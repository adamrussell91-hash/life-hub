import { el } from '@/quiz/dom';
import type { AssessmentMark, CheckMark, HandinMark } from './schema';
import type { AnyColumn, MarkbookActions, MarkbookView, RosterStudent } from './types';
import { assessmentResult, dateOf, formatDay, formatPercent, markOf, orderedColumns, overallFor, quizPercent, type Overall } from './calc';
import { HANDIN_LABEL, nextCheck, nextHandin } from './cells';
import { isConfidentlyWrong, isDropping, quizSeries } from './insight';

/** The desktop grid: students down the side, columns in date order, overall pinned right. */

export const KIND_LABEL = { quiz: 'Quiz', assessment: 'Task', handin: 'Hand-in', check: 'Check' } as const;

export const overallText = (o: Overall): string => (o.percent === null ? '–' : `${formatPercent(o.percent)}${o.partial ? ' so far' : ''}`);

function button(className: string, text: string, label: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
}

/** A right-click (or a long press on a phone), Delete or Backspace clears the cell. */
function clearOn(b: HTMLElement, clear: () => void): void {
  b.setAttribute('aria-label', `${b.getAttribute('aria-label') ?? ''}, Delete to clear`);
  b.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    clear();
  });
  b.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    clear();
  });
}

export function cellFor(view: MarkbookView, column: AnyColumn, student: RosterStudent, actions: MarkbookActions, today: string): HTMLElement {
  let cell = cellButton(view, column, student, actions, today);
  if (student.removed && cell instanceof HTMLButtonElement) {
    // The server refuses writes for students no longer on the class list, so their rows are read-only.
    const span = el('span', cell.className);
    span.append(...cell.childNodes);
    cell = span;
  }
  cell.dataset.col = column.id;
  cell.dataset.student = student.id;
  return cell;
}

function cellButton(view: MarkbookView, column: AnyColumn, student: RosterStudent, actions: MarkbookActions, today: string): HTMLElement {
  const sid = student.id;
  if (column.kind === 'quiz') {
    const score = column.scores[sid];
    if (!score) return el('span', 'mb-cell mb-cell--quiz mb-cell--blank', '');
    const toMark = score.pending > 0 ? `, ${score.pending} to mark` : '';
    const b = button('mb-cell mb-cell--quiz', formatPercent(quizPercent(score)), `${column.title}, ${student.name}: ${formatPercent(quizPercent(score))}${toMark}`);
    if (score.pending > 0) {
      const dot = el('span', 'mb-cell__pending');
      dot.title = `${score.pending} to mark`;
      b.append(dot);
    }
    b.addEventListener('click', () => actions.openQuiz(column.lesson_id, sid));
    return b;
  }
  if (column.kind === 'assessment') {
    const r = assessmentResult(column, markOf<AssessmentMark>(view.markbook, column.id, sid));
    const text = r.exempt ? 'Exempt' : r.score === null ? '–' : r.complete ? `${r.score}/${r.max} · ${formatPercent(r.percent)}` : `${r.score}/${r.max}…`;
    const b = button(`mb-cell mb-cell--assessment${r.exempt ? ' is-exempt' : ''}`, text, `${column.title}, ${student.name}: ${text}`);
    b.addEventListener('click', () => actions.openAssessment(column.id, sid));
    return b;
  }
  if (column.kind === 'handin') {
    const mark = markOf<HandinMark>(view.markbook, column.id, sid);
    const text = mark ? HANDIN_LABEL[mark.status] : '–';
    const b = button(`mb-cell mb-cell--handin${mark ? ` mb-chip--${mark.status}` : ''}`, text, `${column.title}, ${student.name}: ${text}`);
    b.addEventListener('click', () => actions.setMark(column.id, sid, nextHandin(mark, today)));
    clearOn(b, () => actions.setMark(column.id, sid, null));
    return b;
  }
  const mark = markOf<CheckMark>(view.markbook, column.id, sid);
  const text = mark === true ? '✓' : mark === false ? '✗' : typeof mark === 'number' ? String(mark) : '–';
  const b = button('mb-cell mb-cell--check', text, `${column.title}, ${student.name}: ${text}`);
  b.addEventListener('click', () => actions.setMark(column.id, sid, nextCheck(column.scale, mark)));
  clearOn(b, () => actions.setMark(column.id, sid, null));
  return b;
}

export function headerFor(column: AnyColumn, actions: MarkbookActions): HTMLTableCellElement {
  const th = el('th', `mb-col mb-col--${column.kind}`);
  th.scope = 'col';
  const title = el('button', 'mb-col__title', column.title);
  title.type = 'button';
  title.title = column.title;
  title.dataset.col = column.id;
  title.addEventListener('click', () => (column.kind === 'quiz' ? actions.openHeatmap(column.lesson_id) : actions.editColumn(column.id)));
  th.append(el('span', 'mb-col__kind', KIND_LABEL[column.kind]), title, el('span', 'mb-col__date', formatDay(dateOf(column))));
  if (column.kind === 'assessment') th.append(el('span', 'mb-col__weight', `${column.weight}%`));
  if (column.kind === 'quiz') {
    const hide = el('button', 'mb-col__hide', 'Hide');
    hide.type = 'button';
    hide.setAttribute('aria-label', `Hide ${column.title}`);
    hide.addEventListener('click', () => actions.hideQuiz(column.lesson_id, true));
    th.append(hide);
  }
  return th;
}

export function sparkline(series: number[]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const w = 48;
  const h = 16;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'mb-spark');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', series.map((p, i) => `${(i / Math.max(1, series.length - 1)) * w},${h - (Math.max(0, Math.min(100, p)) / 100) * h}`).join(' '));
  svg.append(line);
  return svg;
}

function flag(label: string, reason: string): HTMLElement {
  const f = el('span', 'mb-flag', label);
  f.title = reason;
  f.tabIndex = 0;
  f.setAttribute('aria-label', `${label}: ${reason}`);
  return f;
}

export function studentHead(view: MarkbookView, student: RosterStudent): HTMLElement {
  const wrap = el('div', 'mb-student');
  const name = el('span', 'mb-student__name', student.name);
  name.title = student.name;
  wrap.append(el('span', 'mb-student__initials', student.initials), name);
  const series = quizSeries(view, student.id);
  if (series.length >= 2) wrap.append(sparkline(series));
  if (isDropping(series)) wrap.append(flag('Dropping', 'The last three quizzes are 15 or more points below the ones before.'));
  if (isConfidentlyWrong(view, student.id)) wrap.append(flag('Confident and wrong', 'Often sure of answers that scored zero.'));
  return wrap;
}

export function renderGrid(view: MarkbookView, students: RosterStudent[], actions: MarkbookActions, today: string): HTMLElement {
  const columns = orderedColumns(view);
  const wrap = el('div', 'mb-grid');
  const table = el('table', 'mb-grid__table');
  const headRow = el('tr');
  const corner = el('th', 'mb-grid__student', 'Student');
  corner.scope = 'col';
  const overallHead = el('th', 'mb-grid__overall', 'Overall');
  overallHead.scope = 'col';
  headRow.append(corner, ...columns.map((c) => headerFor(c, actions)), overallHead);
  const body = el('tbody');
  for (const s of students) {
    const row = el('tr');
    const head = el('th', 'mb-grid__student');
    head.scope = 'row';
    head.append(studentHead(view, s));
    row.append(head);
    for (const c of columns) {
      const td = el('td', 'mb-grid__cell');
      td.append(cellFor(view, c, s, actions, today));
      row.append(td);
    }
    row.append(el('td', 'mb-grid__overall', overallText(overallFor(view.markbook, s.id))));
    body.append(row);
  }
  const thead = el('thead');
  thead.append(headRow);
  table.append(thead, body);
  wrap.append(table);
  return wrap;
}
