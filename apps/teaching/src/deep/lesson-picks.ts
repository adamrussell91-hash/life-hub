import type { SkillsContinuum } from '@/skills/schema';
import type { DeepUnderstanding, KnowledgePiece } from './schema';

/**
 * Lesson planning: what a lesson's ticked dot points offer. The picks only
 * decide which chips come first when tagging; they never change what counts.
 */

/** The pieces whose U is ticked, each once, with the deep understanding that owns it. */
export function piecesOffered(ticked: readonly string[], deep: readonly DeepUnderstanding[]): Array<{ du: string; piece: KnowledgePiece }> {
  const on = new Set(ticked);
  return deep.flatMap((du) => du.pieces.filter((p) => p.dot_point && on.has(p.dot_point)).map((piece) => ({ du: du.id, piece })));
}

export type SkillOffer = { ref: string; name: string; strand: string; points: string[]; link: 'shared' | 'related' };

/** The sub-strands that name a ticked R point, shared links first. A skill with both kinds of link counts as shared. */
export function skillsOffered(ticked: readonly string[], continuum: SkillsContinuum | null): SkillOffer[] {
  const on = new Set(ticked.filter((ref) => ref.split(':')[1]?.startsWith('R')));
  const offers: SkillOffer[] = [];
  for (const strand of continuum?.strands ?? []) {
    for (const sub of strand.sub_strands) {
      const links = (sub.points ?? []).filter((p) => on.has(`${p.area}:${p.point}`));
      if (!links.length) continue;
      offers.push({
        ref: `${strand.strand}.${sub.id}`,
        name: sub.name,
        strand: strand.name,
        points: links.map((p) => `${p.area}:${p.point}`),
        link: links.some((p) => p.link === 'shared') ? 'shared' : 'related'
      });
    }
  }
  return [...offers.filter((o) => o.link === 'shared'), ...offers.filter((o) => o.link === 'related')];
}

/** Puts the picked ids first, in the order given, keeping the rest in place. For laying out chips. */
export function picksFirst<T>(items: readonly T[], idOf: (item: T) => string, picks: readonly string[] | undefined): T[] {
  if (!picks?.length) return [...items];
  const at = new Map(picks.map((id, i) => [id, i]));
  const picked = items.filter((x) => at.has(idOf(x))).sort((a, b) => at.get(idOf(a))! - at.get(idOf(b))!);
  return [...picked, ...items.filter((x) => !at.has(idOf(x)))];
}
