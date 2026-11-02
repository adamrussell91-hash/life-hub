import type { Alignment } from '@/alignment/schema';
import { findOutcome } from '@/markbook/parse';
import type { OutcomeLabel } from '@/markbook/types';
import type { SkillsContinuum } from '@/skills/schema';
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

/** The lesson a piece of evidence came from: quiz items, and work with a rubric. Assessment criteria have none. */
const lessonOf = (source: string): string | null => (source.startsWith('quiz:') ? source.slice(5) : source.startsWith('work:') ? source.slice(5) : null);

/** Adds the lesson's outcomes to quiz items that carry none. */
export function withLessonOutcomes(evidence: Evidence[], byLesson: ReadonlyMap<string, string[]>): Evidence[] {
  if (!byLesson.size) return evidence;
  return evidence.map((e) => {
    const lesson = lessonOf(e.source);
    if (lesson === null || e.tags.some((t) => t.startsWith('out:'))) return e;
    const inherited = byLesson.get(lesson);
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

/**
 * The one chain: what a mark on a quiz item reaches is worked out from the
 * item's own tags when marks are read, so past attempts move with no republish.
 *   piece → its U, skill → every R it names in the unit's focus area
 *   neither, or neither leads anywhere → the lesson's dot points
 * Outcomes then follow from those points. Without an alignment there is no chain.
 */
export type PointChain = {
  alignment: Alignment;
  labels: readonly OutcomeLabel[];
  /** Each knowledge piece's `dp:` tag, for pieces with a dot point in the alignment. */
  pieces: ReadonlyMap<string, string>;
  /** Each skill's R points, as `{focus area}:{point id}`. */
  skills: ReadonlyMap<string, readonly string[]>;
  /** The focus areas of each lesson's unit. */
  lessonAreas: ReadonlyMap<string, readonly string[]>;
};

type ChainUnit = { id: string; deep_understandings?: ReadonlyArray<{ dot_points?: readonly string[]; pieces?: ReadonlyArray<{ id: string; dot_point?: string }> }> };
type ChainLesson = { id: string; unit_id?: string; dot_points?: readonly string[] };

const areaOf = (ref: string): string => ref.split(':')[0] ?? '';

/** A unit's focus areas: from its deep understandings' dot points, or failing that its lessons'. */
function unitAreas(unit: ChainUnit | undefined, lessons: readonly ChainLesson[]): string[] {
  const fromDus = (unit?.deep_understandings ?? []).flatMap((d) => d.dot_points ?? []);
  const refs = fromDus.length ? fromDus : lessons.flatMap((l) => l.dot_points ?? []);
  return [...new Set(refs.map(areaOf).filter(Boolean))];
}

export function buildPointChain(input: {
  alignment: Alignment | null;
  labels: readonly OutcomeLabel[];
  continuum: SkillsContinuum | null;
  units: readonly ChainUnit[];
  lessons: readonly ChainLesson[];
}): PointChain | null {
  const { alignment, labels, continuum, units, lessons } = input;
  if (!alignment) return null;
  const exists = (ref: string): boolean => {
    const [area, id] = ref.split(':');
    return !!alignment.focus_areas.find((a) => a.id === area)?.points.some((p) => p.id === id);
  };
  const pieces = new Map<string, string>();
  for (const unit of units) {
    for (const du of unit.deep_understandings ?? []) {
      for (const piece of du.pieces ?? []) {
        if (piece.dot_point && exists(piece.dot_point)) pieces.set(piece.id, pointTag(areaOf(piece.dot_point), piece.dot_point.split(':')[1]!));
      }
    }
  }
  const skills = new Map<string, string[]>();
  for (const strand of continuum?.strands ?? []) {
    for (const sub of strand.sub_strands) {
      const points = (sub.points ?? []).filter((p) => p.point.startsWith('R')).map((p) => `${p.area}:${p.point}`);
      if (points.length) skills.set(`${strand.strand}.${sub.id}`, points);
    }
  }
  const byUnit = new Map<string, ChainLesson[]>();
  for (const lesson of lessons) if (lesson.unit_id) byUnit.set(lesson.unit_id, [...(byUnit.get(lesson.unit_id) ?? []), lesson]);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const lessonAreas = new Map<string, string[]>();
  for (const lesson of lessons) {
    const areas = lesson.unit_id ? unitAreas(unitById.get(lesson.unit_id), byUnit.get(lesson.unit_id) ?? []) : unitAreas(undefined, [lesson]);
    if (areas.length) lessonAreas.set(lesson.id, areas);
  }
  return { alignment, labels, pieces, skills, lessonAreas };
}

/** The `dp:` tags one quiz item reaches through the chain. */
export function chainedPoints(tags: readonly string[], lessonId: string, byLesson: ReadonlyMap<string, string[]>, chain: PointChain): string[] {
  const areas = chain.lessonAreas.get(lessonId) ?? [];
  const points = new Set<string>();
  for (const tag of tags) {
    if (tag.startsWith('kp:')) {
      const point = chain.pieces.get(tag.slice(3));
      if (point) points.add(point);
    } else if (tag.startsWith('skill:')) {
      for (const ref of chain.skills.get(tag.slice(6)) ?? []) {
        const [area, id] = ref.split(':');
        if (area && id && areas.includes(area) && chain.alignment.focus_areas.find((a) => a.id === area)?.points.some((p) => p.id === id)) points.add(pointTag(area, id));
      }
    }
  }
  return points.size ? [...points] : [...(byLesson.get(lessonId) ?? [])];
}

/**
 * Adds dot point tags: assessment criteria get the points their outcomes reach,
 * and keep their outcomes. Quiz items get the chain's points and outcomes from
 * those points only, leaving the outcomes stored on the question unread. With
 * no chain they get their lesson's points, as they always did.
 */
export function withPointTags(evidence: Evidence[], byLesson: ReadonlyMap<string, string[]>, byOutcome: ReadonlyMap<string, string[]>, chain: PointChain | null = null): Evidence[] {
  if (!byLesson.size && !byOutcome.size && !chain) return evidence;
  return evidence.map((e) => {
    const lesson = lessonOf(e.source);
    if (lesson !== null && chain) {
      const points = chainedPoints(e.tags, lesson, byLesson, chain);
      const outcomes = dotPointOutcomes(points.map((t) => t.slice(3)), chain.alignment, chain.labels);
      return { ...e, tags: [...new Set([...e.tags.filter((t) => !t.startsWith('out:')), ...points, ...outcomes])] };
    }
    const extra = lesson !== null
      ? (byLesson.get(lesson) ?? [])
      : e.tags.flatMap((t) => (t.startsWith('out:') ? (byOutcome.get(t) ?? []) : []));
    return extra.length ? { ...e, tags: [...new Set([...e.tags, ...extra])] } : e;
  });
}
