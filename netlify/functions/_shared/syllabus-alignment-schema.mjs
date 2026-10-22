// Generated from apps/teaching/src/alignment/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/alignment/schema.ts
import { z } from "zod";

// packages/problem-solver/skills.mjs
var SKILLS = Object.freeze([
  { id: "abstract_thinking", name: "Abstract thinking", description: "Comprehending and processing ideas and principles that are symbolic, hypothetical or not physically present." },
  { id: "searching", name: "Searching", description: "Systematically locating, gathering and processing information." },
  { id: "learning", name: "Learning", description: "Absorbing and integrating new information to expand knowledge and apply it to different situations." },
  { id: "decision_making", name: "Decision making", description: "Selecting a course of action from multiple alternatives through the consideration of potential outcomes." },
  { id: "inference", name: "Inference", description: "Drawing conclusions that extend beyond the explicit information provided, relying on reasoning and existing knowledge." },
  { id: "reflective_thinking", name: "Reflective thinking", description: "Contemplating and evaluating one's own thoughts and experiences, leading to self-awareness and personal growth." },
  { id: "synthesis", name: "Synthesis", description: "Combining ideas, information, perspectives or elements to form an integrated or new understanding." },
  { id: "analysis", name: "Analysis", description: "Breaking down information or situations into elements to comprehend structures, underlying principles and interrelationships." },
  { id: "logical_reasoning", name: "Logical reasoning", description: "Systematic thinking that follows rules of logic and uses deductive and inductive reasoning to arrive at valid conclusions." },
  { id: "critical_thinking", name: "Critical thinking", description: "Analysing information objectively to identify biases and assumptions, evaluate evidence and arguments, and draw logical conclusions." },
  { id: "metacognition", name: "Metacognition", description: "Awareness and understanding of one's own thought processes, including the ability to regulate one's thinking and learning strategies." },
  { id: "creative_thinking", name: "Creative thinking", description: "Generating novel ideas, thinking divergently and approaching problems from new perspectives." }
]);
var SKILL_IDS = Object.freeze(SKILLS.map((skill) => skill.id));

// apps/teaching/src/alignment/schema.ts
var ALIGNMENT_ID = "english-advanced-12-2024";
var LinkStrengthSchema = z.enum(["shared", "related"]);
var Text = z.string().trim().min(1).max(2e3);
var Code = z.string().regex(/^[A-Z]{2,5}$/);
var ConceptRef = z.string().regex(/^[A-Z]{2,5}\d{1,2}$/);
var PointId = z.string().regex(/^[UR]\d{1,2}$/);
var SkillId = z.string().regex(/^[a-z_]{3,40}$/);
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
  /** Problem Solver thinking skills, strongest first. Older saved copies have none yet. */
  skills: z.array(SkillId).max(12).optional(),
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
  processes: AlignmentPointSchema.shape.processes,
  skills: z.array(SkillId).max(12).default([])
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
  if (patch.skills.some((k) => !SKILL_IDS.includes(k))) throw new AlignmentPatchError("One of those thinking skills isn\u2019t a Problem Solver skill.");
  const dedupe = (rows, key) => [...new Map(rows.map((r) => [key(r), r])).values()];
  const next = structuredClone(doc);
  const target = next.focus_areas.find((f) => f.id === area.id).points.find((p) => p.id === point.id);
  target.outcomes = dedupe(patch.outcomes, (o) => o.n).sort((a, b) => a.n - b.n);
  target.concepts = dedupe(patch.concepts, (c) => c.ref);
  target.processes = [...new Set(patch.processes)];
  target.skills = [...new Set(patch.skills)];
  target.edited = true;
  return next;
}
function mergeMissingSkills(saved, source) {
  const next = structuredClone(saved);
  let changed = false;
  for (const area of next.focus_areas) {
    const from = source.focus_areas.find((f) => f.id === area.id);
    for (const point of area.points) {
      if (point.skills) continue;
      point.skills = [...from?.points.find((p) => p.id === point.id)?.skills ?? []];
      changed = true;
    }
  }
  return { doc: next, changed };
}
var needsSkills = (doc) => doc.focus_areas.some((f) => f.points.some((p) => !p.skills));
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
  applyAlignmentPatch,
  mergeMissingSkills,
  needsSkills
};
