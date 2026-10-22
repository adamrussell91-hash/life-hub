import type { AssessmentColumn, AssessmentMark, Criterion, Markbook } from './schema';
import type { AnyColumn, MarkbookView, QuizScore, RosterStudent } from './types';

/** Plain sums behind the markbook. No DOM, so tests and every view share them. */

export type AssessmentResult = { exempt: boolean; score: number | null; max: number; percent: number | null; complete: boolean };

const collator = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true });

export const criteriaMax = (column: AssessmentColumn): number => column.criteria.reduce((sum, c) => sum + c.max, 0);

export function assessmentResult(column: AssessmentColumn, mark: AssessmentMark | undefined): AssessmentResult {
  const max = criteriaMax(column);
  if (mark?.exempt) return { exempt: true, score: null, max, percent: null, complete: false };
  const given = column.criteria.map((c) => mark?.criteria?.[c.id]).filter((v): v is number => typeof v === 'number');
  if (!given.length) return { exempt: false, score: null, max, percent: null, complete: false };
  const score = Math.round(given.reduce((sum, v) => sum + v, 0) * 100) / 100;
  const complete = given.length === column.criteria.length;
  return { exempt: false, score, max, percent: complete ? (score / max) * 100 : null, complete };
}

/** The marking-guideline band a criterion mark falls in, or null without bands. */
export function bandFor(criterion: Criterion, value: number): string | null {
  const bands = [...(criterion.bands ?? [])].sort((a, b) => b.min - a.min);
  return bands.find((b) => value >= b.min)?.label ?? null;
}

export function markOf<T>(book: Markbook, columnId: string, studentId: string): T | undefined {
  return book.marks[columnId]?.[studentId] as T | undefined;
}

export const assessments = (book: Markbook): AssessmentColumn[] => book.columns.filter((c): c is AssessmentColumn => c.kind === 'assessment');
export const weightTotal = (book: Markbook): number => assessments(book).reduce((sum, c) => sum + c.weight, 0);

export type Overall = { percent: number | null; partial: boolean };

/**
 * Weighted assessment mark. An exempt task drops out, so its weight spreads
 * over the rest; an unmarked task makes the result "so far".
 */
export function overallFor(book: Markbook, studentId: string): Overall {
  let weighted = 0;
  let weights = 0;
  let partial = false;
  for (const column of assessments(book)) {
    if (column.weight === 0) continue;
    const r = assessmentResult(column, markOf<AssessmentMark>(book, column.id, studentId));
    if (r.exempt) continue;
    if (r.percent === null) {
      partial = true;
      continue;
    }
    weighted += column.weight * r.percent;
    weights += column.weight;
  }
  return { percent: weights ? weighted / weights : null, partial };
}

export const quizPercent = (score: QuizScore | undefined): number | null => (score && score.max > 0 ? (score.score / score.max) * 100 : null);

export function dateOf(column: AnyColumn): string {
  return column.kind === 'handin' ? column.due : column.date;
}

/** Teacher columns and shown quizzes, oldest first. */
export function orderedColumns(view: MarkbookView): AnyColumn[] {
  const all: AnyColumn[] = [...view.markbook.columns, ...view.quizzes.filter((q) => !q.hidden)];
  return all.sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || collator.compare(a.title, b.title));
}

const surname = (name: string): string => name.trim().split(/\s+/).pop() ?? '';
export function sortStudents<T extends { name: string }>(students: readonly T[]): T[] {
  return [...students].sort((a, b) => collator.compare(surname(a.name), surname(b.name)) || collator.compare(a.name, b.name));
}

export function removedStudentIds(view: MarkbookView): string[] {
  const listed = new Set(view.students.map((s) => s.id));
  const out = new Set<string>();
  for (const byStudent of Object.values(view.markbook.marks)) for (const id of Object.keys(byStudent)) if (!listed.has(id)) out.add(id);
  return [...out];
}

/** Rows to draw: the list by surname, then removed students when asked for. */
export function rowStudents(view: MarkbookView, showRemoved: boolean): RosterStudent[] {
  const rows = sortStudents(view.students);
  if (!showRemoved) return rows;
  return [...rows, ...removedStudentIds(view).map((id, i) => ({ id, name: `Removed student ${i + 1}`, initials: '–', removed: true as const }))];
}

export const formatPercent = (p: number | null): string => (p === null ? '–' : `${Math.round(p)}%`);

export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

export function todayInSydney(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The Sydney calendar day an ISO timestamp falls on. */
export const sydneyDay = (iso: string): string => todayInSydney(new Date(iso));
