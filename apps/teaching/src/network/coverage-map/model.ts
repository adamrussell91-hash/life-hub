import type { CurriculumLinesV2Content, LessonRouteRole, NetworkLine } from '@/schemas/block';
import { lineColour } from '../colour';
import { buildFlow, type FlowSeq } from '../flow';
import { orderStations, placeByDate, withAutoDepths, type NetLesson } from '../model';

/**
 * The unit coverage map: lessons down the page in the order the unit runs,
 * each on a lane of the route (core, support, extension or an option of a
 * choice), and one branch per syllabus item showing where it is taught and
 * how deep. Pure: no DOM, unit tested directly.
 */

export type MapLane = 'core' | 'support' | 'extension' | 'option';
export type RowKind = 'lesson' | 'check' | 'goal';
/** 1 introduced, 2 reinforced, 3 mastered. */
export type Depth = 1 | 2 | 3;

export type MapLesson = NetLesson & {
  role?: LessonRouteRole;
  skip?: string;
  /** A quiz lesson: a checkpoint on the route. */
  quiz?: boolean;
};

export type MapRow = {
  id: string;
  title: string;
  href?: string;
  lane: MapLane;
  /** "A", "B", … for the options of a choice. */
  option?: string;
  kind: RowKind;
  skip?: string;
  band?: string;
  date?: string;
  /** Item id → depth at this lesson. */
  teaches: Map<string, Depth>;
};

export type MapItem = { id: string; label: string; title: string; colour: string; group: string; strand?: string };
export type MapGroup = { id: string; name: string; items: MapItem[] };
export type ItemCoverage = { core: number; optional: number; thin: boolean; first: number };

export type CoverageMap = {
  rows: MapRow[];
  groups: MapGroup[];
  coverage: Map<string, ItemCoverage>;
};

/** The focus area's dot points, when the subject is in the syllabus alignment. */
export type MapPoints = { area: string; points: ReadonlyArray<{ id: string; kind: 'U' | 'R'; short: string }> };

export type CoverageMapInput = {
  content: CurriculumLinesV2Content;
  lines: readonly NetworkLine[];
  lessons: readonly MapLesson[];
  bands?: ReadonlyMap<string, string>;
  dates?: ReadonlyMap<string, string>;
  points?: MapPoints;
};

/** An item taught in fewer than this share of the core lessons (at least one) is flagged as thin. */
export const THIN_SHARE = 0.15;
export const thinLimit = (coreLessons: number): number => Math.max(1, Math.floor(coreLessons * THIN_SHARE));

const LEVEL_DEPTH = { introduced: 1, reinforced: 2, mastered: 3 } as const;
const isSide = (lane: MapLane) => lane !== 'core';

/** Each row's lane and option letter, from the flow's splits and the lessons' own roles. */
function lanesFrom(seq: FlowSeq, roleOf: (id: string) => MapLane | undefined): Map<string, { lane: MapLane; option?: string }> {
  const out = new Map<string, { lane: MapLane; option?: string }>();
  const rowsOf = (s: FlowSeq): string[] => s.flatMap((item) => ('row' in item ? [item.row] : item.split.flatMap(rowsOf)));
  const walk = (s: FlowSeq, inOption: string | undefined) => {
    for (const item of s) {
      if ('row' in item) {
        const role = roleOf(item.row);
        out.set(item.row, role ? { lane: role } : inOption ? { lane: 'option', option: inOption } : { lane: 'core' });
        continue;
      }
      // A branch made only of support or extension lessons is a detour, not an option.
      const plain = item.split.filter((branch) => rowsOf(branch).some((id) => !roleOf(id)));
      // Beside a branch that goes straight on (no lessons), the others are optional detours.
      const detour = item.split.some((branch) => rowsOf(branch).length === 0);
      item.split.forEach((branch) => {
        const at = plain.indexOf(branch);
        if (detour) {
          for (const id of rowsOf(branch)) {
            const role = roleOf(id);
            out.set(id, role ? { lane: role } : { lane: 'option' });
          }
        } else if (plain.length < 2 || at < 0) walk(branch, inOption);
        else if (at === 0 && !inOption) walk(branch, undefined);
        else walk(branch, inOption ?? String.fromCharCode(65 + at));
      });
      // The first option stays on the core line and is labelled A.
      if (plain.length >= 2 && !inOption && !detour) for (const id of rowsOf(plain[0]!)) if (!roleOf(id)) out.set(id, { lane: 'core', option: 'A' });
    }
  };
  walk(seq, undefined);
  return out;
}

export function buildCoverageMap(input: CoverageMapInput): CoverageMap {
  const { content, lines, lessons, bands, dates, points } = input;
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const hidden = new Set(content.hidden_lessons ?? []);
  const ordered = placeByDate(orderStations(lessons, content.station_order), dates);
  const flow = buildFlow(ordered.map((l) => ({ id: l.id, ...(l.after ? { after: l.after } : {}) })), {
    hidden,
    title: (id) => byId.get(id)?.title || 'Untitled lesson'
  });
  // Support and extension: the lesson's own role, else a light-rail stop that names it.
  const railRole = new Map<string, LessonRouteRole>();
  const railSkip = new Map<string, string>();
  const railAfter = new Map<string, string | undefined>();
  /** The line a support or extension stop sits on: the lesson teaches it, as on the old map. */
  const railLines = new Map<string, string[]>();
  for (const stop of content.rail_stops) {
    if (!stop.lesson_id || stop.kind === 'stop' || !byId.has(stop.lesson_id)) continue;
    railRole.set(stop.lesson_id, stop.kind);
    railAfter.set(stop.lesson_id, stop.after_lesson_id);
    railLines.set(stop.lesson_id, [...(railLines.get(stop.lesson_id) ?? []), stop.line_id]);
    if (stop.skip_rule?.trim()) railSkip.set(stop.lesson_id, stop.skip_rule.trim());
  }
  // A support or extension stop's lesson shows even when the old map left it off its stations,
  // straight after the lesson the stop follows.
  const order = [...flow.order];
  for (const [id, after] of railAfter) {
    if (order.includes(id)) continue;
    const at = after ? order.indexOf(after) : -1;
    let i = at < 0 ? order.length : at + 1;
    while (i < order.length && railAfter.has(order[i]!)) i++;
    order.splice(i, 0, id);
  }
  const shown = withAutoDepths(order.map((id) => byId.get(id)!).filter(Boolean));
  const roleOf = (id: string): MapLane | undefined => byId.get(id)?.role ?? railRole.get(id);
  const lanes = lanesFrom(flow.seq, roleOf);
  const gateLessons = new Set(content.gates.map((g) => g.lesson_id).filter((x): x is string => Boolean(x)));

  /* Items, in four groups. */
  const groups: MapGroup[] = [];
  const pointLine = (kind: 'U' | 'R') => lines.find((l) => l.alignment?.kind === 'points' && l.alignment.group === kind);
  if (points?.points.length) {
    for (const kind of ['U', 'R'] as const) {
      const line = pointLine(kind);
      const colour = line ? lineColour(line.colour) : lineColour(kind === 'U' ? 'wave' : 'navy');
      const items = points.points.filter((p) => p.kind === kind).map((p) => ({ id: `${points.area}:${p.id}`, label: p.id, title: p.short, colour, group: kind }));
      if (items.length) groups.push({ id: kind, name: kind === 'U' ? 'Understanding' : 'Responding', items });
    }
  }
  const lineItem = (l: NetworkLine, group: string): MapItem => ({
    id: l.id,
    label: (l.short?.trim() || l.name.trim().slice(0, 4) || '?').toUpperCase(),
    title: l.name.trim() || 'Untitled line',
    colour: lineColour(l.colour),
    group,
    ...(l.alignment?.kind === 'strand' ? { strand: l.alignment.strand } : {})
  });
  const trains = lines.filter((l) => l.mode === 'train' && !(points?.points.length && l.alignment?.kind === 'points'));
  if (trains.length) groups.push({ id: 'train', name: points?.points.length ? 'Syllabus lines' : 'Syllabus', items: trains.map((l) => lineItem(l, 'train')) });
  const metro = lines.filter((l) => l.mode === 'metro');
  if (metro.length) groups.push({ id: 'metro', name: 'Concepts', items: metro.map((l) => lineItem(l, 'metro')) });
  const rail = lines.filter((l) => l.mode === 'light_rail');
  if (rail.length) groups.push({ id: 'light_rail', name: 'Skills', items: rail.map((l) => lineItem(l, 'light_rail')) });
  const itemIds = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));

  /* Rows. */
  const seen = new Map<string, number>();
  const counted = (id: string): Depth => {
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return n === 1 ? 1 : 2;
  };
  const rows: MapRow[] = shown.map((lesson) => {
    const teaches = new Map<string, Depth>();
    const stopLevel = new Map<string, Depth | null>();
    for (const stop of lesson.line_stops ?? []) {
      const line = lineById.get(stop.line_id);
      if (!line) continue;
      stopLevel.set(line.id, line.mode === 'light_rail' || !stop.level ? null : LEVEL_DEPTH[stop.level]);
    }
    for (const id of railLines.get(lesson.id) ?? []) if (lineById.has(id) && !stopLevel.has(id)) stopLevel.set(id, null);
    for (const [lineId, level] of stopLevel) {
      if (!itemIds.has(lineId)) continue;
      const n = counted(lineId);
      teaches.set(lineId, level ?? n);
    }
    for (const ref of lesson.dot_points ?? []) {
      if (!itemIds.has(ref)) continue;
      const kind = ref.slice(ref.indexOf(':') + 1, ref.indexOf(':') + 2) as 'U' | 'R';
      const line = pointLine(kind);
      const n = counted(ref);
      const level = line ? stopLevel.get(line.id) : undefined;
      teaches.set(ref, level ?? n);
    }
    const role = roleOf(lesson.id);
    const lane = lanes.get(lesson.id) ?? { lane: role ?? ('core' as MapLane) };
    const skip = lesson.skip?.trim() || railSkip.get(lesson.id);
    const isGoal = content.terminus.lesson_id === lesson.id;
    return {
      id: lesson.id,
      title: lesson.title || 'Untitled lesson',
      ...(lesson.href ? { href: lesson.href } : {}),
      lane: lane.lane,
      ...(lane.option ? { option: lane.option } : {}),
      kind: isGoal ? 'goal' : lesson.quiz || gateLessons.has(lesson.id) ? 'check' : 'lesson',
      ...(skip && isSide(lane.lane) ? { skip } : {}),
      ...(bands?.get(lesson.id) ? { band: bands.get(lesson.id) } : {}),
      ...(dates?.get(lesson.id) ? { date: dates.get(lesson.id) } : {}),
      teaches
    };
  });
  if (!rows.some((r) => r.kind === 'goal')) {
    const t = content.terminus;
    rows.push({ id: '__terminus', title: t.label?.trim() || 'Assessment task', lane: 'core', kind: 'goal', teaches: new Map() });
  }

  /* Coverage: core lessons everyone gets, and the rest. */
  const coverage = new Map<string, ItemCoverage>();
  const limit = thinLimit(rows.filter((r) => r.lane === 'core' && !r.option && r.kind !== 'goal').length);
  for (const id of itemIds) {
    let core = 0;
    let optional = 0;
    let first = -1;
    rows.forEach((row, i) => {
      if (!row.teaches.has(id)) return;
      if (first < 0) first = i;
      if (row.lane === 'core' && !row.option) core++;
      else optional++;
    });
    coverage.set(id, { core, optional, thin: core <= limit, first });
  }
  return { rows, groups, coverage };
}
