// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z12 } from "zod";

// apps/teaching/src/skills/schema.ts
import { z } from "zod";
var SKILL_STRANDS = ["reading", "arguing", "comparing", "valuing", "composing", "speaking", "language"];
var RUNG_IDS = ["capable", "skilled", "accomplished", "excellent"];
var SkillRefSchema = z.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/);
var Short = z.string().max(400);
var Long = z.string().max(1500);
var SkillPartSchema = z.object({ id: z.string().min(1).max(40), name: Short, job: Long, language: z.array(Short).max(8).default([]) });
var SkillBuildSchema = z.object({
  formula: z.array(Short).max(8),
  parts: z.array(SkillPartSchema).min(1).max(8),
  example: z.array(z.tuple([Long, z.string().max(40).nullable()])).min(1).max(20),
  why_here: Long,
  checks: z.array(Short).max(8),
  next_move: Long,
  steps: z.array(Long).max(8).optional(),
  technique: z.object({ name: Short, how: Long, pairs: z.array(z.tuple([Long, Long])).max(8) }).optional()
});
var SkillIndicatorSchema = z.object({ group: Short, text: Long, eg: Long.optional() });
var SkillRungSchema = z.object({ i_can: Long, indicators: z.array(SkillIndicatorSchema).max(12).default([]), build: SkillBuildSchema });
var SkillSubStrandSchema = z.object({
  id: z.string().regex(/^[a-z-]{2,40}$/),
  name: Short,
  in_hsc: Long,
  draws_on: Long,
  example_question: Long.optional(),
  example_claim: Long.optional(),
  example_note: Long.optional(),
  outcomes: z.array(z.number().int().min(1).max(12)).max(6).default([]),
  focus_areas: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(8).default([]),
  /** The syllabus dot points it builds. Outcomes and focus areas follow from these; without any, they stand alone. */
  points: z.array(z.object({ area: z.string().regex(/^[a-z0-9-]{2,40}$/), point: z.string().regex(/^[UR]\d{1,2}$/), link: z.enum(["shared", "related"]) })).max(40).default([]),
  rungs: z.object({ capable: SkillRungSchema, skilled: SkillRungSchema, accomplished: SkillRungSchema, excellent: SkillRungSchema })
});
var SkillRungInfoSchema = z.object({ id: z.enum(RUNG_IDS), name: Short, marks: Short, marker_words: Short, meaning: Long });
var SkillStrandSchema = z.object({
  schema: z.literal("skills_strand_v1"),
  strand: z.enum(SKILL_STRANDS),
  name: Short,
  summary: Long,
  rungs: z.array(SkillRungInfoSchema).length(4),
  sub_strands: z.array(SkillSubStrandSchema).min(1).max(12)
});
var SkillsContinuumSchema = z.object({ strands: z.array(SkillStrandSchema).min(1).max(SKILL_STRANDS.length), fetched_at: z.string().optional() });

// apps/teaching/src/schemas/common.ts
import { z as z2 } from "zod";
var StatusSchema = z2.enum(["active", "archived", "trashed"]);
var IsoDateSchema = z2.string().datetime();
var CommonFields = {
  id: z2.string().min(1),
  title: z2.string().min(1),
  slug: z2.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z2.literal(1)
};
var TrashFieldsSchema = z2.object({
  trashed_at: IsoDateSchema.optional(),
  previous_status: z2.enum(["active", "archived"]).optional(),
  trash_reason: z2.string().min(1).optional()
});
var TrashFields = {
  trashed_at: IsoDateSchema.optional(),
  previous_status: z2.enum(["active", "archived"]).optional(),
  trash_reason: z2.string().min(1).optional()
};

// apps/teaching/src/schemas/faded.ts
import { z as z3 } from "zod";
var FadedStepSchema = z3.object({
  /** Absent only on content converted from the old shape: the key is then the block id. */
  id: z3.string().min(1).optional(),
  /** Only when this step needs different wording from the block's question. */
  prompt: z3.string().max(300).optional(),
  extract: z3.string().max(2e3),
  answers: z3.array(z3.string().max(600)).min(1).max(4),
  blanks: z3.array(z3.number().int().min(0).max(3)).max(4),
  /** Worked steps: one question about why the example works. */
  question: z3.object({
    prompt: z3.string().max(300),
    choices: z3.array(z3.string().max(200)).min(2).max(4),
    correct: z3.number().int().min(0).max(3)
  }).optional()
});
var FadedShape = z3.object({
  prompt: z3.string().max(300),
  part_labels: z3.array(z3.string().min(1).max(40)).min(1).max(4),
  steps: z3.array(FadedStepSchema).min(1).max(6),
  /** What a strong answer does, by part label. */
  criteria: z3.record(z3.string(), z3.array(z3.string().max(160)).max(4)),
  /** A block with a writing step is a gate unless switched off. */
  gate: z3.boolean().optional()
});
var GENERIC_CRITERIA = ["Answers the question", "Uses words from the extract", "Says what those words show"];
function upgradeFaded(raw) {
  const c = raw ?? {};
  if (Array.isArray(c.steps)) return raw;
  const parts = Array.isArray(c.parts) ? c.parts : [];
  const blanks = Array.isArray(c.blanks) ? c.blanks : [];
  const labels = parts.map((p) => p.label);
  return {
    prompt: typeof c.prompt === "string" ? c.prompt : "",
    part_labels: labels,
    steps: parts.length ? [{ extract: typeof c.extract === "string" ? c.extract : "", answers: parts.map((p) => p.answer), blanks }] : [],
    criteria: Object.fromEntries(blanks.filter((i) => i < labels.length).map((i) => [labels[i], GENERIC_CRITERIA])),
    ...typeof c.gate === "boolean" ? { gate: c.gate } : {}
  };
}
var FadedContentSchema = z3.preprocess(
  upgradeFaded,
  FadedShape.superRefine((c, ctx) => {
    c.steps.forEach((step, s) => {
      const issue = (message, key) => ctx.addIssue({ code: "custom", message, path: ["steps", s, key] });
      if (step.answers.length !== c.part_labels.length) issue("Each step needs one answer per part.", "answers");
      if (new Set(step.blanks).size !== step.blanks.length || step.blanks.some((i) => i >= c.part_labels.length)) {
        issue("Each blank must name a different part of the example.", "blanks");
      }
      if (step.question && step.question.correct >= step.question.choices.length) issue("The correct choice must be one of the choices.", "question");
    });
  })
);

// apps/teaching/src/schemas/kaplan.ts
import { z as z4 } from "zod";
var KaplanLensSchema = z4.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z4.tuple([
  z4.string().max(1200),
  z4.string().max(1200),
  z4.string().max(1200)
]);
var KaplanQualifierSchema = z4.object({
  lens: KaplanLensSchema,
  focus: z4.string().trim().max(200).default(""),
  mode: z4.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z4.tuple([
    z4.string().max(1200).nullable(),
    z4.string().max(1200).nullable(),
    z4.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z4.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/schemas/discern.ts
import { z as z5 } from "zod";
var DiscernModeSchema = z5.enum(["own", "theirs"]);
var DiscernInitialTypeSchema = z5.enum(["scale", "choose", "write"]);
var DiscernScalePresetSchema = z5.enum(["agree", "extent", "effect", "verdict"]);
var DiscernQualifierSchema = z5.object({
  /** own: the student's answer. theirs: a character's or historical figure's choice. */
  mode: DiscernModeSchema.default("own"),
  who: z5.string().trim().max(80).default(""),
  /** What is being judged. Fills every default prompt. */
  focus: z5.string().trim().max(200).default(""),
  /** Optional evidence source, e.g. "the poems" or "Source B". */
  source: z5.string().trim().max(120).default(""),
  initial: z5.object({
    type: DiscernInitialTypeSchema.default("scale"),
    preset: DiscernScalePresetSchema.default("agree"),
    /** Scale points or choices. Empty scale points fall back to the preset. */
    options: z5.array(z5.string().trim().max(60)).max(5).default([])
  }).prefault({}),
  /** Teacher overrides for the five step prompts; an empty string keeps the default. */
  prompts: z5.array(z5.string().max(1200)).length(5).optional(),
  /** "Their choice" only: students also plot how settled the character is across key moments. */
  character_tail: z5.object({
    enabled: z5.boolean().default(false),
    moments: z5.array(z5.string().trim().max(80)).max(6).default([])
  }).optional()
});

// apps/teaching/src/schemas/lens.ts
import { z as z6 } from "zod";
var LensAttachmentSchema = z6.object({
  id: z6.string().min(1).max(60),
  config: z6.record(z6.string(), z6.unknown())
});
var LensAttachmentsSchema = z6.array(LensAttachmentSchema).max(6).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: z6.ZodIssueCode.custom, message: "Use each lens once per block." });
  }
});
var LensLevelSchema = z6.enum(["support", "core", "extend"]);
var StepTextSchema = z6.string().max(1200);
var WindowsMirrorsConfigSchema = z6.object({
  focus: z6.string().trim().max(200).default(""),
  answer_with: z6.enum(["window", "mirror", "both", "choice"]).default("both"),
  level: LensLevelSchema.default("core"),
  student_level: z6.boolean().default(true),
  mode: z6.enum(["notes", "discussion"]).default("notes"),
  /** Teacher overrides keyed `${level}.${stepId}`; empty keeps the default. */
  prompts: z6.record(z6.string(), StepTextSchema).optional(),
  supports: z6.record(z6.string(), StepTextSchema.nullable()).optional(),
  examples: z6.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SteppedLensConfigSchema = WindowsMirrorsConfigSchema.omit({ answer_with: true });
var LogicSchema = z6.enum(["deductive", "inductive", "abductive", "all_three", "choice"]);
var ReasoningConfigSchema = z6.object({
  focus: z6.string().trim().max(200).default(""),
  logic: LogicSchema.default("choice"),
  level: LensLevelSchema.default("core"),
  student_level: z6.boolean().default(true),
  mode: z6.enum(["notes", "discussion"]).default("notes"),
  prompts: z6.record(z6.string(), StepTextSchema).optional(),
  supports: z6.record(z6.string(), StepTextSchema.nullable()).optional(),
  examples: z6.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SleeveLevelSchema = z6.enum(["support", "extend"]);
var SleeveConfigSchema = z6.object({
  level: SleeveLevelSchema.default("support"),
  student_level: z6.boolean().default(true),
  do: z6.string().max(600).optional(),
  checks: z6.array(z6.string().max(300)).max(3).optional()
});

// apps/teaching/src/tutorial/schema.ts
import { z as z7 } from "zod";
var GAP_TYPES = ["knowledge", "mix_up"];
var TutorialGroupIdSchema = z7.string().regex(/^[a-z0-9_-]{1,40}$/);
var TutorialGroupSchema = z7.object({
  id: TutorialGroupIdSchema,
  /** Teacher-facing: "Re-tells the plot". Students never see it. */
  name: z7.string().min(1).max(80),
  /** Teacher-facing: why this group gets it wrong. */
  why: z7.string().max(300),
  /** Student-facing goal, written as what they will do: "Today: explaining the effect". */
  goal: z7.string().max(140),
  gap_type: z7.enum(GAP_TYPES),
  students: z7.array(z7.string().min(1).max(64)).max(40),
  /** Ann's evidence for placing each student, from their recorded mistakes. */
  evidence: z7.array(z7.object({ student: z7.string().min(1).max(64), quote: z7.string().max(300) })).max(80).default([]),
  /** Teacher-facing: what to build for this group. Shown as a teacher note at the top of its tab. */
  notes: z7.string().max(1200).optional(),
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z7.array(z7.string().min(1).max(64)).max(40).optional()
});
var TutorialSettingsSchema = z7.object({
  class_id: z7.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z7.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z7.string().max(64).optional(),
  groups: z7.array(TutorialGroupSchema).max(8)
});

// apps/teaching/src/sprint/schema.ts
import { z as z8 } from "zod";
var SPRINT_PHASES = ["understand", "sketch", "decide", "prototype", "test"];
var SprintPhaseKeySchema = z8.enum(SPRINT_PHASES);
var LevelSchema = z8.union([z8.literal(1), z8.literal(2), z8.literal(3)]);
var SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 };
var SprintIdSchema = z8.string().regex(/^[a-z0-9_-]{1,40}$/);
var Day = z8.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
var Time = z8.string().regex(/^(\d{2}:\d{2})?$/);
var text = (max) => z8.string().trim().max(max);
var SprintCriterionSchema = z8.object({
  id: SprintIdSchema,
  text: z8.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z8.string().min(1).max(64).optional()
});
var SprintRequirementSchema = z8.object({
  id: SprintIdSchema,
  text: z8.string().trim().min(1).max(160),
  phases: z8.array(SprintPhaseKeySchema).max(5).default(["sketch", "prototype"])
});
var IdeaGuideSchema = z8.object({
  checklist: z8.array(z8.string().trim().min(1).max(160)).min(1).max(8),
  model: z8.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z8.array(text(120)).max(6).default([])
  }),
  pair: z8.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
var exampleLines = z8.array(text(240)).max(4).default([]);
var IdeaKindSchema = z8.object({
  /** "One idea is…": "a kind of viva question, with one sample". */
  one: text(120).default(""),
  /** The plural used in headings: "kinds of viva question". */
  many: text(60).default(""),
  /** What ideas get judged with, shown before the timer starts. */
  judge: text(240).default(""),
  examples: z8.object({
    inspiration: exampleLines,
    rapid: exampleLines,
    pick: exampleLines,
    develop: exampleLines
  }).prefault({})
});
var SprintPhaseSchema = z8.object({
  key: SprintPhaseKeySchema,
  where: z8.enum(["class", "home"]),
  due_date: Day.default(""),
  due_time: Time.default("15:00"),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z8.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(""),
  instruction: text(600).default(""),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z8.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default("")
});
var SprintGroupSchema = z8.object({
  id: SprintIdSchema,
  name: z8.string().trim().min(1).max(40),
  students: z8.array(z8.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
var UNDERSTAND_ALONE = ["spot", "audience", "dig", "say", "limits"];
var UNDERSTAND_GROUP = ["vote", "merge", "grid", "ask", "expert"];
var UNDERSTAND_STEPS = [...UNDERSTAND_ALONE, ...UNDERSTAND_GROUP];
var allSteps = () => Object.fromEntries(UNDERSTAND_STEPS.map((k) => [k, true]));
var UnderstandSettingsSchema = z8.object({
  layout: z8.enum(["slides", "vertical"]).default("slides"),
  steps: z8.record(z8.string(), z8.boolean()).default(allSteps).transform((v) => ({ ...allSteps(), ...Object.fromEntries(Object.entries(v).filter(([k]) => UNDERSTAND_STEPS.includes(k))) }))
});
var defaultUnderstand = () => ({ layout: "slides", steps: allSteps() });
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z8.object({
  class_id: z8.string().min(1).max(64),
  /** Who settles each group's problem and idea: the students' votes (ties come to the teacher), or the teacher approves each. */
  decider: z8.enum(["top_vote", "teacher"]).default("top_vote"),
  support: z8.enum(["guided", "standard", "open"]).default("standard"),
  /** Older Kits' class lock; still loads, no longer used. The teacher picks a lock when ending a class part. */
  lock_hours: z8.number().int().min(0).max(24).default(0),
  criteria: z8.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z8.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z8.array(text(200)).max(2).default([]),
  requirements: z8.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  idea_kind: IdeaKindSchema.optional(),
  phases: z8.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z8.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  understand: UnderstandSettingsSchema.prefault(defaultUnderstand),
  /** Sketch's rapid ideas: minutes on the timer, 0 for no timer. */
  sketch_timer: z8.number().int().min(0).max(30).default(8),
  /** Stand-out dots from before head-to-heads; kept so older Kits still load, no longer used. */
  decide_dots: z8.number().int().min(0).max(5).default(3),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z8.object({ prototype: z8.string().optional(), reflection: z8.string().optional() }).default({})
});
var PublicSprintSchema = z8.object({
  support: z8.enum(["guided", "standard", "open"]),
  lock_hours: z8.number().int().min(0).max(24),
  criteria: z8.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z8.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z8.array(z8.string().max(200)).max(2),
  requirements: z8.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  idea_kind: IdeaKindSchema.optional(),
  phases: z8.array(SprintPhaseSchema).length(5),
  understand: UnderstandSettingsSchema.prefault(defaultUnderstand),
  sketch_timer: z8.number().int().min(0).max(30).default(8),
  decide_dots: z8.number().int().min(0).max(5).default(3)
});
var where = text(200);
var Wheres = z8.record(z8.string().max(40), where).default({});
var cards = z8.array(text(120)).max(8).default([]);
var UnderstandPayloadSchema = z8.object({
  /** Earlier sprints' "How might we" notes; still read, no longer written. */
  notes: z8.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's statements) this student starred. */
  star: z8.string().max(40).default(""),
  stretch: text(300).default(""),
  /** Words from the brief that stand out. */
  spot: z8.array(text(40)).max(30).default([]),
  audience: z8.object({ who: text(200).default(""), why: text(300).default("") }).prefault({ who: "", why: "" }),
  /** The surface problem, then each "why is that a problem?". */
  dig: z8.array(text(300)).max(6).default([]),
  /** The problem in their own words. */
  say: text(400).default(""),
  limits: z8.object({ can_known: cards, cant_known: cards, can_unknown: cards, cant_unknown: cards }).prefault({ can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] })
});
var SketchCardSchema = z8.object({
  id: SprintIdSchema,
  /** The rapid idea it grew from. */
  seed: text(120).optional(),
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z8.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default("")
});
var SketchPayloadSchema = z8.object({
  /** Examples worth borrowing from, and what to take from each. */
  inspiration: z8.array(z8.object({ from: text(120).default(""), borrow: text(200).default("") })).max(3).default([]),
  /** Rapid ideas: one line each, written against the timer. */
  rapid: z8.array(text(120)).max(40).default([]),
  /** When the student started the timer (ISO), or empty. */
  rapid_started_at: z8.string().max(40).default(""),
  /** Developed ideas, one per rapid idea picked (card id "r{index}"). These go to the group. */
  cards: z8.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z8.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var IDEA_PARTS = ["idea", "answers", "evidence"];
var DotSchema = z8.object({ idea: z8.string().max(40), part: z8.enum(IDEA_PARTS), note: text(120).default("") });
var DuelSchema = z8.object({
  a: z8.string().max(40),
  b: z8.string().max(40),
  winner: z8.string().max(40),
  stronger: z8.array(z8.string().max(40)).max(SPRINT_LIMITS.criteria).default([]),
  why: text(160).default("")
});
var DecidePayloadSchema = z8.object({
  /** Head-to-heads between the group's strongest ideas, every pair once. */
  duels: z8.array(DuelSchema).max(66).default([]),
  /** Stand-out dots from sprints run before head-to-heads; no longer placed. */
  dots: z8.array(DotSchema).max(5).default([]),
  /** Criterion id → idea id, from sprints run before head-to-heads. */
  votes: z8.record(z8.string().max(40), z8.string().max(40)).default({}),
  reasons: z8.record(z8.string().max(40), text(300)).default({}),
  opened: z8.array(z8.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypeBuildSchema = z8.object({
  text: text(4e3).default(""),
  link: z8.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z8.array(z8.string().max(40)).max(SPRINT_LIMITS.files).default([])
});
var PrototypePayloadSchema = PrototypeBuildSchema.extend({
  /** A student with two or more parts builds each one here, by part id; one part uses the fields above. */
  builds: z8.record(z8.string().max(40), PrototypeBuildSchema).refine((b) => Object.keys(b).length <= SPRINT_LIMITS.parts, "Too many parts.").default({}),
  requirements: Wheres,
  self: z8.record(z8.string().max(40), LevelSchema).default({}),
  self_why: z8.record(z8.string().max(40), text(300)).default({}),
  value_answer: text(300).default("")
});
var TestPayloadSchema = z8.object({
  reflection: z8.array(text(1e3)).max(2).default([]),
  quote: text(300).default(""),
  change_criterion: z8.string().max(40).default(""),
  value_answer: text(300).default("")
});
var PartSchema = z8.object({
  id: SprintIdSchema,
  text: z8.string().trim().min(1).max(80),
  shows: text(400).default(""),
  /** Optional notes on how the part gets made: tools, steps, what is borrowed. */
  how: text(400).default(""),
  criterion: z8.string().max(40).default("")
});
var PartsSchema = z8.array(PartSchema).max(SPRINT_LIMITS.parts).refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, "Each part needs its own id.");
var FeedbackEntrySchema = z8.object({
  levels: z8.record(z8.string().max(40), LevelSchema).default({}),
  worked: text(300).default(""),
  next: text(300).default(""),
  /** The criterion the written lines are about. */
  about: z8.string().max(40).default("")
});

// apps/teaching/src/quiz/core.ts
import { z as z10 } from "zod";

// apps/teaching/src/quiz/writing.ts
import { z as z9 } from "zod";
var WRITING_CHECKS = ["off", "flag", "block"];
var WritingCheckSchema = z9.enum(WRITING_CHECKS);

// apps/teaching/src/quiz/core.ts
var QUIZ_QUESTION_KINDS = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "short_answer",
  "fill_gap",
  "odd_one_out",
  "matching",
  "ordering",
  "categorise",
  "quote_technique",
  "find_it",
  "spot_technique",
  "label_image",
  "extended_response",
  "explain_effect"
];
var QuizQuestionKindSchema = z10.enum(QUIZ_QUESTION_KINDS);
var QUIZ_LIMITS = {
  prompt: 1e3,
  option: 300,
  hint: 500,
  explanation: 1e3,
  passage: 4e3,
  /** A short answer's "Looking for" note, and a teacher's comment on a marked answer. */
  note: 1e3,
  answer: 200,
  model: 3e3,
  response: 6e3,
  marksMax: 20
};
var Id = z10.string().min(1).max(64);
var Text = (max) => z10.string().trim().min(1).max(max);
var OptionalText = (max) => z10.string().trim().max(max).optional();
var QuizImageSchema = z10.object({
  url: z10.string().min(1).max(2e3),
  alt: z10.string().max(300).default("")
});
var QuizChoiceSchema = z10.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z10.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z10.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z10.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z10.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z10.array(Id).min(1).max(10)
});
var QuizPinSchema = z10.object({
  id: Id,
  x: z10.number().min(0).max(1),
  y: z10.number().min(0).max(1),
  label: Text(120)
});
var NextStepEntrySchema = z10.object({
  lines: z10.array(z10.string().max(160)).length(5),
  /** Lines the teacher changed by hand; Regenerate keeps these. */
  edited: z10.array(z10.boolean()).length(5),
  /** Hash of the question, skills and ladder it was built from (bankSource), for the stale note. */
  source: z10.string().max(32)
});
var NextStepBankSchema = z10.record(z10.string().min(1).max(64), NextStepEntrySchema);
var SkillRefPattern = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z10.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z10.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z10.array(z10.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z10.array(z10.string().regex(SkillRefPattern, "Pick a skill from the list.")).max(8).optional(),
  /** Knowledge pieces this question checks (deep understandings), for the unit's tracking. */
  pieces: z10.array(z10.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).optional()
};
var QuizQuestionSchema = z10.discriminatedUnion("kind", [
  z10.object({ ...base, kind: z10.literal("multiple_choice"), options: z10.array(QuizChoiceSchema).min(2).max(6), correct: z10.array(Id).length(1) }),
  z10.object({ ...base, kind: z10.literal("multi_select"), options: z10.array(QuizChoiceSchema).min(2).max(8), correct: z10.array(Id).min(1).max(8) }),
  z10.object({ ...base, kind: z10.literal("true_false"), answer: z10.boolean() }),
  z10.object({
    ...base,
    kind: z10.literal("short_answer"),
    accepted: z10.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z10.boolean().optional(),
    /** What a right answer says, for the AI marker. Optional. */
    looking_for: OptionalText(QUIZ_LIMITS.note),
    ai_mark: z10.boolean().optional()
  }),
  z10.object({ ...base, kind: z10.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z10.boolean().optional(), ai_mark: z10.boolean().optional() }),
  z10.object({ ...base, kind: z10.literal("odd_one_out"), options: z10.array(QuizChoiceSchema).min(3).max(6), correct: z10.array(Id).length(1) }),
  z10.object({ ...base, kind: z10.literal("matching"), pairs: z10.array(QuizPairSchema).min(2).max(8) }),
  z10.object({ ...base, kind: z10.literal("ordering"), items: z10.array(QuizChoiceSchema).min(3).max(8) }),
  z10.object({
    ...base,
    kind: z10.literal("categorise"),
    groups: z10.array(QuizGroupSchema).min(2).max(4),
    items: z10.array(QuizSortItemSchema).min(2).max(16)
  }),
  z10.object({
    ...base,
    kind: z10.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z10.array(QuizChoiceSchema.extend({ technique_id: z10.string().max(64).optional() })).min(2).max(6),
    correct: z10.array(Id).length(1)
  }),
  z10.object({
    ...base,
    kind: z10.literal("find_it"),
    segments: z10.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z10.array(Id).min(1).max(40)
  }),
  z10.object({
    ...base,
    kind: z10.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z10.array(
      QuizChoiceSchema.extend({
        technique_id: z10.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z10.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z10.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z10.number().int().min(1).max(12).optional()
  }),
  z10.object({ ...base, kind: z10.literal("label_image"), image: QuizImageSchema, pins: z10.array(QuizPinSchema).min(2).max(8) }),
  z10.object({
    ...base,
    kind: z10.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z10.boolean().optional()
  }),
  z10.object({
    ...base,
    kind: z10.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z10.boolean().optional()
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z10.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z10.custom(
  (value) => !!value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && QUIZ_QUESTION_KINDS.includes(value.kind),
  { message: "A quiz question needs an id and a known kind." }
);
function questionProblems(q) {
  const out = [];
  const needsPrompt = q.kind !== "fill_gap";
  if (needsPrompt && !q.prompt.trim()) out.push("Write the question.");
  const unique = (ids, what) => {
    if (new Set(ids).size !== ids.length) out.push(`Two ${what} share an id.`);
  };
  switch (q.kind) {
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique": {
      unique(q.options.map((o) => o.id), "options");
      const ids = new Set(q.options.map((o) => o.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tick the right answer.");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two options say the same thing.");
      break;
    }
    case "find_it": {
      unique(q.segments.map((s) => s.id), "lines");
      const ids = new Set(q.segments.map((s) => s.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tap the line or lines that answer the question.");
      if (q.correct.length >= q.segments.length) out.push("Leave at least one line that isn\u2019t an answer.");
      break;
    }
    case "spot_technique": {
      unique(q.options.map((o) => o.id), "techniques");
      unique(q.targets.map((t) => t.id), "answers");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two techniques say the same thing.");
      const ids = new Set(q.options.map((o) => o.id));
      for (const target of q.targets) {
        if (!locateQuote(q.passage, target.quote)) out.push(`\u201C${target.quote}\u201D isn\u2019t in the passage. Copy the words exactly.`);
        if (!target.correct.length || target.correct.some((id) => !ids.has(id))) out.push("Name the technique for every answer.");
      }
      if ((q.find ?? q.targets.length) > q.targets.length) out.push("Students can\u2019t be asked to find more than there are answers.");
      if ((q.find ?? q.targets.length) > 1) {
        for (const option of q.options) {
          const needed = q.targets.filter((t) => t.correct.length === 1 && t.correct[0] === option.id).length;
          if (needed > (option.uses ?? 1)) out.push(`${option.text.trim() || "A technique"} is the answer ${needed} times. Set it to \xD7${needed}.`);
        }
      }
      break;
    }
    case "fill_gap":
      if (!parseGapPassage(q.passage).some((part) => part.type === "gap")) out.push("Blank out at least one word.");
      break;
    case "matching":
      unique(q.pairs.map((p) => p.id), "pairs");
      if (new Set(q.pairs.map((p) => norm(p.right))).size !== q.pairs.length) out.push("Two pairs have the same right-hand side.");
      break;
    case "ordering":
      unique(q.items.map((i) => i.id), "items");
      break;
    case "categorise": {
      unique(q.groups.map((g) => g.id), "groups");
      unique(q.items.map((i) => i.id), "items");
      const groups = new Set(q.groups.map((g) => g.id));
      if (q.items.some((i) => !groups.has(i.group))) out.push("Put every item in a group.");
      break;
    }
    case "label_image":
      unique(q.pins.map((p) => p.id), "pins");
      if (new Set(q.pins.map((p) => norm(p.label))).size !== q.pins.length) out.push("Two pins have the same label.");
      break;
    default:
      break;
  }
  return out;
}
function parseGapPassage(passage) {
  const parts = [];
  const re = /\[\[([^\]]*)\]\]/g;
  let last = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    if (m.index > last) parts.push({ type: "text", text: passage.slice(last, m.index) });
    const answers = (m[1] ?? "").split("|").map((a) => a.trim()).filter(Boolean);
    if (answers.length) parts.push({ type: "gap", answers });
    else parts.push({ type: "text", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < passage.length) parts.push({ type: "text", text: passage.slice(last) });
  return parts;
}
function passageWords(passage) {
  const words = [];
  const re = /\S+/g;
  let line = 0;
  let seen = 0;
  for (let m = re.exec(passage); m; m = re.exec(passage)) {
    line += (passage.slice(seen, m.index).match(/\n/g) ?? []).length;
    seen = m.index;
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length, line });
  }
  return words;
}
function wordKey(word) {
  return norm(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
function locateQuote(passage, quote) {
  const words = passageWords(passage);
  const keyed = words.map((w, i) => ({ i, key: wordKey(w.text) })).filter((w) => w.key);
  const wanted = passageWords(quote).map((w) => wordKey(w.text)).filter(Boolean);
  if (!wanted.length) return null;
  for (let s = 0; s + wanted.length <= keyed.length; s++) {
    if (wanted.every((key, j) => keyed[s + j].key === key)) return { from: keyed[s].i, to: keyed[s + wanted.length - 1].i };
  }
  return null;
}
var FILLER = new Set(
  "a an the and or but of to in on at by for with from as is are was were be been it its this that these those i you he she we they his her their our my your so then than".split(" ")
);
var QuizFeedbackSchema = z10.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z10.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z10.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z10.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z10.boolean().optional(),
  shuffle_questions: z10.boolean().optional(),
  shuffle_options: z10.boolean().optional(),
  attempts: z10.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z10.number().min(0).max(1).optional(),
  confidence: z10.boolean().optional(),
  /** Written answers: off, flag how they were typed, or also block paste. Blank means flag. */
  writing_check: WritingCheckSchema.optional(),
  closes_at: z10.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z10.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z10.array(z10.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z10.string().max(64).optional(),
  follow_up_flag: z10.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z10.string().max(64).optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z11 } from "zod";
var TkStepSchema = z11.object({
  id: z11.string().min(1),
  title: z11.string(),
  prompt: z11.string()
});
var TkRevealSchema = z11.object({
  id: z11.string().min(1),
  label: z11.string(),
  body: z11.string()
});
var TkTeacherNoteSchema = z11.object({
  what: z11.string().default(""),
  run: z11.array(z11.string()).default([]),
  say: z11.array(z11.string()).default([]),
  watch: z11.array(z11.string()).default([]),
  extra_label: z11.string().default(""),
  extra: z11.array(z11.string()).default([]),
  time: z11.string().default(""),
  source: z11.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z11.boolean().default(false)
});
var TkJotsSchema = z11.record(z11.string(), z11.string()).default({});
var TkItemListSchema = z11.array(z11.string().min(1)).default([]);
var ToolkitSkillContentSchema = z11.object({
  item: z11.string().min(1),
  label: z11.string(),
  definition: z11.string(),
  definition_source: z11.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  context: z11.string().default(""),
  steps: z11.array(TkStepSchema).max(8),
  show_test: z11.boolean().default(true),
  checks: z11.array(z11.string()).max(8).default([]),
  reveals: z11.array(TkRevealSchema).max(6).default([]),
  links: z11.object({ tools: TkItemListSchema, values: TkItemListSchema }).prefault({ tools: [], values: [] }),
  show_links: z11.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z11.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z11.preprocess(
  (value) => value === "level2" ? "none" : value,
  z11.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z11.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z11.object({
  kind: z11.string().default(""),
  marker: z11.string().default(""),
  a: z11.string().default(""),
  b: z11.string().default("")
});
var ToolkitToolContentSchema = z11.object({
  item: z11.string().min(1),
  label: z11.string(),
  definition: z11.string(),
  definition_source: z11.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  frame: ToolFrameSchema,
  sentence: z11.string().default(""),
  steps: z11.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.prefault({}),
  worked_note: z11.string().default(""),
  converters: z11.array(z11.object({ id: z11.string().min(1), closed: z11.string(), open: z11.string() })).max(10).default([]),
  statements: z11.array(
    z11.object({
      id: z11.string().min(1),
      text: z11.string(),
      verdict: StressVerdictSchema,
      reason: z11.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z11.array(TkRevealSchema).max(6).default([]),
  links: z11.object({ skills: TkItemListSchema, tools: TkItemListSchema }).prefault({ skills: [], tools: [] }),
  show_links: z11.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z11.object({
  item: z11.string().min(1),
  label: z11.string(),
  definition: z11.string(),
  definition_source: z11.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  claim: z11.string().default(""),
  options: z11.array(z11.object({ id: z11.string().min(1), text: z11.string() })).max(8).default([]),
  probes: z11.array(z11.object({ id: z11.string().min(1), question: z11.string(), asks: z11.string() })).max(8).default([]),
  instruction: z11.string().default(""),
  model: z11.object({ label: z11.string(), body: z11.string() }).prefault({ label: "", body: "" }),
  discussion: z11.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z11.object({
  id: z11.string().min(1),
  tool: z11.string().min(1),
  prompt: z11.string(),
  frame: z11.string(),
  example: z11.string()
});
var ThinkingMoveContentSchema = z11.object({
  skill: z11.string().min(1),
  tools: z11.array(z11.string().min(1)).min(1).max(5),
  value: z11.string().min(1),
  community: z11.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  stimulus: z11.string().default(""),
  steps: z11.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z11.array(z11.string()).max(8).default([]),
  why: z11.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z11.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z11.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z11.object({
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  stimulus: z11.string().default(""),
  procedure: z11.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z11.boolean().default(false),
  questions: z11.array(z11.object({ id: z11.string().min(1), text: z11.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z11.array(z11.object({ id: z11.string().min(1), closed: z11.string(), open: z11.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z11.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z11.object({
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  concepts: z11.array(
    z11.object({
      id: z11.string().min(1),
      label: z11.string(),
      central: z11.boolean(),
      contestable: z11.boolean(),
      common: z11.boolean()
    })
  ).max(8).default([]),
  analogy: z11.object({ stem: z11.string(), example: z11.string() }).prefault({ stem: "", example: "" }),
  game: z11.object({
    kind: ConceptGameKindSchema,
    left: z11.string(),
    middle: z11.string(),
    right: z11.string(),
    cards: z11.array(z11.object({ id: z11.string().min(1), text: z11.string(), prompt: z11.string() })).max(16)
  }).prefault({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z11.array(z11.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z11.object({
  content: z11.string().default(""),
  skills: z11.array(z11.string().min(1)).max(2).default([]),
  tools: z11.array(z11.string().min(1)).max(6).default([]),
  values: z11.array(z11.string().min(1)).max(4).default([]),
  community: z11.array(z11.string().min(1)).max(2).default([]),
  success: z11.array(z11.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z11.object({
  variant: z11.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  concept: z11.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z11.object({
  task: z11.string().default(""),
  steps: z11.array(TkStepSchema).max(6).default([]),
  example: z11.string().default("")
});
var FluidAnalogyContentSchema = z11.object({
  kind: z11.string().min(1),
  label: z11.string(),
  definition: z11.string(),
  /** The text, character or idea students work with. */
  focus: z11.string().default(""),
  /** The level students start at. */
  level: z11.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z11.boolean().default(true),
  tiers: z11.array(AnalogyTierSchema).length(3),
  show_check: z11.boolean().default(true),
  checks: z11.array(z11.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z11.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z11.object({
  key: z11.string().min(1),
  label: z11.string().default(""),
  frame: z11.string().default(""),
  example: z11.string().default("")
});
var AnalogyStageSchema = z11.object({
  task: z11.string().default(""),
  slots: z11.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z11.object({
  label: z11.string(),
  definition: z11.string(),
  /** The text, character or idea students work with. */
  focus: z11.string().default(""),
  /** The level students start at. */
  level: z11.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z11.boolean().default(true),
  levels: z11.array(AnalogyStageSchema).length(3),
  show_check: z11.boolean().default(true),
  checks: z11.array(z11.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z11.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z11.object({
  /** Student instruction shown at the top of the block. */
  guide: z11.string().default(""),
  focus: z11.string().default(""),
  /** Types marked "This lesson". */
  types: z11.array(z11.string().min(1)).max(7).default([]),
  show_contrast: z11.boolean().default(true),
  weak: z11.string().default(""),
  strong: z11.string().default(""),
  why: z11.string().default(""),
  process: z11.array(z11.string()).max(8).default([]),
  show_check: z11.boolean().default(true),
  checks: z11.array(z11.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteWalkthruSchema = z11.object({
  set: z11.number().int().min(1).max(20).default(1),
  // A book technique (w1-…) or a fusion from the board (fu_…), whose steps can run to nine.
  id: z11.string().regex(/^(?:w\d+-[a-z0-9-]{2,80}|fu_[a-z0-9]{6,24})$/),
  jots: z11.record(z11.string().regex(/^[1-9]$/), z11.string().max(2e3)).default({})
});
var TeacherNoteBlockContentSchema = z11.object({
  title: z11.string().default("Teacher note"),
  html: z11.string().default(""),
  walkthru: TeacherNoteWalkthruSchema.optional()
});
var TOOLKIT_NOTE_BLOCK_TYPES = [
  "toolkit_skill",
  "toolkit_tool",
  "toolkit_value",
  "thinking_move",
  "question_quadrant",
  "concept_features",
  "thinking_reflection"
];
var TOOLKIT_BLOCK_TYPES = [
  ...TOOLKIT_NOTE_BLOCK_TYPES,
  "thinking_intentions"
];

// apps/teaching/src/schemas/block.ts
var VisibilitySchema = z12.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z12.enum([
  "rich_text",
  "heading",
  "callout",
  "image",
  "gallery",
  "video",
  "embed",
  "html",
  "html_app",
  "quote",
  "divider",
  "classroom_tools",
  "countdown",
  "definition",
  "code",
  "audio",
  "attachment",
  "accordion",
  "table",
  "peer_feedback",
  "question_drop",
  "done",
  "brainstorm",
  "hinge_question",
  "explainer",
  "comparative_judgement",
  "continuum_line",
  "curriculum_lines",
  "quiz_question",
  "question_set",
  "discern_confirm",
  "flashcards",
  "cloze",
  "self_check",
  "note_cue",
  "with_teacher",
  "faded_example",
  "chart",
  "equation",
  "diagram",
  "mind_map",
  "concept_map",
  "whiteboard",
  "columns",
  "section",
  "spacer",
  "timeline",
  "card_stack",
  "tabs",
  "collection",
  "anthology",
  "outcomes",
  "annotation",
  "toolkit_skill",
  "toolkit_tool",
  "toolkit_value",
  "thinking_move",
  "question_quadrant",
  "concept_features",
  "thinking_intentions",
  "thinking_reflection",
  "fluid_analogy",
  "analogy_types",
  "analogy_close_reading",
  "analogy_pattern",
  "analogy_reverse",
  "analogy_problem",
  "analogy_metaphor",
  "analogy_transfer",
  "analogy_chains",
  "teacher_note"
]);
var ColumnPresetSchema = z12.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z12.enum(["small", "medium", "large"]);
var VideoProviderSchema = z12.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z12.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z12.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z12.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z12.enum([
  "cultural_warning",
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z12.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z12.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z12.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
  layout: z12.record(z12.string(), z12.unknown()).default({}),
  print: z12.record(z12.string(), z12.unknown()).default({}),
  settings: z12.record(z12.string(), z12.unknown()).default({})
};
var RichTextBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("rich_text"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({ html: z12.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var NarrationSchema = z12.object({
  url: z12.string().min(1),
  duration_s: z12.number().min(0).max(900),
  transcript: z12.string().max(8e3).optional()
});
var RevealSchema = z12.enum(["all", "one"]);
var HeadingBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z12.object({
    text: z12.string(),
    narration: NarrationSchema.optional(),
    /** Lecture: what the teacher plans to say, e.g. imported speaker notes. Teacher-only. */
    script: z12.string().max(8e3).optional(),
    reveal: RevealSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("callout"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    style: CalloutStyleSchema,
    title: z12.string().optional(),
    body: z12.string(),
    related_to: z12.object({
      block_id: z12.string().min(1),
      question_id: z12.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    url: z12.string(),
    alt_text: z12.string(),
    caption: z12.string().optional(),
    annotations: z12.array(
      z12.object({
        id: z12.string().min(1),
        body: z12.string().min(1),
        selector: z12.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z12.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z12.object({
  id: z12.string().min(1),
  url: z12.string(),
  alt_text: z12.string(),
  caption: z12.string().optional(),
  /** A lesson in the same unit: the image opens it. Unresolved ids show as a plain image. */
  lesson_id: z12.string().min(1).optional()
});
var GalleryBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    layout: GalleryLayoutSchema,
    items: z12.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z12.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    provider: VideoProviderSchema,
    external_id: z12.string(),
    url: z12.string().optional(),
    start_seconds: z12.number().int().positive().optional(),
    title: z12.string().optional(),
    caption: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("embed"),
  variant: z12.string().default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    url: z12.string(),
    title: z12.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("html"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({ html: z12.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z12.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z12.object({
  enabled: z12.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z12.string().min(1),
  system: z12.string(),
  max_tokens: z12.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("html_app"),
  variant: z12.string().default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    html: z12.string(),
    height_px: z12.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("quote"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    quote: z12.string(),
    attribution: z12.string().optional(),
    source: z12.string().optional(),
    reference: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z12.object({
  label: z12.string().max(60),
  minutes: z12.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z12.enum([
  "timer",
  "stopwatch",
  "names",
  "number",
  "groups",
  "technique",
  "scores",
  "coin",
  "dice"
]);
var DividerBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("divider"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z12.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z12.array(TimerSegmentSchema).max(8).default([])
  }).prefault({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("classroom_tools"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    timer_stack: z12.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).prefault({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("countdown"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z12.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z12.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z12.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z12.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("definition"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    term: z12.string(),
    definition: z12.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("code"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    code: z12.string(),
    language: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("audio"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   * `oracy` layers a type over those modes: speech, debate and presentation run
   * as viva, recite as respond with `recite_text` in place of a required prompt.
   */
  content: z12.object({
    url: z12.string(),
    title: z12.string().optional(),
    mode: z12.enum(["listen", "respond", "viva"]).default("listen"),
    prompt: z12.string().max(4e3).optional(),
    time_limit_s: z12.number().int().min(30).max(300).optional(),
    student_chooses_time: z12.boolean().optional(),
    scaffold: z12.array(z12.object({ label: z12.string().max(80), weight: z12.number().min(0.5).max(3).default(1) })).max(8).optional(),
    code_groups: z12.array(z12.enum(["composition", "viva", "speaking"])).optional(),
    oracy: z12.enum(["speech", "debate", "presentation", "recite"]).optional(),
    side: z12.enum(["proposing", "opposing"]).optional(),
    stems: z12.array(z12.string().max(120)).max(12).optional(),
    recite_text: z12.string().max(8e3).optional(),
    /**
     * Time pressure: one locked run. The question stays hidden until the student
     * starts prepping; then prep time, a big "about to speak" countdown, the
     * speaking time, and a grace period before the take sends itself.
     */
    pressure: z12.object({
      enabled: z12.boolean().default(false),
      prep_s: z12.number().int().min(10).max(600).default(60),
      countdown_s: z12.number().int().min(3).max(30).default(10),
      grace_s: z12.number().int().min(0).max(30).default(10)
    }).optional(),
    /**
     * Follow-ups: after the main answer, questions drawn at random from the
     * teacher's bank. Each gets a short think, then a timed answer, recorded
     * onto the same take so it is marked with it.
     */
    follow_up: z12.object({
      enabled: z12.boolean().default(false),
      questions: z12.array(z12.string().max(300)).max(40).default([]),
      count: z12.number().int().min(1).max(3).default(1),
      think_s: z12.number().int().min(3).max(60).default(10),
      answer_s: z12.number().int().min(10).max(180).default(30)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("attachment"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    url: z12.string(),
    title: z12.string(),
    filename: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z12.object({
  title: z12.string(),
  body: z12.string()
});
var AccordionBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("accordion"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    items: z12.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("table"),
  variant: z12.string().default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    headers: z12.array(z12.string()),
    rows: z12.array(z12.array(z12.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z12.object({
  id: z12.string().min(1),
  prompt: z12.string(),
  kind: QuestionKindSchema,
  options: z12.array(z12.string()).optional(),
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z12.enum(["beginner", "detective", "judge", "inventor"]).optional(),
  /** Reasoning chart format: which logic this question walks. Absent means Student's choice. */
  logic: LogicSchema.optional(),
  /** Short answer only: the answer a student can check their own against. */
  model_answer: z12.string().optional(),
  /** How the model answer opens: straight away, or after the student rates their confidence 1 to 5. Absent means straight away. */
  model_check: z12.enum(["reveal", "confidence"]).optional(),
  /** Success criteria the student ticks off against their answer. */
  checklist: z12.array(z12.object({ id: z12.string().min(1), label: z12.string() })).max(12).optional(),
  /** Skills-continuum sub-strands (`strand.sub`) this box practises; they pick the student's next step. */
  skills: z12.array(z12.string().regex(SkillRefPattern)).max(4).optional(),
  /** The box's next steps, one entry per linked feedback code. */
  next_steps: NextStepBankSchema.optional()
});
var PeerFeedbackBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("peer_feedback"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    prompt: z12.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z12.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z12.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z12.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ContinuumStatementSchema = z12.object({
  id: z12.string().min(1),
  text: z12.string().max(300).default(""),
  snap: z12.boolean().default(false),
  /** Predict mode: where the statement really sits on the line (0 to 1). Teacher only: publish strips it. */
  answer: z12.number().min(0).max(1).optional()
});
var ContinuumLineBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("continuum_line"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    stimulus: z12.object({
      kind: z12.enum(["text", "image", "video"]).default("text"),
      text: z12.string().max(2e3).default(""),
      url: z12.string().max(2e3).default(""),
      alt_text: z12.string().max(500).default("")
    }).prefault({ kind: "text", text: "", url: "", alt_text: "" }),
    scale: z12.object({
      left: z12.string().max(40).default("Implied"),
      right: z12.string().max(40).default("Not implied"),
      stops: z12.array(z12.string().max(40)).max(3).default([])
    }).prefault({ left: "Implied", right: "Not implied", stops: [] }),
    statements: z12.array(ContinuumStatementSchema).max(10).default([]),
    pace: z12.enum(["teacher", "student", "self"]).default("teacher"),
    replace: z12.boolean().default(true),
    /** Opinion: no right answer, the reason is the point. Predict: each statement has an answer the teacher shows after the reveal. Absent means opinion. */
    mode: z12.enum(["opinion", "predict"]).optional(),
    /** A return line: the id of an earlier continuum line in the lesson. It runs that line's stimulus, scale and statements again, and shows each student where they first put their symbol. */
    returns_to: z12.string().min(1).max(64).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("brainstorm"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    question: z12.string().max(500).default(""),
    safety: z12.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z12.union([z12.literal(0), z12.literal(1), z12.literal(3), z12.literal(5)]).default(3),
    max_length: z12.number().int().min(20).max(280).default(140),
    layout: z12.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HingeOptionSchema = z12.object({
  id: z12.string().min(1).max(40),
  text: z12.string().max(300).default(""),
  misconception: z12.string().max(300).default(""),
  /** Independent mode: how near this answer is. Absent: the right answer is right, the rest are mix-ups. */
  tier: z12.enum(["right", "close", "mixup"]).optional()
});
var HingeBackupSchema = z12.object({
  prompt: z12.string().max(500).default(""),
  options: z12.array(HingeOptionSchema).max(5).default([]),
  correct_id: z12.string().max(40).default(""),
  source: z12.enum(["teacher", "ann"]).default("teacher")
});
var HingeQuestionBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("hinge_question"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    prompt: z12.string().max(500).default(""),
    options: z12.array(HingeOptionSchema).max(5).default([]),
    correct_id: z12.string().max(40).default(""),
    seconds: z12.union([z12.literal(0), z12.literal(30), z12.literal(60), z12.literal(90), z12.literal(120)]).default(60),
    move_on: z12.number().int().min(1).max(100).default(80),
    reteach: z12.number().int().min(0).max(99).default(50),
    /** A parallel question for the re-check after re-teaching. Teacher-written, or drafted by Ann in focus view. */
    backup: HingeBackupSchema.optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z12.boolean().optional(),
    /**
     * Live: the teacher opens and closes a round. Independent: each student
     * answers alone with a reason, gets their own feedback and one retry on
     * the back-up question. Absent means live.
     */
    pace: z12.enum(["live", "independent"]).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z12.enum([
  "wave",
  "wave_deep",
  "green",
  "green_deep",
  "amber",
  "amber_deep",
  "lilac",
  "lilac_deep",
  "navy",
  "navy_deep"
]);
var CurriculumLinesLevelSchema = z12.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z12.object({
  id: z12.string().min(1).max(64),
  name: z12.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z12.object({
  id: z12.string().min(1).max(64),
  strand_id: z12.string().min(1).max(64),
  week: z12.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z12.string().max(120).default(""),
  lesson_id: z12.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z12.object({
  id: z12.string().min(1).max(64),
  week: z12.number().int().min(1).max(20),
  label: z12.string().max(80).default(""),
  lesson_id: z12.string().min(1).max(64).optional(),
  strand_ids: z12.array(z12.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z12.object({
  label: z12.string().max(80).default("Assessment task"),
  detail: z12.string().max(160).optional(),
  when: z12.string().max(24).optional(),
  lesson_id: z12.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z12.object({
  title: z12.string().max(120).optional(),
  weeks: z12.number().int().min(1).max(20).default(8),
  strands: z12.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z12.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z12.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.prefault({ label: "Assessment task" })
});
var NetworkLineModeSchema = z12.enum(["train", "metro", "light_rail"]);
var LineAlignmentSchema = z12.discriminatedUnion("kind", [
  z12.object({ kind: z12.literal("points"), group: z12.enum(["U", "R"]) }),
  z12.object({ kind: z12.literal("concept"), key: z12.string().regex(/^[A-Z]{2,5}$/) }),
  z12.object({ kind: z12.literal("strand"), strand: z12.enum(SKILL_STRANDS) })
]);
var DotPointRefSchema = z12.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/);
var NetworkLineSchema = z12.object({
  id: z12.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z12.string().max(60).default(""),
  short: z12.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave"),
  alignment: LineAlignmentSchema.optional()
});
var AfterLessonIdsSchema = z12.array(z12.string().min(1).max(64)).max(6);
var LessonRouteRoleSchema = z12.enum(["core", "support", "extension", "optional"]);
var LessonSkipRuleSchema = z12.string().trim().max(80);
var LineStopSchema = z12.object({
  line_id: z12.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional(),
  /** Set from the lesson's dot points; it follows them until the teacher takes it off. */
  auto: z12.literal(true).optional()
});
var LineOffSchema = z12.array(z12.string().min(1).max(64)).max(24);
var NetworkNudgesSchema = z12.record(
  z12.string().min(1).max(160),
  z12.object({ dx: z12.number().min(-2e3).max(2e3), dy: z12.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z12.object({
  id: z12.string().min(1).max(64),
  line_id: z12.string().min(1).max(64),
  after_lesson_id: z12.string().min(1).max(64).optional(),
  kind: z12.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z12.string().min(1).max(64).optional(),
  block_id: z12.string().min(1).max(120).optional(),
  label: z12.string().max(120).default(""),
  /** Who may take the straight track past a support stop, e.g. "90%+ on the techniques quiz". */
  skip_rule: z12.string().max(80).optional()
});
var CurriculumGateSchema = z12.object({
  id: z12.string().min(1).max(64),
  after_lesson_id: z12.string().min(1).max(64).optional(),
  label: z12.string().max(80).default(""),
  lesson_id: z12.string().min(1).max(64).optional(),
  line_ids: z12.array(z12.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z12.object({
  version: z12.literal(2),
  title: z12.string().max(120).optional(),
  rail_stops: z12.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z12.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z12.array(z12.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z12.array(z12.string().min(1).max(64)).max(200).optional(),
  /** The syllabus focus area this unit covers; unset is worked out from the unit's title. */
  focus_area: z12.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  /** The metro lines (textual concepts) this unit shows; unset shows every one. The year network always shows them all. */
  concept_lines: z12.array(z12.string().min(1).max(64)).max(4).optional(),
  /** The light rail lines (skills strands) this unit shows; unset shows every one. The year network always shows them all. */
  skill_lines: z12.array(z12.string().min(1).max(64)).max(4).optional(),
  terminus: CurriculumLinesTerminusSchema.prefault({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("curriculum_lines"),
  variant: z12.string().default("large"),
  visibility: VisibilitySchema,
  content: z12.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
function isCurriculumLinesV2(content) {
  return content.version === 2;
}
var QuestionDropBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("question_drop"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    target_quiz_id: z12.string().max(64).default(""),
    prompt: z12.string().max(500).default(""),
    kinds: z12.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z12.number().int().min(1).max(20).default(1),
    marks_max: z12.number().int().min(1).max(20).default(3),
    per_student: z12.number().int().min(1).max(5).default(1),
    accepting: z12.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DoneBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("done"),
  variant: z12.string().default("small"),
  visibility: VisibilitySchema,
  content: z12.object({
    label: z12.string().max(120).default("I\u2019ve finished this")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("discern_confirm"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    target_block_id: z12.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("quiz_question"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z12.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("question_set"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    questions: z12.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z12.enum(["standard", "human_experience_table", "anchor_bridge", "question_levels", "because_but_so", "reasoning_chart"]).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z12.object({
      rows: z12.number().int().min(3).max(5).default(3),
      example: z12.boolean().default(true)
    }).optional(),
    /** Reasoning chart settings, kept when switching format away and back. */
    reasoning: z12.object({
      level: LensLevelSchema.default("core"),
      student_level: z12.boolean().default(true)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z12.object({
  block_id: z12.string().min(1),
  annotation_id: z12.string().min(1),
  lesson_id: z12.string().optional(),
  kind: z12.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z12.string().min(1)
});
var FlashcardItemSchema = z12.object({
  id: z12.string().min(1),
  front: z12.string(),
  back: z12.string(),
  image_url: z12.string().optional(),
  image_alt: z12.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("flashcards"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    cards: z12.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z12.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("cloze"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    text: z12.string(),
    case_sensitive: z12.boolean().optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z12.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z12.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z12.object({
  id: z12.string().min(1),
  label: z12.string()
});
var SelfCheckBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("self_check"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z12.string(),
    answer: z12.string().optional(),
    items: z12.array(SelfCheckItemSchema).max(12).optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z12.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var NOTE_CUE_KINDS = ["copy", "own_words", "draw", "question"];
var NoteCueKindSchema = z12.enum(NOTE_CUE_KINDS);
var NoteCueBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("note_cue"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    kind: NoteCueKindSchema,
    prompt: z12.string().max(500)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WithTeacherBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("with_teacher"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    talking_points: z12.array(z12.string().max(300)).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FadedExampleBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("faded_example"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: FadedContentSchema,
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z12.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z12.object({
  x: z12.union([z12.string(), z12.number()]),
  y: z12.number()
});
var ChartSeriesColorSchema = z12.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z12.object({
  id: z12.string().min(1),
  name: z12.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z12.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("chart"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    chart_type: ChartTypeSchema,
    title: z12.string().optional(),
    x_label: z12.string().optional(),
    y_label: z12.string().optional(),
    series: z12.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("equation"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    latex: z12.string(),
    caption: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z12.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("diagram"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    source: DiagramSourceSchema,
    image_url: z12.string().optional(),
    image_alt: z12.string().optional(),
    svg_markup: z12.string().optional(),
    caption: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z12.object({
  id: z12.string().min(1),
  label: z12.string(),
  parent_id: z12.string().nullable().optional(),
  color: z12.string().optional(),
  x: z12.number().optional(),
  y: z12.number().optional()
});
var GraphBuildModeSchema = z12.enum(["outline", "canvas"]);
var GraphEdgeSchema = z12.object({
  id: z12.string().min(1),
  from: z12.string().min(1),
  to: z12.string().min(1),
  label: z12.string().optional()
});
var MindMapBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("mind_map"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    nodes: z12.array(GraphNodeSchema).min(1).max(24),
    edges: z12.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("concept_map"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    nodes: z12.array(GraphNodeSchema).min(1).max(24),
    edges: z12.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardStarterIdSchema = z12.enum(["sort_groups", "venn", "same_different"]);
var WhiteboardBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("whiteboard"),
  variant: z12.string().default("large"),
  visibility: VisibilitySchema,
  content: z12.object({
    document_id: z12.string().min(1),
    seed_document_id: z12.string().min(1).optional(),
    /** Built-in layout drawn into the board the first time it opens with no document (packages/whiteboard/starters.mjs). */
    starter: WhiteboardStarterIdSchema.optional(),
    title: z12.string().optional(),
    height_px: z12.number().int().min(360).max(1400).default(640),
    published_snapshot: z12.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z12.object({
  id: z12.string().min(1),
  when: z12.string(),
  label: z12.string(),
  description: z12.string(),
  image_url: z12.string().optional(),
  image_alt: z12.string().optional(),
  link_url: z12.string().optional(),
  link_label: z12.string().optional()
});
var TimelineLayoutSchema = z12.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("timeline"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    layout: TimelineLayoutSchema.optional(),
    events: z12.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z12.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z12.object({
  id: z12.string().min(1),
  number: z12.string().optional(),
  eyebrow: z12.string(),
  title: z12.string(),
  description: z12.string(),
  image_url: z12.string().optional(),
  image_alt: z12.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("card_stack"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    cards: z12.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z12.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("collection"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    source: CollectionSourceSchema,
    title: z12.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z12.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("anthology"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  // Shows as What, How, Why. The type keeps its old name so blocks already placed carry over.
  block_type: z12.literal("outcomes"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    what: z12.string().default(""),
    how: z12.array(z12.object({ id: z12.string().min(1), text: z12.string() })).default([])
  }).default({ what: "", how: [] }),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z12.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z12.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z12.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z12.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z12.enum(["left", "center", "right"]);
var AnnotationLineSchema = z12.object({
  id: z12.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z12.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z12.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z12.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z12.object({
  id: z12.string().min(1),
  lines: z12.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z12.object({
  kind: z12.enum(["verse", "prose"]),
  stanzas: z12.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z12.object({
  id: z12.string().min(1),
  name: z12.string().min(1),
  subgroup: z12.string().optional()
});
var AnnotationLayerSchema = z12.object({
  id: z12.string().min(1),
  name: z12.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z12.string().optional(),
  sublayers: z12.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z12.object({
  exact: z12.string().min(1),
  prefix: z12.string().optional(),
  suffix: z12.string().optional()
});
var AnnotationAnchorSchema = z12.object({
  /** Required on every stop when the annotation is a thread. */
  id: z12.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z12.string().min(1),
  line: z12.string().optional(),
  start: z12.number().int().min(0).optional(),
  end: z12.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z12.string().optional()
});
var AnnotationTechniqueRefSchema = z12.object({
  id: z12.string().min(1),
  table_version: z12.string().min(1)
});
var AnnotationCodeRefSchema = z12.object({
  id: z12.string().min(1).max(40),
  code: z12.string().regex(/^[A-Z]{1,3}$/),
  label: z12.string().max(60),
  descriptor: z12.string().max(600).default(""),
  colour: z12.enum(["blue", "sage", "peach", "gold", "lilac"]).default("blue"),
  positive: z12.boolean().default(false)
});
var AnnotationAttachmentSchema = z12.discriminatedUnion("kind", [
  z12.object({
    kind: z12.literal("link"),
    url: z12.string(),
    label: z12.string().optional()
  }),
  z12.object({
    kind: z12.literal("video"),
    url: z12.string(),
    start_seconds: z12.number().int().min(0).optional()
  }),
  z12.object({
    kind: z12.literal("audio"),
    url: z12.string(),
    title: z12.string().optional()
  }),
  z12.object({
    kind: z12.literal("image"),
    url: z12.string(),
    alt_text: z12.string()
  }),
  z12.object({
    kind: z12.literal("block"),
    block_id: z12.string().min(1)
  })
]);
var AnthologyTagSchema = z12.object({
  include: z12.boolean(),
  themes: z12.array(z12.string().trim().max(40)).max(8).default([]),
  concepts: z12.array(z12.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z12.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z12.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z12.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z12.enum(["text", "custom"]).default("text"),
  anchor_order: z12.array(z12.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z12.object({
  w: z12.string(),
  start: z12.number(),
  end: z12.number()
});
var AnnotationVoiceClipSchema = z12.object({
  id: z12.string().min(1),
  start_s: z12.number(),
  end_s: z12.number(),
  word_range: z12.tuple([z12.number().int().min(0), z12.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z12.enum(["tap", "quote", "ai", "manual"]),
  confidence: z12.number().min(0).max(1),
  approved: z12.boolean(),
  transcript_text: z12.string()
});
var AnnotationVoiceTrackSchema = z12.object({
  id: z12.string().min(1),
  layer_id: z12.string().min(1),
  kind: z12.enum(["reading", "think_aloud", "feedback"]),
  title: z12.string().min(1),
  audio: z12.object({
    media_id: z12.string().optional(),
    url: z12.string().min(1),
    duration_s: z12.number().min(0),
    mime: z12.string().min(1)
  }),
  transcript: z12.object({
    words: z12.array(AnnotationVoiceWordSchema),
    timing: z12.enum(["word", "segment", "estimated"])
  }),
  taps: z12.array(
    z12.object({
      t: z12.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z12.array(AnnotationVoiceClipSchema).default([]),
  status: z12.enum(["draft", "published"]),
  extras: z12.array(
    z12.object({
      id: z12.string().min(1),
      kind: z12.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z12.string(),
      approved: z12.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z12.object({
  id: z12.string().min(1),
  layer_id: z12.string().min(1),
  sublayer_id: z12.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z12.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  code: AnnotationCodeRefSchema.optional(),
  body: z12.object({
    html: z12.string(),
    attachments: z12.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "Thread primary anchor needs an id",
      path: ["anchor", "id"]
    });
  }
  const ids = [primaryId, ...extras.map((a) => a.id)].filter(
    (id) => typeof id === "string" && id.length > 0
  );
  const expectedCount = extras.length + (primaryId ? 1 : 0);
  if (ids.length !== expectedCount) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "Thread stop ids must be unique within the annotation",
      path: ["also_anchors"]
    });
  }
  if (ann.thread?.order !== "custom") return;
  const order = ann.thread.anchor_order ?? [];
  const idSet = new Set(ids);
  const isPermutation = order.length === ids.length && new Set(order).size === order.length && order.every((id) => idSet.has(id));
  if (!isPermutation) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z12.object({
  show_markers: z12.boolean().default(true),
  default_layer_id: z12.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z12.union([z12.literal(0), z12.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z12.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationExemplarQuestionSchema = z12.object({
  id: z12.string().min(1).max(40),
  kind: z12.enum(["what", "why", "how"]),
  text: z12.string().trim().max(300)
});
var AnnotationExemplarSchema = z12.object({
  kind: z12.enum(["single", "compare", "counter"]),
  /** What the exemplar shows, e.g. "a topic sentence that argues". */
  focus: z12.string().trim().max(120).optional(),
  labels: z12.array(z12.string().trim().max(40)).max(2).default([]),
  split_at: z12.string().min(1).optional(),
  hide_labels: z12.boolean().default(false),
  questions: z12.array(AnnotationExemplarQuestionSchema).max(8).default([])
});
var AnnotationBlockObjectSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("annotation"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().optional(),
    attribution: z12.string().optional(),
    text: AnnotationTextSchema,
    layers: z12.array(AnnotationLayerSchema).default([]),
    annotations: z12.array(AnnotationItemSchema).default([]),
    voice_tracks: z12.array(AnnotationVoiceTrackSchema).optional(),
    anthology: AnthologyTagSchema.optional(),
    exemplar: AnnotationExemplarSchema.optional(),
    settings: AnnotationBlockSettingsSchema.prefault({ show_markers: true })
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineAnnotationVoiceTracks(block, ctx) {
  const voiceLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === "voice").map((layer) => layer.id)
  );
  const teacherLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === "teacher").map((layer) => layer.id)
  );
  for (const [index, track] of (block.content.voice_tracks ?? []).entries()) {
    if (!voiceLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z12.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z12.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
var EXPLAINER_MAX_SECONDS = 600;
var ExplainerMarkStyleSchema = z12.enum(["highlight", "underline", "box", "bracket", "strike"]);
var explainerEventBase = {
  id: z12.string().min(1).max(60),
  t: z12.number().min(0)
};
var ExplainerMarkEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("mark"),
  style: ExplainerMarkStyleSchema,
  colour: AnnotationColourSchema.optional(),
  anchor: AnnotationAnchorSchema
});
var ExplainerNoteEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("note"),
  anchor: AnnotationAnchorSchema,
  html: z12.string().max(4e3).default(""),
  tray_id: z12.string().max(60).optional()
});
var ExplainerEraseEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("erase"),
  target: z12.string().min(1).max(60)
});
var ExplainerPointerEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("pointer"),
  pane: z12.enum(["text", "board"]),
  samples: z12.array(z12.union([z12.tuple([z12.number(), z12.number()]), z12.tuple([z12.number(), z12.number(), z12.number()])])).max(2e4).default([])
});
var ExplainerPauseEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("pause"),
  prompt: z12.string().max(500).default("")
});
var ExplainerBoardElementSchema = z12.looseObject({
  id: z12.string().min(1).max(80),
  type: z12.string().min(1).max(40),
  version: z12.number().optional(),
  isDeleted: z12.boolean().optional()
});
var ExplainerBoardEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("board"),
  elements: z12.array(ExplainerBoardElementSchema).max(500).default([])
});
var ExplainerStrokeEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("stroke"),
  element: ExplainerBoardElementSchema,
  offsets: z12.array(z12.number().min(0)).max(2e4).default([])
});
var ExplainerSendEventSchema = z12.object({
  ...explainerEventBase,
  kind: z12.literal("send"),
  anchor: AnnotationAnchorSchema,
  element: ExplainerBoardElementSchema
});
var ExplainerEventSchema = z12.discriminatedUnion("kind", [
  ExplainerMarkEventSchema,
  ExplainerNoteEventSchema,
  ExplainerEraseEventSchema,
  ExplainerPointerEventSchema,
  ExplainerPauseEventSchema,
  ExplainerBoardEventSchema,
  ExplainerStrokeEventSchema,
  ExplainerSendEventSchema
]);
var ExplainerClipSchema = z12.object({
  media_id: z12.string().optional(),
  url: z12.string().min(1),
  mime: z12.string().min(1),
  start_s: z12.number().min(0),
  duration_s: z12.number().min(0)
});
var ExplainerTranscriptSchema = z12.object({
  words: z12.array(AnnotationVoiceWordSchema),
  timing: z12.enum(["word", "segment", "estimated"])
});
var ExplainerRecordingSchema = z12.object({
  status: z12.enum(["draft", "published"]).default("draft"),
  clips: z12.array(ExplainerClipSchema).max(200).default([]),
  duration_s: z12.number().min(0).max(EXPLAINER_MAX_SECONDS),
  transcript: ExplainerTranscriptSchema.optional(),
  events: z12.array(ExplainerEventSchema).max(5e3).default([])
});
var ExplainerTrayNoteSchema = z12.object({
  id: z12.string().min(1).max(60),
  html: z12.string().max(4e3).default("")
});
var ExplainerBoardSceneSchema = z12.object({
  format: z12.literal("excalidraw"),
  version: z12.literal(1),
  elements: z12.array(ExplainerBoardElementSchema).max(2e3).default([]),
  appState: z12.object({ viewBackgroundColor: z12.string().max(40).optional() }).default({}),
  files: z12.record(z12.string(), z12.unknown()).default({})
});
var ExplainerLayoutSchema = z12.enum(["text", "board", "both"]);
var ExplainerBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("explainer"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().max(200).optional(),
    layout: ExplainerLayoutSchema.default("text"),
    text: AnnotationTextSchema.optional(),
    tray: z12.array(ExplainerTrayNoteSchema).max(60).default([]),
    /** The board's starting picture (an Excalidraw scene), drawn before recording. */
    board_start: ExplainerBoardSceneSchema.optional(),
    recording: ExplainerRecordingSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CJ_DEFAULT_CRITERION = "Which answer is stronger overall?";
var CJ_DEFAULT_CHIPS = ["Precise quote", "Clear argument", "Analyses effect"];
var CjSourceSchema = z12.object({
  /** '' = this lesson. */
  lesson_id: z12.string().max(80).default(""),
  block_id: z12.string().max(80).default(""),
  question_id: z12.string().max(80).default("")
});
var CjCalibrationSchema = z12.object({
  id: z12.string().min(1).max(60),
  left: z12.string().max(4e3).default(""),
  right: z12.string().max(4e3).default(""),
  better: z12.enum(["left", "right"]).default("left"),
  reason: z12.string().max(300).default("")
});
var CjAnchorSchema = z12.object({
  id: z12.string().min(1).max(60),
  text: z12.string().max(4e3).default(""),
  mark: z12.number().min(0).max(100).nullable().default(null)
});
var ComparativeJudgementBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("comparative_judgement"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string().max(200).optional(),
    source: CjSourceSchema.default({ lesson_id: "", block_id: "", question_id: "" }),
    criterion: z12.string().max(300).default(CJ_DEFAULT_CRITERION),
    chips: z12.array(z12.string().max(40)).max(8).default(CJ_DEFAULT_CHIPS),
    calibration: z12.array(CjCalibrationSchema).max(3).default([]),
    anchors: z12.array(CjAnchorSchema).max(6).default([]),
    per_student: z12.number().int().min(4).max(20).default(8),
    show_third: z12.boolean().default(false),
    teacher_weight: z12.union([z12.literal(1), z12.literal(2), z12.literal(3)]).default(2),
    downweight_misfits: z12.boolean().default(true),
    out_of: z12.number().min(1).max(100).default(20)
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineExplainerRecording(block, ctx) {
  const rec = block.content.recording;
  if (!rec) return;
  let prev = 0;
  for (const [index, ev] of rec.events.entries()) {
    if (ev.t < prev) {
      ctx.addIssue({
        code: z12.ZodIssueCode.custom,
        message: "explainer events must be sorted by t",
        path: ["content", "recording", "events", index, "t"]
      });
    }
    if (ev.t > rec.duration_s + 1e-6) {
      ctx.addIssue({
        code: z12.ZodIssueCode.custom,
        message: "explainer event is after the end of the recording",
        path: ["content", "recording", "events", index, "t"]
      });
    }
    if (ev.kind === "stroke") {
      const points = ev.element.points;
      if (Array.isArray(points) && points.length !== ev.offsets.length) {
        ctx.addIssue({
          code: z12.ZodIssueCode.custom,
          message: "a stroke needs one time offset for each point",
          path: ["content", "recording", "events", index, "offsets"]
        });
      }
    }
    prev = Math.max(prev, ev.t);
  }
}
function toolkitBlockSchema(blockType, content) {
  return z12.object({
    id: z12.string().min(1),
    type: z12.literal("block"),
    block_type: z12.literal(blockType),
    variant: z12.string().default("medium"),
    visibility: VisibilitySchema,
    content,
    ...blockLayout,
    ...blockTimestamps
  });
}
var ToolkitSkillBlockSchema = toolkitBlockSchema("toolkit_skill", ToolkitSkillContentSchema);
var ToolkitToolBlockSchema = toolkitBlockSchema("toolkit_tool", ToolkitToolContentSchema);
var ToolkitValueBlockSchema = toolkitBlockSchema("toolkit_value", ToolkitValueContentSchema);
var ThinkingMoveBlockSchema = toolkitBlockSchema("thinking_move", ThinkingMoveContentSchema);
var QuestionQuadrantBlockSchema = toolkitBlockSchema(
  "question_quadrant",
  QuestionQuadrantContentSchema
);
var ConceptFeaturesBlockSchema = toolkitBlockSchema(
  "concept_features",
  ConceptFeaturesContentSchema
);
var ThinkingIntentionsBlockSchema = toolkitBlockSchema(
  "thinking_intentions",
  ThinkingIntentionsContentSchema
);
var ThinkingReflectionBlockSchema = toolkitBlockSchema(
  "thinking_reflection",
  ThinkingReflectionContentSchema
);
var FluidAnalogyBlockSchema = toolkitBlockSchema("fluid_analogy", FluidAnalogyContentSchema);
var AnalogyTypesBlockSchema = toolkitBlockSchema("analogy_types", AnalogyTypesContentSchema);
var AnalogyCloseReadingBlockSchema = toolkitBlockSchema("analogy_close_reading", AnalogyMoveContentSchema);
var AnalogyPatternBlockSchema = toolkitBlockSchema("analogy_pattern", AnalogyMoveContentSchema);
var AnalogyReverseBlockSchema = toolkitBlockSchema("analogy_reverse", AnalogyMoveContentSchema);
var AnalogyProblemBlockSchema = toolkitBlockSchema("analogy_problem", AnalogyMoveContentSchema);
var AnalogyMetaphorBlockSchema = toolkitBlockSchema("analogy_metaphor", AnalogyMoveContentSchema);
var AnalogyTransferBlockSchema = toolkitBlockSchema("analogy_transfer", AnalogyMoveContentSchema);
var AnalogyChainsBlockSchema = toolkitBlockSchema("analogy_chains", AnalogyMoveContentSchema);
var TeacherNoteBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("teacher_note"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema.transform(() => "teacher_only"),
  content: TeacherNoteBlockContentSchema,
  ...blockLayout,
  ...blockTimestamps
});
var leafBlockSchemas = [
  RichTextBlockSchema,
  HeadingBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  GalleryBlockSchema,
  VideoBlockSchema,
  EmbedBlockSchema,
  HtmlBlockSchema,
  HtmlAppBlockSchema,
  QuoteBlockSchema,
  DividerBlockSchema,
  ClassroomToolsBlockSchema,
  CountdownBlockSchema,
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  PeerFeedbackBlockSchema,
  QuestionDropBlockSchema,
  DoneBlockSchema,
  BrainstormBlockSchema,
  HingeQuestionBlockSchema,
  ExplainerBlockSchema,
  ComparativeJudgementBlockSchema,
  ContinuumLineBlockSchema,
  CurriculumLinesBlockSchema,
  QuizQuestionBlockSchema,
  DiscernConfirmBlockSchema,
  QuestionSetBlockSchema,
  FlashcardsBlockSchema,
  ClozeBlockSchema,
  SelfCheckBlockSchema,
  NoteCueBlockSchema,
  WithTeacherBlockSchema,
  FadedExampleBlockSchema,
  ChartBlockSchema,
  EquationBlockSchema,
  DiagramBlockSchema,
  MindMapBlockSchema,
  ConceptMapBlockSchema,
  WhiteboardBlockSchema,
  OutcomesBlockSchema,
  AnnotationBlockObjectSchema,
  AnthologyBlockObjectSchema,
  ToolkitSkillBlockSchema,
  ToolkitToolBlockSchema,
  ToolkitValueBlockSchema,
  ThinkingMoveBlockSchema,
  QuestionQuadrantBlockSchema,
  ConceptFeaturesBlockSchema,
  ThinkingIntentionsBlockSchema,
  ThinkingReflectionBlockSchema,
  FluidAnalogyBlockSchema,
  AnalogyTypesBlockSchema,
  AnalogyCloseReadingBlockSchema,
  AnalogyPatternBlockSchema,
  AnalogyReverseBlockSchema,
  AnalogyProblemBlockSchema,
  AnalogyMetaphorBlockSchema,
  AnalogyTransferBlockSchema,
  AnalogyChainsBlockSchema,
  TeacherNoteBlockSchema
];
var SpacerBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("spacer"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z12.lazy(
  () => z12.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z12.array(
  z12.object({
    width: z12.number().int().min(1).max(12),
    blocks: z12.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("columns"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z12.lazy(
  () => z12.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("tabs"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    tabs: z12.array(
      z12.object({
        id: z12.string().min(1),
        label: z12.string(),
        blocks: z12.array(TabChildBlockSchema)
      })
    ).min(2).max(8),
    /** Absent means tabs; folds shows each panel as a fold-out. */
    style: z12.enum(["tabs", "folds"]).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionInnerChildBlockSchema = z12.lazy(
  () => z12.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SidePathSectionSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("section"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string(),
    collapsed_in_editor: z12.boolean().optional(),
    blocks: z12.array(SectionInnerChildBlockSchema),
    side_path: z12.literal(true),
    narration: NarrationSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z12.lazy(
  () => z12.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    SidePathSectionSchema
  ])
);
var SectionLinkSchema = z12.object({
  mode: z12.literal("linked"),
  source_composition_id: z12.string().min(1)
});
var GroupSetSchema = z12.object({
  group_id: z12.string().min(1).max(64),
  class_id: z12.string().min(1).max(64),
  name: z12.string().min(1).max(120),
  tags: z12.array(z12.string().min(1).max(120)).min(1).max(8),
  students: z12.array(z12.string().min(1).max(64)).max(60),
  target: z12.number().int().min(1).max(10)
});
var SectionBlockObjectSchema = z12.object({
  id: z12.string().min(1),
  type: z12.literal("block"),
  block_type: z12.literal("section"),
  variant: z12.string().default("medium"),
  visibility: VisibilitySchema,
  content: z12.object({
    title: z12.string(),
    collapsed_in_editor: z12.boolean().optional(),
    blocks: z12.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional(),
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z12.object({ enabled: z12.boolean(), prompt: z12.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z12.boolean().optional(),
    /** Tutorial: this top-level section is the tab for the group with this id. */
    tutorial_group: TutorialGroupIdSchema.optional(),
    /** Tutorial: with tutorial_group, this section is that group's exit check (quiz questions). */
    tutorial_exit: z12.boolean().optional(),
    /** Design Sprint: this top-level section holds the guides for one phase. */
    sprint_phase: SprintPhaseKeySchema.optional(),
    /** Design Sprint: this top-level section holds resources that stay with students on every phase. */
    sprint_guides: z12.boolean().optional(),
    /** Case Study: this top-level section holds the Brief's blocks, shown to students above the first-take question. */
    case_brief: z12.boolean().optional(),
    /** Case Study: this top-level section holds one case part's blocks (by part id), shown in the work panel while that part is open. */
    case_part: z12.string().max(40).optional(),
    /** Case Study: this top-level section holds the Outcome's blocks, shown to students once the outcome is out. */
    case_outcome: z12.boolean().optional(),
    /** Station Rotation: this top-level section holds one station's blocks (by station id). */
    rotation_station: z12.string().max(40).optional(),
    /** Station Rotation: this top-level section holds the finale's own blocks. */
    rotation_finale: z12.boolean().optional(),
    /** Quiz: this top-level section is a group set, practice for one markbook group's students only. */
    group_set: GroupSetSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z12.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z12.lazy(
  () => z12.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    SectionBlockObjectSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    TabsBlockSchema,
    CollectionBlockSchema
  ]).superRefine((block, ctx) => {
    if (block.block_type === "section") {
      refineLinkedSection(block, ctx);
    }
    if (block.block_type === "annotation") {
      refineAnnotationVoiceTracks(block, ctx);
    }
    if (block.block_type === "explainer") {
      refineExplainerRecording(block, ctx);
    }
  })
);
export {
  AccordionBlockSchema,
  AccordionItemSchema,
  AfterLessonIdsSchema,
  AnalogyChainsBlockSchema,
  AnalogyCloseReadingBlockSchema,
  AnalogyMetaphorBlockSchema,
  AnalogyPatternBlockSchema,
  AnalogyProblemBlockSchema,
  AnalogyReverseBlockSchema,
  AnalogyTransferBlockSchema,
  AnalogyTypesBlockSchema,
  AnnotationAnchorSchema,
  AnnotationAttachmentSchema,
  AnnotationBlockObjectSchema,
  AnnotationBlockSchema,
  AnnotationBlockSettingsSchema,
  AnnotationCodeRefSchema,
  AnnotationColourSchema,
  AnnotationExemplarQuestionSchema,
  AnnotationExemplarSchema,
  AnnotationFamilyKeySchema,
  AnnotationGranularitySchema,
  AnnotationItemSchema,
  AnnotationLayerKindSchema,
  AnnotationLayerSchema,
  AnnotationLineAlignSchema,
  AnnotationLineSchema,
  AnnotationQuoteSchema,
  AnnotationStanzaSchema,
  AnnotationSublayerSchema,
  AnnotationTechniqueRefSchema,
  AnnotationTextSchema,
  AnnotationThreadKindSchema,
  AnnotationThreadSchema,
  AnnotationVoiceClipSchema,
  AnnotationVoiceTrackSchema,
  AnnotationVoiceWordSchema,
  AnthologyBlockObjectSchema,
  AnthologyBlockSchema,
  AnthologyTagSchema,
  AnthologyViewSchema,
  AttachmentBlockSchema,
  AudioBlockSchema,
  BlockSchema,
  BlockTypeSchema,
  BrainstormBlockSchema,
  CJ_DEFAULT_CHIPS,
  CJ_DEFAULT_CRITERION,
  CalloutBlockSchema,
  CalloutStyleSchema,
  CardStackBlockSchema,
  CardStackItemSchema,
  CardStackTintSchema,
  ChartBlockSchema,
  ChartPointSchema,
  ChartSeriesColorSchema,
  ChartSeriesSchema,
  ChartTypeSchema,
  CjAnchorSchema,
  CjCalibrationSchema,
  CjSourceSchema,
  ClassroomToolIdSchema,
  ClassroomToolsBlockSchema,
  ClozeBlockSchema,
  CodeBlockSchema,
  CollectionBlockSchema,
  CollectionSourceSchema,
  ColumnChildBlockSchema,
  ColumnPresetSchema,
  ColumnsBlockSchema,
  ComparativeJudgementBlockSchema,
  ConceptFeaturesBlockSchema,
  ConceptMapBlockSchema,
  ContinuumLineBlockSchema,
  ContinuumStatementSchema,
  CountdownBlockSchema,
  CurriculumGateSchema,
  CurriculumLinesBlockSchema,
  CurriculumLinesCheckpointSchema,
  CurriculumLinesColourSchema,
  CurriculumLinesLevelSchema,
  CurriculumLinesStationSchema,
  CurriculumLinesStrandSchema,
  CurriculumLinesTerminusSchema,
  CurriculumLinesV1ContentSchema,
  CurriculumLinesV2ContentSchema,
  CurriculumRailStopSchema,
  DIAGRAM_IMAGE_PUBLISH_URL_ISSUE,
  DefinitionBlockSchema,
  DiagramBlockSchema,
  DiagramSourceSchema,
  DiscernConfirmBlockSchema,
  DividerBlockSchema,
  DoneBlockSchema,
  DotPointRefSchema,
  EXPLAINER_MAX_SECONDS,
  EmbedBlockSchema,
  EmbedProviderSchema,
  EquationBlockSchema,
  ExplainerBlockSchema,
  ExplainerBoardElementSchema,
  ExplainerBoardEventSchema,
  ExplainerBoardSceneSchema,
  ExplainerClipSchema,
  ExplainerEraseEventSchema,
  ExplainerEventSchema,
  ExplainerLayoutSchema,
  ExplainerMarkEventSchema,
  ExplainerMarkStyleSchema,
  ExplainerNoteEventSchema,
  ExplainerPauseEventSchema,
  ExplainerPointerEventSchema,
  ExplainerRecordingSchema,
  ExplainerSendEventSchema,
  ExplainerStrokeEventSchema,
  ExplainerTranscriptSchema,
  ExplainerTrayNoteSchema,
  FadedExampleBlockSchema,
  FlashcardItemSchema,
  FlashcardSourceSchema,
  FlashcardsBlockSchema,
  FluidAnalogyBlockSchema,
  GalleryBlockSchema,
  GalleryItemSchema,
  GalleryLayoutSchema,
  GraphBuildModeSchema,
  GraphEdgeSchema,
  GraphNodeSchema,
  GroupSetSchema,
  HeadingBlockSchema,
  HeadingVariantSchema,
  HingeBackupSchema,
  HingeOptionSchema,
  HingeQuestionBlockSchema,
  HtmlAppAiProviderSchema,
  HtmlAppAiSchema,
  HtmlAppBlockSchema,
  HtmlBlockSchema,
  ImageBlockSchema,
  LessonRouteRoleSchema,
  LessonSkipRuleSchema,
  LineAlignmentSchema,
  LineOffSchema,
  LineStopSchema,
  MediaSizeVariantSchema,
  MindMapBlockSchema,
  NOTE_CUE_KINDS,
  NarrationSchema,
  NetworkLineModeSchema,
  NetworkLineSchema,
  NetworkNudgesSchema,
  NextStepBankSchema,
  NextStepEntrySchema,
  NoteCueBlockSchema,
  NoteCueKindSchema,
  OutcomesBlockSchema,
  PeerFeedbackBlockSchema,
  QuestionDropBlockSchema,
  QuestionItemSchema,
  QuestionKindSchema,
  QuestionQuadrantBlockSchema,
  QuestionSetBlockSchema,
  QuizQuestionBlockSchema,
  QuoteBlockSchema,
  ResponseSpaceSchema,
  RevealSchema,
  RichTextBlockSchema,
  SectionBlockSchema,
  SectionChildBlockSchema,
  SectionLinkSchema,
  SelfCheckBlockSchema,
  SelfCheckItemSchema,
  SelfCheckModeSchema,
  SidePathSectionSchema,
  SpacerBlockSchema,
  SpacerSizeSchema,
  TabChildBlockSchema,
  TableBlockSchema,
  TabsBlockSchema,
  TeacherNoteBlockSchema,
  ThinkingIntentionsBlockSchema,
  ThinkingMoveBlockSchema,
  ThinkingReflectionBlockSchema,
  TimelineBlockSchema,
  TimelineEventSchema,
  TimelineLayoutSchema,
  TimerSegmentSchema,
  ToolkitSkillBlockSchema,
  ToolkitToolBlockSchema,
  ToolkitValueBlockSchema,
  VideoBlockSchema,
  VideoProviderSchema,
  VisibilitySchema,
  WhiteboardBlockSchema,
  WhiteboardStarterIdSchema,
  WithTeacherBlockSchema,
  isCurriculumLinesV2,
  refineAnnotationVoiceTracks,
  refineExplainerRecording
};
