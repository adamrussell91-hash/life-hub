import { el, formatMarks } from '@/quiz/dom';
import type { AssessmentMark, CheckMark, HandinMark } from './schema';
import type { AnyColumn, MarkbookActions, MarkbookView, RosterStudent } from './types';
import { assessmentResult, formatPercent, markOf, quizPercent, workCount, type Overall } from './calc';
import { HANDIN_LABEL, nextCheck, nextHandin } from './cells';
import { isConfidentlyWrong, isDropping, quizSeries } from './insight';

/** Marked-column cells, headers and the student head, shared by Marks & progress and its phone list. */

export const KIND_LABEL = { quiz: 'Quiz', assessment: 'Task', handin: 'Hand-in', check: 'Check', work: 'Work' } as const;

export const overallText = (o: Overall): string => (o.percent === null ? '–' : `${formatPercent(o.percent)}${o.partial ? ' so far' : ''}`);

function button(className: string, text: string, label: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
}

/**
 * A right-click, Delete or Backspace clears the cell. `hint` adds that to the
 * label; the phone card leaves it off, since it has a visible Clear button.
 */
function clearOn(b: HTMLElement, clear: () => void, hint: boolean): void {
  if (hint) b.setAttribute('aria-label', `${b.getAttribute('aria-label') ?? ''}, Delete to clear`);
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

export type CellOptions = {
  /** Say "Delete to clear" in the label. Defaults to true. */
  clearHint?: boolean;
  /** Show a handed-in quiz as its mark, 13/20, instead of a percentage. */
  quizScore?: boolean;
};

export function cellFor(
  view: MarkbookView,
  column: AnyColumn,
  student: RosterStudent,
  actions: MarkbookActions,
  today: string,
  options: CellOptions = {}
): HTMLElement {
  let cell = cellButton(view, column, student, actions, today, options.clearHint ?? true, options.quizScore ?? false);
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

function cellButton(view: MarkbookView, column: AnyColumn, student: RosterStudent, actions: MarkbookActions, today: string, hint: boolean, asScore: boolean): HTMLElement {
  const sid = student.id;
  if (column.kind === 'quiz') {
    const score = column.scores[sid];
    if (!score) {
      // A tutorial's exit check is for the students in its groups; everyone else isn't missing it.
      if (column.groups && !column.groups[sid]) return el('span', 'mb-cell mb-cell--quiz mb-cell--blank mb-cell--na', '');
      const saved = column.saved?.[sid];
      if (saved) {
        // Not handed in, but their page saved answers as they went: show how far they got.
        const text = `${saved.answered}/${saved.total}`;
        const b = button('mb-cell mb-cell--quiz mb-cell--started mb-cell--saved', text, `${column.title}, ${student.name}: not handed in, ${saved.answered} of ${saved.total} answered, ${formatMarks(saved.score)}/${formatMarks(saved.max)} so far`);
        b.title = 'Not handed in. Answers saved as they went.';
        b.addEventListener('click', () => actions.openQuiz(column.lesson_id, sid));
        return b;
      }
      if (column.started?.includes(sid)) {
        const open = el('span', 'mb-cell mb-cell--quiz mb-cell--blank mb-cell--started', 'Started');
        open.title = 'Opened this quiz but hasn’t handed it in';
        return open;
      }
      return el('span', 'mb-cell mb-cell--quiz mb-cell--blank', '');
    }
    const toMark = score.pending > 0 ? `, ${score.pending} to mark` : '';
    const group = column.groups?.[sid];
    const shown = asScore ? `${formatMarks(score.score)}/${formatMarks(score.max)}` : formatPercent(quizPercent(score));
    const b = button('mb-cell mb-cell--quiz', shown, `${column.title}, ${student.name}: ${shown}${toMark}${group ? ` · ${group}` : ''}`);
    const percent = quizPercent(score);
    b.dataset.result = score.pending > 0 ? 'waiting' : percent !== null && percent < 50 ? 'low' : 'done';
    if (group) b.title = group;
    if (score.pending > 0) {
      const dot = el('span', 'mb-cell__pending');
      dot.title = `${score.pending} to mark`;
      b.append(dot);
    }
    if (score.writing_flags) {
      const mark = el('span', 'mb-cell__writing', '✎');
      mark.title = `${score.writing_flags} written ${score.writing_flags === 1 ? 'answer' : 'answers'} to check: open Results to see how they were typed`;
      b.append(mark);
      b.setAttribute('aria-label', `${b.getAttribute('aria-label') ?? ''}, ${mark.title}`);
    }
    const practice = Object.values(score.practice ?? {});
    if (practice.length) {
      const got = practice.reduce((n, p) => n + p.score, 0);
      const max = practice.reduce((n, p) => n + p.max, 0);
      const line = el('span', 'mb-cell__practice', `+${formatMarks(got)}/${formatMarks(max)}`);
      line.title = `Practice for their group: ${formatMarks(got)}/${formatMarks(max)}`;
      b.append(line);
    }
    b.addEventListener('click', () => actions.openQuiz(column.lesson_id, sid));
    return b;
  }
  if (column.kind === 'work') {
    const n = workCount(column, sid);
    if (!n) return el('span', 'mb-cell mb-cell--work mb-cell--blank', '');
    const text = `${n} written`;
    const b = button('mb-cell mb-cell--work', text, `${column.title}, ${student.name}: ${n} ${n === 1 ? 'answer' : 'answers'} written`);
    b.addEventListener('click', () => actions.openWork(column.lesson_id, sid));
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
    clearOn(b, () => actions.setMark(column.id, sid, null), hint);
    return b;
  }
  const mark = markOf<CheckMark>(view.markbook, column.id, sid);
  const text = mark === true ? '✓' : mark === false ? '✗' : typeof mark === 'number' ? String(mark) : '–';
  const b = button('mb-cell mb-cell--check', text, `${column.title}, ${student.name}: ${text}`);
  b.addEventListener('click', () => actions.setMark(column.id, sid, nextCheck(column.scale, mark)));
  clearOn(b, () => actions.setMark(column.id, sid, null), hint);
  return b;
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

export function studentHead(view: MarkbookView, student: RosterStudent, onOpen?: (id: string) => void): HTMLElement {
  const wrap = el('div', 'mb-student');
  const name = onOpen ? el('button', 'mb-student__name mb-patterns__name', student.name) : el('span', 'mb-student__name', student.name);
  if (onOpen && name instanceof HTMLButtonElement) {
    name.type = 'button';
    name.dataset.student = student.id;
    name.addEventListener('click', () => onOpen(student.id));
  }
  name.title = student.name;
  wrap.append(el('span', 'mb-student__initials', student.initials), name);
  // No trend line here: it cost a column of width and said little. Patterns keeps one per group.
  const series = quizSeries(view, student.id);
  if (isDropping(series)) wrap.append(flag('Dropping', 'The last three quizzes are 15 or more points below the ones before.'));
  if (isConfidentlyWrong(view, student.id)) wrap.append(flag('Confident and wrong', 'Often sure of answers that scored zero.'));
  return wrap;
}
