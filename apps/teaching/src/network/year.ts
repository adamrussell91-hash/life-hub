import type { NetworkLine } from '@/schemas/block';
import type { NetInput, NetLevel, NetNudge, NetRow } from './layout';
import { LEVEL_RANK, stopsFor, toNetLines, type NetLesson } from './model';

/** A unit on the year network, with the lessons the viewer may see. */
export type NetUnit = {
  id: string;
  title: string;
  href?: string;
  lessons: readonly (NetLesson & { outcome_ids?: readonly string[] })[];
  /** Light-rail lines that have a stop in this unit's map block. */
  railLineIds?: readonly string[];
};

/**
 * A unit stops on a train or metro line when any of its lessons does, at the
 * highest depth among them; on a light-rail line when any lesson or rail stop
 * in it does.
 */
export function unitStops(unit: NetUnit, lines: ReadonlyMap<string, NetworkLine>): Map<string, NetLevel | null> {
  const out = new Map<string, NetLevel | null>();
  for (const lesson of unit.lessons) {
    for (const [id, level] of stopsFor(lesson.line_stops, lines)) {
      const had = out.get(id);
      if (level === null) out.set(id, null);
      else if (had === undefined || had === null || LEVEL_RANK[level] > LEVEL_RANK[had]) out.set(id, level);
    }
  }
  for (const id of unit.railLineIds ?? []) {
    if (lines.get(id)?.mode === 'light_rail') out.set(id, null);
  }
  return out;
}

export function buildYearNetwork(
  subjectLines: readonly NetworkLine[],
  units: readonly NetUnit[],
  options: { nudges?: Readonly<Record<string, NetNudge>>; now?: NetInput['now'] } = {}
): NetInput {
  const lines = new Map(subjectLines.map((l) => [l.id, l]));
  const rows: NetRow[] = units.map((unit) => ({
    id: unit.id,
    target: { text: unit.title || 'Untitled unit', ...(unit.href ? { href: unit.href } : {}) },
    stops: unitStops(unit, lines)
  }));
  return {
    lines: toNetLines(subjectLines),
    rows,
    railStops: [],
    gates: [],
    nudges: options.nudges ?? {},
    terminus: { text: 'HSC', detail: 'Higher School Certificate', when: 'HSC' },
    rowKind: 'unit',
    ...(options.now ? { now: options.now } : {})
  };
}

/**
 * Where a class is now: its latest scheduled lesson dated today or earlier,
 * as a position between that lesson's unit and the next.
 */
export function classNow(
  units: readonly { id: string; lesson_ids: readonly string[] }[],
  schedule: readonly { lesson_id: string; unit_id: string; date: string }[],
  today: string,
  label = 'Class now'
): NetInput['now'] | undefined {
  const past = schedule.filter((row) => row.date <= today).sort((x, y) => x.date.localeCompare(y.date));
  for (let i = past.length - 1; i >= 0; i--) {
    const row = past[i]!;
    const at = units.findIndex((u) => u.id === row.unit_id);
    if (at < 0) continue;
    const ids = units[at]!.lesson_ids;
    const idx = Math.max(0, ids.indexOf(row.lesson_id));
    return { row: at, frac: ids.length ? idx / ids.length : 0, label };
  }
  return undefined;
}

export type OutcomeCoverage = {
  id: string;
  code: string;
  title: string;
  units: Array<{ id: string; title: string }>;
  level: NetLevel | null;
  flagged: boolean;
};

/**
 * For each outcome: the units whose lessons tag it, and the highest depth
 * reached on any train or metro line through those lessons. Outcomes with no
 * tagged lessons are flagged.
 */
export function outcomeCoverage(
  outcomes: readonly { id: string; code?: string; title?: string }[],
  units: readonly NetUnit[],
  subjectLines: readonly NetworkLine[]
): OutcomeCoverage[] {
  const lines = new Map(subjectLines.map((l) => [l.id, l]));
  return outcomes.map((outcome) => {
    const hit: Array<{ id: string; title: string }> = [];
    let level: NetLevel | null = null;
    for (const unit of units) {
      const tagged = unit.lessons.filter((l) => l.outcome_ids?.includes(outcome.id));
      if (!tagged.length) continue;
      hit.push({ id: unit.id, title: unit.title });
      for (const lesson of tagged) {
        for (const depth of stopsFor(lesson.line_stops, lines).values()) {
          if (depth && (level === null || LEVEL_RANK[depth] > LEVEL_RANK[level])) level = depth;
        }
      }
    }
    return { id: outcome.id, code: outcome.code ?? '', title: outcome.title ?? '', units: hit, level, flagged: hit.length === 0 };
  });
}
