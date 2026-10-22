import type { AssessmentMark } from './schema';
import type { MarkbookView, QuizColumn, QuizRow } from './types';
import { assessments, dateOf, markOf, quizPercent } from './calc';

/** Outcome evidence and quiz flags, worked out from what the markbook already holds. */

export type Evidence = { outcome: string; percent: number; source: string; item: string };

/** Every percentage that counts as evidence for an outcome, for one student. */
export function evidenceFor(view: MarkbookView, studentId: string): Evidence[] {
  const out: Evidence[] = [];
  for (const column of assessments(view.markbook)) {
    const mark = markOf<AssessmentMark>(view.markbook, column.id, studentId);
    if (!mark || mark.exempt) continue;
    for (const c of column.criteria) {
      const given = mark.criteria?.[c.id];
      if (typeof given !== 'number') continue;
      for (const outcome of c.outcomes) out.push({ outcome, percent: (given / c.max) * 100, source: column.title, item: c.label });
    }
  }
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    const s = quiz.scores[studentId];
    if (!s) continue;
    for (const row of s.rows) {
      if (row.awarded === null || row.max <= 0) continue;
      const prompt = quiz.questions.find((q) => q.id === row.id)?.prompt || 'Question';
      for (const outcome of row.outcomes) out.push({ outcome, percent: (row.awarded / row.max) * 100, source: quiz.title, item: prompt });
    }
  }
  return out;
}

export function outcomeCell(evidence: Evidence[], outcome: string): { mean: number | null; count: number; items: Evidence[] } {
  const items = evidence.filter((e) => e.outcome === outcome);
  return { mean: items.length ? items.reduce((s, e) => s + e.percent, 0) / items.length : null, count: items.length, items };
}

/** Outcomes the markbook has any place for, criteria first. */
export function outcomesInView(view: MarkbookView): string[] {
  const seen = new Set<string>();
  for (const column of assessments(view.markbook)) for (const c of column.criteria) for (const o of c.outcomes) seen.add(o);
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    for (const q of quiz.questions) for (const o of q.outcomes) seen.add(o);
    for (const s of Object.values(quiz.scores)) for (const r of s.rows) for (const o of r.outcomes) seen.add(o);
  }
  return [...seen];
}

export type Band4 = 'low' | 'mid' | 'good' | 'high';
export const band4 = (percent: number): Band4 => (percent < 50 ? 'low' : percent < 70 ? 'mid' : percent < 85 ? 'good' : 'high');

/** Share of marks awarded for one question, or null while it waits for the teacher. */
export const heatShare = (row: QuizRow | undefined): number | null => (!row || row.awarded === null || row.max <= 0 ? null : row.awarded / row.max);

/** Questions the class averaged below half on, lowest first. */
export function reteachList(quiz: QuizColumn, studentIds: string[]): Array<{ id: string; prompt: string; average: number }> {
  const out: Array<{ id: string; prompt: string; average: number }> = [];
  for (const q of quiz.questions) {
    let got = 0;
    let max = 0;
    for (const id of studentIds) {
      const row = quiz.scores[id]?.rows.find((r) => r.id === q.id);
      if (!row || row.awarded === null) continue;
      got += row.awarded;
      max += row.max;
    }
    if (max > 0 && got / max < 0.5) out.push({ id: q.id, prompt: q.prompt || 'Question', average: got / max });
  }
  return out.sort((a, b) => a.average - b.average);
}

/** A student's quiz percentages, oldest first, leaving out hidden quizzes and ones still being marked. */
export function quizSeries(view: MarkbookView, studentId: string): number[] {
  return view.quizzes
    .filter((q) => !q.hidden)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
    .map((q) => q.scores[studentId])
    .filter((s) => s && s.pending === 0)
    .map((s) => quizPercent(s))
    .filter((p): p is number => p !== null);
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Five or more quizzes, and the last three average 15 or more points below the ones before. */
export function isDropping(series: number[]): boolean {
  if (series.length < 5) return false;
  return mean(series.slice(0, -3)) - mean(series.slice(-3)) >= 15;
}

/** Three or more most-confident answers scored zero, and they are 40% or more of the student's most-confident answers. */
export function isConfidentlyWrong(view: MarkbookView, studentId: string): boolean {
  let sure = 0;
  let wrong = 0;
  for (const quiz of view.quizzes) {
    if (quiz.hidden || !quiz.confidence) continue;
    for (const row of quiz.scores[studentId]?.rows ?? []) {
      if (row.confidence !== 3 || row.awarded === null) continue;
      sure += 1;
      if (row.awarded === 0) wrong += 1;
    }
  }
  return wrong >= 3 && wrong / sure >= 0.4;
}
