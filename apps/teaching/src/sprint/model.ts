import type { Block } from '@/schemas/block';
import { phaseDue } from './rules';
import { SPRINT_PHASES, defaultUnderstand, type PublicSprint, type SprintPhaseKey, type SprintSettings } from './schema';

type Section = Extract<Block, { block_type: 'section' }>;

export const phaseOfSection = (b: Block): SprintPhaseKey | null =>
  b.block_type === 'section' && typeof b.content.sprint_phase === 'string' ? b.content.sprint_phase : null;

export const isGuidesSection = (b: Block): boolean => b.block_type === 'section' && b.content.sprint_guides === true;

/** Top-level blocks outside phase and guides sections are the brief; each phase has at most one section (the first wins), and so does Guides. */
export function sprintParts(blocks: readonly Block[]): { brief: Block[]; phases: Map<SprintPhaseKey, Section>; guides: Section | null } {
  const brief: Block[] = [];
  const phases = new Map<SprintPhaseKey, Section>();
  let guides: Section | null = null;
  for (const b of blocks) {
    const key = phaseOfSection(b);
    if (isGuidesSection(b)) guides ??= b as Section;
    else if (key === null) brief.push(b);
    else if (!phases.has(key)) phases.set(key, b as Section);
  }
  return { brief, phases, guides };
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
    phases: s.phases.map((p) => ({ ...p })),
    understand: s.understand ? { layout: s.understand.layout, steps: { ...s.understand.steps } } : defaultUnderstand(),
    sketch_timer: s.sketch_timer ?? 8,
    decide_dots: s.decide_dots ?? 3
  };
}

export { SPRINT_PHASES };

/** The brief's words as plain text, for Understand's Spot step: headings, text, callouts and quotes, in order. */
export function briefText(blocks: readonly Block[]): string {
  const plain = (html: string) => {
    if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, ' ');
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  };
  const out: string[] = [];
  // Walk the content, so toggles (accordion items) and any other block that
  // holds words are read, not only the flat text keys.
  const walk = (v: unknown, key: string, depth: number): void => {
    if (depth > 4) return;
    if (typeof v === 'string') {
      if (['text', 'html', 'body', 'title', 'description', 'prompt'].includes(key) && v.trim()) out.push(/<[a-z!/]/i.test(v) ? plain(v) : v);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, typeof x === 'string' ? key : '', depth + 1);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (k !== 'narration' && k !== 'script') walk(x, k, depth + 1);
    }
  };
  for (const b of sprintParts(blocks).brief) walk(b.content, '', 0);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
