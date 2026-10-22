import { z } from 'zod';
import { SKILL_IDS } from '../../../../packages/problem-solver/skills.mjs';

/**
 * A syllabus alignment: one subject's focus areas, their Understanding and
 * Responding dot points, and each point's links to outcomes, Stage 6 concept
 * bullets and learning processes. The wording lives in the private data repo,
 * never in this code. The teacher edits links; the wording stays as imported.
 */

export const ALIGNMENT_ID = 'english-advanced-12-2024';
/** Bump with each change to the private file that saved copies should pick up. */
export const ALIGNMENT_REVISION = 2;

export const LinkStrengthSchema = z.enum(['shared', 'related']);
export type LinkStrength = z.infer<typeof LinkStrengthSchema>;

const Text = z.string().trim().min(1).max(2000);
const Code = z.string().regex(/^[A-Z]{2,5}$/);
const ConceptRef = z.string().regex(/^[A-Z]{2,5}\d{1,2}$/);
const PointId = z.string().regex(/^[UR]\d{1,2}$/);
/** A Problem Solver thinking skill id (packages/problem-solver/skills.mjs). */
const SkillId = z.string().regex(/^[a-z_]{3,40}$/);

export const AlignmentOutcomeSchema = z.object({ n: z.number().int().min(1).max(12), code: z.string().min(1).max(32), text: Text });
export const AlignmentProcessSchema = z.object({ code: Code, name: z.string().min(1).max(80), text: Text });
export const AlignmentConceptSchema = z.object({
  key: Code,
  name: z.string().min(1).max(80),
  head: Text,
  bullets: z.array(z.object({ n: z.number().int().min(1).max(20), text: Text, adv: z.boolean().default(false) })).min(1).max(20)
});
export const AlignmentPointSchema = z.object({
  id: PointId,
  kind: z.enum(['U', 'R']),
  short: z.string().trim().min(1).max(80),
  text: Text,
  outcomes: z.array(z.object({ n: z.number().int().min(1).max(12), link: LinkStrengthSchema })).max(12),
  concepts: z.array(z.object({ ref: ConceptRef, link: LinkStrengthSchema })).max(30),
  processes: z.array(Code).max(6),
  /** Problem Solver thinking skills, strongest first. Older saved copies have none yet. */
  skills: z.array(SkillId).max(12).optional(),
  edited: z.boolean().optional()
});
export const AlignmentFocusAreaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().min(1).max(80),
  points: z.array(AlignmentPointSchema).min(1).max(20)
});
export const AlignmentSchema = z.object({
  schema: z.literal('syllabus_alignment_v1'),
  title: z.string().min(1).max(120),
  match: z.object({ syllabus: z.string().min(1).max(80), version: z.string().min(1).max(20), year: z.number().int() }),
  sources: z.array(z.string().max(300)).max(6).default([]),
  outcomes: z.array(AlignmentOutcomeSchema).min(1).max(12),
  processes: z.array(AlignmentProcessSchema).max(8),
  concepts: z.array(AlignmentConceptSchema).max(20),
  focus_areas: z.array(AlignmentFocusAreaSchema).min(1).max(8),
  /** The private file's revision this copy was last brought up to. Missing means 1. */
  revision: z.number().int().min(1).optional(),
  updated_at: z.string().optional()
});
export type Alignment = z.infer<typeof AlignmentSchema>;
export type AlignmentPoint = z.infer<typeof AlignmentPointSchema>;
export type AlignmentConcept = z.infer<typeof AlignmentConceptSchema>;

/** One dot point's new links. Wording is not editable here. */
export const AlignmentPatchSchema = z.object({
  focus_area: z.string().regex(/^[a-z0-9-]{2,40}$/),
  point: PointId,
  outcomes: AlignmentPointSchema.shape.outcomes,
  concepts: AlignmentPointSchema.shape.concepts,
  processes: AlignmentPointSchema.shape.processes,
  skills: z.array(SkillId).max(12).default([])
});
export type AlignmentPatch = z.infer<typeof AlignmentPatchSchema>;

export class AlignmentPatchError extends Error {}

/** Apply a point's new links, refusing anything that points outside this alignment. */
export function applyAlignmentPatch(doc: Alignment, patch: AlignmentPatch): Alignment {
  const area = doc.focus_areas.find((f) => f.id === patch.focus_area);
  const point = area?.points.find((p) => p.id === patch.point);
  if (!area || !point) throw new AlignmentPatchError('That dot point isn’t in this syllabus.');
  const outcomeNs = new Set(doc.outcomes.map((o) => o.n));
  const processCodes = new Set(doc.processes.map((p) => p.code));
  const refs = new Set(doc.concepts.flatMap((c) => c.bullets.map((b) => c.key + b.n)));
  if (patch.outcomes.some((o) => !outcomeNs.has(o.n))) throw new AlignmentPatchError('One of those outcomes isn’t in this syllabus.');
  if (patch.concepts.some((c) => !refs.has(c.ref))) throw new AlignmentPatchError('One of those concept bullets isn’t in the booklet.');
  if (patch.processes.some((p) => !processCodes.has(p))) throw new AlignmentPatchError('One of those learning processes isn’t in the booklet.');
  if (patch.skills.some((k) => !(SKILL_IDS as readonly string[]).includes(k))) throw new AlignmentPatchError('One of those thinking skills isn’t a Problem Solver skill.');
  const dedupe = <T>(rows: T[], key: (row: T) => string | number): T[] => [...new Map(rows.map((r) => [key(r), r])).values()];
  const next: Alignment = structuredClone(doc);
  const target = next.focus_areas.find((f) => f.id === area.id)!.points.find((p) => p.id === point.id)!;
  target.outcomes = dedupe(patch.outcomes, (o) => o.n).sort((a, b) => a.n - b.n);
  target.concepts = dedupe(patch.concepts, (c) => c.ref);
  target.processes = [...new Set(patch.processes)];
  target.skills = [...new Set(patch.skills)];
  target.edited = true;
  return next;
}

/**
 * Bring a saved copy up to the private file. Thinking skills a copy predates are filled in.
 * From a newer revision, points the teacher never edited take the file's links; edited
 * points keep theirs and gain only concept bullets the saved copy had nowhere.
 */
export function mergeFromSource(saved: Alignment, source: Alignment): { doc: Alignment; changed: boolean } {
  const next: Alignment = structuredClone(saved);
  const newer = (source.revision ?? 1) > (saved.revision ?? 1);
  const linked = new Set(saved.focus_areas.flatMap((f) => f.points.flatMap((p) => p.concepts.map((c) => c.ref))));
  let changed = false;
  for (const area of next.focus_areas) {
    const from = source.focus_areas.find((f) => f.id === area.id);
    for (const point of area.points) {
      const src = from?.points.find((p) => p.id === point.id);
      if (!point.skills) {
        point.skills = [...(src?.skills ?? [])];
        changed = true;
      }
      if (!newer || !src) continue;
      if (!point.edited) {
        point.outcomes = structuredClone(src.outcomes);
        point.concepts = structuredClone(src.concepts);
        point.processes = [...src.processes];
        point.skills = [...(src.skills ?? point.skills)];
      } else {
        const own = new Set(point.concepts.map((c) => c.ref));
        point.concepts.push(...src.concepts.filter((c) => !linked.has(c.ref) && !own.has(c.ref)));
      }
    }
  }
  if (newer) {
    next.revision = source.revision;
    changed = true;
  }
  return { doc: next, changed };
}

export const needsSkills = (doc: Alignment): boolean => doc.focus_areas.some((f) => f.points.some((p) => !p.skills));
/** A saved copy missing skills, or older than the revision this code expects. */
export const needsSource = (doc: Alignment): boolean => needsSkills(doc) || (doc.revision ?? 1) < ALIGNMENT_REVISION;
