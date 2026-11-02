import type { SkillsContinuum } from '@/skills/schema';
import { picksFirst, skillsOffered } from './lesson-picks';
import { STEP_LABEL, type DeepUnderstanding, type PlacedStep } from './schema';

/**
 * The "What does this check?" row, as plain data: which chips come first and
 * what the marking rubric will hold. The row itself is tag-row.ts.
 */

export type PieceChip = { id: string; text: string; tier: string; du: number };
export type PieceLayout = {
  /** Shown straight away: the lesson's picks, then the pieces of any chosen DU step. */
  suggested: PieceChip[];
  /** Everything else, grouped by deep understanding, taught pieces ahead of untaught. */
  groups: Array<{ du: number; claim: string; pieces: PieceChip[] }>;
};

export function pieceLayout(
  deep: readonly DeepUnderstanding[],
  opts: { picks?: readonly string[]; taught?: ReadonlySet<string>; stepDus?: readonly string[] } = {}
): PieceLayout {
  const seen = new Set<string>();
  const all: PieceChip[] = [];
  for (const [n, du] of deep.entries()) {
    for (const p of du.pieces) {
      if (seen.has(p.id) || !p.text.trim()) continue;
      seen.add(p.id);
      all.push({ id: p.id, text: p.text, tier: p.tier, du: n + 1 });
    }
  }
  const stepIds = new Set(deep.filter((d) => opts.stepDus?.includes(d.id)).flatMap((d) => d.pieces.map((p) => p.id)));
  const picked = picksFirst(all.filter((c) => opts.picks?.includes(c.id)), (c) => c.id, opts.picks);
  const fromStep = all.filter((c) => stepIds.has(c.id) && !picked.some((x) => x.id === c.id));
  const suggested = [...picked, ...fromStep];
  const used = new Set(suggested.map((c) => c.id));
  const taught = opts.taught ?? new Set<string>();
  const groups = deep
    .map((du, n) => {
      const pieces = all.filter((c) => c.du === n + 1 && !used.has(c.id));
      return { du: n + 1, claim: du.claim, pieces: [...pieces.filter((c) => taught.has(c.id)), ...pieces.filter((c) => !taught.has(c.id))] };
    })
    .filter((g) => g.pieces.length);
  return { suggested, groups };
}

export type SkillChip = { ref: string; name: string; strand: string };
export type SkillLayout = { suggested: SkillChip[]; groups: Array<{ strand: string; skills: SkillChip[] }> };

export function skillLayout(
  continuum: SkillsContinuum | null,
  deep: readonly DeepUnderstanding[],
  opts: { picks?: readonly string[]; stepDus?: readonly string[] } = {}
): SkillLayout {
  const all: SkillChip[] = [];
  for (const strand of continuum?.strands ?? []) {
    for (const sub of strand.sub_strands) all.push({ ref: `${strand.strand}.${sub.id}`, name: sub.name, strand: strand.name });
  }
  const picked = picksFirst(all.filter((c) => opts.picks?.includes(c.ref)), (c) => c.ref, opts.picks);
  const stepRefs = new Set(
    deep.filter((d) => opts.stepDus?.includes(d.id)).flatMap((d) => skillsOffered(d.dot_points, continuum).map((o) => o.ref))
  );
  const fromStep = all.filter((c) => stepRefs.has(c.ref) && !picked.some((x) => x.ref === c.ref));
  const suggested = [...picked, ...fromStep];
  const used = new Set(suggested.map((c) => c.ref));
  const groups: SkillLayout['groups'] = [];
  for (const c of all) {
    if (used.has(c.ref)) continue;
    const g = groups.find((x) => x.strand === c.strand);
    if (g) g.skills.push(c);
    else groups.push({ strand: c.strand, skills: [c] });
  }
  return { suggested, groups };
}

/** Every step a block could be evidence for, labelled "DU 1 · Step 2A". */
export function stepOptions(deep: readonly DeepUnderstanding[]): Array<{ du: string; step: PlacedStep; label: string }> {
  return deep.flatMap((d, n) => (['2a', '2b', '3', '4'] as const).map((step) => ({ du: d.id, step, label: `DU ${n + 1} · Step ${STEP_LABEL[step]}` })));
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "Your marking rubric: 2 skills, 3 pieces, 1 DU step", or a prompt to tag something when the rubric would be empty. */
export function rubricLine(c: { skills: number; pieces: number; steps: number }): string {
  const parts = [c.skills && plural(c.skills, 'skill'), c.pieces && plural(c.pieces, 'piece'), c.steps && plural(c.steps, 'DU step')].filter(Boolean);
  return parts.length ? `Your marking rubric: ${parts.join(', ')}` : 'Tag a skill, a piece or a DU step and the marking rubric builds itself.';
}
