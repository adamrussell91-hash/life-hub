import type { Alignment } from '@/alignment/schema';
import { conceptKeyOf } from '@/alignment/model';
import type { NetworkLine } from '@/schemas/block';
import type { SkillsContinuum } from '@/skills/schema';

/**
 * The year network shows every textual concept, for whole-year and stage
 * tracking. A unit map and its lessons show only the unit's own few: the
 * concepts its focus area's dot points are built on.
 */

export const MAX_UNIT_CONCEPTS = 4;

/**
 * The concepts a focus area leans on most: ranked by how many of its dot
 * points share wording with the concept, then how many touch it at all, then
 * booklet order. Three, and a fourth when it shares wording with two or more
 * points.
 */
export function unitConceptKeys(doc: Alignment, areaId: string): string[] {
  const points = doc.focus_areas.find((f) => f.id === areaId)?.points ?? [];
  const shared = new Map<string, number>();
  const touched = new Map<string, number>();
  for (const point of points) {
    for (const key of new Set(point.concepts.filter((c) => c.link === 'shared').map((c) => conceptKeyOf(c.ref)))) shared.set(key, (shared.get(key) ?? 0) + 1);
    for (const key of new Set(point.concepts.map((c) => conceptKeyOf(c.ref)))) touched.set(key, (touched.get(key) ?? 0) + 1);
  }
  const ranked = doc.concepts
    .map((c, i) => ({ key: c.key, shared: shared.get(c.key) ?? 0, touched: touched.get(c.key) ?? 0, i }))
    .filter((c) => c.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.touched - a.touched || a.i - b.i);
  const fourth = ranked[MAX_UNIT_CONCEPTS - 1];
  return ranked.slice(0, fourth && fourth.shared >= 2 ? MAX_UNIT_CONCEPTS : MAX_UNIT_CONCEPTS - 1).map((c) => c.key);
}

/** The metro lines standing for these concepts (linked to one, or named after it), in the concepts' order. */
export function conceptLineIds(
  lines: readonly NetworkLine[],
  keys: readonly string[],
  concepts: ReadonlyArray<{ key: string; name: string }>
): string[] {
  const metro = lines.filter((l) => l.mode === 'metro');
  const ids: string[] = [];
  for (const key of keys) {
    const name = concepts.find((c) => c.key === key)?.name.trim().toLowerCase();
    const line =
      metro.find((l) => l.alignment?.kind === 'concept' && l.alignment.key === key) ??
      metro.find((l) => !l.alignment && name !== undefined && l.name.trim().toLowerCase() === name);
    if (line && !ids.includes(line.id)) ids.push(line.id);
  }
  return ids;
}

/**
 * The skills strands a focus area leans on most: ranked by how many of its
 * dot points a sub-strand names as core, then booklet order. Three, and a
 * fourth when it names two or more points.
 */
export function unitSkillStrands(doc: Alignment, skills: SkillsContinuum, areaId: string): string[] {
  const ids = new Set((doc.focus_areas.find((f) => f.id === areaId)?.points ?? []).map((p) => p.id));
  const ranked = skills.strands
    .map((s, i) => ({
      strand: s.strand as string,
      shared: new Set(s.sub_strands.flatMap((sub) => sub.points.filter((x) => x.link === 'shared' && x.area === areaId && ids.has(x.point)).map((x) => x.point))).size,
      i
    }))
    .filter((s) => s.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.i - b.i);
  const fourth = ranked[MAX_UNIT_SKILLS - 1];
  return ranked.slice(0, fourth && fourth.shared >= 2 ? MAX_UNIT_SKILLS : MAX_UNIT_SKILLS - 1).map((s) => s.strand);
}

export const MAX_UNIT_SKILLS = 4;

/** The light rail lines standing for these strands, in the strands' order. */
export function skillLineIds(lines: readonly NetworkLine[], strands: readonly string[]): string[] {
  const ids: string[] = [];
  for (const strand of strands) {
    const line = lines.find((l) => l.mode === 'light_rail' && l.alignment?.kind === 'strand' && l.alignment.strand === strand);
    if (line && !ids.includes(line.id)) ids.push(line.id);
  }
  return ids;
}

/**
 * The lines a unit map or lesson shows: every train, and of the metro lines
 * only the unit's concepts, and of the light rail lines only the unit's
 * skills. Unset shows every line of that kind.
 */
export function unitLines<T extends Pick<NetworkLine, 'id' | 'mode'>>(
  lines: readonly T[],
  conceptLines: readonly string[] | undefined,
  skillLines?: readonly string[] | undefined
): T[] {
  const concepts = conceptLines?.length ? new Set(conceptLines) : null;
  const skills = skillLines?.length ? new Set(skillLines) : null;
  return lines.filter((l) => (l.mode === 'metro' ? !concepts || concepts.has(l.id) : l.mode === 'light_rail' ? !skills || skills.has(l.id) : true));
}
