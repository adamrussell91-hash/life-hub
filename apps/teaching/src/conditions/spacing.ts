/**
 * Spacing across a unit. A dot point taught in one burst and never returned
 * to fades; retrieval spread over growing gaps keeps it (well established in
 * cognitive psychology, and part of Tokuhama-Espinosa's memory principle).
 *
 * Pure: give it the unit's lessons with their dot points and first class
 * dates, and it says which dot points were taught once and where to bring
 * them back. Nothing is saved here.
 */

export type SpacingLesson = {
  id: string;
  title: string;
  dot_points?: readonly string[];
  /** First class date, `YYYY-MM-DD` (a time after it is ignored). */
  date?: string;
  assessment?: boolean;
};

export type SpacingStop = {
  lessonId: string;
  title: string;
  date: string;
  /** Days after the dot point was first taught. */
  gap: number;
  why: 'next' | 'week' | 'before_assessment';
};

export type SpacingRow = {
  /** The dot point ref, e.g. `human:U2`. */
  ref: string;
  /** Lessons that teach it, in date order. */
  taughtIn: Array<{ lessonId: string; title: string; date: string }>;
  /** Taught again at least this many days after the first time. */
  spaced: boolean;
  /** Where to bring it back, when not yet spaced. */
  stops: SpacingStop[];
};

/** Teaching a point again this many days or more after the first time counts as spaced. */
export const SPACED_AFTER_DAYS = 3;
/** The second stop aims for about a week after first teaching. */
export const WEEK_GAP_DAYS = 7;

const day = (date: string): string => date.slice(0, 10);
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${day(b)}T00:00:00Z`) - Date.parse(`${day(a)}T00:00:00Z`)) / 86_400_000);
}

export function spacingPlan(lessons: readonly SpacingLesson[]): SpacingRow[] {
  const dated = lessons
    .filter((l): l is SpacingLesson & { date: string } => typeof l.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(l.date))
    .map((l) => ({ ...l, date: day(l.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const refs = [...new Set(dated.flatMap((l) => l.dot_points ?? []))];
  const rows: SpacingRow[] = [];
  for (const ref of refs) {
    const taught = dated.filter((l) => l.dot_points?.includes(ref));
    const first = taught[0]!;
    const spaced = taught.some((l) => daysBetween(first.date, l.date) >= SPACED_AFTER_DAYS);
    const row: SpacingRow = { ref, taughtIn: taught.map((l) => ({ lessonId: l.id, title: l.title, date: l.date })), spaced, stops: [] };
    if (!spaced) row.stops = stopsAfter(first.date, dated.filter((l) => !l.dot_points?.includes(ref)));
    rows.push(row);
  }
  // Points that need spacing first, then by when they were first taught.
  return rows.sort((a, b) => Number(a.spaced) - Number(b.spaced) || a.taughtIn[0]!.date.localeCompare(b.taughtIn[0]!.date));
}

/** Up to three lessons after `from`: the next one, about a week on, and the last before the next assessment. */
function stopsAfter(from: string, candidates: ReadonlyArray<SpacingLesson & { date: string }>): SpacingStop[] {
  const later = candidates.filter((l) => daysBetween(from, l.date) >= 1);
  const teaching = later.filter((l) => !l.assessment);
  const stops: SpacingStop[] = [];
  const add = (l: SpacingLesson & { date: string } | undefined, why: SpacingStop['why']) => {
    if (!l || stops.some((s) => s.lessonId === l.id)) return;
    stops.push({ lessonId: l.id, title: l.title, date: l.date, gap: daysBetween(from, l.date), why });
  };
  add(teaching[0], 'next');
  add(teaching.find((l) => daysBetween(from, l.date) >= WEEK_GAP_DAYS), 'week');
  const assessment = later.find((l) => l.assessment);
  if (assessment) add([...teaching].reverse().find((l) => l.date < assessment.date), 'before_assessment');
  return stops.sort((a, b) => a.date.localeCompare(b.date));
}

/** For one lesson: the dot points from earlier lessons it is a good place to bring back. */
export function revisitsFor(plan: readonly SpacingRow[], lessonId: string): Array<{ row: SpacingRow; stop: SpacingStop }> {
  const out: Array<{ row: SpacingRow; stop: SpacingStop }> = [];
  for (const row of plan) {
    const stop = row.stops.find((s) => s.lessonId === lessonId);
    if (stop) out.push({ row, stop });
  }
  return out;
}

export const STOP_LABEL: Record<SpacingStop['why'], string> = {
  next: 'Next lesson',
  week: 'About a week on',
  before_assessment: 'Before the assessment'
};
