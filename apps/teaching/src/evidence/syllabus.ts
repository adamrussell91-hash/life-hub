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
export function catalogueId(code: string, labels: readonly OutcomeLabel[]): string {
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

/** The tag for a dot point, `dp:{focus area}:{point id}`. */
export const pointTag = (area: string, id: string): string => `dp:${area}:${id}`;

/** Each lesson's dot point tags, for the lessons whose dot points exist in the alignment. */
export function lessonPointMap(lessons: ReadonlyArray<{ id: string; dot_points?: readonly string[] }>, alignment: Alignment | null): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!alignment) return map;
  for (const lesson of lessons) {
    const tags = new Set<string>();
    for (const ref of lesson.dot_points ?? []) {
      const [area, id] = ref.split(':');
      if (area && id && alignment.focus_areas.find((a) => a.id === area)?.points.some((p) => p.id === id)) tags.add(pointTag(area, id));
    }
    if (tags.size) map.set(lesson.id, [...tags]);
  }
  return map;
}

/**
 * The dot points each outcome tag (`out:{id}`) reaches: the points that link to
 * it as shared, or as related when a point has no shared link. Assessment
 * criteria carry outcomes but no dot points, so this is how their marks reach
 * the Grid, at outcome level.
 */
export function outcomePointMap(alignment: Alignment | null, labels: readonly OutcomeLabel[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!alignment) return map;
  for (const area of alignment.focus_areas) {
    for (const point of area.points) {
      const shared = point.outcomes.filter((o) => o.link === 'shared');
      for (const { n } of shared.length ? shared : point.outcomes) {
        const code = alignment.outcomes.find((o) => o.n === n)?.code;
        if (!code) continue;
        const key = `out:${catalogueId(code, labels)}`;
        map.set(key, [...(map.get(key) ?? []), pointTag(area.id, point.id)]);
      }
    }
  }
  return map;
}

/** Adds dot point tags: quiz items get their lesson's points, assessment criteria the points their outcomes reach. */
export function withPointTags(evidence: Evidence[], byLesson: ReadonlyMap<string, string[]>, byOutcome: ReadonlyMap<string, string[]>): Evidence[] {
  if (!byLesson.size && !byOutcome.size) return evidence;
  return evidence.map((e) => {
    const extra = e.source.startsWith('quiz:')
      ? (byLesson.get(e.source.slice(5)) ?? [])
      : e.tags.flatMap((t) => (t.startsWith('out:') ? (byOutcome.get(t) ?? []) : []));
    return extra.length ? { ...e, tags: [...new Set([...e.tags, ...extra])] } : e;
  });
}
