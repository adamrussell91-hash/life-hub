// Generated from apps/teaching/src/sprint/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/sprint/schema.ts
import { z } from "zod";
var SPRINT_PHASES = ["understand", "sketch", "decide", "prototype", "test"];
var SprintPhaseKeySchema = z.enum(SPRINT_PHASES);
var PHASE_LABELS = {
  understand: "Understand",
  sketch: "Sketch",
  decide: "Decide",
  prototype: "Prototype",
  test: "Test"
};
var LEVEL_LABELS = ["Starting", "Showing", "Strong"];
var LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
var SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 };
var SprintIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
var Day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
var Time = z.string().regex(/^(\d{2}:\d{2})?$/);
var text = (max) => z.string().trim().max(max);
var SprintCriterionSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z.string().min(1).max(64).optional()
});
var SprintRequirementSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  phases: z.array(SprintPhaseKeySchema).max(5).default(["sketch", "prototype"])
});
var IdeaGuideSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  model: z.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z.array(text(120)).max(6).default([])
  }),
  pair: z.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
var SprintPhaseSchema = z.object({
  key: SprintPhaseKeySchema,
  where: z.enum(["class", "home"]),
  due_date: Day.default(""),
  due_time: Time.default("15:00"),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(""),
  instruction: text(600).default(""),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default("")
});
var SprintGroupSchema = z.object({
  id: SprintIdSchema,
  name: z.string().trim().min(1).max(40),
  students: z.array(z.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  decider: z.enum(["top_vote", "teacher"]).default("teacher"),
  support: z.enum(["guided", "standard", "open"]).default("standard"),
  lock_hours: z.number().int().min(0).max(24).default(2),
  criteria: z.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z.array(text(200)).max(2).default([]),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z.object({ prototype: z.string().optional(), reflection: z.string().optional() }).default({})
});
var PublicSprintSchema = z.object({
  support: z.enum(["guided", "standard", "open"]),
  lock_hours: z.number().int().min(0).max(24),
  criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z.array(z.string().max(200)).max(2),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5)
});
var where = text(200);
var Wheres = z.record(z.string().max(40), where).default({});
var UnderstandPayloadSchema = z.object({
  notes: z.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's notes) this student starred. */
  star: z.string().max(40).default(""),
  stretch: text(300).default("")
});
var SketchCardSchema = z.object({
  id: SprintIdSchema,
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default("")
});
var SketchPayloadSchema = z.object({
  cards: z.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var DecidePayloadSchema = z.object({
  /** Criterion id → idea id. */
  votes: z.record(z.string().max(40), z.string().max(40)).default({}),
  reasons: z.record(z.string().max(40), text(300)).default({}),
  opened: z.array(z.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypePayloadSchema = z.object({
  text: text(4e3).default(""),
  link: z.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z.array(z.string().max(40)).max(SPRINT_LIMITS.files).default([]),
  requirements: Wheres,
  self: z.record(z.string().max(40), LevelSchema).default({}),
  self_why: z.record(z.string().max(40), text(300)).default({}),
  value_answer: text(300).default("")
});
var TestPayloadSchema = z.object({
  reflection: z.array(text(1e3)).max(2).default([]),
  quote: text(300).default(""),
  change_criterion: z.string().max(40).default(""),
  value_answer: text(300).default("")
});
var PAYLOAD_SCHEMAS = {
  understand: UnderstandPayloadSchema,
  sketch: SketchPayloadSchema,
  decide: DecidePayloadSchema,
  prototype: PrototypePayloadSchema,
  test: TestPayloadSchema
};
var PartSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(80),
  shows: text(200).default(""),
  criterion: z.string().max(40).default("")
});
var PartsSchema = z.array(PartSchema).max(SPRINT_LIMITS.parts);
var FeedbackEntrySchema = z.object({
  levels: z.record(z.string().max(40), LevelSchema).default({}),
  worked: text(300).default(""),
  next: text(300).default(""),
  /** The criterion the written lines are about. */
  about: z.string().max(40).default("")
});
export {
  DecidePayloadSchema,
  FeedbackEntrySchema,
  IdeaGuideSchema,
  LEVEL_LABELS,
  LevelSchema,
  PAYLOAD_SCHEMAS,
  PHASE_LABELS,
  PartSchema,
  PartsSchema,
  PrototypePayloadSchema,
  PublicSprintSchema,
  SPRINT_LIMITS,
  SPRINT_PHASES,
  SketchCardSchema,
  SketchPayloadSchema,
  SprintCriterionSchema,
  SprintGroupSchema,
  SprintIdSchema,
  SprintPhaseKeySchema,
  SprintPhaseSchema,
  SprintRequirementSchema,
  SprintSettingsSchema,
  TestPayloadSchema,
  UnderstandPayloadSchema
};
