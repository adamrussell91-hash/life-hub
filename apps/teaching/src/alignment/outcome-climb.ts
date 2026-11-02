import type { OutcomeClimbEntry, ScopeSequence } from '@/schemas';
import { diffDays, resolveTermSpan } from '@/scope/timeline-dates';
import { RUNG_IDS, type RungId } from '@/skills/schema';
import { conceptKeyOf } from './model';
import { focusAreaFor } from './coverage';
import type { Alignment } from './schema';

/**
 * How each outcome builds across the year (Scope & Sequence → Curriculum Map).
 * A visit is a unit with a lesson whose dot point core-links the outcome, so
 * nothing extra is tagged. Weeks come from lesson dates. The level and what
 * students now do are the teacher's call, saved on the scope. Pure: no DOM.
 */

export type ClimbLesson = { id: string; title: string; href?: string; date?: string; dot_points?: readonly string[] };
export type ClimbUnit = { id: string; title: string; focusArea?: string; lessons: readonly ClimbLesson[] };

export type ClimbVisit = {
  unit_id: string;
  unit_title: string;
  /** Scope weeks, inclusive. */
  first_week: number;
  last_week: number;
  lessons: ClimbLesson[];
  /** Index into RUNG_IDS. Null until the teacher sets it. */
  level: number | null;
  demand: string;
  points: string[];
  concepts: string[];
  /** Teaching weeks since the last visit ended. Null on the first visit. */
  gap: number | null;
};
export type ClimbOutcome = { n: number; code: string; text: string; visits: ClimbVisit[]; next_chance?: string };
export type ClimbBandItem = { id: string; title: string; start_week: number; end_week: number; kind: 'unit' | 'note'; untagged: boolean };
export type OutcomeClimb = {
  week_count: number;
  terms: Array<{ number: number; start_week: number; end_week: number }>;
  band: ClimbBandItem[];
  outcomes: ClimbOutcome[];
};

export const levelIndex = (level: RungId | undefined): number | null => {
  const i = level ? RUNG_IDS.indexOf(level) : -1;
  return i < 0 ? null : i;
};

/** The scope week a date falls in. Holiday dates go to the first week of the next term. */
export function weekOfDate(scope: Pick<ScopeSequence, 'terms' | 'academic_year'>, ymd: string): number | null {
  const terms = [...scope.terms].sort((a, b) => a.start_week - b.start_week);
  for (const term of terms) {
    const span = resolveTermSpan(term, scope.academic_year);
    if (ymd < span.start) return term.start_week;
    if (ymd <= span.end) return Math.min(term.end_week, term.start_week + Math.floor(diffDays(span.start, ymd) / 7));
  }
  return null;
}

export function buildOutcomeClimb(doc: Alignment, scope: ScopeSequence, units: readonly ClimbUnit[]): OutcomeClimb {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const items = scope.timeline_items.filter((item) => item.kind === 'note' || unitById.has(item.unit_id));
  const placed = items.flatMap((item) => (item.kind === 'unit' ? [{ item, unit: unitById.get(item.unit_id)! }] : []))
    .sort((a, b) => a.item.start_week - b.item.start_week || a.item.order - b.item.order);
  const saved = new Map((scope.outcome_climb ?? []).map((e) => [`${e.outcome}:${e.unit_id}`, e]));
  const conceptName = new Map(doc.concepts.map((c) => [c.key, c.name]));

  // A lesson with no date sits where its place in the unit puts it.
  const weekOfLesson = new Map<string, number>();
  for (const { item, unit } of placed) {
    unit.lessons.forEach((lesson, i) => {
      const span = item.end_week - item.start_week + 1;
      const byOrder = item.start_week + Math.floor((i / Math.max(1, unit.lessons.length)) * span);
      const dated = lesson.date ? weekOfDate(scope, lesson.date) : null;
      const week = dated !== null && dated >= item.start_week && dated <= item.end_week ? dated : byOrder;
      weekOfLesson.set(`${unit.id}:${lesson.id}`, week);
    });
  }
  const pointOf = (ref: string) => {
    const at = ref.indexOf(':');
    return doc.focus_areas.find((a) => a.id === ref.slice(0, at))?.points.find((p) => p.id === ref.slice(at + 1));
  };

  const outcomes = doc.outcomes.map((outcome): ClimbOutcome => {
    const visits: ClimbVisit[] = [];
    for (const { unit } of placed) {
      const points = new Map<string, NonNullable<ReturnType<typeof pointOf>>>();
      const lessons: ClimbLesson[] = [];
      for (const lesson of unit.lessons) {
        const hits = (lesson.dot_points ?? []).filter((ref) => pointOf(ref)?.outcomes.some((o) => o.n === outcome.n && o.link === 'shared'));
        if (!hits.length) continue;
        lessons.push(lesson);
        for (const ref of hits) points.set(ref, pointOf(ref)!);
      }
      if (!lessons.length) continue;
      const weeks = lessons.map((l) => weekOfLesson.get(`${unit.id}:${l.id}`)!);
      const entry = saved.get(`${outcome.n}:${unit.id}`);
      const concepts = [...new Set([...points.values()].flatMap((p) => p.concepts.filter((c) => c.link === 'shared').map((c) => conceptKeyOf(c.ref))))]
        .map((key) => conceptName.get(key) ?? key);
      const first_week = Math.min(...weeks);
      const last = visits[visits.length - 1];
      visits.push({
        unit_id: unit.id,
        unit_title: unit.title,
        first_week,
        last_week: Math.max(...weeks),
        lessons,
        level: levelIndex(entry?.level),
        demand: entry?.demand ?? '',
        points: [...points.values()].map((p) => p.short),
        concepts,
        gap: last ? Math.max(0, first_week - last.last_week - 1) : null
      });
    }
    // Met once: the next unit whose focus area could bring it back.
    const lastUnit = visits[visits.length - 1]?.unit_id;
    const after = placed.slice(placed.findIndex((p) => p.unit.id === lastUnit) + 1);
    const next = visits.length === 1 ? after.find(({ unit }) => {
      const area = focusAreaFor(doc, unit.title, unit.focusArea);
      return doc.focus_areas.find((a) => a.id === area?.id)?.points.some((p) => p.outcomes.some((o) => o.n === outcome.n && o.link === 'shared'));
    }) : undefined;
    return { n: outcome.n, code: outcome.code, text: outcome.text, visits, ...(next ? { next_chance: next.unit.title } : {}) };
  });

  const taught = new Set(outcomes.flatMap((o) => o.visits.map((v) => v.unit_id)));
  const band = items.map((item): ClimbBandItem => item.kind === 'unit'
    ? { id: item.id, title: unitById.get(item.unit_id)!.title, start_week: item.start_week, end_week: item.end_week, kind: 'unit', untagged: !taught.has(item.unit_id) }
    : { id: item.id, title: item.title, start_week: item.start_week, end_week: item.end_week, kind: 'note', untagged: false });

  return {
    week_count: scope.week_count,
    terms: [...scope.terms].sort((a, b) => a.start_week - b.start_week).map((t) => ({ number: t.term_number, start_week: t.start_week, end_week: t.end_week })),
    band,
    outcomes
  };
}

/** Where a line is drawn: its level, or the last one set before it (Capable to start). */
export function drawnLevels(visits: readonly ClimbVisit[]): number[] {
  let current = 0;
  return visits.map((v) => {
    if (v.level !== null) current = v.level;
    return current;
  });
}

/** One visit's saved values changed: the whole list to save, with empty entries dropped. */
export function nextClimbEntries(
  entries: readonly OutcomeClimbEntry[],
  outcome: number,
  unit_id: string,
  change: { level?: RungId | null; demand?: string }
): OutcomeClimbEntry[] {
  const old = entries.find((e) => e.outcome === outcome && e.unit_id === unit_id);
  const level = change.level === undefined ? old?.level : change.level ?? undefined;
  const demand = (change.demand === undefined ? old?.demand : change.demand)?.trim();
  const rest = entries.filter((e) => e !== old);
  return level || demand ? [...rest, { outcome, unit_id, ...(level ? { level } : {}), ...(demand ? { demand } : {}) }] : rest;
}

export function climbSummary(outcome: ClimbOutcome, levelName: (i: number) => string): string {
  const { visits } = outcome;
  if (!visits.length) return 'No lessons tagged yet';
  const unset = visits.filter((v) => v.level === null).length;
  const times = visits.length === 1 ? 'Met once so far' : `Met ${visits.length} times`;
  if (unset) return `${times}. ${unset === visits.length && unset > 1 ? 'Levels' : unset === 1 ? 'One level' : `${unset} levels`} still to set`;
  const lo = visits[0]!.level!, hi = visits[visits.length - 1]!.level!;
  if (visits.length === 1) return `${times}, at ${levelName(lo)}`;
  if (hi > lo) return `Climbs from ${levelName(lo)} to ${levelName(hi)} over ${visits.length} visits`;
  if (hi === lo) return `Stays at ${levelName(lo)} over ${visits.length} visits`;
  return `Moves from ${levelName(lo)} to ${levelName(hi)} over ${visits.length} visits`;
}
