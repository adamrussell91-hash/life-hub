import { el } from '@/quiz/dom';
import type { AnyColumn, MarkbookActions, MarkbookView, RosterStudent } from './types';
import { dateOf, formatDay, markOf, orderedColumns, overallFor } from './calc';
import { KIND_LABEL, cellFor, overallText, studentHead } from './grid';
import { lessonButton, lessonCell, shortDate, type ProgressLesson } from './progress';

/**
 * Marks & progress: one table for every lesson, quiz, task, hand-in and check, in date order.
 * Lesson boxes tick on a press; marked boxes show the mark and open it. Done (core lessons so far)
 * and Overall stay pinned on the right. At phone width, one student's list at a time.
 */

export type BookShow = 'all' | 'marked' | 'lessons';

/** Which phone nav control a redraw should put focus back on. */
export type PhoneControl = 'prev' | 'next' | 'pick';

export type BookOptions = {
  view: MarkbookView;
  students: RosterStudent[];
  lessons: readonly ProgressLesson[];
  actions: MarkbookActions;
  today: string;
  show: BookShow;
  setShow: (show: BookShow) => void;
  onMark: (studentId: string, lessonId: string, state: 'complete' | 'clear') => void;
  /** Set while a lesson tick is failing to save. */
  error?: string;
};

export type BookColumn =
  | { kind: 'lesson'; lesson: ProgressLesson; date?: string; unit?: string }
  | { kind: 'marked'; column: AnyColumn; date: string; unit?: string };

/**
 * Lessons and marked columns in one date order. A lesson that is a quiz shows once, as its quiz.
 * Undated lessons go last. A marked column takes the unit of its lesson, or of the column before it.
 */
export function bookColumns(view: MarkbookView, lessons: readonly ProgressLesson[]): BookColumn[] {
  const quizLessons = new Set(view.quizzes.map((q) => q.lesson_id));
  const unitOf = new Map(lessons.map((l) => [l.id, l.unit] as const));
  const all: BookColumn[] = [
    ...lessons.filter((l) => !quizLessons.has(l.id)).map((l): BookColumn => ({ kind: 'lesson', lesson: l, date: l.date, unit: l.unit })),
    ...orderedColumns(view).map((c): BookColumn => ({ kind: 'marked', column: c, date: dateOf(c), unit: 'lesson_id' in c ? unitOf.get(c.lesson_id) : undefined }))
  ];
  const order = all.map((c, i) => [c, i] as const).sort(([a, i], [b, j]) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0) || i - j);
  const out = order.map(([c]) => c);
  for (let i = 0; i < out.length; i++) {
    if (out[i]!.unit) continue;
    const near = out.slice(0, i).reverse().find((c) => c.unit) ?? out.slice(i + 1).find((c) => c.unit);
    if (near) out[i] = { ...out[i]!, unit: near.unit };
  }
  return out;
}

/** Core lessons set up to today that this student has done, as "done/total". */
export function doneText(view: MarkbookView, studentId: string, lessons: readonly ProgressLesson[], today: string): string {
  const due = lessons.filter((l) => l.role === 'core' && l.date && l.date <= today);
  if (!due.length) return '–';
  return `${due.filter((l) => lessonCell(view, studentId, l, today).state === 'complete').length}/${due.length}`;
}

const lessonTag = (l: ProgressLesson): string => (l.assessment ? 'Assessment' : l.role === 'core' ? '' : l.role === 'optional' ? 'Option' : l.role === 'support' ? 'Support' : 'Extension');

function markedMeta(c: AnyColumn): string {
  const max = c.kind === 'quiz' ? c.questions.reduce((n, q) => n + q.marks, 0) : 0;
  return [shortDate(dateOf(c)), max ? `out of ${max}` : '', c.kind === 'assessment' ? `${c.weight}%` : ''].filter(Boolean).join(' · ');
}

function lessonHeader(l: ProgressLesson): HTMLTableCellElement {
  const th = el('th', `mb-book__col mb-progress__lesson mb-progress__lesson--${l.role}`);
  th.scope = 'col';
  th.title = l.title;
  const label = el('div', 'mb-progress__label');
  label.append(el('span', 'mb-progress__title', l.title));
  const meta = [l.date ? shortDate(l.date) : '', lessonTag(l)].filter(Boolean).join(' · ');
  if (meta) label.append(el('span', 'mb-progress__meta', meta));
  th.append(label);
  return th;
}

/** A marked column's head: kind, its title (which opens the class view or settings), date, Hide for quizzes. */
function markedHeader(c: AnyColumn, actions: MarkbookActions): HTMLTableCellElement {
  const th = el('th', `mb-book__col mb-book__col--marked mb-col mb-col--${c.kind}`);
  th.scope = 'col';
  th.title = c.title;
  const label = el('div', 'mb-progress__label');
  const title = c.kind === 'work' ? el('span', 'mb-col__title mb-progress__title', c.title) : el('button', 'mb-col__title mb-progress__title', c.title);
  if (title instanceof HTMLButtonElement) {
    title.type = 'button';
    title.addEventListener('click', () => (c.kind === 'quiz' ? actions.openHeatmap(c.lesson_id) : actions.editColumn(c.id)));
  }
  title.dataset.col = c.id;
  label.append(el('span', 'mb-col__kind mb-book__kind', KIND_LABEL[c.kind]), title, el('span', 'mb-progress__meta', markedMeta(c)));
  th.append(label);
  if (c.kind === 'quiz') {
    const hide = el('button', 'mb-col__hide', 'Hide');
    hide.type = 'button';
    hide.setAttribute('aria-label', `Hide ${c.title}`);
    hide.addEventListener('click', () => actions.hideQuiz(c.lesson_id, true));
    th.append(hide);
  }
  return th;
}

function keyList(): HTMLElement {
  const key = el('ul', 'mb-progress__key');
  const swatch = (cls: string, symbol: string, words: string) => {
    const li = el('li', 'mb-progress__keyitem');
    const box = el('span', `mb-progress__swatch ${cls}`, symbol);
    box.setAttribute('aria-hidden', 'true');
    li.append(box, words);
    return li;
  };
  key.append(
    swatch('mb-progress__btn--complete', '✓', 'Done'),
    swatch('mb-progress__btn--complete mb-progress__btn--override', '✓', 'Ticked by you (press to undo)'),
    swatch('mb-progress__btn--partial', '◐', 'Started, or waiting to be marked'),
    swatch('mb-progress__btn--na', '', 'Not for this student'),
    swatch('mb-progress__btn--late', '', 'Overdue a week'),
    swatch('mb-book__swatch--marked', '', 'Marked work: press to mark')
  );
  return key;
}

function showChips(show: BookShow, setShow: (show: BookShow) => void): HTMLElement {
  const group = el('div', 'mb-book__show');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Show');
  for (const [value, text] of [['all', 'Everything'], ['marked', 'Marked work only'], ['lessons', 'Lessons only']] as const) {
    const b = el('button', 'mb-book__chip', text);
    b.type = 'button';
    b.dataset.show = value;
    b.setAttribute('aria-pressed', String(show === value));
    b.addEventListener('click', () => setShow(value));
    group.append(b);
  }
  return group;
}

const shown = (c: BookColumn, show: BookShow): boolean => show === 'all' || (show === 'marked') === (c.kind === 'marked');

export function renderBook(o: BookOptions): HTMLElement {
  const root = el('div', 'mb-book');
  root.append(showChips(o.show, o.setShow), keyList());
  if (o.error) {
    const alert = el('p', 'mb__error', o.error);
    alert.setAttribute('role', 'alert');
    root.append(alert);
  }
  const columns = bookColumns(o.view, o.lessons).filter((c) => shown(c, o.show));
  if (!columns.length) {
    root.append(el('p', 'mb__empty', o.show === 'marked' ? 'No marked work yet. Add a task, hand-in or check.' : 'This class has no unit lessons yet.'));
    return root;
  }
  const wrap = el('div', 'mb-book__scroll');
  const table = el('table', 'mb-book__table');
  const thead = el('thead');
  const units = columns.map((c) => c.unit ?? '');
  if (new Set(units).size > 1) {
    const band = el('tr', 'mb-progress__units');
    band.append(el('td', 'mb-progress__corner'));
    for (let i = 0; i < units.length; ) {
      let n = 1;
      while (units[i + n] === units[i]) n++;
      const th = el('th', 'mb-progress__unit');
      th.scope = 'colgroup';
      th.colSpan = n;
      th.title = units[i]!;
      th.append(el('span', 'mb-progress__unitname', units[i]!));
      band.append(th);
      i += n;
    }
    band.append(el('td', 'mb-book__pin mb-book__pin--done'), el('td', 'mb-book__pin mb-book__pin--overall'));
    thead.append(band);
  }
  const head = el('tr');
  const corner = el('th', 'mb-progress__corner', 'Student');
  corner.scope = 'col';
  head.append(corner, ...columns.map((c) => (c.kind === 'lesson' ? lessonHeader(c.lesson) : markedHeader(c.column, o.actions))));
  const doneHead = el('th', 'mb-book__pin mb-book__pin--done');
  doneHead.scope = 'col';
  doneHead.append('Done', el('small', undefined, 'core so far'));
  const overallHead = el('th', 'mb-book__pin mb-book__pin--overall', 'Overall');
  overallHead.scope = 'col';
  head.append(doneHead, overallHead);
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (const s of o.students) {
    const tr = el('tr');
    const name = el('th', 'mb-progress__student');
    name.scope = 'row';
    name.append(studentHead(o.view, s, o.actions.openStudent));
    tr.append(name);
    for (const c of columns) {
      const td = el('td', c.kind === 'lesson' ? 'mb-progress__cell' : 'mb-progress__cell mb-book__marked');
      td.append(c.kind === 'lesson' ? lessonButton(o.view, s, c.lesson, o.today, o.onMark) : cellFor(o.view, c.column, s, o.actions, o.today, { quizScore: true }));
      tr.append(td);
    }
    tr.append(el('td', 'mb-book__pin mb-book__pin--done', doneText(o.view, s.id, o.lessons, o.today)), el('td', 'mb-book__pin mb-book__pin--overall', overallText(overallFor(o.view.markbook, s.id))));
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  root.append(wrap);
  return root;
}

/** Phone width: one student, every lesson and marked column as a list by unit. */
export function renderBookPhone(o: BookOptions & { index: number; move: (index: number) => void }): HTMLElement {
  const at = Math.max(0, Math.min(o.students.length - 1, o.index));
  const s = o.students[at]!;
  const card = el('div', 'mb-phone mb-book');
  const nav = el('div', 'mb-phone__nav');
  const prev = el('button', 'btn btn--secondary mb-phone__prev', 'Previous');
  prev.type = 'button';
  prev.dataset.phone = 'prev';
  prev.disabled = at === 0;
  prev.addEventListener('click', () => o.move(at - 1));
  const next = el('button', 'btn btn--secondary mb-phone__next', 'Next');
  next.type = 'button';
  next.dataset.phone = 'next';
  next.disabled = at === o.students.length - 1;
  next.addEventListener('click', () => o.move(at + 1));
  const pick = el('select', 'mb-form__input mb-phone__pick');
  pick.dataset.phone = 'pick';
  pick.setAttribute('aria-label', 'Student');
  o.students.forEach((x, i) => {
    const opt = el('option', undefined, `${x.initials} · ${x.name}`);
    opt.value = String(i);
    pick.append(opt);
  });
  pick.value = String(at);
  pick.addEventListener('change', () => o.move(Number(pick.value)));
  nav.append(prev, pick, next);
  const head = el('div', 'mb-phone__head');
  head.append(el('h3', 'mb-phone__name', `${s.initials} · ${s.name}`));
  const sums = el('div', 'mb-book__sums');
  const sum = (value: string, words: string, cls: string) => {
    const box = el('div', 'mb-book__sum');
    box.append(el('b', cls, value), el('span', undefined, words));
    return box;
  };
  sums.append(
    sum(doneText(o.view, s.id, o.lessons, o.today), 'Core lessons done', 'mb-phone__done'),
    sum(overallText(overallFor(o.view.markbook, s.id)), 'Overall', 'mb-phone__overall')
  );
  card.append(nav, head, sums, showChips(o.show, o.setShow));
  if (o.error) {
    const alert = el('p', 'mb__error', o.error);
    alert.setAttribute('role', 'alert');
    card.append(alert);
  }
  const list = el('div', 'mb-phone__list');
  let unit: string | undefined;
  for (const c of bookColumns(o.view, o.lessons).filter((x) => shown(x, o.show))) {
    if (c.unit && c.unit !== unit) {
      unit = c.unit;
      list.append(el('p', 'mb-book__unit', unit));
    }
    const row = el('div', c.kind === 'marked' ? 'mb-phone__row mb-book__marked' : 'mb-phone__row');
    const label = el('div', 'mb-phone__label');
    if (c.kind === 'lesson') {
      label.append(el('span', undefined, c.lesson.title), el('small', undefined, [lessonTag(c.lesson), c.lesson.date ? formatDay(c.lesson.date) : ''].filter(Boolean).join(' · ')));
      row.append(label, lessonButton(o.view, s, c.lesson, o.today, o.onMark));
    } else {
      const col = c.column;
      label.append(el('span', undefined, col.title), el('small', undefined, `${KIND_LABEL[col.kind]} · ${formatDay(dateOf(col))}`));
      row.append(label, cellFor(o.view, col, s, o.actions, o.today, { clearHint: false, quizScore: true }));
      if ((col.kind === 'handin' || col.kind === 'check') && !s.removed && markOf(o.view.markbook, col.id, s.id) !== undefined) {
        const clear = el('button', 'mb-phone__clear', 'Clear');
        clear.type = 'button';
        clear.setAttribute('aria-label', `Clear ${col.title} for ${s.name}`);
        clear.dataset.col = col.id;
        clear.dataset.student = s.id;
        clear.addEventListener('click', () => o.actions.setMark(col.id, s.id, null));
        row.append(clear);
      }
    }
    list.append(row);
  }
  card.append(list);
  return card;
}
