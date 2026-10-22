import { RUNG_IDS, type RungId, type SkillStrand, type SkillSubStrand, type SkillsContinuum } from './schema';

export type SkillEntry = { ref: string; strand: SkillStrand; sub: SkillSubStrand };

/** Every sub-strand, with its `strand.sub` reference, in continuum order. */
export function skillEntries(c: SkillsContinuum): SkillEntry[] {
  return c.strands.flatMap((strand) => strand.sub_strands.map((sub) => ({ ref: `${strand.strand}.${sub.id}`, strand, sub })));
}

export function findSkill(c: SkillsContinuum, ref: string | undefined): SkillEntry | null {
  if (!ref) return null;
  return skillEntries(c).find((e) => e.ref === ref) ?? null;
}

/** Skills that build outcome n, optionally within one focus area. */
export function skillsForOutcome(c: SkillsContinuum, n: number, area?: string): SkillEntry[] {
  return skillEntries(c).filter((e) => e.sub.outcomes.includes(n) && (!area || area === 'all' || e.sub.focus_areas.includes(area)));
}

export function skillsForArea(c: SkillsContinuum, area: string): SkillEntry[] {
  return skillEntries(c).filter((e) => area === 'all' || e.sub.focus_areas.includes(area));
}

/**
 * Whether a sub-strand builds this dot point: the points it names, or, for one that
 * names none yet, any point in its focus areas reaching an outcome it builds.
 */
export function servesPoint(sub: SkillSubStrand, p: { area: string; id: string; outcomes: { n: number }[] }): boolean {
  if (sub.points.length) return sub.points.some((x) => x.area === p.area && x.point === p.id);
  return sub.focus_areas.includes(p.area) && p.outcomes.some((o) => sub.outcomes.includes(o.n));
}

/**
 * The rung a mark reaches, on the HSC-style scale out of 20: 13 Capable,
 * 15 Skilled, 17 Accomplished, 19 Excellent, scaled to the criterion's marks.
 * Below 13 out of 20 is under the starting line.
 */
export const RUNG_THRESHOLDS: Record<RungId, number> = { capable: 0.65, skilled: 0.75, accomplished: 0.85, excellent: 0.95 };

export function rungForMark(mark: number, max: number): RungId | 'below' {
  if (!(max > 0) || !Number.isFinite(mark)) return 'below';
  const share = mark / max + 1e-9;
  let reached: RungId | 'below' = 'below';
  for (const id of RUNG_IDS) if (share >= RUNG_THRESHOLDS[id]) reached = id;
  return reached;
}

/** The move a student at this rung should make next. Below the line, aim at Capable. */
export function nextMoveFor(sub: SkillSubStrand, rung: RungId | 'below'): { target: RungId; i_can: string; move: string } {
  if (rung === 'below') return { target: 'capable', i_can: sub.rungs.capable.i_can, move: sub.rungs.capable.i_can };
  const target = RUNG_IDS[Math.min(RUNG_IDS.indexOf(rung) + 1, RUNG_IDS.length - 1)]!;
  return { target, i_can: sub.rungs[target].i_can, move: sub.rungs[rung].build.next_move.replace(/^Keep refining: /, '') };
}

export const rungName = (c: SkillsContinuum, id: RungId | 'below'): string =>
  id === 'below' ? 'Below Capable' : c.strands[0]?.rungs.find((r) => r.id === id)?.name ?? id;
