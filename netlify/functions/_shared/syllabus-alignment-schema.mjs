// Generated from apps/teaching/src/alignment/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/alignment/schema.ts
import { z } from "zod";
var ALIGNMENT_ID = "english-advanced-12-2024";
var LinkStrengthSchema = z.enum(["shared", "related"]);
var Text = z.string().trim().min(1).max(2e3);
var Code = z.string().regex(/^[A-Z]{2,5}$/);
var ConceptRef = z.string().regex(/^[A-Z]{2,5}\d{1,2}$/);
var PointId = z.string().regex(/^[UR]\d{1,2}$/);
var AlignmentOutcomeSchema = z.object({ n: z.number().int().min(1).max(12), code: z.string().min(1).max(32), text: Text });
var AlignmentProcessSchema = z.object({ code: Code, name: z.string().min(1).max(80), text: Text });
var AlignmentConceptSchema = z.object({
  key: Code,
  name: z.string().min(1).max(80),
  head: Text,
  bullets: z.array(z.object({ n: z.number().int().min(1).max(20), text: Text, adv: z.boolean().default(false) })).min(1).max(20)
});
var AlignmentPointSchema = z.object({
  id: PointId,
  kind: z.enum(["U", "R"]),
  short: z.string().trim().min(1).max(80),
  text: Text,
  outcomes: z.array(z.object({ n: z.number().int().min(1).max(12), link: LinkStrengthSchema })).max(12),
  concepts: z.array(z.object({ ref: ConceptRef, link: LinkStrengthSchema })).max(30),
  processes: z.array(Code).max(6),
  edited: z.boolean().optional()
});
var AlignmentFocusAreaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().min(1).max(80),
  points: z.array(AlignmentPointSchema).min(1).max(20)
});
var AlignmentSchema = z.object({
  schema: z.literal("syllabus_alignment_v1"),
  title: z.string().min(1).max(120),
  match: z.object({ syllabus: z.string().min(1).max(80), version: z.string().min(1).max(20), year: z.number().int() }),
  sources: z.array(z.string().max(300)).max(6).default([]),
  outcomes: z.array(AlignmentOutcomeSchema).min(1).max(12),
  processes: z.array(AlignmentProcessSchema).max(8),
  concepts: z.array(AlignmentConceptSchema).max(20),
  focus_areas: z.array(AlignmentFocusAreaSchema).min(1).max(8),
  updated_at: z.string().optional()
});
var AlignmentPatchSchema = z.object({
  focus_area: z.string().regex(/^[a-z0-9-]{2,40}$/),
  point: PointId,
  outcomes: AlignmentPointSchema.shape.outcomes,
  concepts: AlignmentPointSchema.shape.concepts,
  processes: AlignmentPointSchema.shape.processes
});
var AlignmentPatchError = class extends Error {
};
function applyAlignmentPatch(doc, patch) {
  const area = doc.focus_areas.find((f) => f.id === patch.focus_area);
  const point = area?.points.find((p) => p.id === patch.point);
  if (!area || !point) throw new AlignmentPatchError("That dot point isn\u2019t in this syllabus.");
  const outcomeNs = new Set(doc.outcomes.map((o) => o.n));
  const processCodes = new Set(doc.processes.map((p) => p.code));
  const refs = new Set(doc.concepts.flatMap((c) => c.bullets.map((b) => c.key + b.n)));
  if (patch.outcomes.some((o) => !outcomeNs.has(o.n))) throw new AlignmentPatchError("One of those outcomes isn\u2019t in this syllabus.");
  if (patch.concepts.some((c) => !refs.has(c.ref))) throw new AlignmentPatchError("One of those concept bullets isn\u2019t in the booklet.");
  if (patch.processes.some((p) => !processCodes.has(p))) throw new AlignmentPatchError("One of those learning processes isn\u2019t in the booklet.");
  const dedupe = (rows, key) => [...new Map(rows.map((r) => [key(r), r])).values()];
  const next = structuredClone(doc);
  const target = next.focus_areas.find((f) => f.id === area.id).points.find((p) => p.id === point.id);
  target.outcomes = dedupe(patch.outcomes, (o) => o.n).sort((a, b) => a.n - b.n);
  target.concepts = dedupe(patch.concepts, (c) => c.ref);
  target.processes = [...new Set(patch.processes)];
  target.edited = true;
  return next;
}
export {
  ALIGNMENT_ID,
  AlignmentConceptSchema,
  AlignmentFocusAreaSchema,
  AlignmentOutcomeSchema,
  AlignmentPatchError,
  AlignmentPatchSchema,
  AlignmentPointSchema,
  AlignmentProcessSchema,
  AlignmentSchema,
  LinkStrengthSchema,
  applyAlignmentPatch
};
