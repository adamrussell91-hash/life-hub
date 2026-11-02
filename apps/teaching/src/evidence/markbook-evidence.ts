import { assessments, sydneyDay } from '@/markbook/calc';
import { outcomeIdOf } from '@/markbook/parse';
import type { AssessmentMark } from '@/markbook/schema';
import type { MarkbookView, OutcomeLabel } from '@/markbook/types';
import { rungShare } from './constants';
import type { Evidence } from './types';

export type Source = { source: string; title: string };
/** Per timed quiz: students whose paper ends with blank items, and how many. Never names in stored output. */
export type Timing = Record<string, Record<string, number>>;

const trailingBlanks = (rows: ReadonlyArray<{ unanswered?: true }>): number => {
  let n = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i]!.unanswered; i--) n += 1;
  return n;
};

/**
 * Every piece of evidence the markbook holds: quiz items (latest attempts,
 * shown quizzes only), assessment criteria, and the skills rated on rubrics of
 * written work and viva takes. Old outcome codes become catalogue ids when
 * `labels` are given.
 */
export function markbookEvidence(view: MarkbookView, labels: readonly OutcomeLabel[] = []): { evidence: Evidence[]; sources: Source[]; timing: Timing } {
  const norm = (tag: string): string => (tag.startsWith('out:') ? `out:${outcomeIdOf(tag.slice(4), labels)}` : tag);
  const evidence: Evidence[] = [];
  const sources: Source[] = [];
  const timing: Timing = {};
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    const source = `quiz:${quiz.lesson_id}`;
    sources.push({ source, title: quiz.title });
    if (quiz.timed) timing[source] = Object.fromEntries(Object.entries(quiz.scores).map(([student, score]) => [student, trailingBlanks(score.rows)]));
    for (const [student, score] of Object.entries(quiz.scores)) {
      const date = score.submitted_at ? sydneyDay(score.submitted_at) : quiz.date;
      for (const row of score.rows) for (const item of row.items ?? []) evidence.push({ ...item, tags: item.tags.map(norm), student, source, date, confidence: row.confidence });
    }
  }
  // A rubric's rung is the skill's evidence: the criterion's mark still counts, without that skill.
  const rated = new Set((view.rubrics ?? []).flatMap((r) => (r.column_id ? Object.keys(r.skills).map((s) => `${r.column_id}|${r.student}|${s}`) : [])));
  for (const column of assessments(view.markbook)) {
    const source = `assess:${column.id}`;
    sources.push({ source, title: column.title });
    for (const [student, raw] of Object.entries(view.markbook.marks[column.id] ?? {})) {
      const mark = raw as AssessmentMark | undefined;
      if (!mark || mark.exempt) continue;
      for (const c of column.criteria) {
        const given = mark.criteria?.[c.id];
        if (typeof given !== 'number' || c.max <= 0) continue;
        const share = Math.min(1, given / c.max);
        const tags = [...c.outcomes.map((o) => norm(`out:${o}`)), ...(c.skill && !rated.has(`${column.id}|${student}|${c.skill}`) ? [`skill:${c.skill}`] : [])];
        const why = share < 1 ? (mark.codes?.[c.id] ?? []).map((id) => ({ type: 'code' as const, id })) : [];
        evidence.push({ item: `${column.id}:${c.id}`, tags, share, why, student, source, date: column.date, confidence: null });
      }
    }
  }
  const named = new Set<string>();
  for (const row of view.rubrics ?? []) {
    const source = `work:${row.lesson_id}`;
    if (!named.has(source)) {
      named.add(source);
      sources.push({ source, title: row.title });
    }
    const date = sydneyDay(row.at);
    for (const [skill, rung] of Object.entries(row.skills)) {
      const share = rungShare(rung);
      if (share !== null) evidence.push({ item: `${row.piece}#skill:${skill}`, tags: [`skill:${skill}`], share, why: [], student: row.student, source, date, confidence: null });
    }
  }
  return { evidence, sources, timing };
}
