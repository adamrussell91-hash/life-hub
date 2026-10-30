import { el } from '@/quiz/dom';
import type { QuizColumn, RosterStudent, WorkColumn } from './types';
import { band4, heatShare, reteachList } from './insight';
import { openOverlay } from './overlay';

/** Overlay sheets opened from a quiz or work column: the class heatmap, one student's attempt, one student's writing. */

export type SheetOptions = {
  /** Where focus goes on close when the element that opened the sheet is gone. */
  returnFocus?: () => HTMLElement | null;
};

let sheetCount = 0;

/** A sheet with a Close button, its contents, and a heading among them that names the dialog. */
function present(heading: HTMLElement, contents: Node[], opts: SheetOptions): HTMLElement {
  const body = el('div', 'mb-sheet');
  heading.id = `mb-sheet-${(sheetCount += 1)}`;
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  body.append(close, ...contents);
  const opened = openOverlay(body, { labelledBy: heading.id, returnFocus: opts.returnFocus });
  close.addEventListener('click', () => opened.close());
  return opened.overlay;
}

const LEGEND: Array<[string, string]> = [
  ['mb-band--low', 'Below 50'],
  ['mb-band--mid', '50–69'],
  ['mb-band--good', '70–84'],
  ['mb-band--high', '85+'],
  ['mb-heat--pending', 'To mark'],
  ['mb-heat--none', 'Not taken']
];

function legend(): HTMLElement {
  const list = el('ul', 'mb-heat-legend');
  for (const [cls, text] of LEGEND) {
    const item = el('li', 'mb-heat-legend__item');
    const swatch = el('span', `mb-heat-legend__swatch ${cls}`);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, text);
    list.append(item);
  }
  return list;
}

const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text || 'Question');

export function openHeatmap(quiz: QuizColumn, students: RosterStudent[], opts: SheetOptions = {}): HTMLElement {
  const heading = el('h3', 'mb-form__title', quiz.title);
  const body: Node[] = [heading];
  const reteach = reteachList(quiz, students.map((s) => s.id));
  body.push(el('h4', 'mb-form__label', 'Reteach'));
  if (!reteach.length) body.push(el('p', 'mb__empty', 'No question averaged below 50%.'));
  else {
    const list = el('ol', 'mb-reteach');
    for (const r of reteach) {
      const item = el('li', undefined, `${short(r.prompt)} · ${Math.round(r.average * 100)}%`);
      item.title = r.prompt;
      list.append(item);
    }
    body.push(list);
  }
  const grid = el('div', 'mb-grid');
  const table = el('table', 'mb-grid__table mb-heat');
  const headRow = el('tr');
  const corner = el('th', 'mb-grid__student', 'Question');
  corner.scope = 'col';
  headRow.append(corner);
  for (const s of students) {
    const th = el('th', undefined, s.initials);
    th.scope = 'col';
    th.title = s.name;
    headRow.append(th);
  }
  const thead = el('thead');
  thead.append(headRow);
  const tbody = el('tbody');
  for (const q of quiz.questions) {
    const row = el('tr');
    const head = el('th', 'mb-grid__student', short(q.prompt));
    head.scope = 'row';
    head.title = q.prompt;
    row.append(head);
    for (const s of students) {
      const r = quiz.scores[s.id]?.rows.find((x) => x.id === q.id);
      const share = heatShare(r);
      const td = el('td', `mb-heat__cell ${!r ? 'mb-heat--none' : share === null ? 'mb-heat--pending' : `mb-band--${band4(share * 100)}`}`);
      // Hidden text, not aria-label: screen readers announce a cell's content, but often skip a label on a td.
      td.append(el('span', 'mb-sr', `${s.name}: ${!r ? 'not taken' : share === null ? 'to mark' : `${Math.round(share * 100)}%`}`));
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  grid.append(table);
  body.push(grid, legend());
  return present(heading, body, opts);
}

const SAVED_AT = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const savedAt = (iso: string | null): string => (iso ? SAVED_AT.format(new Date(iso)) : '');

export function openQuizAttempt(quiz: QuizColumn, student: RosterStudent, resultsHref: string, opts: SheetOptions = {}): HTMLElement {
  const heading = el('h3', 'mb-panel__student', `${student.initials} · ${student.name}`);
  const list = el('ul', 'mb-attempt');
  const score = quiz.scores[student.id];
  // Not handed in: the go as its page last saved it, marked so far.
  const saved = score ? undefined : quiz.saved?.[student.id];
  const rows = score?.rows ?? saved?.rows ?? [];
  // Walks the quiz's questions, so rows from an older published key are left out.
  for (const q of quiz.questions) {
    const r = rows.find((x) => x.id === q.id);
    // A handed-in blank keeps its mark; a go still open says it hasn't got there yet.
    const blank = !r || (!!saved && !!r.unanswered);
    list.append(el('li', undefined, `${short(q.prompt)} · ${blank ? (saved ? 'not answered yet' : 'not answered') : r.awarded === null ? 'to mark' : `${r.awarded}/${r.max}`}`));
  }
  const note = saved
    ? el('p', 'mb-attempt__note', `Not handed in. ${saved.answered} of ${saved.total} answered, ${saved.score}/${saved.max} so far${saved.saved_at ? `, last saved ${savedAt(saved.saved_at)}` : ''}. Closing the quiz in Results hands this in.`)
    : null;
  const flagged = score?.writing_flags ?? 0;
  const writing = flagged ? el('p', 'mb-attempt__writing', `${flagged} written ${flagged === 1 ? 'answer' : 'answers'} to check for how ${flagged === 1 ? 'it was' : 'they were'} typed. Results has the replay.`) : null;
  const link = el('a', 'mb-attempt__link', saved ? 'Open Results' : 'Mark in Results');
  link.href = resultsHref;
  return present(heading, [el('p', 'mb-panel__task', quiz.title), heading, ...(note ? [note] : []), list, ...(writing ? [writing] : []), link], opts);
}

/** A readable name for a field the page saved: the question it answers, else its own name in words. */
export function workLabel(prompts: Record<string, string>, part: string, field: string): string {
  if (part === 'answers' && prompts[field]) return prompts[field];
  const words = (text: string): string => text.replace(/\bs(\d+)\b/g, 'step $1').replace(/[._:-]+/g, ' ').trim();
  const name = part === 'answers' ? words(field) : `${words(part.slice(part.indexOf('.') + 1))} · ${words(field)}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function openWorkSheet(work: WorkColumn, student: RosterStudent, lessonHref: string, opts: SheetOptions = {}): HTMLElement {
  const heading = el('h3', 'mb-panel__student', `${student.initials} · ${student.name}`);
  const mine = work.students[student.id];
  const body: Node[] = [el('p', 'mb-panel__task', work.title), heading];
  if (mine?.at) body.push(el('p', 'mb-attempt__note', `Saved as they wrote. Last saved ${savedAt(mine.at)}.`));
  const list = el('div', 'mb-work');
  // Blocks keep lesson order; within a block, answers keep the order the page saved them.
  for (const block of work.blocks) {
    const parts = mine?.blocks[block.id];
    if (!parts) continue;
    const items = Object.entries(parts).flatMap(([part, fields]) => Object.entries(fields).filter(([, t]) => t.trim()).map(([field, text]) => [part, field, text] as const));
    if (!items.length) continue;
    if (block.title) list.append(el('h4', 'mb-work__block', block.title));
    for (const [part, field, text] of items) {
      const item = el('div', 'mb-work__item');
      item.append(el('p', 'mb-work__label', workLabel(block.prompts, part, field)), el('p', 'mb-work__text', text));
      list.append(item);
    }
  }
  if (!list.childElementCount) list.append(el('p', 'mb__empty', 'Nothing written yet.'));
  const link = el('a', 'mb-attempt__link', 'Open the lesson');
  link.href = lessonHref;
  body.push(list, link);
  return present(heading, body, opts);
}
