import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { fileBase64, type ClareMinutesReview } from '@/api/clare-comms';
import { minutesSectionKeys, orphanedItemNotes, PDF_MAX_BYTES, savedLine, type MinutesSaveInput } from '@/lib/meeting-minutes';
import type { MeetingMinutes, MeetingRecord, MinutesItemNote } from '@/domain/types';

type CardAttendee = { ref: string; name: string; role: string | null };

export type MinutesCardDeps = {
  read: (minutes: { pdf: { media_type: 'application/pdf'; data: string } } | { text: string }) => Promise<ClareMinutesReview>;
  save: (input: Omit<MinutesSaveInput, 'record' | 'meetingRef' | 'attendees'>) => Promise<{ record: MeetingRecord; counts: MeetingMinutes['saved_counts'] }>;
  openFile: (fileKey: string) => Promise<void>;
  /** Base64 of a stored minutes PDF. */
  fetchPdf: (fileKey: string) => Promise<string>;
  /** Minutes that were pasted into chat. */
  fetchText: (fileKey: string) => Promise<string>;
  /** Clears minutes_pending on the meeting. */
  dismissPending: () => Promise<MeetingRecord>;
  /** Keeps the typed text on the meeting. Empty text clears it. */
  saveDraft: (text: string) => Promise<void>;
  /** Saves every item's notes. Runs as they type, so it must not file promises. */
  saveItemNotes: (notes: MinutesItemNote[]) => Promise<void>;
  /** Files the » lines in one finished note. Returns the names that aren't in the room. */
  commitItemNote: (text: string) => Promise<string[]>;
};

type ReadInput = Parameters<MinutesCardDeps['read']>[0];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, part: string, kind = 'btn--secondary'): HTMLButtonElement {
  const node = el('button', `btn ${kind}`, label) as HTMLButtonElement;
  node.type = 'button';
  node.dataset.part = part;
  return node;
}

const DRAFT_SAVE_MS = 800;
const DRAFT_MAX = 60000;
const NOTE_MAX = 8000;
const NOTE_HINT = 'Under any item: »me for something you owe, »Name for something they owe, ✓ for a decision, @Name for who said what.';

/** Why a » line stayed a note. »me has no one to be owed to until the room has someone in it. */
function unmatchedLine(owners: string[]): string {
  const names = [...new Set(owners)].filter((owner) => owner.toLowerCase() !== 'me');
  const parts: string[] = [];
  if (names.length < new Set(owners).size) parts.push('»me needs someone in The room to owe it to, so that line stays as a note.');
  if (names.length) parts.push(`Add ${names.join(', ')} to The room to make ${names.length === 1 ? 'that line' : 'those lines'} a promise. It stays as a note for now.`);
  return parts.join(' ');
}

function growToFit(area: HTMLTextAreaElement): void {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

const due = (value: string | null) => (value ? ` · due ${formatDisplayDate(value)}` : '');

/** Official minutes: add a PDF or paste, review what Clare found, save what is ticked. */
export function mountMinutesCard(options: {
  record: () => MeetingRecord;
  attendees: () => CardAttendee[];
  onSaved: (record: MeetingRecord) => void;
  deps: MinutesCardDeps;
}): HTMLElement {
  const card = el('section', 'card meeting-minutes');
  card.dataset.part = 'minutes';
  const body = el('div', 'meeting-minutes__body');
  card.append(el('h3', undefined, 'Minutes'), body);
  // Set once the pending minutes are reviewed and saved, or dismissed.
  let pendingCleared = false;
  // The Minutes box text. Saved as it changes and kept until minutes read from it are saved.
  let draft = options.record().minutes_draft ?? '';
  let savedDraft = draft;
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let draftWrite: Promise<void> = Promise.resolve();
  let draftStatus: HTMLElement | null = null;
  // Adam's notes under each item, by section key. Separate from the minutes, so Replace leaves them.
  const itemNotes = new Map<string, MinutesItemNote>((options.record().minutes_notes ?? []).map((note) => [note.key, note]));
  let notesDirty = false;
  let notesTimer: ReturnType<typeof setTimeout> | null = null;
  let notesWrite: Promise<void> = Promise.resolve();
  let notesStatus: HTMLElement | null = null;

  /** Writes run in order, and the latest text always goes, so a failed save is retried by the next one. */
  function flushItemNotes(): Promise<void> {
    if (notesTimer !== null) clearTimeout(notesTimer);
    notesTimer = null;
    notesWrite = notesWrite.then(async () => {
      if (!notesDirty) return;
      notesDirty = false;
      const status = notesStatus;
      try {
        await options.deps.saveItemNotes([...itemNotes.values()].filter((note) => note.text.trim()));
        if (status) status.textContent = notesDirty ? 'Saving…' : 'Saved.';
      } catch {
        notesDirty = true;
        if (status) status.textContent = 'Not saved yet. Keep this page open and check your connection.';
      }
    });
    return notesWrite;
  }

  function noteBox(key: string, heading: string | null, name: string, onChange: () => void, grow: Array<() => void>): HTMLElement {
    const box = el('div', 'meeting-minutes__note-box');
    const id = `minutes-note-${key.replace(/[^a-z0-9]+/g, '-')}`;
    const label = el('label', undefined, 'Your notes');
    label.htmlFor = id;
    const area = el('textarea') as HTMLTextAreaElement;
    area.id = id;
    area.rows = 3;
    area.maxLength = NOTE_MAX;
    area.value = itemNotes.get(key)?.text ?? '';
    area.setAttribute('aria-label', `Your notes on ${name}`);
    grow.push(() => growToFit(area));
    const status = el('p', 'muted meeting-minutes__note-status');
    status.setAttribute('role', 'status');
    area.addEventListener('input', () => {
      growToFit(area);
      itemNotes.set(key, { key, heading, text: area.value });
      notesDirty = true;
      notesStatus = status;
      status.textContent = 'Saving…';
      onChange();
      if (notesTimer !== null) clearTimeout(notesTimer);
      notesTimer = setTimeout(() => void flushItemNotes(), DRAFT_SAVE_MS);
    });
    // Promises wait until the note is finished, so a half-typed line never becomes one.
    area.addEventListener('blur', async () => {
      await flushItemNotes();
      const unmatched = await options.deps.commitItemNote(area.value).catch(() => [] as string[]);
      if (unmatched.length) status.textContent = unmatchedLine(unmatched);
    });
    box.append(label, area, status);
    return box;
  }

  function itemFold(key: string, heading: string | null, text: string | null): HTMLDetailsElement {
    const name = heading || 'Minutes';
    const fold = el('details', 'meeting-minutes__item') as HTMLDetailsElement;
    fold.dataset.part = 'minutes-item';
    const summary = el('summary');
    const marker = el('span', 'meeting-minutes__has-note', 'Your notes');
    const paintMarker = () => { marker.hidden = !itemNotes.get(key)?.text.trim(); };
    summary.append(el('span', undefined, name), marker);
    paintMarker();
    const inner = el('div', 'meeting-minutes__item-body');
    if (text) inner.append(el('p', 'meeting-minutes__text', text));
    // A closed fold has no height to measure, so boxes size themselves on opening.
    const grow: Array<() => void> = [];
    inner.append(noteBox(key, heading, name, paintMarker, grow));
    fold.addEventListener('toggle', () => { if (fold.open) grow.forEach((fit) => fit()); });
    fold.append(summary, inner);
    return fold;
  }

  function showDraftStatus(text: string): void {
    if (draftStatus) draftStatus.textContent = text;
  }

  /** Writes run in order, so an older save can't land after a newer one. */
  function flushDraft(): Promise<void> {
    if (draftTimer !== null) clearTimeout(draftTimer);
    draftTimer = null;
    draftWrite = draftWrite.then(async () => {
      if (draft === savedDraft) return;
      const text = draft;
      showDraftStatus('Saving…');
      try {
        await options.deps.saveDraft(text);
        savedDraft = text;
        showDraftStatus(draft === text ? 'Saved on this meeting.' : 'Saving…');
      } catch {
        showDraftStatus('Not saved yet. Keep this page open and check your connection.');
      }
    });
    return draftWrite;
  }

  function pendingBox(): HTMLElement | null {
    const pending = pendingCleared ? null : options.record().minutes_pending ?? null;
    if (!pending) return null;
    const box = el('div', 'meeting-minutes__pending');
    box.dataset.part = 'minutes-pending';
    box.append(el('p', 'meeting-minutes__pending-title', `Minutes from chat · added ${formatDisplayDate(pending.added_at)}`));
    if (pending.note) box.append(el('p', 'muted meeting-minutes__pending-note', pending.note));
    const review = button('Review them', 'minutes-pending-review', 'btn--primary');
    review.addEventListener('click', () => {
      const fileKey = pending.file_key;
      if (fileKey.endsWith('.txt')) {
        void runRead(async () => ({ text: await options.deps.fetchText(fileKey) }), null, null);
        return;
      }
      void runRead(async () => ({ pdf: { media_type: 'application/pdf', data: await options.deps.fetchPdf(fileKey) } }), null, fileKey);
    });
    const dismiss = button('Dismiss', 'minutes-pending-dismiss', 'btn--ghost');
    dismiss.addEventListener('click', async () => {
      dismiss.disabled = true;
      review.disabled = true;
      try {
        const record = await options.deps.dismissPending();
        pendingCleared = true;
        options.onSaved(record);
        paintFor(record);
      } catch (err) {
        dismiss.disabled = false;
        review.disabled = false;
        box.querySelector('.meeting-minutes__note')?.remove();
        box.append(el('p', 'muted meeting-minutes__note', err instanceof Error ? err.message : 'Could not dismiss. Try again.'));
      }
    });
    const row = el('div', 'clare-row');
    row.append(review, dismiss);
    box.append(row);
    return box;
  }

  function withPending(): void {
    const box = pendingBox();
    if (box) body.prepend(box);
  }

  function paintFor(record: MeetingRecord): void {
    if (record.minutes && !draft) paintSaved(record.minutes, null);
    else paintEmpty(Boolean(record.minutes));
  }

  function paintEmpty(withCancel: boolean): void {
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = 'application/pdf';
    file.hidden = true;
    const add = button('Add minutes', 'minutes-add', 'btn--primary');
    add.addEventListener('click', () => file.click());
    const pasteToggle = button('Paste instead', 'minutes-paste-toggle', 'btn--ghost');
    const paste = el('div', 'meeting-minutes__paste');
    paste.hidden = !draft;
    const area = el('textarea') as HTMLTextAreaElement;
    area.rows = 8;
    area.maxLength = DRAFT_MAX;
    area.value = draft;
    area.setAttribute('aria-label', 'Paste the minutes');
    draftStatus = el('p', 'muted meeting-minutes__draft-status', draft ? 'Saved on this meeting.' : 'Saves on this meeting as you type.');
    draftStatus.setAttribute('role', 'status');
    area.addEventListener('input', () => {
      draft = area.value;
      showDraftStatus('Saving…');
      if (draftTimer !== null) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => void flushDraft(), DRAFT_SAVE_MS);
    });
    area.addEventListener('blur', () => void flushDraft());
    const readText = button('Read pasted minutes', 'minutes-read-text');
    paste.append(area, draftStatus, readText);
    pasteToggle.addEventListener('click', () => { paste.hidden = !paste.hidden; if (!paste.hidden) area.focus(); });
    readText.addEventListener('click', () => {
      const text = area.value.trim();
      if (text) void runRead(async () => ({ text }), null, null, true);
    });
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      if (picked.type !== 'application/pdf') return note('That isn’t a PDF. Paste the text instead.');
      if (picked.size > PDF_MAX_BYTES) return note('That PDF is over 4 MB. Paste the part you need instead.');
      const data = await fileBase64(picked);
      void runRead(async () => ({ pdf: { media_type: 'application/pdf', data } }), data, null);
    });
    const row = el('div', 'clare-row');
    row.append(add, pasteToggle);
    if (withCancel) {
      const cancel = button('Cancel', 'minutes-cancel', 'btn--ghost');
      cancel.addEventListener('click', () => paintSaved(options.record().minutes!, null));
      row.append(cancel);
    }
    const hint = el('p', 'muted meeting-page__hint', 'Official minutes for this meeting. Clare finds your actions, other people’s, and the decisions.');
    body.replaceChildren(hint, row, paste, file);
    withPending();
  }

  function note(message: string): void {
    body.querySelector('.meeting-minutes__note')?.remove();
    body.append(el('p', 'muted meeting-minutes__note', message));
  }

  function backToDraft(): HTMLButtonElement {
    const back = button('Back to your text', 'minutes-back-to-text', 'btn--ghost');
    back.addEventListener('click', () => paintEmpty(Boolean(options.record().minutes)));
    return back;
  }

  async function runRead(load: () => Promise<ReadInput>, pdfData: string | null, fileKey: string | null, fromDraft = false): Promise<void> {
    if (fromDraft) await flushDraft();
    draftStatus = null;
    body.replaceChildren(el('p', 'muted', 'Clare is reading the minutes. This can take a minute or two.'));
    try {
      paintReview(await options.deps.read(await load()), pdfData, fileKey, fromDraft);
    } catch (err) {
      body.replaceChildren(
        el('p', 'muted', 'Clare couldn’t read these minutes.'),
        el('p', 'muted meeting-minutes__note', err instanceof Error ? err.message : '')
      );
      const retry = button('Try again', 'minutes-retry');
      retry.addEventListener('click', () => void runRead(load, pdfData, fileKey, fromDraft));
      body.append(retry);
      if (fromDraft) body.append(backToDraft());
    }
  }

  function tickGroup<T>(group: string, title: string, items: T[], label: (item: T) => string): Array<[HTMLInputElement, T]> {
    if (!items.length) return [];
    const host = el('div', 'meeting-minutes__group');
    host.dataset.group = group;
    host.append(el('h4', undefined, title));
    const boxes: Array<[HTMLInputElement, T]> = [];
    for (const item of items) {
      const row = el('label', 'clare-found__item');
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = true;
      row.append(box, document.createTextNode(` ${label(item)}`));
      host.append(row);
      boxes.push([box, item]);
    }
    body.append(host);
    return boxes;
  }

  function paintReview(review: ClareMinutesReview, pdfData: string | null, fileKey: string | null, fromDraft: boolean): void {
    body.replaceChildren();
    const mine = tickGroup('mine', 'For you', review.mine, (item) => `${item.text}${due(item.due)}`);
    const others = tickGroup('others', 'For others', review.others, (item) => `${item.person_name}: ${item.text}${due(item.due)}`);

    const pickers: Array<[HTMLSelectElement, ClareMinutesReview['unmatched'][number]]> = [];
    if (review.unmatched.length) {
      const host = el('div', 'meeting-minutes__group');
      host.dataset.group = 'unmatched';
      host.append(el('h4', undefined, 'Who is this?'));
      for (const item of review.unmatched) {
        const row = el('label', 'meeting-minutes__unmatched');
        const pick = el('select') as HTMLSelectElement;
        pick.setAttribute('aria-label', `Who is ${item.who_text}?`);
        pick.append(new Option('Skip', ''));
        for (const person of options.attendees()) pick.append(new Option(person.name, person.ref));
        row.append(el('span', undefined, `“${item.who_text}”: ${item.text}${due(item.due)}`), pick);
        host.append(row);
        pickers.push([pick, item]);
      }
      body.append(host);
    }

    const decisions = tickGroup('decisions', 'Decisions', review.decisions, (item) => `${item.text}${item.agenda_heading ? ` · under ${item.agenda_heading}` : ''}`);

    if (review.differences.length) {
      const host = el('div', 'meeting-minutes__group meeting-minutes__diffs');
      host.dataset.group = 'differences';
      host.append(el('h4', undefined, 'Check against your notes'));
      for (const item of review.differences) host.append(el('p', 'meeting-minutes__diff', item.text));
      body.append(host);
    }

    const save = button('Save ticked items', 'minutes-save', 'btn--primary');
    save.addEventListener('click', async () => {
      save.disabled = true;
      const ticked = <T>(boxes: Array<[HTMLInputElement, T]>) => boxes.filter(([box]) => box.checked).map(([, item]) => item);
      const picked = pickers.filter(([pick]) => pick.value).map(([pick, item]) => ({ text: item.text, person_ref: pick.value, due: item.due }));
      try {
        const { record, counts } = await options.deps.save({
          pdfData,
          fileKey,
          sections: review.sections,
          mine: ticked(mine).map(({ text, due: d }) => ({ text, due: d })),
          others: [...ticked(others).map(({ text, person_ref, due: d }) => ({ text, person_ref, due: d })), ...picked],
          decisions: ticked(decisions),
          ...(fromDraft ? { clearDraft: true } : {})
        });
        if (fromDraft) {
          draft = '';
          savedDraft = '';
        }
        pendingCleared = true;
        options.onSaved(record);
        paintSaved(record.minutes!, savedLine(counts));
      } catch (err) {
        save.disabled = false;
        note(err instanceof Error ? err.message : 'Could not save. Try again.');
      }
    });
    body.append(save);
    if (fromDraft) body.append(backToDraft());
  }

  function paintSaved(minutes: MeetingMinutes, line: string | null): void {
    draftStatus = null;
    body.replaceChildren();
    if (line) body.append(el('p', 'meeting-minutes__saved', line));
    const keys = minutesSectionKeys(minutes.sections);
    const items = el('div', 'meeting-minutes__items');
    minutes.sections.forEach((section, index) => {
      items.append(itemFold(keys[index]!, section.heading || null, section.text));
    });
    const notes = [...itemNotes.values()];
    const orphans = orphanedItemNotes(notes, minutes.sections);
    for (const note of orphans) {
      items.append(itemFold(note.key, note.heading, null));
    }
    const foldAll = button('Open all', 'minutes-fold-all', 'btn--ghost meeting-minutes__fold-all');
    foldAll.addEventListener('click', () => {
      const folds = [...items.querySelectorAll<HTMLDetailsElement>('details')];
      const open = !folds.every((fold) => fold.open);
      for (const fold of folds) fold.open = open;
      foldAll.textContent = open ? 'Close all' : 'Open all';
    });
    body.append(el('p', 'muted meeting-page__hint', NOTE_HINT), foldAll, items);
    if (orphans.length) body.append(el('p', 'muted meeting-page__hint', `${orphans.length === 1 ? 'The last item above is' : `The last ${orphans.length} items above are`} from earlier minutes, kept with your notes.`));
    const row = el('div', 'clare-row');
    if (minutes.file_key) {
      const open = button('Open the PDF', 'minutes-open-pdf', 'btn--ghost');
      open.addEventListener('click', () => void options.deps.openFile(minutes.file_key!).catch(() => note('Could not open the PDF.')));
      row.append(open);
    }
    const replace = button('Replace minutes', 'minutes-replace', 'btn--ghost');
    replace.addEventListener('click', () => paintEmpty(true));
    row.append(replace);
    if (draft) row.append(backToDraft());
    body.append(row);
    withPending();
  }

  paintFor(options.record());
  return card;
}
