import type { LineStop, NetworkLine } from '@/schemas/block';
import { LEVEL_ORDER } from '@/network/model';
import type { NetLevel } from '@/network/layout';
import type { SkillsContinuum } from '@/skills/schema';
import { conceptKeyOf } from './model';
import type { Alignment, AlignmentPoint } from './schema';

/**
 * A lesson's lines from its dot points. Tag a lesson's U and R points and its
 * lines follow from the alignment: a train for each group it teaches, a metro
 * line for each concept a point is a core link to, and a light rail line for
 * each skills strand with a sub-strand that names a point as core. Pure: no
 * DOM, unit tested directly.
 *
 * Stops a teacher adds by hand stay put. A line the teacher takes off an auto
 * stop goes in `line_off`, so the next dot point change leaves it off.
 */

export type AutoLineContext = { doc: Alignment; skills: SkillsContinuum | null; areaId: string };

/** The dot points of this focus area that a lesson's refs name ("human:U2" → U2). */
export function pointsTaught(ctx: AutoLineContext, dotPoints: readonly string[] | undefined): AlignmentPoint[] {
  const points = ctx.doc.focus_areas.find((f) => f.id === ctx.areaId)?.points ?? [];
  const prefix = `${ctx.areaId}:`;
  return (dotPoints ?? [])
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => points.find((p) => p.id === ref.slice(prefix.length)))
    .filter((p): p is AlignmentPoint => Boolean(p));
}

/** The lines these dot points put a lesson on. */
export function autoLineIds(lines: readonly NetworkLine[], ctx: AutoLineContext, dotPoints: readonly string[] | undefined): Set<string> {
  const taught = pointsTaught(ctx, dotPoints);
  const ids = new Set<string>();
  if (!taught.length) return ids;
  const coreConcepts = new Set(taught.flatMap((p) => p.concepts.filter((c) => c.link === 'shared').map((c) => conceptKeyOf(c.ref))));
  const taughtIds = new Set(taught.map((p) => p.id));
  for (const line of lines) {
    const link = line.alignment;
    if (!link) continue;
    if (link.kind === 'points' && taught.some((p) => p.kind === link.group)) ids.add(line.id);
    else if (link.kind === 'concept' && coreConcepts.has(link.key)) ids.add(line.id);
    else if (link.kind === 'strand') {
      const strand = ctx.skills?.strands.find((s) => s.strand === link.strand);
      const named = strand?.sub_strands.some((sub) =>
        sub.points.some((x) => x.link === 'shared' && x.area === ctx.areaId && taughtIds.has(x.point))
      );
      if (named) ids.add(line.id);
    }
  }
  return ids;
}

/**
 * The stops after a dot point change: hand-set stops kept, auto stops brought
 * in step with `auto` (keeping any depth the teacher set), lines the teacher
 * took off left off.
 */
export function syncAutoStops(stops: readonly LineStop[] | undefined, off: readonly string[] | undefined, auto: ReadonlySet<string>): LineStop[] {
  const skip = new Set(off ?? []);
  const next = (stops ?? []).filter((s) => !s.auto || (auto.has(s.line_id) && !skip.has(s.line_id)));
  const have = new Set(next.map((s) => s.line_id));
  for (const id of auto) if (!have.has(id) && !skip.has(id)) next.push({ line_id: id, auto: true });
  return next.slice(0, 16);
}

/** The lessons before `lessonId` in map order: the lines any of them stops on. */
export function linesBefore(ordered: ReadonlyArray<{ id: string; line_stops?: readonly LineStop[] }>, lessonId: string): Set<string> {
  const seen = new Set<string>();
  for (const lesson of ordered) {
    if (lesson.id === lessonId) break;
    for (const stop of lesson.line_stops ?? []) seen.add(stop.line_id);
  }
  return seen;
}

/**
 * One tap on a lesson's line. A light rail stop is on or off. A train or
 * metro stop steps its depth from the one it shows (`shown`, for an auto
 * stop with none of its own): introduced, reinforced, mastered, then back to
 * introduced with `wrap`, or off without it. Taking an auto stop off
 * remembers it in `off`; putting it back brings it back as an auto stop.
 */
export function toggleLineStop(
  stops: readonly LineStop[] | undefined,
  off: readonly string[] | undefined,
  line: Pick<NetworkLine, 'id' | 'mode'>,
  options: { shown?: NetLevel; wrap?: boolean } = {}
): { stops: LineStop[]; off: string[] } {
  const list = [...(stops ?? [])];
  const at = list.findIndex((s) => s.line_id === line.id);
  if (at < 0) {
    const wasAuto = (off ?? []).includes(line.id);
    const stop: LineStop = line.mode === 'light_rail' ? { line_id: line.id } : { line_id: line.id, level: 'introduced' };
    list.push(wasAuto ? { ...stop, auto: true } : stop);
    return { stops: list.slice(0, 16), off: (off ?? []).filter((id) => id !== line.id) };
  }
  const current = list[at]!;
  if (line.mode !== 'light_rail') {
    const now = current.level ?? options.shown ?? 'reinforced';
    const level = LEVEL_ORDER[LEVEL_ORDER.indexOf(now) + 1] ?? (options.wrap ? LEVEL_ORDER[0] : undefined);
    if (level) {
      list[at] = { ...current, level };
      return { stops: list, off: [...(off ?? [])] };
    }
  }
  return removeLineStop(list, off, line.id);
}

/** Takes a line off a lesson; an auto stop is remembered in `off` so the dot points leave it off. */
export function removeLineStop(stops: readonly LineStop[] | undefined, off: readonly string[] | undefined, lineId: string): { stops: LineStop[]; off: string[] } {
  const stop = (stops ?? []).find((s) => s.line_id === lineId);
  const skip = (off ?? []).filter((id) => id !== lineId);
  return {
    stops: (stops ?? []).filter((s) => s.line_id !== lineId),
    off: (stop?.auto ? [...skip, lineId] : skip).slice(0, 24)
  };
}
