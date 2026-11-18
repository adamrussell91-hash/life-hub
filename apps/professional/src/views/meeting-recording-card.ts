/**
 * After: "From the recording". While the audio is on its way it shows where it is,
 * with the three-place safety row (this device · Life Hub · your Mac). Once written up
 * it shows the Overview, How it went, Your notes built out, Picked up, Who said what,
 * and the full transcript in a drawer. Mockup: docs/mockups/meeting-recording.html (After).
 */
import '../styles/meeting-recording.css';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { personRoute } from '@/app/router';
import {
  deleteRecording,
  fetchRecordingPart,
  patchReview,
  patchSpeakers,
  rerunWriteup,
  retryRecording,
  saveRecordingNotes,
  stopRecording,
  type MeetingRecording,
  type MeetingTranscript,
  type MeetingWriteup,
  type PickReview,
  type RecordingBundle,
  type RecordingKind,
  type WriteupBuilt
} from '@/api/meeting-recordings';
import {
  capNotes,
  downloadBlob,
  formatClock,
  listRecovery,
  recorderFor,
  recordingFileName,
  shouldClearDevice,
  type LocalSession,
  type Recovery,
  type RecorderSnapshot
} from '@/lib/meeting-recorder';
import {
  askConfirm,
  avatar,
  button,
  clockTime,
  el,
  minutesOf,
  personFor,
  recordingPeople,
  type RecPerson,
  type RecordingAttendeeInput,
  type RecordingModel
} from '@/views/meeting-recording-strip';
import { openTranscriptDrawer, type DrawerHandle } from '@/views/meeting-transcript-drawer';

// ───────────────────────────── Pure ─────────────────────────────

export type CardState =
  | 'none'
  | 'recording'
  | 'uploading'
  | 'device'
  | 'open'
  | 'waiting'
  | 'transcribing'
  | 'writing_up'
  | 'failed'
  | 'done'
  | 'writeup_failed'
  | 'no_writeup';

export type LocalView = {
  active: boolean;
  hasLocal: boolean;
  pending: number;
  stalled: boolean;
  /** This tab is uploading (or retrying) the parts itself. */
  adopted: boolean;
  savedMs: number;
  uploadedMs: number;
  lastTriedAt: number | null;
};

export const NO_LOCAL: LocalView = { active: false, hasLocal: false, pending: 0, stalled: false, adopted: false, savedMs: 0, uploadedMs: 0, lastTriedAt: null };

/** Which state the card shows, from what Life Hub holds and what this device holds. */
export function cardState(bundle: RecordingBundle | null, local: LocalView): CardState {
  const recording = bundle?.recording ?? null;
  if (local.active) return 'recording';
  if (!recording && !local.hasLocal) return 'none';
  if (local.pending > 0) return local.adopted && !local.stalled ? 'uploading' : 'device';
  if (!recording) return 'device';
  switch (recording.status) {
    case 'recording':
      return local.adopted ? 'uploading' : 'open';
    case 'uploaded':
      return 'waiting';
    case 'transcribing':
      return 'transcribing';
    case 'writing_up':
      return 'writing_up';
    case 'failed':
      return 'failed';
    case 'done':
    default:
      if (recording.writeup_status === 'running') return 'writing_up';
      // A failed redo keeps the earlier write-up: show that, with a note.
      if (recording.writeup_status === 'failed') return bundle?.writeup && bundle.writeup.overview ? 'done' : 'writeup_failed';
      if (bundle?.writeup && (bundle.writeup.status === 'done' || bundle.writeup.status === 'unchecked')) return 'done';
      return 'no_writeup';
  }
}

/** `2 hours ago`, `3 min ago`, `just now`. */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const mins = Math.round((now - at) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The overview arrives as escaped HTML with only `<b>` allowed. It goes in as HTML,
 * after a belt-and-braces pass that drops any other tag.
 */
export function overviewHtml(html: string): string {
  return String(html ?? '').replace(/<(?!\/?b>)[^>]*>/gi, '');
}

/** Text with `<b>` tags shown as bold and nothing else parsed. */
export function richText(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let bold: HTMLElement | null = null;
  for (const piece of String(text ?? '').split(/(<b>|<\/b>)/i)) {
    if (/^<b>$/i.test(piece)) {
      bold = el('b');
      frag.append(bold);
      continue;
    }
    if (/^<\/b>$/i.test(piece)) {
      bold = null;
      continue;
    }
    const clean = piece.replace(/<[^>]*>/g, '');
    if (!clean) continue;
    (bold ?? frag).append(clean);
  }
  return frag;
}

export function plainText(text: string): string {
  const stripped = String(text ?? '').replace(/<[^>]*>/g, '');
  const decoded = stripped.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" })[name] ?? _);
  return decoded.replace(/\s+/g, ' ').trim();
}

/** Built-out lines grouped under the note they add to; out-of-range indices join "Not in your notes". */
export function groupBuilt(notes: string[], built: WriteupBuilt[]): { byNote: Array<Array<{ item: WriteupBuilt; index: number }>>; extra: Array<{ item: WriteupBuilt; index: number }> } {
  const byNote = notes.map(() => [] as Array<{ item: WriteupBuilt; index: number }>);
  const extra: Array<{ item: WriteupBuilt; index: number }> = [];
  built.forEach((item, index) => {
    const at = item.note_index;
    if (at !== null && at !== undefined && at >= 0 && at < notes.length) byNote[at]!.push({ item, index });
    else extra.push({ item, index });
  });
  return { byNote, extra };
}

const ROLE_WORD: Record<string, string> = { chair: 'chair', minute_taker: 'minute taker', presenter: 'presenter' };

// ───────────────────────────── Card ─────────────────────────────

export type RecordingCardDeps = {
  /** Adds lines under one "From the recording" block in the notes. */
  appendToNotes: (lines: string[]) => void;
  /** + Task: a task tagged with this meeting. */
  createTask: (input: { title: string; due_date?: string }) => Promise<void>;
  /** Track it: a they-owe promise on that person. */
  trackIt: (input: { person_ref: string; text: string; due: string | null }) => Promise<void>;
  /** Overview into the After Summary (meetings only). */
  useAsSummary?: (text: string) => Promise<void>;
  summaryHas?: (text: string) => boolean;
};

export type RecordingCardHandle = {
  el: HTMLElement;
  openDrawerAt(line: number | null): void;
  /** Your note lines changed: Life Hub keeps them for the write-up until it runs. */
  notesChanged(lines: string[]): void;
  destroy(): void;
};

export function mountRecordingCard(options: {
  meetingId: string;
  kind: RecordingKind;
  people: () => RecordingAttendeeInput[];
  room: boolean;
  model: RecordingModel;
  deps: RecordingCardDeps;
  /** Open the drawer at this line once the transcript is in (from `?line=`). */
  initialLine?: number | null;
}): RecordingCardHandle {
  const session = recorderFor(options.meetingId);
  const card = el('section', 'card rec-card');
  card.dataset.part = 'recording-card';
  card.hidden = true;
  const ctx = options.kind === 'event' ? 'event' : 'meeting';

  let snap: RecorderSnapshot = session.snapshot();
  let recovery: Recovery | null = null;
  let recoverySession: LocalSession | null = null;
  let lastKey = '';
  let busy = false;
  let message: string | null = null;
  let drawer: DrawerHandle | null = null;
  let pendingLine = options.initialLine ?? null;
  let clearedFor: string | null = null;
  let notesTimer: ReturnType<typeof setTimeout> | null = null;
  let live: Array<() => void> = [];

  const people = (): RecPerson[] => {
    const bundle = options.model.get();
    const fromPage = options.people();
    // The names saved on the recording cover anyone removed from the room since.
    const saved = (bundle?.recording?.attendees ?? []).filter((a) => a.who.startsWith('shared:') && !fromPage.some((p) => p.ref === a.who));
    return recordingPeople([...fromPage, ...saved.map((a) => ({ ref: a.who, name: a.name, role: a.role }))], options.room || Boolean(bundle?.recording?.room));
  };

  function localView(): LocalView {
    if (session.localSession()) {
      return {
        active: session.isActive(),
        hasLocal: snap.savedParts > 0,
        pending: snap.pendingUploads,
        stalled: snap.uploadStalled,
        adopted: true,
        savedMs: snap.savedMs,
        uploadedMs: snap.uploadedMs,
        lastTriedAt: snap.lastTriedAt
      };
    }
    if (recovery) {
      return { active: false, hasLocal: true, pending: recovery.notUploaded.length, stalled: true, adopted: false, savedMs: recovery.savedMs, uploadedMs: recovery.uploadedMs, lastTriedAt: null };
    }
    return NO_LOCAL;
  }

  function key(bundle: RecordingBundle | null, local: LocalView, state: CardState): string {
    const writeup = bundle?.writeup ? { ...bundle.writeup, review: undefined } : null;
    return JSON.stringify([
      state, busy, message, bundle?.recording, bundle?.mac,
      state === 'done' ? writeup : null,
      state === 'done' ? bundle?.transcript?.voices : null,
      local.hasLocal, local.pending > 0, local.stalled, local.adopted,
      people().map((p) => p.who)
    ]);
  }

  function render(): void {
    const bundle = options.model.get();
    const local = localView();
    const state = cardState(bundle, local);
    if (bundle?.recording && shouldClearDevice(bundle.recording) && clearedFor !== bundle.recording.id) {
      clearedFor = bundle.recording.id;
      recovery = null;
      void session.clearDevice(bundle.recording.id);
    }
    const k = key(bundle, local, state);
    if (k !== lastKey) {
      lastKey = k;
      live = [];
      card.hidden = state === 'none' || state === 'recording';
      card.dataset.state = state;
      card.replaceChildren(...build(state, bundle, local));
    }
    for (const update of live) update();
    if (state === 'done' && pendingLine !== null && bundle?.transcript) {
      const line = pendingLine;
      pendingLine = null;
      openDrawerAt(line);
    }
  }

  function head(text: string, recording: MeetingRecording | null): HTMLElement {
    const h = el('h3', 'rec-card__title', text);
    if (recording?.private) h.append(' ', el('span', 'rec-tag is-plum', '🔒 Private'));
    return h;
  }

  function stateRow(icon: string, tone: 'wait' | 'work' | 'fail', content: HTMLElement[]): HTMLElement {
    const row = el('div', 'rec-state');
    const main = el('div', 'rec-state__main');
    main.append(...content);
    row.append(el('span', `rec-state__icon is-${tone}`, icon), main);
    return row;
  }

  function safetyRow(device: string, lifeHub: string, mac: string): HTMLElement {
    const row = el('div', 'rec-safety');
    row.dataset.part = 'rec-safety';
    for (const [value, where] of [[device, 'on this device'], [lifeHub, 'in Life Hub'], [mac, 'on your Mac']] as const) {
      const cell = el('div');
      cell.append(el('b', undefined, value), el('span', undefined, where));
      row.append(cell);
    }
    return row;
  }

  function lifeHubCell(recording: MeetingRecording | null): string {
    if (!recording) return '—';
    if (recording.audio_deleted_at) return 'Deleted';
    const got = recording.parts_received?.length ?? 0;
    const all = recording.parts_expected !== null && got >= recording.parts_expected;
    return all ? `${minutesOf(recording.duration_ms || got * 60_000)} ✓` : `${got} min`;
  }

  function deviceCell(local: LocalView): string {
    return local.hasLocal ? `${minutesOf(local.savedMs)} ✓` : '—';
  }

  function actions(...nodes: HTMLElement[]): HTMLElement {
    const row = el('div', 'rec-actions');
    row.append(...nodes);
    return row;
  }

  function notice(): HTMLElement[] {
    return message ? [el('p', 'rec-error', message)] : [];
  }

  function build(state: CardState, bundle: RecordingBundle | null, local: LocalView): HTMLElement[] {
    const recording = bundle?.recording ?? null;
    const title = head('From the recording', recording);
    switch (state) {
      case 'none':
      case 'recording':
        return [];
      case 'uploading': {
        const text = el('p');
        const bar = el('div', 'rec-bar');
        const fill = el('i');
        bar.append(fill);
        live.push(() => {
          const total = Math.max(1, snap.savedParts);
          text.replaceChildren('Uploading the last parts — ', el('b', undefined, `${snap.uploadedParts} of ${total}`));
          fill.style.width = `${Math.round((snap.uploadedParts / total) * 100)}%`;
        });
        const safe = el('div', 'muted', snap.storage === 'memory' ? 'Keep this tab open until it finishes.' : 'Safe to close: every part is already saved on this device.');
        return [title, stateRow('⇡', 'wait', [text, bar, safe]), safetyRow(deviceCell(local), lifeHubCell(recording), '—')];
      }
      case 'device': {
        const minutes = Math.max(1, local.pending);
        const lead = el('p');
        lead.append(el('b', undefined, `${minutes} minute${minutes === 1 ? ' is' : 's are'} only on this device.`));
        if (local.uploadedMs > 0) lead.append(` The upload stopped at minute ${Math.round(local.uploadedMs / 60_000)}.`);
        const tried = agoLabel(local.lastTriedAt ? new Date(local.lastTriedAt).toISOString() : null);
        const more = el('div', 'muted', `They stay here until Life Hub has them. Don’t clear this browser’s data.${tried ? ` This device last tried ${tried}.` : ''}`);
        const upload = button(busy ? 'Uploading…' : 'Upload now', 'btn btn--primary btn--sm', 'rec-upload-now');
        upload.disabled = busy;
        upload.addEventListener('click', () => void uploadNow());
        return [title, stateRow('⇡', 'fail', [lead, more, actions(upload, saveCopyButton('⇣ Save the whole recording to this device', recording))]), ...notice(),
          safetyRow(deviceCell(local), lifeHubCell(recording), '—')];
      }
      case 'open': {
        const got = recording?.parts_received?.length ?? 0;
        const lead = el('p');
        const missingCount = recording?.parts_expected != null ? Math.max(0, recording.parts_expected - got) : 0;
        if (recording?.stopped_at && missingCount) {
          lead.append(el('b', undefined, `Life Hub is missing ${missingCount} minute${missingCount === 1 ? '' : 's'} of this recording.`), ' They aren’t on this device.');
        } else {
          lead.append(el('b', undefined, 'This recording didn’t finish.'), ` Life Hub has ${minutesOf(got * 60_000)} of it.`);
        }
        const more = el('div', 'muted', 'If it isn’t still recording or uploading on another device, finish it with what Life Hub has, and your Mac will write it up.');
        const finish = button(busy ? 'Finishing…' : 'Finish with what Life Hub has', 'btn btn--primary btn--sm', 'rec-finish-open');
        finish.disabled = busy || !got;
        finish.addEventListener('click', () => void finishOpen(recording!));
        return [title, stateRow('!', 'fail', [lead, more, actions(finish, deleteButton())]), ...notice(), safetyRow(deviceCell(local), lifeHubCell(recording), '—')];
      }
      case 'waiting': {
        const seen = agoLabel(bundle?.mac?.last_seen_at);
        const p = el('p', undefined, `Your Mac will write this up next time it’s on.`);
        const meta = el('div', 'muted', `${seen ? `Mac last checked in ${seen}` : 'Your Mac hasn’t checked in yet'} · ${minutesOf(recording?.duration_ms ?? 0)} recorded, all uploaded`);
        const copy = el('div', 'rec-state__copy');
        copy.append(saveCopyButton('⇣ Save a copy of the audio', recording, 'rec-link'), el('span', 'muted', ' · available until the write-up is done'));
        return [title, stateRow('💻', 'wait', [p, meta, copy]), ...notice(), safetyRow(deviceCell(local), lifeHubCell(recording), '—')];
      }
      case 'transcribing':
      case 'writing_up': {
        const p = el('p');
        p.append(state === 'transcribing' ? 'Your Mac is writing this up ' : recording?.private ? 'Your Mac is writing this up ' : 'Claude is writing this up ',
          el('span', 'muted', state === 'transcribing' ? '(about 20 minutes for an hour)' : '(a minute or two)'));
        const bar = el('div', 'rec-bar is-working');
        bar.append(el('i'));
        const how = el('div', 'muted', `Words → voices → ${recording?.private ? 'speaker check and write-up on your Mac' : 'speaker check and write-up by Claude'}. Audio is deleted only once the write-up is saved.`);
        return [title, stateRow('⚙', 'work', [p, bar, how]), safetyRow(deviceCell(local), lifeHubCell(recording), state === 'transcribing' ? 'working' : '✓')];
      }
      case 'failed': {
        const attempts = recording?.attempts ?? 0;
        const p = el('p');
        p.append(el('b', undefined, attempts >= 3 ? 'Transcription keeps failing.' : 'Transcription didn’t finish.'), recording?.error ? ` ${recording.error}` : '');
        const more = el('div', 'muted', `Tried ${attempts} time${attempts === 1 ? '' : 's'}. The audio is safe in Life Hub${local.hasLocal ? ' and on this device' : ''} until a run works.`);
        const retry = button(busy ? 'Starting…' : 'Try again', 'btn btn--primary btn--sm', 'rec-retry');
        retry.disabled = busy;
        retry.addEventListener('click', () => void act(async () => {
          const out = await retryRecording(options.meetingId);
          options.model.patch({ recording: out.recording });
        }));
        return [title, stateRow('!', 'fail', [p, more, actions(retry, saveCopyButton('⇣ Save a copy of the audio', recording), deleteButton())]), ...notice(),
          safetyRow(deviceCell(local), lifeHubCell(recording), 'failed')];
      }
      case 'writeup_failed':
      case 'no_writeup': {
        const failed = state === 'writeup_failed';
        const p = el('p');
        if (failed) p.append(el('b', undefined, 'The write-up didn’t finish.'), bundle?.writeup?.error ? ` ${bundle.writeup.error}` : ' The transcript is safe.');
        else p.append(recording?.writeup_status === 'private_none'
          ? 'Private: your Mac made the transcript but has no local model for the write-up.'
          : 'The transcript is ready.');
        const row: HTMLElement[] = [];
        // A private meeting's write-up runs on the Mac only (the server answers 409 private_meeting).
        if (failed && !recording?.private) {
          const again = button(busy ? 'Starting…' : 'Write it up again', 'btn btn--primary btn--sm', 'rec-writeup-again');
          again.disabled = busy;
          again.addEventListener('click', () => void act(async () => {
            const out = await rerunWriteup(options.meetingId);
            options.model.patch({ recording: out.recording });
          }));
          row.push(again);
        }
        if (bundle?.transcript) row.push(drawerButton());
        return [title, stateRow(failed ? '!' : '≡', failed ? 'fail' : 'wait', [p, actions(...row)]), ...notice(),
          safetyRow(local.hasLocal ? deviceCell(local) : 'Cleared', lifeHubCell(recording), '✓')];
      }
      case 'done':
        return buildDone(bundle!, recording!);
    }
  }

  function drawerButton(label = '≡ Full transcript'): HTMLButtonElement {
    const open = button(label, 'btn btn--secondary btn--sm', 'rec-open-drawer');
    open.addEventListener('click', () => openDrawerAt(null));
    return open;
  }

  /** A time that opens the transcript at its line; nothing when the write-up couldn't place it. */
  function timeButton(ms: number | null | undefined, line: number | null | undefined): HTMLButtonElement | Text {
    if (ms === null || ms === undefined || line === null || line === undefined) return document.createTextNode('');
    const ts = button(formatClock(ms), 'rec-ts', 'rec-time');
    ts.title = 'Check the exact words';
    ts.addEventListener('click', () => openDrawerAt(line));
    return ts;
  }

  function bundleLineStart(line: number): number | null {
    return options.model.get()?.transcript?.lines[line]?.start_ms ?? null;
  }

  function deleteButton(): HTMLButtonElement {
    const del = button('Delete recording', 'btn btn--ghost btn--sm', 'rec-delete');
    del.addEventListener('click', async () => {
      const yes = await askConfirm({
        title: 'Delete this recording?',
        body: 'The audio is deleted permanently and there will be no write-up. This can’t be undone.',
        confirm: 'Delete',
        danger: true
      });
      if (!yes) return;
      await act(async () => {
        const id = options.model.get()?.recording?.id ?? session.localSession()?.recording_id ?? null;
        await deleteRecording(options.meetingId);
        if (id) await session.clearDevice(id);
        recovery = null;
        options.model.set({ recording: null, transcript: null, writeup: null, mac: options.model.get()?.mac ?? { last_seen_at: null, version: null } });
      });
    });
    return del;
  }

  function saveCopyButton(label: string, recording: MeetingRecording | null, className = 'btn btn--secondary btn--sm'): HTMLButtonElement {
    const save = button(label, className, 'rec-save-copy');
    save.addEventListener('click', async () => {
      save.disabled = true;
      const before = save.textContent;
      save.textContent = 'Preparing…';
      try {
        if (!session.localSession() && recoverySession) await session.adopt(recoverySession, recording);
        const local = await session.localCopy();
        if (local && !local.missing.length) {
          downloadBlob(local.blob, recordingFileName(local.startedAt, local.mime));
          return;
        }
        if (!recording || recording.audio_deleted_at) {
          if (local) downloadBlob(local.blob, recordingFileName(local.startedAt, local.mime));
          return;
        }
        const count = recording.parts_expected ?? Math.max(-1, ...recording.parts_received) + 1;
        const blobs: Blob[] = [];
        for (let index = 0; index < count; index += 1) blobs.push(await fetchRecordingPart(options.meetingId, index));
        const mime = blobs[0]?.type && blobs[0].type !== 'application/octet-stream' ? blobs[0].type : local?.mime ?? 'audio/webm';
        downloadBlob(new Blob(blobs, { type: mime }), recordingFileName(recording.started_at, mime));
      } catch (err) {
        message = err instanceof Error ? `Couldn’t save a copy: ${err.message}` : 'Couldn’t save a copy.';
        lastKey = '';
        render();
      } finally {
        save.disabled = false;
        save.textContent = before;
      }
    });
    return save;
  }

  // ── Done ──
  function buildDone(bundle: RecordingBundle, recording: MeetingRecording): HTMLElement[] {
    const writeup = bundle.writeup!;
    const all = people();
    const out: HTMLElement[] = [];

    const top = el('div', 'rec-card__head');
    const left = el('div', 'rec-card__head-text');
    const deleted = recording.audio_deleted_at ? `audio deleted ${clockTime(recording.audio_deleted_at)}` : 'audio kept until the write-up is saved';
    left.append(head('From the recording', recording), el('p', 'muted rec-card__sub', `${minutesOf(recording.duration_ms)} · ${recording.private ? 'written up on your Mac' : 'written up by Claude'} · ${deleted}`));
    top.append(left);
    if (bundle.transcript) top.append(drawerButton());
    out.push(top);

    // Overview
    out.push(sectionHead('Overview'));
    if (recording.writeup_status === 'failed') {
      out.push(el('p', 'rec-error', 'The last write-up didn’t finish. This is the earlier one.'));
    }
    const overview = el('p', 'rec-overview');
    overview.innerHTML = overviewHtml(writeup.overview);
    out.push(overview);
    if (options.deps.useAsSummary) {
      const feeds = el('div', 'rec-feeds');
      const text = plainText(writeup.overview);
      if (options.deps.summaryHas?.(text)) feeds.append(el('span', 'rec-tag is-ok', '✓ In Summary'));
      else {
        const use = button('Use as Summary', 'rec-link', 'rec-use-summary');
        use.addEventListener('click', async () => {
          use.disabled = true;
          try {
            await options.deps.useAsSummary!(text);
            use.replaceWith(el('span', 'rec-tag is-ok', '✓ In Summary'));
          } catch {
            use.disabled = false;
          }
        });
        feeds.append(use);
      }
      out.push(feeds);
    }

    // How it went
    if (writeup.flow.length) {
      const flowHead = sectionHead('How it went');
      flowHead.append(el('span', 'rec-sect__aside', 'scroll →'));
      out.push(flowHead);
      const COLOURS = ['#9aa3b2', '#2f6f8f', '#5e8a6e', '#b7791f', '#6b4c8a', '#a67c00', '#8a5a2b', '#3f7f7a'];
      const bar = el('div', 'rec-flowbar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `The ${ctx} in ${writeup.flow.length} parts: ${writeup.flow.map((seg) => seg.title).join(', ')}`);
      const strip = el('div', 'rec-flow');
      writeup.flow.forEach((seg, index) => {
        const colour = COLOURS[index % COLOURS.length]!;
        const piece = el('i');
        piece.style.flex = String(Math.max(1, seg.mins));
        piece.style.background = colour;
        piece.title = `${seg.title} · ${seg.mins} min`;
        bar.append(piece);
        const card = el('article', 'rec-seg');
        card.style.setProperty('--c', colour);
        const when = el('div', 'rec-seg__when');
        when.append(el('span', undefined, seg.start_ms === null ? '' : formatClock(seg.start_ms)), el('span', undefined, `${seg.mins} min`));
        const who = el('div', 'rec-seg__who');
        const minis = el('span', 'rec-minis');
        for (const ref of seg.who) {
          const person = personFor(all, ref);
          const mini = avatar(person, 'rec-mini');
          mini.title = person?.name ?? '';
          minis.append(mini);
        }
        who.append(minis);
        if (seg.line !== null && seg.line !== undefined) {
          const words = button('words', 'rec-link', 'rec-seg-words');
          words.addEventListener('click', () => openDrawerAt(seg.line));
          who.append(words);
        }
        card.append(when, el('b', undefined, seg.title), el('p', undefined, seg.text), who);
        strip.append(card);
      });
      out.push(bar, strip);
    }

    // Your notes, built out
    out.push(...builtSection(writeup, recording, all));

    // Picked up
    out.push(sectionHead('Picked up'));
    const picks = el('div', 'rec-picks');
    picks.append(
      pickColumn('☐ For you to do', 'mine', writeup.picks.mine.map((pick, i) => pickCard(`mine:${i}`, pick.text, null, pick.due_label ?? (pick.due ? formatDisplayDate(pick.due) : null), pick.quote, pick.start_ms, pick.line, all, 'mine', pick))),
      pickColumn('⏳ Others said they’d do', 'others', writeup.picks.others.map((pick, i) => pickCard(`others:${i}`, pick.text, pick.who, pick.due ? formatDisplayDate(pick.due) : null, pick.quote, pick.start_ms, pick.line, all, 'others', pick))),
      pickColumn('★ Points of interest', 'poi', writeup.picks.poi.map((pick, i) => pickCard(`poi:${i}`, pick.text, pick.who, null, pick.quote, pick.start_ms, pick.line, all, 'poi', {})))
    );
    out.push(picks);

    // Who said what
    if (writeup.persons.length) {
      out.push(sectionHead('Who said what'));
      const grid = el('div', 'rec-persons');
      for (const entry of writeup.persons) grid.append(personCard(entry, all, recording));
      out.push(grid);
    }
    const unnamed = (bundle.transcript?.voices ?? []).filter((voice) => !voice.who);
    if (unnamed.length) {
      const prompt = el('div', 'rec-nameprompt');
      prompt.dataset.part = 'rec-unnamed';
      const text = el('span');
      text.append('⚠ ', el('b', undefined, `${unnamed.length} voice${unnamed.length > 1 ? 's' : ''} not named`), ' — what they said isn’t on anyone’s profile yet.');
      const name = button('Name it', 'btn btn--secondary btn--sm', 'rec-name-it');
      name.addEventListener('click', () => openDrawerAt(null));
      prompt.append(text, name);
      out.push(prompt);
    }

    const foot = el('div', 'rec-wordsbar');
    if (!writeup.speakers_checked) {
      const check = button(busy ? 'Starting…' : 'Check speakers', 'btn btn--secondary btn--sm', 'rec-check-speakers');
      check.disabled = busy;
      check.hidden = recording.private;
      check.addEventListener('click', () => void act(async () => {
        const res = await rerunWriteup(options.meetingId);
        options.model.patch({ recording: res.recording });
      }));
      const note = el('span');
      note.append(el('span', 'rec-tag is-amber', 'Speakers not checked'), ' Names come from your taps only.');
      foot.append(note, check);
    } else {
      foot.append(el('span', undefined, 'Lines the check moved are marked in the transcript. Check wording there before quoting anyone.'));
    }
    if (bundle.transcript) foot.append(drawerButton());
    out.push(...notice(), foot);
    return out;
  }

  function sectionHead(text: string): HTMLElement {
    const h = el('div', 'rec-sect');
    h.append(el('span', undefined, text));
    return h;
  }

  function reviewOf(): MeetingWriteup['review'] {
    return options.model.get()?.writeup?.review ?? { built: {}, picks: {} };
  }

  function builtSection(writeup: MeetingWriteup, recording: MeetingRecording, all: RecPerson[]): HTMLElement[] {
    const notes = recording.notes ?? [];
    if (!writeup.built.length && !notes.length) return [];
    const headRow = sectionHead('Your notes, built out');
    const status = el('span', 'rec-sect__aside');
    headRow.append(status);
    const box = el('div', 'rec-bnotes');
    const rows = new Map<number, HTMLElement>();
    const { byNote, extra } = groupBuilt(notes, writeup.built);

    const paintStatus = () => {
      const review = reviewOf();
      const pending = writeup.built.filter((_, i) => !review.built[String(i)]).length;
      status.replaceChildren();
      if (!writeup.built.length) return;
      if (pending) {
        const keepAll = button('✓ Keep all', 'btn btn--secondary btn--xs', 'rec-keep-all');
        keepAll.addEventListener('click', () => void decideBuilt(writeup.built.map((_, i) => i).filter((i) => !reviewOf().built[String(i)]), 'kept'));
        status.append(el('span', 'muted', `${pending} to look at`), keepAll);
      } else status.append(el('span', 'rec-tag is-ok', 'All looked at'));
    };

    const addRow = ({ item, index }: { item: WriteupBuilt; index: number }) => {
      const row = el('div', 'rec-add');
      row.dataset.built = String(index);
      const text = el('div', 'rec-add__text');
      text.append(item.text, ' ');
      const person = personFor(all, item.who);
      const src = el('span', 'rec-add__src', `— ${person ? (person.who === 'me' ? 'You' : person.short) : 'Unnamed voice'} `);
      src.append(timeButton(item.start_ms, item.line));
      text.append(src);
      const acts = el('div', 'rec-add__acts');
      const keep = button('✓', 'rec-add__btn', 'rec-built-keep');
      keep.title = 'Keep in my notes';
      keep.setAttribute('aria-label', 'Keep in my notes');
      keep.addEventListener('click', () => void decideBuilt([index], 'kept'));
      const drop = button('✕', 'rec-add__btn', 'rec-built-drop');
      drop.title = 'Drop';
      drop.setAttribute('aria-label', 'Drop');
      drop.addEventListener('click', () => void decideBuilt([index], 'gone'));
      acts.append(keep, drop);
      row.append(text, acts);
      rows.set(index, row);
      return row;
    };

    const paintRows = () => {
      const review = reviewOf();
      for (const [index, row] of rows) {
        const state = review.built[String(index)];
        row.classList.toggle('is-kept', state === 'kept');
        row.hidden = state === 'gone';
      }
    };

    notes.forEach((note, ni) => {
      box.append(el('div', 'rec-mine', note));
      for (const entry of byNote[ni] ?? []) box.append(addRow(entry));
    });
    if (extra.length) {
      box.append(el('div', 'rec-mine is-new', 'Not in your notes'));
      for (const entry of extra) box.append(addRow(entry));
    }
    if (!writeup.built.length) box.append(el('p', 'muted', 'The recording didn’t add anything to your notes.'));

    async function decideBuilt(indices: number[], state: 'kept' | 'gone'): Promise<void> {
      if (!indices.length) return;
      const current = options.model.get()?.writeup;
      if (!current) return;
      const before = { ...current.review.built };
      const change: Record<string, 'kept' | 'gone'> = {};
      for (const i of indices) change[String(i)] = state;
      // Show it at once; the notes block saves on its own timer.
      options.model.patch({ writeup: { ...current, review: { ...current.review, built: { ...before, ...change } } } });
      if (state === 'kept') {
        options.deps.appendToNotes(indices.map((i) => {
          const item = current.built[i]!;
          const person = personFor(people(), item.who);
          const noteLine = item.note_index !== null && item.note_index !== undefined ? recording.notes?.[item.note_index] : null;
          const who = person ? (person.who === 'me' ? 'you' : person.short) : 'unnamed voice';
          const at = item.start_ms === null || item.start_ms === undefined ? '' : `, ${formatClock(item.start_ms)}`;
          return `${noteLine ? `${noteLine}: ` : ''}${item.text.trim()} (${who}${at})`;
        }));
      }
      paintRows();
      paintStatus();
      try {
        const res = await patchReview({ meeting_id: options.meetingId, built: change });
        options.model.patch({ writeup: res.writeup });
      } catch (err) {
        message = err instanceof Error ? `Not saved: ${err.message}` : 'Not saved. Try again.';
        lastKey = '';
        render();
      }
      paintRows();
      paintStatus();
    }

    live.push(() => {
      paintRows();
      paintStatus();
    });
    const legend = el('div', 'rec-legend');
    const key = el('span', 'rec-legend__key');
    key.append(el('span', 'rec-legend__swatch'), 'added from the recording');
    legend.append(key, el('span', undefined, '✓ moves it into your notes · ✕ drops it · the time opens the exact words'));
    return [headRow, box, legend];
  }

  function pickColumn(title: string, kind: 'mine' | 'others' | 'poi', cards: HTMLElement[]): HTMLElement {
    const col = el('div', `rec-pcol is-${kind}`);
    const h = el('h4');
    h.append(title, ' ', el('span', 'rec-pcol__n', String(cards.length)));
    col.append(h, ...cards);
    if (!cards.length) col.append(el('p', 'muted', kind === 'mine' ? 'Nothing you said you’d do.' : kind === 'others' ? 'Nobody said they’d do anything.' : 'Nothing stood out.'));
    return col;
  }

  function pickCard(
    keyName: string,
    text: string,
    who: string | null,
    dueLabel: string | null,
    quote: string,
    startMs: number | null,
    line: number | null,
    all: RecPerson[],
    kind: 'mine' | 'others' | 'poi',
    raw: { due?: string | null }
  ): HTMLElement {
    const node = el('div', 'rec-pk');
    node.dataset.pick = keyName;
    const person = personFor(all, who);
    const lead = el('div', 'rec-pk__text');
    if (person && kind !== 'mine') {
      const name = el('b', 'rec-pk__who', person.who === 'me' ? 'You' : person.short);
      name.style.setProperty('--c', person.colour);
      lead.append(name, ' · ');
    }
    lead.append(text);
    if (dueLabel) lead.append(' ', el('span', 'rec-tag is-amber', dueLabel));
    const q = el('div', 'rec-pk__quote');
    if (quote) q.append(`“${quote.replace(/^[“"]|[”"]$/g, '')}” `);
    q.append(timeButton(startMs, line));
    const acts = el('div', 'rec-pk__acts');
    const result = el('div', 'rec-pk__result');
    const isPerson = Boolean(person && person.who.startsWith('shared:'));

    const decide = async (review: PickReview, work?: () => Promise<void>, trigger?: HTMLButtonElement) => {
      acts.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      try {
        if (work) await work();
        const current = options.model.get()?.writeup;
        if (current) options.model.patch({ writeup: { ...current, review: { ...current.review, picks: { ...current.review.picks, [keyName]: review } } } });
        paint();
        const res = await patchReview({ meeting_id: options.meetingId, picks: { [keyName]: review } });
        options.model.patch({ writeup: res.writeup });
      } catch (err) {
        acts.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = false; });
        result.hidden = false;
        result.classList.add('is-error');
        result.textContent = err instanceof Error ? err.message : 'That didn’t save. Try again.';
        trigger?.focus();
      }
      paint();
    };

    if (kind === 'mine') {
      const task = button('+ Task', 'btn btn--primary btn--xs', 'rec-pick-task');
      task.addEventListener('click', () => void decide(
        { state: 'done', note: `✓ Task added${dueLabel ? ` · due ${dueLabel}` : ''}` },
        () => options.deps.createTask({ title: text, ...(raw.due ? { due_date: raw.due } : {}) }),
        task
      ));
      acts.append(task);
    } else if (kind === 'others') {
      if (isPerson) {
        const track = button('Track it', 'btn btn--primary btn--xs', 'rec-pick-track');
        track.addEventListener('click', () => void decide(
          { state: 'done', note: `✓ Waiting on ${person!.short} · on their profile` },
          () => options.deps.trackIt({ person_ref: person!.who, text, due: raw.due ?? null }),
          track
        ));
        acts.append(track);
      }
    } else {
      const keep = button('★ Keep', 'btn btn--primary btn--xs', 'rec-pick-keep');
      keep.addEventListener('click', () => void decide({ state: 'done', note: `★ Kept${isPerson ? ` · on ${person!.short}’s profile` : ''}` }, undefined, keep));
      const task = button('+ Task', 'btn btn--secondary btn--xs', 'rec-pick-task');
      task.addEventListener('click', () => void decide({ state: 'done', note: '✓ Task added: follow up' }, () => options.deps.createTask({ title: `Follow up: ${text}` }), task));
      acts.append(keep, task);
    }
    const no = button('Not this', 'btn btn--ghost btn--xs', 'rec-pick-x');
    no.addEventListener('click', () => void decide({ state: 'x', note: '' }, undefined, no));
    acts.append(no);

    function paint(): void {
      const review = reviewOf().picks[keyName];
      node.hidden = review?.state === 'x';
      node.classList.toggle('is-done', review?.state === 'done');
      acts.hidden = Boolean(review);
      if (review?.state === 'done') {
        result.hidden = false;
        result.classList.remove('is-error');
        result.textContent = review.note || '✓ Done';
      } else if (!result.classList.contains('is-error')) result.hidden = true;
    }
    live.push(paint);
    node.append(lead, q, acts, result);
    return node;
  }

  function personCard(entry: MeetingWriteup['persons'][number], all: RecPerson[], recording: MeetingRecording): HTMLElement {
    const person = personFor(all, entry.who, recording.attendees.find((a) => a.who === entry.who)?.name);
    const node = el('div', 'rec-person');
    const top = el('div', 'rec-person__top');
    const isMe = entry.who === 'me';
    const isRoom = entry.who === 'room';
    const name = el('span', 'rec-person__name', isMe ? 'You' : person?.name ?? 'Someone');
    const role = isMe ? 'you' : isRoom ? 'from the audience' : ROLE_WORD[person?.role ?? ''] ?? 'attendee';
    name.append(el('small', undefined, role));
    top.append(avatar(person, 'rec-av rec-av--lg'), name);
    const list = el('ul');
    for (const point of entry.points) {
      const li = el('li');
      if (point.star) li.append(el('span', 'rec-star', '★ '));
      li.append(point.text);
      list.append(li);
    }
    let quoteEl: HTMLElement | null = null;
    if (entry.quote) {
      const q = el('div', 'rec-pk__quote');
      quoteEl = q;
      const line = entry.line ?? null;
      q.append(`“${entry.quote.replace(/^[“"]|[”"]$/g, '')}” `, timeButton(line === null ? null : bundleLineStart(line), line));
    }
    const foot = el('div', 'rec-person__foot');
    if (isMe) foot.append(el('span', 'muted', 'Not saved anywhere else'));
    else if (isRoom || !entry.who.startsWith('shared:')) foot.append(el('span', 'muted', 'Not on a profile'));
    else {
      const id = entry.who.split(':').pop() ?? '';
      foot.append(el('span', 'rec-tag is-ok', `✓ On ${person?.short ?? 'their'}’s profile`));
      const open = el('a', 'rec-link', 'Open profile') as HTMLAnchorElement;
      open.href = personRoute(id);
      open.dataset.part = 'rec-open-profile';
      foot.append(open);
    }
    node.append(top, list);
    if (quoteEl) node.append(quoteEl);
    node.append(foot);
    return node;
  }

  // ── Actions ──
  async function act(work: () => Promise<void>): Promise<void> {
    busy = true;
    message = null;
    render();
    try {
      await work();
    } catch (err) {
      message = err instanceof Error ? err.message : 'That didn’t work. Try again.';
    } finally {
      busy = false;
      lastKey = '';
      render();
    }
  }

  async function uploadNow(): Promise<void> {
    await act(async () => {
      if (!session.localSession() && recoverySession) await session.adopt(recoverySession, options.model.get()?.recording ?? null);
      await session.uploadRest(recoverySession?.notes);
      recovery = null;
      await options.model.refresh();
    });
  }

  async function finishOpen(recording: MeetingRecording): Promise<void> {
    await act(async () => {
      // Only an unbroken run from the first minute can be joined into audio.
      const got = new Set(recording.parts_received ?? []);
      let expected = 0;
      while (got.has(expected)) expected += 1;
      const out = await stopRecording({
        meeting_id: options.meetingId,
        recording_id: recording.id,
        parts_expected: expected,
        duration_ms: recording.duration_ms || expected * 60_000,
        taps: recording.taps ?? [],
        flags: recording.flags ?? [],
        notes: recording.notes ?? []
      });
      options.model.patch({ recording: out.recording });
      if (out.missing.length) message = `Life Hub is missing ${out.missing.length} minute${out.missing.length === 1 ? '' : 's'} of it. Your Mac writes up the rest.`;
    });
  }

  function openDrawerAt(line: number | null): void {
    const bundle = options.model.get();
    const transcript = bundle?.transcript;
    if (!transcript) return;
    if (drawer) {
      if (line !== null) drawer.openAt(line);
      return;
    }
    drawer = openTranscriptDrawer({
      transcript,
      people: people(),
      atLine: line,
      onSpeakers: async (change) => {
        const out = await patchSpeakers({ meeting_id: options.meetingId, ...change });
        options.model.patch({ transcript: out.transcript, ...(out.writeup ? { writeup: out.writeup } : {}) });
        return out;
      },
      onClose: () => {
        drawer = null;
      }
    });
  }

  // ── Wiring ──
  const unsubModel = options.model.subscribe(() => {
    const transcript = options.model.get()?.transcript;
    if (drawer && transcript) drawer.update(transcript as MeetingTranscript);
    render();
  });
  const unsubRec = session.subscribe((next) => {
    snap = next;
    if (card.isConnected || !card.hidden) render();
  });

  async function loadLocal(): Promise<void> {
    if (session.localSession()) return;
    const found = await listRecovery(options.meetingId, options.model.get()?.recording ?? null);
    recovery = found.recovery;
    recoverySession = found.session;
    render();
  }

  // Poll while the Mac (or Claude) is working, and only while the card is on the page.
  const poll = setInterval(() => {
    if (!card.isConnected) return;
    const state = card.dataset.state as CardState | undefined;
    if (state === 'waiting' || state === 'transcribing' || state === 'writing_up') void options.model.refresh();
  }, 30_000);

  void (async () => {
    if (!options.model.get()) await options.model.refresh();
    await loadLocal();
  })();
  render();

  return {
    el: card,
    openDrawerAt,
    notesChanged(lines: string[]) {
      const recording = options.model.get()?.recording;
      if (!recording || !(recording.status === 'recording' || recording.status === 'uploaded' || recording.status === 'transcribing')) return;
      if (notesTimer !== null) clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        notesTimer = null;
        void saveRecordingNotes(options.meetingId, capNotes(lines)).then((out) => options.model.patch({ recording: out.recording })).catch(() => undefined);
      }, 1500);
    },
    destroy() {
      clearInterval(poll);
      unsubModel();
      unsubRec();
      drawer?.close();
    }
  };
}
