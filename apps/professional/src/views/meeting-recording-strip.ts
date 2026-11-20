/**
 * During: ● Record → consent panel with mic check → rec badge, live meter, health
 * line, silent-mic and upload alarms, the 2 h 50 warning, tap chips with counts and
 * Undo, "That's a to-do" / "Remember this", and the crash-recovery banner.
 * Mockup: docs/mockups/meeting-recording.html (During).
 *
 * Also home to the bits the card and drawer share: who-is-who for chips and
 * avatars, the recording model (one GET per page, shared), and a confirm card.
 */
import '../styles/meeting-recording.css';
import { ApiClientError } from '@/api/client';
import {
  getRecordingBundle,
  startRecording,
  type MeetingRecording,
  type RecordingBundle,
  type RecordingKind
} from '@/api/meeting-recordings';
import {
  activeRecordingMeeting,
  canUndoTap,
  downloadBlob,
  formatClock,
  listRecovery,
  recorderFor,
  recordingFileName,
  tapCounts,
  type LocalSession,
  type Recovery,
  type RecorderSnapshot
} from '@/lib/meeting-recorder';

// ───────────────────────────── Shared helpers ─────────────────────────────

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className = 'btn btn--secondary', part?: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  if (part) node.dataset.part = part;
  return node;
}

export type RecordingAttendeeInput = { ref: string; name: string; role: string | null; about?: string | null };

export type RecPerson = { who: string; name: string; short: string; role: string | null; colour: string };

const ME_COLOUR = '#17375e';
const ROOM_COLOUR = '#9aa3b2';
const PALETTE = ['#2f6f8f', '#8a5a2b', '#5e8a6e', '#6b4c8a', '#b7791f', '#a03e5c', '#3f7f7a', '#7a6a2b'];

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.map((word) => word[0]!.toUpperCase()).join('').slice(0, 2);
}

/** Me first, then each attendee, then (events) someone in the room. */
export function recordingPeople(attendees: RecordingAttendeeInput[], room: boolean): RecPerson[] {
  const people: RecPerson[] = [{ who: 'me', name: 'Me', short: 'Me', role: null, colour: ME_COLOUR }];
  attendees.forEach((attendee, index) => {
    people.push({
      who: attendee.ref,
      name: attendee.name,
      short: attendee.name.trim().split(/\s+/)[0] || attendee.name,
      role: attendee.role,
      colour: PALETTE[index % PALETTE.length]!
    });
  });
  if (room) people.push({ who: 'room', name: 'Someone in the room', short: 'Room', role: null, colour: ROOM_COLOUR });
  return people;
}

/** The person for a `who`, with a stand-in for a ref no longer in the room (never the raw ref, D12). */
export function personFor(people: RecPerson[], who: string | null | undefined, fallbackName?: string): RecPerson | null {
  if (!who) return null;
  const found = people.find((person) => person.who === who);
  if (found) return found;
  if (who === 'room') return { who, name: 'Someone in the room', short: 'Room', role: null, colour: ROOM_COLOUR };
  const name = fallbackName || 'Someone no longer in the room';
  return { who, name, short: name.split(/\s+/)[0] || name, role: null, colour: '#7b8494' };
}

export function avatar(person: RecPerson | null, className = 'rec-av'): HTMLElement {
  const node = el('span', className, person ? (person.who === 'me' ? 'Me' : person.who === 'room' ? '?' : initialsOf(person.name)) : '?');
  node.style.setProperty('--c', person?.colour ?? ROOM_COLOUR);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/**
 * A kit confirm card over the page (I10: never window.confirm). Escape closes it
 * unless focus is in a text field (I8); a click on the backdrop closes it (V13).
 */
export function askConfirm(options: { title: string; body: string; confirm: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = el('div', 'confirm-card-overlay rec-confirm');
    const card = el('section', 'confirm-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', options.title);
    const actions = el('div', 'rec-confirm__actions');
    const no = button(options.cancel ?? 'Cancel', 'btn btn--ghost');
    const yes = button(options.confirm, options.danger ? 'btn btn--danger' : 'btn btn--primary');
    yes.dataset.part = 'confirm-yes';
    actions.append(no, yes);
    card.append(el('h3', 'rec-confirm__title', options.title), el('p', 'muted', options.body), actions);
    overlay.append(card);
    const finish = (answer: boolean) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      returnFocus?.focus();
      resolve(answer);
    };
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      finish(false);
    }
    no.addEventListener('click', () => finish(false));
    yes.addEventListener('click', () => finish(true));
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    yes.focus();
  });
}

export function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function minutesOf(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return rest ? `${Math.floor(total / 60)} h ${rest} min` : `${Math.floor(total / 60)} h`;
}

// ───────────────────────────── Recording model ─────────────────────────────

/** The meeting's recording as Life Hub has it, shared by the strip and the card. */
export type RecordingModel = {
  readonly meetingId: string;
  get(): RecordingBundle | null;
  set(next: RecordingBundle): void;
  patch(next: Partial<RecordingBundle>): void;
  refresh(): Promise<RecordingBundle | null>;
  subscribe(fn: (bundle: RecordingBundle | null) => void): () => void;
};

export function createRecordingModel(meetingId: string, load: (id: string) => Promise<RecordingBundle> = getRecordingBundle): RecordingModel {
  let bundle: RecordingBundle | null = null;
  const listeners = new Set<(bundle: RecordingBundle | null) => void>();
  let inflight: Promise<RecordingBundle | null> | null = null;
  const emit = () => listeners.forEach((fn) => fn(bundle));
  return {
    meetingId,
    get: () => bundle,
    set(next) {
      bundle = next;
      emit();
    },
    patch(next) {
      bundle = { ...(bundle ?? { recording: null, mac: { last_seen_at: null, version: null } }), ...next };
      emit();
    },
    refresh() {
      inflight ??= load(meetingId)
        .then((next) => {
          bundle = next;
          emit();
          return bundle;
        })
        .catch(() => bundle)
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

// ───────────────────────────── The strip ─────────────────────────────

export type RecordingStripHandle = {
  /** Goes inside the dark live strip, after the timer. */
  controls: HTMLElement;
  /** Full-width health line, last inside the live strip. */
  health: HTMLElement;
  /** Alarms, consent panel and tap chips: straight after the live strip. */
  below: HTMLElement;
  isActive(): boolean;
  /** End ›: stops the recording, keeps the last minute, tells Life Hub. */
  stopForEnd(): Promise<void>;
  destroy(): void;
};

export function mountRecordingStrip(options: {
  meetingId: string;
  kind: RecordingKind;
  people: () => RecordingAttendeeInput[];
  room: boolean;
  notes: () => string[];
  model: RecordingModel;
}): RecordingStripHandle {
  const session = recorderFor(options.meetingId);
  const controls = el('span', 'rec-controls');
  controls.dataset.part = 'rec-controls';
  const health = el('div', 'rec-health');
  health.dataset.part = 'rec-health';
  const below = el('div', 'rec-below');
  below.dataset.part = 'rec-below';
  below.hidden = true;

  let consentOpen = false;
  let ticked = false;
  let isPrivate = false;
  let starting = false;
  let startError: string | null = null;
  let recovery: Recovery | null = null;
  let recoverySession: LocalSession | null = null;
  let recoveryBusy = false;
  let flashWho: string | null = null;
  let flashUntil = 0;
  let lastKey = '';
  let live: Array<(snap: RecorderSnapshot) => void> = [];

  const ctx = options.kind === 'event' ? 'event' : 'meeting';
  const people = () => recordingPeople(options.people(), options.room);

  function structureKey(s: RecorderSnapshot): string {
    return JSON.stringify([
      s.phase, s.supported, s.error, consentOpen, ticked, isPrivate, starting, startError, Boolean(recovery), recoveryBusy,
      s.silentAlarm, s.uploadStalled, s.storage, s.limit, s.stoppedByLimit, s.wakeLock, s.isPrivate, s.mics.map((m) => m.id), s.micId,
      tapCounts(s.taps), s.flags.length, canUndoTap(s.taps, s.elapsedMs), s.taps[s.taps.length - 1]?.who ?? null,
      s.pendingUploads > 0, s.finalized, activeRecordingMeeting() !== null && activeRecordingMeeting() !== options.meetingId,
      people().map((p) => p.who)
    ]);
  }

  function render(s: RecorderSnapshot): void {
    const key = structureKey(s);
    if (key !== lastKey) {
      lastKey = key;
      live = [];
      buildControls(s);
      buildHealth(s);
      buildBelow(s);
    }
    for (const update of live) update(s);
  }

  // ── Inside the dark strip ──
  function meter(dead: (s: RecorderSnapshot) => boolean): HTMLElement {
    const node = el('span', 'rec-meter');
    node.setAttribute('aria-hidden', 'true');
    const bars = Array.from({ length: 6 }, () => el('i'));
    node.append(...bars);
    live.push((s) => {
      const isDead = dead(s);
      node.classList.toggle('is-dead', isDead);
      bars.forEach((bar, index) => {
        bar.style.height = `${isDead ? 2 : s.levels[index] ?? 2}px`;
      });
    });
    return node;
  }

  function buildControls(s: RecorderSnapshot): void {
    controls.replaceChildren();
    const recording = s.phase === 'recording' || s.phase === 'paused' || s.phase === 'stopping';
    if (recording) {
      const badge = el('span', `rec-badge${s.phase === 'paused' ? ' is-paused' : ''}`);
      badge.setAttribute('role', 'status');
      const time = el('span', 'rec-badge__time');
      badge.append(el('span', 'rec-dot'), el('span', undefined, s.phase === 'paused' ? 'Paused' : s.phase === 'stopping' ? 'Stopping' : 'Rec'), time);
      live.push((snap) => {
        time.textContent = formatClock(snap.elapsedMs);
      });
      const pause = button(s.phase === 'paused' ? '▶ Resume' : '❚❚ Pause', 'btn btn--ghost btn--sm', 'rec-pause');
      pause.disabled = s.phase === 'stopping';
      pause.addEventListener('click', () => (s.phase === 'paused' ? session.resume() : session.pause()));
      const stop = button('■ Stop', 'btn btn--ghost btn--sm', 'rec-stop');
      stop.disabled = s.phase === 'stopping';
      stop.addEventListener('click', () => void stopNow());
      controls.append(badge, meter((snap) => snap.phase !== 'recording' || snap.silentAlarm), pause, stop);
      return;
    }
    if (s.phase === 'stopped' && s.recordingId) {
      const done = el('span', 'rec-badge is-done', `✓ Recorded ${formatClock(s.elapsedMs)}`);
      done.dataset.part = 'rec-recorded';
      controls.append(done);
      return;
    }
    const elsewhere = activeRecordingMeeting();
    const record = button('● Record', 'btn btn--sm rec-record', 'rec-record');
    if (!s.supported) {
      record.disabled = true;
      record.title = 'This browser can’t record audio.';
    } else if (elsewhere && elsewhere !== options.meetingId) {
      record.disabled = true;
      record.title = 'Another meeting is recording. Stop it there first.';
    }
    record.setAttribute('aria-expanded', String(consentOpen));
    record.addEventListener('click', () => void openConsent());
    controls.append(record);
  }

  function buildHealth(s: RecorderSnapshot): void {
    health.replaceChildren();
    const showing = s.phase === 'recording' || s.phase === 'paused' || s.phase === 'stopping' || (s.phase === 'stopped' && (s.pendingUploads > 0 || !s.finalized));
    health.hidden = !showing;
    if (!showing) return;
    const item = (part: string) => {
      const node = el('span');
      node.dataset.part = part;
      health.append(node);
      return node;
    };
    const sound = item('rec-sound');
    const saved = item('rec-saved');
    const inHub = item('rec-in-hub');
    const screen = item('rec-screen');
    live.push((snap) => {
      const active = snap.phase === 'recording' || snap.phase === 'paused';
      sound.hidden = !active;
      const quiet = snap.phase === 'recording' && snap.silentMs >= 5000;
      sound.className = quiet ? 'is-bad' : 'is-ok';
      sound.textContent = snap.phase === 'paused' ? 'Paused' : quiet ? `No sound for ${Math.floor(snap.silentMs / 1000)}s` : 'Hearing voices';
      saved.className = snap.storage === 'memory' ? 'is-bad' : 'is-ok';
      saved.textContent = snap.storage === 'memory' ? 'Not saved on this device. Keep this tab open' : `Saved on this device: ${formatClock(snap.savedMs)}`;
      inHub.className = snap.uploadStalled ? 'is-bad' : 'is-ok';
      inHub.textContent = snap.uploadStalled
        ? `Upload paused, ${snap.pendingUploads} min waiting`
        : snap.phase === 'stopped' && snap.pendingUploads
          ? `Uploading, ${snap.pendingUploads} min to go`
          : `In Life Hub: ${minutesOf(snap.uploadedMs)}`;
      screen.hidden = !active;
      screen.className = snap.wakeLock === 'held' ? 'is-ok' : 'is-bad';
      screen.textContent = snap.wakeLock === 'held' ? 'Screen kept on' : 'Keep this screen on while recording';
    });
    if (s.isPrivate) health.append(el('span', undefined, '🔒 Private'));
  }

  // ── Below the strip ──
  function buildBelow(s: RecorderSnapshot): void {
    below.replaceChildren();
    if (recovery && !(s.phase === 'recording' || s.phase === 'paused' || s.phase === 'stopping')) below.append(recoveryBanner(recovery));
    const recording = s.phase === 'recording' || s.phase === 'paused';
    if (s.silentAlarm) below.append(silentAlarm(s));
    if (s.uploadStalled && (recording || s.phase === 'stopped')) below.append(uploadAlarm(s));
    if (s.storage === 'memory' && recording && !s.uploadStalled) {
      const note = alarm('amber', '!', 'This browser isn’t keeping a copy on the device.', 'Each minute goes straight to Life Hub instead. Keep this tab open until the upload finishes.');
      below.append(note);
    }
    if (s.stoppedByLimit && s.phase === 'stopped') {
      below.append(alarm('sky', '■', 'Recording stopped at 3 hours.', s.pendingUploads ? 'The last minutes are uploading.' : 'It has all uploaded.'));
    }
    if (s.error && !recording) below.append(alarm('amber', '!', s.error, ''));
    if (consentOpen && !recording && s.phase !== 'stopping') below.append(consentPanel(s));
    if (recording && s.limit === 'warn') {
      const warn = el('div', 'rec-alarm is-amber rec-alarm--line');
      warn.dataset.part = 'rec-limit';
      const text = el('span');
      warn.append(el('span', undefined, '⚠'), text);
      live.push((snap) => {
        text.textContent = `Recording stops by itself at 3 hours (${formatClock(Math.max(0, 3 * 3600_000 - snap.elapsedMs))} left).`;
      });
      below.append(warn);
    }
    if (recording) below.append(tapsBox(s));
    below.hidden = below.childElementCount === 0;
  }

  function alarm(tone: 'red' | 'amber' | 'sky', icon: string, title: string, body: string): HTMLElement {
    const box = el('div', `rec-alarm is-${tone}`);
    const main = el('div', 'rec-alarm__main');
    const p = el('p');
    p.append(el('b', undefined, title));
    main.append(p);
    if (body) main.append(el('div', undefined, body));
    box.append(el('span', 'rec-alarm__icon', icon), main);
    return box;
  }

  function micSelect(s: RecorderSnapshot, className: string): HTMLSelectElement {
    const select = el('select', className);
    select.setAttribute('aria-label', 'Microphone');
    for (const mic of s.mics) {
      const option = el('option', undefined, mic.label);
      option.value = mic.id;
      option.selected = mic.id === s.micId;
      select.append(option);
    }
    if (!s.mics.length) {
      const option = el('option', undefined, 'This device’s microphone');
      option.value = '';
      select.append(option);
    }
    return select;
  }

  function silentAlarm(s: RecorderSnapshot): HTMLElement {
    const box = alarm('red', '🔇', '', 'The recording is running, but the mic is picking up silence. The phone buzzes and this stays until sound comes back.');
    box.setAttribute('role', 'alert');
    box.dataset.part = 'rec-silent';
    const title = box.querySelector('b')!;
    live.push((snap) => {
      title.textContent = `Not hearing anything for ${Math.floor(snap.silentMs / 1000)} seconds.`;
    });
    const acts = el('div', 'rec-alarm__acts');
    const select = micSelect(s, 'rec-select');
    const swap = button('Switch mic', 'btn btn--sm rec-alarm__btn', 'rec-switch-mic');
    swap.addEventListener('click', () => void session.openMic(select.value || null));
    const quiet = button('It’s just quiet', 'btn btn--sm rec-alarm__btn is-outline', 'rec-just-quiet');
    quiet.addEventListener('click', () => session.acknowledgeSilence());
    acts.append(select, swap, quiet);
    box.querySelector('.rec-alarm__main')!.append(acts);
    return box;
  }

  function uploadAlarm(s: RecorderSnapshot): HTMLElement {
    const recording = s.phase === 'recording' || s.phase === 'paused';
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const box = alarm('amber', '⇡', offline ? 'Upload paused — no connection.' : 'Upload paused — Life Hub isn’t answering.', '');
    box.dataset.part = 'rec-upload-stalled';
    const main = box.querySelector('.rec-alarm__main')!;
    if (recording) main.querySelector('p')!.append(' Recording carries on.');
    const body = el('div');
    live.push((snap) => {
      body.textContent = snap.storage === 'memory'
        ? `${snap.pendingUploads} min are only in this tab. Keep it open until they upload.`
        : `Every minute is saved on this device first, so nothing is lost. ${snap.pendingUploads} min will upload when the connection is back.`;
    });
    const acts = el('div', 'rec-alarm__acts');
    const retry = button('Try now', 'btn btn--sm', 'rec-try-now');
    retry.addEventListener('click', () => void session.retryNow());
    acts.append(retry, saveCopyButton('⇣ Save a copy to this device'));
    main.append(body, acts);
    return box;
  }

  function saveCopyButton(label: string): HTMLButtonElement {
    const save = button(label, 'btn btn--sm', 'rec-save-copy');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const copy = await session.localCopy();
        if (copy) downloadBlob(copy.blob, recordingFileName(copy.startedAt, copy.mime));
      } finally {
        save.disabled = false;
      }
    });
    return save;
  }

  function privateSwitch(): HTMLElement {
    const wrap = el('div', 'rec-private');
    const toggle = el('button', 'switch') as HTMLButtonElement;
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(isPrivate));
    toggle.setAttribute('aria-label', 'Private');
    toggle.dataset.part = 'rec-private';
    toggle.addEventListener('click', () => {
      isPrivate = !isPrivate;
      render(session.snapshot());
    });
    const text = el('span', 'rec-private__text');
    text.append(el('b', undefined, 'Private'), el('small', undefined, isPrivate
      ? 'Speaker check and write-up run on your Mac. Nothing leaves Life Hub.'
      : 'Speaker check and write-up send text, never audio, to Claude.'));
    wrap.append(toggle, text);
    return wrap;
  }

  function consentPanel(s: RecorderSnapshot): HTMLElement {
    const panel = el('section', 'rec-consent');
    panel.dataset.part = 'rec-consent';
    panel.setAttribute('aria-label', 'Start recording');
    const check = el('div', 'rec-miccheck');
    const heard = el('span', 'rec-miccheck__heard');
    const hint = el('span', 'muted', 'Say something. The bars must move before you start.');
    const select = micSelect(s, 'rec-select');
    select.addEventListener('change', () => void session.openMic(select.value || null));
    check.append(meter(() => false), heard, select, hint);
    live.push((snap) => {
      heard.textContent = snap.hearing ? '✓ Hearing you' : 'Listening…';
      heard.classList.toggle('is-heard', snap.hearing);
    });
    const tick = el('label', 'rec-consent__tick');
    const box = el('input') as HTMLInputElement;
    box.type = 'checkbox';
    box.checked = ticked;
    box.dataset.part = 'rec-consent-tick';
    box.addEventListener('change', () => {
      ticked = box.checked;
      render(session.snapshot());
      panel.isConnected && below.querySelector<HTMLInputElement>('[data-part="rec-consent-tick"]')?.focus();
    });
    tick.append(box, document.createTextNode(` Everyone in this ${ctx} has agreed to it being recorded.`));
    const law = el('p', 'rec-consent__law', 'Recording people without their agreement is unlawful in NSW.');
    const row = el('div', 'rec-consent__row');
    const buttons = el('span', 'rec-consent__buttons');
    const cancel = button('Cancel', 'btn btn--ghost btn--sm', 'rec-cancel');
    cancel.addEventListener('click', () => {
      consentOpen = false;
      ticked = false;
      startError = null;
      session.closeMic();
      render(session.snapshot());
    });
    const start = button(starting ? 'Starting…' : '● Start recording', 'btn btn--primary', 'rec-start');
    start.disabled = !ticked || starting || !s.supported;
    start.addEventListener('click', () => void begin());
    buttons.append(cancel, start);
    row.append(privateSwitch(), buttons);
    panel.append(check, tick, law, row);
    if (startError) panel.append(el('p', 'rec-error', startError));
    return panel;
  }

  function tapsBox(s: RecorderSnapshot): HTMLElement {
    const box = el('section', 'rec-taps');
    box.dataset.part = 'rec-taps';
    const all = people();
    const counts = tapCounts(s.taps);
    const named = all.filter((person) => person.who !== 'room');
    const allTapped = named.every((person) => counts[person.who]);
    const hint = el('p', 'rec-taps__hint');
    hint.append(
      el('span', undefined, allTapped ? 'Who’s talking? Tap when someone new starts.' : 'Tap when someone starts talking. Two or three taps each is enough.'),
      el('span', undefined, `${s.taps.length} tap${s.taps.length === 1 ? '' : 's'}`)
    );
    const chips = el('div', 'rec-chips');
    const lastWho = s.taps[s.taps.length - 1]?.who ?? null;
    for (const person of all) {
      const chip = el('button', `rec-chip${person.who === 'room' ? ' is-room' : ''}${person.who === lastWho ? ' is-speaking' : ''}`) as HTMLButtonElement;
      chip.type = 'button';
      chip.dataset.tap = person.who;
      chip.title = person.name;
      chip.append(avatar(person), el('span', 'rec-chip__name', person.who === 'room' ? 'Someone in the room' : person.short));
      if (counts[person.who]) chip.append(el('span', 'rec-chip__count', `×${counts[person.who]}`));
      if (flashWho === person.who && Date.now() < flashUntil) chip.classList.add('is-flash');
      chip.addEventListener('click', () => {
        flashWho = person.who;
        flashUntil = Date.now() + 350;
        session.tap(person.who);
        setTimeout(() => below.querySelector(`[data-tap="${CSS.escape(person.who)}"]`)?.classList.remove('is-flash'), 360);
      });
      chips.append(chip);
    }
    const flagRow = el('div', 'rec-flags');
    const todo = button('☐ That’s a to-do', 'btn btn--secondary btn--sm rec-flag', 'rec-flag-task');
    todo.addEventListener('click', () => session.flag('task'));
    const poi = button('★ Remember this', 'btn btn--secondary btn--sm rec-flag', 'rec-flag-poi');
    poi.addEventListener('click', () => session.flag('poi'));
    flagRow.append(todo, poi);
    if (s.flags.length) flagRow.append(el('span', 'muted', `${s.flags.length} marked — the write-up looks hardest here`));
    const undo = el('div', 'rec-undo');
    undo.setAttribute('aria-live', 'polite');
    if (canUndoTap(s.taps, s.elapsedMs) && lastWho) {
      const who = all.find((person) => person.who === lastWho);
      undo.append(document.createTextNode(`Tapped ${who?.short ?? 'someone'}. `));
      const link = button('Undo last tap', 'rec-link', 'rec-undo');
      link.addEventListener('click', () => session.undoTap());
      undo.append(link);
    }
    box.append(hint, chips, flagRow, undo);
    return box;
  }

  function recoveryBanner(found: Recovery): HTMLElement {
    const when = clockTime(found.startedAt);
    const box = alarm('sky', '↺', found.interrupted
      ? `A recording${when ? ` from ${when}` : ''} didn’t finish uploading.`
      : `${minutesOf(found.savedMs - found.uploadedMs) === '0 min' ? 'Part' : minutesOf(found.savedMs - found.uploadedMs)} of a recording is only on this device.`, '');
    box.dataset.part = 'rec-recovery';
    const main = box.querySelector('.rec-alarm__main')!;
    const body = el('div');
    if (found.interrupted) body.append(document.createTextNode('The page closed while it was recording. '));
    body.append(el('b', undefined, minutesOf(found.savedMs)), document.createTextNode(` is saved on this device and ${minutesOf(found.uploadedMs)} is already in Life Hub. Nothing is lost.`));
    const acts = el('div', 'rec-alarm__acts');
    const upload = button(found.notUploaded.length ? `Upload the last ${found.notUploaded.length} min` : 'Finish the upload', 'btn btn--primary btn--sm', 'rec-recover-upload');
    upload.disabled = recoveryBusy;
    upload.addEventListener('click', async () => {
      if (!recoverySession) return;
      recoveryBusy = true;
      render(session.snapshot());
      await session.adopt(recoverySession, options.model.get()?.recording ?? null);
      await session.uploadRest(options.notes());
      recovery = null;
      recoveryBusy = false;
      await options.model.refresh();
      render(session.snapshot());
    });
    const save = button('⇣ Save a copy to this device', 'btn btn--sm', 'rec-recover-save');
    save.addEventListener('click', async () => {
      if (!recoverySession) return;
      if (!session.localSession()) await session.adopt(recoverySession, options.model.get()?.recording ?? null);
      const copy = await session.localCopy();
      if (copy) downloadBlob(copy.blob, recordingFileName(copy.startedAt, copy.mime));
    });
    acts.append(upload, save);
    const server = options.model.get()?.recording ?? null;
    if (found.canContinue && server && server.id === found.recordingId) {
      const keep = button('Keep recording (adds to it)', 'btn btn--sm', 'rec-recover-continue');
      keep.disabled = recoveryBusy;
      keep.addEventListener('click', async () => {
        recoveryBusy = true;
        render(session.snapshot());
        await session.begin(server, { resume: recoverySession, notes: options.notes() });
        recovery = null;
        recoveryBusy = false;
        render(session.snapshot());
      });
      acts.append(keep);
    }
    main.append(body, acts);
    return box;
  }

  // ── Actions ──
  async function openConsent(): Promise<void> {
    consentOpen = true;
    startError = null;
    render(session.snapshot());
    await session.openMic();
  }

  async function begin(): Promise<void> {
    if (!ticked || starting) return;
    starting = true;
    startError = null;
    render(session.snapshot());
    const body = {
      meeting_id: options.meetingId,
      consent_confirmed: true as const,
      private: isPrivate,
      kind: options.kind,
      attendees: options.people().map((person) => ({ who: person.ref, name: person.name, role: person.role, about: person.about ?? null })),
      room: options.room
    };
    try {
      const existing = options.model.get()?.recording ?? null;
      let replace = false;
      if (existing && existing.status !== 'recording') {
        replace = await askConfirm({
          title: `Record this ${ctx} again?`,
          body: 'This replaces the last recording, its transcript and its write-up. It can’t be undone.',
          confirm: 'Record again'
        });
        if (!replace) return;
      }
      let recording: MeetingRecording;
      try {
        recording = (await startRecording({ ...body, ...(replace ? { replace: true } : {}) })).recording;
      } catch (err) {
        if (!(err instanceof ApiClientError && err.status === 409) || replace) throw err;
        const again = await askConfirm({
          title: `Record this ${ctx} again?`,
          body: 'This replaces the last recording, its transcript and its write-up. It can’t be undone.',
          confirm: 'Record again'
        });
        if (!again) return;
        recording = (await startRecording({ ...body, replace: true })).recording;
      }
      options.model.patch({ recording, transcript: null, writeup: null });
      consentOpen = false;
      ticked = false;
      recovery = null;
      await session.begin(recording, { notes: options.notes() });
    } catch (err) {
      startError = err instanceof Error ? err.message : 'Could not start the recording. Try again.';
    } finally {
      starting = false;
      render(session.snapshot());
    }
  }

  async function stopNow(): Promise<void> {
    const out = await session.stop(options.notes());
    if (out.recording) options.model.patch({ recording: out.recording });
    else void options.model.refresh();
  }

  // ── Start-up: crash recovery, then follow the recorder ──
  const unsubscribe = session.subscribe(render);
  void (async () => {
    if (session.isActive() || session.localSession()) return;
    const bundle = options.model.get() ?? (await options.model.refresh());
    const found = await listRecovery(options.meetingId, bundle?.recording ?? null);
    if (found.recovery && !session.isActive()) {
      recovery = found.recovery;
      recoverySession = found.session;
      lastKey = '';
      render(session.snapshot());
    }
  })();

  return {
    controls,
    health,
    below,
    isActive: () => session.isActive(),
    async stopForEnd() {
      if (session.isActive()) await stopNow();
    },
    destroy() {
      unsubscribe();
      // The mic stays open only while recording; a mic check left open is closed.
      if (!session.isActive()) session.closeMic();
    }
  };
}
