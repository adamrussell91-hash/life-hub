import type { AssessmentMark, CheckMark, HandinMark } from './schema';
import type { AnyColumn, MarkbookView } from './types';
import { assessmentResult, formatPercent, markOf, orderedColumns, overallFor, quizPercent, sortStudents, workCount } from './calc';
import { HANDIN_LABEL } from './cells';

/** Quote when needed, and defuse text a spreadsheet would run as a formula. */
const cell = (raw: string): string => {
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const blankDash = (text: string): string => (text === '–' ? '' : text);

function value(view: MarkbookView, column: AnyColumn, studentId: string): string {
  if (column.kind === 'work') {
    const n = workCount(column, studentId);
    return n ? `${n} written` : '';
  }
  if (column.kind === 'quiz') {
    const score = column.scores[studentId];
    const saved = column.saved?.[studentId];
    if (!score && saved) return `Not handed in (${saved.answered}/${saved.total} answered)`;
    const text = blankDash(formatPercent(quizPercent(score)));
    // A score with answers still to mark is not final; say so rather than look like a finished mark.
    return text && score && score.pending > 0 ? `${text} (${score.pending} to mark)` : text;
  }
  if (column.kind === 'assessment') {
    const r = assessmentResult(column, markOf<AssessmentMark>(view.markbook, column.id, studentId));
    return r.exempt ? 'Exempt' : blankDash(formatPercent(r.percent));
  }
  if (column.kind === 'handin') {
    const mark = markOf<HandinMark>(view.markbook, column.id, studentId);
    return mark ? HANDIN_LABEL[mark.status] : '';
  }
  const mark = markOf<CheckMark>(view.markbook, column.id, studentId);
  return mark === true ? 'Yes' : mark === false ? 'No' : typeof mark === 'number' ? String(mark) : '';
}

/** One row per student on the list, every shown column, then the overall mark. */
export function markbookCsv(view: MarkbookView): string {
  const columns = orderedColumns(view);
  const lines = [['Initials', 'Name', ...columns.map((c) => c.title), 'Overall']];
  for (const s of sortStudents(view.students)) {
    lines.push([s.initials, s.name, ...columns.map((c) => value(view, c, s.id)), blankDash(formatPercent(overallFor(view.markbook, s.id).percent))]);
  }
  return lines.map((row) => row.map(cell).join(',')).join('\n');
}

export function csvFileName(className: string, today: string): string {
  const slug = className.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
  return `markbook-${slug}-${today}.csv`;
}
