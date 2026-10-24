import type { Block } from '@/schemas/block';
import { phaseDue } from './rules';
import { SPRINT_PHASES, type PublicSprint, type SprintPhaseKey, type SprintSettings } from './schema';

type Section = Extract<Block, { block_type: 'section' }>;

export const phaseOfSection = (b: Block): SprintPhaseKey | null =>
  b.block_type === 'section' && typeof b.content.sprint_phase === 'string' ? b.content.sprint_phase : null;

/** Top-level blocks outside phase sections are the brief; each phase has at most one section (the first wins). */
export function sprintParts(blocks: readonly Block[]): { brief: Block[]; phases: Map<SprintPhaseKey, Section> } {
  const brief: Block[] = [];
  const phases = new Map<SprintPhaseKey, Section>();
  for (const b of blocks) {
    const key = phaseOfSection(b);
    if (key === null) brief.push(b);
    else if (!phases.has(key)) phases.set(key, b as Section);
  }
  return { brief, phases };
}

/** What stops a sprint publishing, in the teacher's words. */
export function sprintIssues(lesson: { sprint?: SprintSettings; blocks: readonly Block[] }): string[] {
  const s = lesson.sprint;
  if (!s) return ['Set up the sprint’s Kit before publishing.'];
  const out: string[] = [];
  if (s.criteria.length < 2) out.push('Add at least 2 criteria in the Kit.');
  const dues = s.phases.map((p) => phaseDue(p));
  if (dues.some((d) => d === null)) out.push('Set a deadline for every phase.');
  else if (dues.some((d, i) => i > 0 && d! <= dues[i - 1]!)) out.push('Each phase’s deadline must come after the one before it.');
  if (!s.groups.length || s.groups.some((g) => !g.students.length)) out.push('Put every student in a group.');
  const seen = new Set<string>();
  for (const g of s.groups) for (const st of g.students) {
    if (seen.has(st)) { out.push('A student is in two groups. Keep each student in one group.'); break; }
    seen.add(st);
  }
  return out;
}

export function publicSprint(s: SprintSettings): PublicSprint {
  const strip = (c: { id: string; text: string }) => ({ id: c.id, text: c.text });
  return {
    support: s.support,
    lock_hours: s.lock_hours,
    criteria: s.criteria.map(strip),
    reflection_criteria: s.reflection_criteria.map(strip),
    reflection_prompts: [...s.reflection_prompts],
    requirements: s.requirements.map((r) => ({ ...r, phases: [...r.phases] })),
    idea_guide: s.idea_guide,
    phases: s.phases.map((p) => ({ ...p }))
  };
}

export { SPRINT_PHASES };
