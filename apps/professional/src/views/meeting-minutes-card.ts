import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { fileBase64, type ClareMinutesReview } from '@/api/clare-comms';
import { PDF_MAX_BYTES, savedLine, type MinutesSaveInput } from '@/lib/meeting-minutes';
import type { MeetingMinutes, MeetingRecord } from '@/domain/types';

type CardAttendee = { ref: string; name: string; role: string | null };

export type MinutesCardDeps = {
  read: (minutes: { pdf: { media_type: 'application/pdf'; data: string } } | { text: string }) => Promise<ClareMinutesReview>;
  save: (input: Omit<MinutesSaveInput, 'record' | 'meetingRef' | 'attendees'>) => Promise<{ record: MeetingRecord; counts: MeetingMinutes['saved_counts'] }>;
  openFile: (fileKey: string) => Promise<void>;
};

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

  function paintEmpty(withCancel: boolean): void {
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = 'application/pdf';
    file.hidden = true;
    const add = button('Add minutes', 'minutes-add', 'btn--primary');
    add.addEventListener('click', () => file.click());
    const pasteToggle = button('Paste instead', 'minutes-paste-toggle', 'btn--ghost');
    const paste = el('div', 'meeting-minutes__paste');
    paste.hidden = true;
    const area = el('textarea') as HTMLTextAreaElement;
    area.rows = 8;
    area.setAttribute('aria-label', 'Paste the minutes');
    const readText = button('Read pasted minutes', 'minutes-read-text');
    paste.append(area, readText);
    pasteToggle.addEventListener('click', () => { paste.hidden = !paste.hidden; if (!paste.hidden) area.focus(); });
    readText.addEventListener('click', () => {
      const text = area.value.trim();
      if (text) void runRead({ text }, null);
    });
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      if (picked.type !== 'application/pdf') return note('That isn’t a PDF. Paste the text instead.');
      if (picked.size > PDF_MAX_BYTES) return note('That PDF is over 4 MB. Paste the part you need instead.');
      const data = await fileBase64(picked);
      void runRead({ pdf: { media_type: 'application/pdf', data } }, data);
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
  }

  function note(message: string): void {
    body.querySelector('.meeting-minutes__note')?.remove();
    body.append(el('p', 'muted meeting-minutes__note', message));
  }

  async function runRead(minutes: Parameters<MinutesCardDeps['read']>[0], pdfData: string | null): Promise<void> {
    body.replaceChildren(el('p', 'muted', 'Clare is reading the minutes…'));
    try {
      paintReview(await options.deps.read(minutes), pdfData);
    } catch (err) {
      body.replaceChildren(
        el('p', 'muted', 'Clare couldn’t read these minutes.'),
        el('p', 'muted meeting-minutes__note', err instanceof Error ? err.message : '')
      );
      const retry = button('Try again', 'minutes-retry');
      retry.addEventListener('click', () => void runRead(minutes, pdfData));
      body.append(retry);
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

  function paintReview(review: ClareMinutesReview, pdfData: string | null): void {
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
          sections: review.sections,
          mine: ticked(mine).map(({ text, due: d }) => ({ text, due: d })),
          others: [...ticked(others).map(({ text, person_ref, due: d }) => ({ text, person_ref, due: d })), ...picked],
          decisions: ticked(decisions)
        });
        options.onSaved(record);
        paintSaved(record.minutes!, savedLine(counts));
      } catch (err) {
        save.disabled = false;
        note(err instanceof Error ? err.message : 'Could not save. Try again.');
      }
    });
    body.append(save);
  }

  function paintSaved(minutes: MeetingMinutes, line: string | null): void {
    body.replaceChildren();
    if (line) body.append(el('p', 'meeting-minutes__saved', line));
    for (const section of minutes.sections) {
      const block = el('div', 'meeting-minutes__section');
      if (section.heading) block.append(el('h4', undefined, section.heading));
      block.append(el('p', 'meeting-minutes__text', section.text));
      body.append(block);
    }
    const row = el('div', 'clare-row');
    if (minutes.file_key) {
      const open = button('Open the PDF', 'minutes-open-pdf', 'btn--ghost');
      open.addEventListener('click', () => void options.deps.openFile(minutes.file_key!).catch(() => note('Could not open the PDF.')));
      row.append(open);
    }
    const replace = button('Replace minutes', 'minutes-replace', 'btn--ghost');
    replace.addEventListener('click', () => paintEmpty(true));
    row.append(replace);
    body.append(row);
  }

  const existing = options.record().minutes;
  if (existing) paintSaved(existing, null);
  else paintEmpty(false);
  return card;
}
