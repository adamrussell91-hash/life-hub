import type { Alignment } from '@/alignment/schema';
import { findOutcome } from '@/markbook/parse';
import type { OutcomeLabel } from '@/markbook/types';
import type { Evidence } from './types';

/**
 * Quiz marks reach the syllabus through their lesson: a quiz item with no
 * outcome tag of its own counts toward the outcomes its lesson's dot points
 * link to. Shared links only, unless a point has none.
 */

const numbers = (code: string): string => (code.match(/\d+/g) ?? []).map(Number).join('.');

/**
 * The catalogue id for an alignment outcome code. Codes are written
 * differently in places (EAV-12-03, EA12-3), so when the code itself is not
 * in the catalogue, the one outcome with the same numbers stands for it.
 */
function catalogueId(code: string, labels: readonly OutcomeLabel[]): string {
  const found = findOutcome(code, labels);
  if (found) return found.id;
  const same = labels.filter((l) => numbers(l.code) === numbers(code));
  return same.length === 1 ? same[0]!.id : code;
}

/** Outcome tags (`out:{catalogue id}`) a lesson's dot points reach. */
export function dotPointOutcomes(dotPoints: readonly string[], alignment: Alignment | null, labels: readonly OutcomeLabel[]): string[] {
  if (!alignment || !dotPoints.length) return [];
  const tags = new Set<string>();
  for (const ref of dotPoints) {
    const [area, id] = ref.split(':');
    const point = alignment.focus_areas.find((a) => a.id === area)?.points.find((p) => p.id === id);
    if (!point) continue;
    const shared = point.outcomes.filter((o) => o.link === 'shared');
    for (const { n } of shared.length ? shared : point.outcomes) {
      const code = alignment.outcomes.find((o) => o.n === n)?.code;
      if (code) tags.add(`out:${catalogueId(code, labels)}`);
    }
  }
  return [...tags];
}

/** Each lesson's outcome tags, for the lessons that have dot points. */
export function lessonOutcomeMap(
  lessons: ReadonlyArray<{ id: string; dot_points?: readonly string[] }>,
  alignment: Alignment | null,
  labels: readonly OutcomeLabel[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const lesson of lessons) {
    const tags = dotPointOutcomes(lesson.dot_points ?? [], alignment, labels);
    if (tags.length) map.set(lesson.id, tags);
  }
  return map;
}

/** Adds the lesson's outcomes to quiz items that carry none. */
export function withLessonOutcomes(evidence: Evidence[], byLesson: ReadonlyMap<string, string[]>): Evidence[] {
  if (!byLesson.size) return evidence;
  return evidence.map((e) => {
    if (!e.source.startsWith('quiz:') || e.tags.some((t) => t.startsWith('out:'))) return e;
    const inherited = byLesson.get(e.source.slice(5));
    return inherited ? { ...e, tags: [...e.tags, ...inherited] } : e;
  });
}
