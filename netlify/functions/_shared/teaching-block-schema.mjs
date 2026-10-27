// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z10 } from "zod";

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

// apps/teaching/src/schemas/kaplan.ts
import { z as z3 } from "zod";
var KaplanLensSchema = z3.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z3.tuple([
  z3.string().max(1200),
  z3.string().max(1200),
  z3.string().max(1200)
]);
var KaplanQualifierSchema = z3.object({
  lens: KaplanLensSchema,
  focus: z3.string().trim().max(200).default(""),
  mode: z3.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z3.tuple([
    z3.string().max(1200).nullable(),
    z3.string().max(1200).nullable(),
    z3.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z3.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z3.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/schemas/discern.ts
import { z as z4 } from "zod";
var DiscernModeSchema = z4.enum(["own", "theirs"]);
var DiscernInitialTypeSchema = z4.enum(["scale", "choose", "write"]);
var DiscernScalePresetSchema = z4.enum(["agree", "extent", "effect", "verdict"]);
var DiscernQualifierSchema = z4.object({
  /** own: the student's answer. theirs: a character's or historical figure's choice. */
  mode: DiscernModeSchema.default("own"),
  who: z4.string().trim().max(80).default(""),
  /** What is being judged. Fills every default prompt. */
  focus: z4.string().trim().max(200).default(""),
  /** Optional evidence source, e.g. "the poems" or "Source B". */
  source: z4.string().trim().max(120).default(""),
  initial: z4.object({
    type: DiscernInitialTypeSchema.default("scale"),
    preset: DiscernScalePresetSchema.default("agree"),
    /** Scale points or choices. Empty scale points fall back to the preset. */
    options: z4.array(z4.string().trim().max(60)).max(5).default([])
  }).default({}),
  /** Teacher overrides for the five step prompts; an empty string keeps the default. */
  prompts: z4.array(z4.string().max(1200)).length(5).optional(),
  /** "Their choice" only: students also plot how settled the character is across key moments. */
  character_tail: z4.object({
    enabled: z4.boolean().default(false),
    moments: z4.array(z4.string().trim().max(80)).max(6).default([])
  }).optional()
});

// apps/teaching/src/schemas/lens.ts
import { z as z5 } from "zod";
var LensAttachmentSchema = z5.object({
  id: z5.string().min(1).max(60),
  config: z5.record(z5.unknown())
});
var LensAttachmentsSchema = z5.array(LensAttachmentSchema).max(6).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: z5.ZodIssueCode.custom, message: "Use each lens once per block." });
  }
});
var LensLevelSchema = z5.enum(["support", "core", "extend"]);
var StepTextSchema = z5.string().max(1200);
var WindowsMirrorsConfigSchema = z5.object({
  focus: z5.string().trim().max(200).default(""),
  answer_with: z5.enum(["window", "mirror", "both", "choice"]).default("both"),
  level: LensLevelSchema.default("core"),
  student_level: z5.boolean().default(true),
  mode: z5.enum(["notes", "discussion"]).default("notes"),
  /** Teacher overrides keyed `${level}.${stepId}`; empty keeps the default. */
  prompts: z5.record(StepTextSchema).optional(),
  supports: z5.record(StepTextSchema.nullable()).optional(),
  examples: z5.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SteppedLensConfigSchema = WindowsMirrorsConfigSchema.omit({ answer_with: true });
var LogicSchema = z5.enum(["deductive", "inductive", "abductive", "all_three", "choice"]);
var ReasoningConfigSchema = z5.object({
  focus: z5.string().trim().max(200).default(""),
  logic: LogicSchema.default("choice"),
  level: LensLevelSchema.default("core"),
  student_level: z5.boolean().default(true),
  mode: z5.enum(["notes", "discussion"]).default("notes"),
  prompts: z5.record(StepTextSchema).optional(),
  supports: z5.record(StepTextSchema.nullable()).optional(),
  examples: z5.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});

// apps/teaching/src/tutorial/schema.ts
import { z as z6 } from "zod";
var GAP_TYPES = ["knowledge", "mix_up"];
var TutorialGroupIdSchema = z6.string().regex(/^[a-z0-9_-]{1,40}$/);
var TutorialGroupSchema = z6.object({
  id: TutorialGroupIdSchema,
  /** Teacher-facing: "Re-tells the plot". Students never see it. */
  name: z6.string().min(1).max(80),
  /** Teacher-facing: why this group gets it wrong. */
  why: z6.string().max(300),
  /** Student-facing goal, written as what they will do: "Today: explaining the effect". */
  goal: z6.string().max(140),
  gap_type: z6.enum(GAP_TYPES),
  students: z6.array(z6.string().min(1).max(64)).max(40),
  /** Ann's evidence for placing each student, from their recorded mistakes. */
  evidence: z6.array(z6.object({ student: z6.string().min(1).max(64), quote: z6.string().max(300) })).max(80).default([]),
  /** Teacher-facing: what to build for this group. Shown as a teacher note at the top of its tab. */
  notes: z6.string().max(1200).optional(),
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z6.array(z6.string().min(1).max(64)).max(40).optional()
});
var TutorialSettingsSchema = z6.object({
  class_id: z6.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z6.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z6.string().max(64).optional(),
  groups: z6.array(TutorialGroupSchema).max(8)
});

// apps/teaching/src/sprint/schema.ts
import { z as z7 } from "zod";
var SPRINT_PHASES = ["understand", "sketch", "decide", "prototype", "test"];
var SprintPhaseKeySchema = z7.enum(SPRINT_PHASES);
var LevelSchema = z7.union([z7.literal(1), z7.literal(2), z7.literal(3)]);
var SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 };
var SprintIdSchema = z7.string().regex(/^[a-z0-9_-]{1,40}$/);
var Day = z7.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
var Time = z7.string().regex(/^(\d{2}:\d{2})?$/);
var text = (max) => z7.string().trim().max(max);
var SprintCriterionSchema = z7.object({
  id: SprintIdSchema,
  text: z7.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z7.string().min(1).max(64).optional()
});
var SprintRequirementSchema = z7.object({
  id: SprintIdSchema,
  text: z7.string().trim().min(1).max(160),
  phases: z7.array(SprintPhaseKeySchema).max(5).default(["sketch", "prototype"])
});
var IdeaGuideSchema = z7.object({
  checklist: z7.array(z7.string().trim().min(1).max(160)).min(1).max(8),
  model: z7.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z7.array(text(120)).max(6).default([])
  }),
  pair: z7.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
var SprintPhaseSchema = z7.object({
  key: SprintPhaseKeySchema,
  where: z7.enum(["class", "home"]),
  due_date: Day.default(""),
  due_time: Time.default("15:00"),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z7.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(""),
  instruction: text(600).default(""),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z7.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default("")
});
var SprintGroupSchema = z7.object({
  id: SprintIdSchema,
  name: z7.string().trim().min(1).max(40),
  students: z7.array(z7.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
var UNDERSTAND_ALONE = ["spot", "audience", "dig", "say", "limits"];
var UNDERSTAND_GROUP = ["vote", "merge", "grid", "ask", "expert"];
var UNDERSTAND_STEPS = [...UNDERSTAND_ALONE, ...UNDERSTAND_GROUP];
var allSteps = () => Object.fromEntries(UNDERSTAND_STEPS.map((k) => [k, true]));
var UnderstandSettingsSchema = z7.object({
  layout: z7.enum(["slides", "vertical"]).default("slides"),
  steps: z7.record(z7.string(), z7.boolean()).default(allSteps).transform((v) => ({ ...allSteps(), ...Object.fromEntries(Object.entries(v).filter(([k]) => UNDERSTAND_STEPS.includes(k))) }))
});
var defaultUnderstand = () => ({ layout: "slides", steps: allSteps() });
var phasesInOrder = (phases) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);
var SprintSettingsSchema = z7.object({
  class_id: z7.string().min(1).max(64),
  decider: z7.enum(["top_vote", "teacher"]).default("teacher"),
  support: z7.enum(["guided", "standard", "open"]).default("standard"),
  lock_hours: z7.number().int().min(0).max(24).default(2),
  criteria: z7.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z7.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z7.array(text(200)).max(2).default([]),
  requirements: z7.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z7.array(SprintPhaseSchema).length(5).refine(phasesInOrder, "Phases must be in order: Understand, Sketch, Decide, Prototype, Test."),
  groups: z7.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  /** Sketch's rapid ideas: minutes on the timer, 0 for no timer. */
  sketch_timer: z7.number().int().min(0).max(30).default(8),
  /** Decide's stand-out dots each student places on parts of any idea; 0 turns them off. */
  decide_dots: z7.number().int().min(0).max(5).default(3),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z7.object({ prototype: z7.string().optional(), reflection: z7.string().optional() }).default({})
});
var PublicSprintSchema = z7.object({
  support: z7.enum(["guided", "standard", "open"]),
  lock_hours: z7.number().int().min(0).max(24),
  criteria: z7.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z7.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z7.array(z7.string().max(200)).max(2),
  requirements: z7.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  phases: z7.array(SprintPhaseSchema).length(5),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  sketch_timer: z7.number().int().min(0).max(30).default(8),
  decide_dots: z7.number().int().min(0).max(5).default(3)
});
var where = text(200);
var Wheres = z7.record(z7.string().max(40), where).default({});
var cards = z7.array(text(120)).max(8).default([]);
var UnderstandPayloadSchema = z7.object({
  /** Earlier sprints' "How might we" notes; still read, no longer written. */
  notes: z7.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's statements) this student starred. */
  star: z7.string().max(40).default(""),
  stretch: text(300).default(""),
  /** Words from the brief that stand out. */
  spot: z7.array(text(40)).max(30).default([]),
  audience: z7.object({ who: text(200).default(""), why: text(300).default("") }).default({ who: "", why: "" }),
  /** The surface problem, then each "why is that a problem?". */
  dig: z7.array(text(300)).max(6).default([]),
  /** The problem in their own words. */
  say: text(400).default(""),
  limits: z7.object({ can_known: cards, cant_known: cards, can_unknown: cards, cant_unknown: cards }).default({ can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] })
});
var SketchCardSchema = z7.object({
  id: SprintIdSchema,
  /** The rapid idea it grew from. */
  seed: text(120).optional(),
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z7.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default("")
});
var SketchPayloadSchema = z7.object({
  /** Examples worth borrowing from, and what to take from each. */
  inspiration: z7.array(z7.object({ from: text(120).default(""), borrow: text(200).default("") })).max(3).default([]),
  /** Rapid ideas: one line each, written against the timer. */
  rapid: z7.array(text(120)).max(40).default([]),
  /** When the student started the timer (ISO), or empty. */
  rapid_started_at: z7.string().max(40).default(""),
  /** Developed ideas, one per rapid idea picked (card id "r{index}"). These go to the group. */
  cards: z7.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z7.string().max(40).default(""),
  strongest_why: text(300).default("")
});
var IDEA_PARTS = ["idea", "answers", "evidence"];
var DotSchema = z7.object({ idea: z7.string().max(40), part: z7.enum(IDEA_PARTS), note: text(120).default("") });
var DecidePayloadSchema = z7.object({
  /** Stand-out dots: up to the Kit's number, on parts of any idea. */
  dots: z7.array(DotSchema).max(5).default([]),
  /** Criterion id → idea id. */
  votes: z7.record(z7.string().max(40), z7.string().max(40)).default({}),
  reasons: z7.record(z7.string().max(40), text(300)).default({}),
  opened: z7.array(z7.string().max(40)).max(40).default([]),
  stretch: text(300).default("")
});
var PrototypePayloadSchema = z7.object({
  text: text(4e3).default(""),
  link: z7.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "Links start with https://").default(""),
  files: z7.array(z7.string().max(40)).max(SPRINT_LIMITS.files).default([]),
  requirements: Wheres,
  self: z7.record(z7.string().max(40), LevelSchema).default({}),
  self_why: z7.record(z7.string().max(40), text(300)).default({}),
  value_answer: text(300).default("")
});
var TestPayloadSchema = z7.object({
  reflection: z7.array(text(1e3)).max(2).default([]),
  quote: text(300).default(""),
  change_criterion: z7.string().max(40).default(""),
  value_answer: text(300).default("")
});
var PartSchema = z7.object({
  id: SprintIdSchema,
  text: z7.string().trim().min(1).max(80),
  shows: text(200).default(""),
  criterion: z7.string().max(40).default("")
});
var PartsSchema = z7.array(PartSchema).max(SPRINT_LIMITS.parts).refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, "Each part needs its own id.");
var FeedbackEntrySchema = z7.object({
  levels: z7.record(z7.string().max(40), LevelSchema).default({}),
  worked: text(300).default(""),
  next: text(300).default(""),
  /** The criterion the written lines are about. */
  about: z7.string().max(40).default("")
});

// apps/teaching/src/quiz/core.ts
import { z as z8 } from "zod";
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
var QuizQuestionKindSchema = z8.enum(QUIZ_QUESTION_KINDS);
var QUIZ_LIMITS = {
  prompt: 1e3,
  option: 300,
  hint: 500,
  explanation: 1e3,
  passage: 4e3,
  answer: 200,
  model: 3e3,
  response: 6e3,
  marksMax: 20
};
var Id = z8.string().min(1).max(64);
var Text = (max) => z8.string().trim().min(1).max(max);
var OptionalText = (max) => z8.string().trim().max(max).optional();
var QuizImageSchema = z8.object({
  url: z8.string().min(1).max(2e3),
  alt: z8.string().max(300).default("")
});
var QuizChoiceSchema = z8.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z8.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z8.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z8.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z8.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z8.array(Id).min(1).max(10)
});
var QuizPinSchema = z8.object({
  id: Id,
  x: z8.number().min(0).max(1),
  y: z8.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z8.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z8.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z8.array(z8.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z8.array(z8.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/, "Pick a skill from the list.")).max(8).optional()
};
var QuizQuestionSchema = z8.discriminatedUnion("kind", [
  z8.object({ ...base, kind: z8.literal("multiple_choice"), options: z8.array(QuizChoiceSchema).min(2).max(6), correct: z8.array(Id).length(1) }),
  z8.object({ ...base, kind: z8.literal("multi_select"), options: z8.array(QuizChoiceSchema).min(2).max(8), correct: z8.array(Id).min(1).max(8) }),
  z8.object({ ...base, kind: z8.literal("true_false"), answer: z8.boolean() }),
  z8.object({
    ...base,
    kind: z8.literal("short_answer"),
    accepted: z8.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z8.boolean().optional()
  }),
  z8.object({ ...base, kind: z8.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z8.boolean().optional() }),
  z8.object({ ...base, kind: z8.literal("odd_one_out"), options: z8.array(QuizChoiceSchema).min(3).max(6), correct: z8.array(Id).length(1) }),
  z8.object({ ...base, kind: z8.literal("matching"), pairs: z8.array(QuizPairSchema).min(2).max(8) }),
  z8.object({ ...base, kind: z8.literal("ordering"), items: z8.array(QuizChoiceSchema).min(3).max(8) }),
  z8.object({
    ...base,
    kind: z8.literal("categorise"),
    groups: z8.array(QuizGroupSchema).min(2).max(4),
    items: z8.array(QuizSortItemSchema).min(2).max(16)
  }),
  z8.object({
    ...base,
    kind: z8.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z8.array(QuizChoiceSchema.extend({ technique_id: z8.string().max(64).optional() })).min(2).max(6),
    correct: z8.array(Id).length(1)
  }),
  z8.object({
    ...base,
    kind: z8.literal("find_it"),
    segments: z8.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z8.array(Id).min(1).max(40)
  }),
  z8.object({
    ...base,
    kind: z8.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z8.array(
      QuizChoiceSchema.extend({
        technique_id: z8.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z8.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z8.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z8.number().int().min(1).max(12).optional()
  }),
  z8.object({ ...base, kind: z8.literal("label_image"), image: QuizImageSchema, pins: z8.array(QuizPinSchema).min(2).max(8) }),
  z8.object({
    ...base,
    kind: z8.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z8.object({
    ...base,
    kind: z8.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z8.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z8.custom(
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
var QuizFeedbackSchema = z8.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z8.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z8.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z8.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z8.boolean().optional(),
  shuffle_questions: z8.boolean().optional(),
  shuffle_options: z8.boolean().optional(),
  attempts: z8.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z8.number().min(0).max(1).optional(),
  confidence: z8.boolean().optional(),
  closes_at: z8.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z8.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z8.array(z8.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z8.string().max(64).optional(),
  follow_up_flag: z8.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z8.string().max(64).optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z9 } from "zod";
var TkStepSchema = z9.object({
  id: z9.string().min(1),
  title: z9.string(),
  prompt: z9.string()
});
var TkRevealSchema = z9.object({
  id: z9.string().min(1),
  label: z9.string(),
  body: z9.string()
});
var TkTeacherNoteSchema = z9.object({
  what: z9.string().default(""),
  run: z9.array(z9.string()).default([]),
  say: z9.array(z9.string()).default([]),
  watch: z9.array(z9.string()).default([]),
  extra_label: z9.string().default(""),
  extra: z9.array(z9.string()).default([]),
  time: z9.string().default(""),
  source: z9.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z9.boolean().default(false)
});
var TkJotsSchema = z9.record(z9.string()).default({});
var TkItemListSchema = z9.array(z9.string().min(1)).default([]);
var ToolkitSkillContentSchema = z9.object({
  item: z9.string().min(1),
  label: z9.string(),
  definition: z9.string(),
  definition_source: z9.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  context: z9.string().default(""),
  steps: z9.array(TkStepSchema).max(8),
  show_test: z9.boolean().default(true),
  checks: z9.array(z9.string()).max(8).default([]),
  reveals: z9.array(TkRevealSchema).max(6).default([]),
  links: z9.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z9.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z9.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z9.preprocess(
  (value) => value === "level2" ? "none" : value,
  z9.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z9.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z9.object({
  kind: z9.string().default(""),
  marker: z9.string().default(""),
  a: z9.string().default(""),
  b: z9.string().default("")
});
var ToolkitToolContentSchema = z9.object({
  item: z9.string().min(1),
  label: z9.string(),
  definition: z9.string(),
  definition_source: z9.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  frame: ToolFrameSchema,
  sentence: z9.string().default(""),
  steps: z9.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z9.string().default(""),
  converters: z9.array(z9.object({ id: z9.string().min(1), closed: z9.string(), open: z9.string() })).max(10).default([]),
  statements: z9.array(
    z9.object({
      id: z9.string().min(1),
      text: z9.string(),
      verdict: StressVerdictSchema,
      reason: z9.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z9.array(TkRevealSchema).max(6).default([]),
  links: z9.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z9.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z9.object({
  item: z9.string().min(1),
  label: z9.string(),
  definition: z9.string(),
  definition_source: z9.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  claim: z9.string().default(""),
  options: z9.array(z9.object({ id: z9.string().min(1), text: z9.string() })).max(8).default([]),
  probes: z9.array(z9.object({ id: z9.string().min(1), question: z9.string(), asks: z9.string() })).max(8).default([]),
  instruction: z9.string().default(""),
  model: z9.object({ label: z9.string(), body: z9.string() }).default({ label: "", body: "" }),
  discussion: z9.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z9.object({
  id: z9.string().min(1),
  tool: z9.string().min(1),
  prompt: z9.string(),
  frame: z9.string(),
  example: z9.string()
});
var ThinkingMoveContentSchema = z9.object({
  skill: z9.string().min(1),
  tools: z9.array(z9.string().min(1)).min(1).max(5),
  value: z9.string().min(1),
  community: z9.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  stimulus: z9.string().default(""),
  steps: z9.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z9.array(z9.string()).max(8).default([]),
  why: z9.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z9.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z9.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z9.object({
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  stimulus: z9.string().default(""),
  procedure: z9.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z9.boolean().default(false),
  questions: z9.array(z9.object({ id: z9.string().min(1), text: z9.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z9.array(z9.object({ id: z9.string().min(1), closed: z9.string(), open: z9.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z9.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z9.object({
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  concepts: z9.array(
    z9.object({
      id: z9.string().min(1),
      label: z9.string(),
      central: z9.boolean(),
      contestable: z9.boolean(),
      common: z9.boolean()
    })
  ).max(8).default([]),
  analogy: z9.object({ stem: z9.string(), example: z9.string() }).default({ stem: "", example: "" }),
  game: z9.object({
    kind: ConceptGameKindSchema,
    left: z9.string(),
    middle: z9.string(),
    right: z9.string(),
    cards: z9.array(z9.object({ id: z9.string().min(1), text: z9.string(), prompt: z9.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z9.array(z9.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z9.object({
  content: z9.string().default(""),
  skills: z9.array(z9.string().min(1)).max(2).default([]),
  tools: z9.array(z9.string().min(1)).max(6).default([]),
  values: z9.array(z9.string().min(1)).max(4).default([]),
  community: z9.array(z9.string().min(1)).max(2).default([]),
  success: z9.array(z9.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z9.object({
  variant: z9.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  concept: z9.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z9.object({
  task: z9.string().default(""),
  steps: z9.array(TkStepSchema).max(6).default([]),
  example: z9.string().default("")
});
var FluidAnalogyContentSchema = z9.object({
  kind: z9.string().min(1),
  label: z9.string(),
  definition: z9.string(),
  /** The text, character or idea students work with. */
  focus: z9.string().default(""),
  /** The level students start at. */
  level: z9.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z9.boolean().default(true),
  tiers: z9.array(AnalogyTierSchema).length(3),
  show_check: z9.boolean().default(true),
  checks: z9.array(z9.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z9.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z9.object({
  key: z9.string().min(1),
  label: z9.string().default(""),
  frame: z9.string().default(""),
  example: z9.string().default("")
});
var AnalogyStageSchema = z9.object({
  task: z9.string().default(""),
  slots: z9.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z9.object({
  label: z9.string(),
  definition: z9.string(),
  /** The text, character or idea students work with. */
  focus: z9.string().default(""),
  /** The level students start at. */
  level: z9.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z9.boolean().default(true),
  levels: z9.array(AnalogyStageSchema).length(3),
  show_check: z9.boolean().default(true),
  checks: z9.array(z9.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z9.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z9.object({
  /** Student instruction shown at the top of the block. */
  guide: z9.string().default(""),
  focus: z9.string().default(""),
  /** Types marked "This lesson". */
  types: z9.array(z9.string().min(1)).max(7).default([]),
  show_contrast: z9.boolean().default(true),
  weak: z9.string().default(""),
  strong: z9.string().default(""),
  why: z9.string().default(""),
  process: z9.array(z9.string()).max(8).default([]),
  show_check: z9.boolean().default(true),
  checks: z9.array(z9.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z9.object({
  title: z9.string().default("Teacher note"),
  html: z9.string().default("")
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
var VisibilitySchema = z10.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z10.enum([
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
  "brainstorm",
  "hinge_question",
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
var ColumnPresetSchema = z10.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z10.enum(["small", "medium", "large"]);
var VideoProviderSchema = z10.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z10.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z10.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z10.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z10.enum([
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
var QuestionKindSchema = z10.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z10.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z10.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
  layout: z10.record(z10.unknown()).default({}),
  print: z10.record(z10.unknown()).default({}),
  settings: z10.record(z10.unknown()).default({})
};
var RichTextBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("rich_text"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({ html: z10.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var NarrationSchema = z10.object({
  url: z10.string().min(1),
  duration_s: z10.number().min(0).max(900),
  transcript: z10.string().max(8e3).optional()
});
var RevealSchema = z10.enum(["all", "one"]);
var HeadingBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z10.object({
    text: z10.string(),
    narration: NarrationSchema.optional(),
    /** Lecture: what the teacher plans to say, e.g. imported speaker notes. Teacher-only. */
    script: z10.string().max(8e3).optional(),
    reveal: RevealSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("callout"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    style: CalloutStyleSchema,
    title: z10.string().optional(),
    body: z10.string(),
    related_to: z10.object({
      block_id: z10.string().min(1),
      question_id: z10.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    url: z10.string(),
    alt_text: z10.string(),
    caption: z10.string().optional(),
    annotations: z10.array(
      z10.object({
        id: z10.string().min(1),
        body: z10.string().min(1),
        selector: z10.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z10.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z10.object({
  id: z10.string().min(1),
  url: z10.string(),
  alt_text: z10.string(),
  caption: z10.string().optional()
});
var GalleryBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    layout: GalleryLayoutSchema,
    items: z10.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z10.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    provider: VideoProviderSchema,
    external_id: z10.string(),
    url: z10.string().optional(),
    start_seconds: z10.number().int().positive().optional(),
    title: z10.string().optional(),
    caption: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("embed"),
  variant: z10.string().default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    url: z10.string(),
    title: z10.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("html"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({ html: z10.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z10.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z10.object({
  enabled: z10.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z10.string().min(1),
  system: z10.string(),
  max_tokens: z10.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("html_app"),
  variant: z10.string().default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    html: z10.string(),
    height_px: z10.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("quote"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    quote: z10.string(),
    attribution: z10.string().optional(),
    source: z10.string().optional(),
    reference: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z10.object({
  label: z10.string().max(60),
  minutes: z10.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z10.enum([
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
var DividerBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("divider"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z10.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z10.array(TimerSegmentSchema).max(8).default([])
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("classroom_tools"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    timer_stack: z10.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("countdown"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z10.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z10.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z10.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z10.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("definition"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    term: z10.string(),
    definition: z10.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("code"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    code: z10.string(),
    language: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("audio"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   */
  content: z10.object({
    url: z10.string(),
    title: z10.string().optional(),
    mode: z10.enum(["listen", "respond", "viva"]).default("listen"),
    prompt: z10.string().max(4e3).optional(),
    time_limit_s: z10.number().int().min(30).max(300).optional(),
    student_chooses_time: z10.boolean().optional(),
    scaffold: z10.array(z10.object({ label: z10.string().max(80), weight: z10.number().min(0.5).max(3).default(1) })).max(8).optional(),
    code_groups: z10.array(z10.enum(["composition", "viva", "speaking"])).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("attachment"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    url: z10.string(),
    title: z10.string(),
    filename: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z10.object({
  title: z10.string(),
  body: z10.string()
});
var AccordionBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("accordion"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    items: z10.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("table"),
  variant: z10.string().default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    headers: z10.array(z10.string()),
    rows: z10.array(z10.array(z10.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z10.object({
  id: z10.string().min(1),
  prompt: z10.string(),
  kind: QuestionKindSchema,
  options: z10.array(z10.string()).optional(),
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z10.enum(["beginner", "detective", "judge", "inventor"]).optional(),
  /** Reasoning chart format: which logic this question walks. Absent means Student's choice. */
  logic: LogicSchema.optional()
});
var PeerFeedbackBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("peer_feedback"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    prompt: z10.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z10.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z10.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z10.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ContinuumStatementSchema = z10.object({
  id: z10.string().min(1),
  text: z10.string().max(300).default(""),
  snap: z10.boolean().default(false)
});
var ContinuumLineBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("continuum_line"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    stimulus: z10.object({
      kind: z10.enum(["text", "image", "video"]).default("text"),
      text: z10.string().max(2e3).default(""),
      url: z10.string().max(2e3).default(""),
      alt_text: z10.string().max(500).default("")
    }).default({ kind: "text", text: "", url: "", alt_text: "" }),
    scale: z10.object({
      left: z10.string().max(40).default("Implied"),
      right: z10.string().max(40).default("Not implied"),
      stops: z10.array(z10.string().max(40)).max(3).default([])
    }).default({ left: "Implied", right: "Not implied", stops: [] }),
    statements: z10.array(ContinuumStatementSchema).max(10).default([]),
    pace: z10.enum(["teacher", "student", "self"]).default("teacher"),
    replace: z10.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("brainstorm"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    question: z10.string().max(500).default(""),
    safety: z10.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z10.union([z10.literal(0), z10.literal(1), z10.literal(3), z10.literal(5)]).default(3),
    max_length: z10.number().int().min(20).max(280).default(140),
    layout: z10.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HingeOptionSchema = z10.object({
  id: z10.string().min(1).max(40),
  text: z10.string().max(300).default(""),
  misconception: z10.string().max(300).default("")
});
var HingeBackupSchema = z10.object({
  prompt: z10.string().max(500).default(""),
  options: z10.array(HingeOptionSchema).max(5).default([]),
  correct_id: z10.string().max(40).default(""),
  source: z10.enum(["teacher", "ann"]).default("teacher")
});
var HingeQuestionBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("hinge_question"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    prompt: z10.string().max(500).default(""),
    options: z10.array(HingeOptionSchema).max(5).default([]),
    correct_id: z10.string().max(40).default(""),
    seconds: z10.union([z10.literal(0), z10.literal(30), z10.literal(60), z10.literal(90), z10.literal(120)]).default(60),
    move_on: z10.number().int().min(1).max(100).default(80),
    reteach: z10.number().int().min(0).max(99).default(50),
    /** A parallel question for the re-check after re-teaching. Teacher-written, or drafted by Ann in focus view. */
    backup: HingeBackupSchema.optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z10.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z10.enum([
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
var CurriculumLinesLevelSchema = z10.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z10.object({
  id: z10.string().min(1).max(64),
  name: z10.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z10.object({
  id: z10.string().min(1).max(64),
  strand_id: z10.string().min(1).max(64),
  week: z10.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z10.string().max(120).default(""),
  lesson_id: z10.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z10.object({
  id: z10.string().min(1).max(64),
  week: z10.number().int().min(1).max(20),
  label: z10.string().max(80).default(""),
  lesson_id: z10.string().min(1).max(64).optional(),
  strand_ids: z10.array(z10.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z10.object({
  label: z10.string().max(80).default("Assessment task"),
  detail: z10.string().max(160).optional(),
  when: z10.string().max(24).optional(),
  lesson_id: z10.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z10.object({
  title: z10.string().max(120).optional(),
  weeks: z10.number().int().min(1).max(20).default(8),
  strands: z10.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z10.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z10.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var NetworkLineModeSchema = z10.enum(["train", "metro", "light_rail"]);
var LineAlignmentSchema = z10.discriminatedUnion("kind", [
  z10.object({ kind: z10.literal("points"), group: z10.enum(["U", "R"]) }),
  z10.object({ kind: z10.literal("concept"), key: z10.string().regex(/^[A-Z]{2,5}$/) }),
  z10.object({ kind: z10.literal("strand"), strand: z10.enum(SKILL_STRANDS) })
]);
var DotPointRefSchema = z10.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/);
var NetworkLineSchema = z10.object({
  id: z10.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z10.string().max(60).default(""),
  short: z10.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave"),
  alignment: LineAlignmentSchema.optional()
});
var AfterLessonIdsSchema = z10.array(z10.string().min(1).max(64)).max(6);
var LessonRouteRoleSchema = z10.enum(["core", "support", "extension", "optional"]);
var LessonSkipRuleSchema = z10.string().trim().max(80);
var LineStopSchema = z10.object({
  line_id: z10.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional(),
  /** Set from the lesson's dot points; it follows them until the teacher takes it off. */
  auto: z10.literal(true).optional()
});
var LineOffSchema = z10.array(z10.string().min(1).max(64)).max(24);
var NetworkNudgesSchema = z10.record(
  z10.string().min(1).max(160),
  z10.object({ dx: z10.number().min(-2e3).max(2e3), dy: z10.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z10.object({
  id: z10.string().min(1).max(64),
  line_id: z10.string().min(1).max(64),
  after_lesson_id: z10.string().min(1).max(64).optional(),
  kind: z10.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z10.string().min(1).max(64).optional(),
  block_id: z10.string().min(1).max(120).optional(),
  label: z10.string().max(120).default(""),
  /** Who may take the straight track past a support stop, e.g. "90%+ on the techniques quiz". */
  skip_rule: z10.string().max(80).optional()
});
var CurriculumGateSchema = z10.object({
  id: z10.string().min(1).max(64),
  after_lesson_id: z10.string().min(1).max(64).optional(),
  label: z10.string().max(80).default(""),
  lesson_id: z10.string().min(1).max(64).optional(),
  line_ids: z10.array(z10.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z10.object({
  version: z10.literal(2),
  title: z10.string().max(120).optional(),
  rail_stops: z10.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z10.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z10.array(z10.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z10.array(z10.string().min(1).max(64)).max(200).optional(),
  /** The syllabus focus area this unit covers; unset is worked out from the unit's title. */
  focus_area: z10.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  /** The metro lines (textual concepts) this unit shows; unset shows every one. The year network always shows them all. */
  concept_lines: z10.array(z10.string().min(1).max(64)).max(4).optional(),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("curriculum_lines"),
  variant: z10.string().default("large"),
  visibility: VisibilitySchema,
  content: z10.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
function isCurriculumLinesV2(content) {
  return content.version === 2;
}
var QuestionDropBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("question_drop"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    target_quiz_id: z10.string().max(64).default(""),
    prompt: z10.string().max(500).default(""),
    kinds: z10.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z10.number().int().min(1).max(20).default(1),
    marks_max: z10.number().int().min(1).max(20).default(3),
    per_student: z10.number().int().min(1).max(5).default(1),
    accepting: z10.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("discern_confirm"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    target_block_id: z10.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("quiz_question"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z10.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("question_set"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    questions: z10.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z10.enum(["standard", "human_experience_table", "anchor_bridge", "question_levels", "because_but_so", "reasoning_chart"]).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z10.object({
      rows: z10.number().int().min(3).max(5).default(3),
      example: z10.boolean().default(true)
    }).optional(),
    /** Reasoning chart settings, kept when switching format away and back. */
    reasoning: z10.object({
      level: LensLevelSchema.default("core"),
      student_level: z10.boolean().default(true)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z10.object({
  block_id: z10.string().min(1),
  annotation_id: z10.string().min(1),
  lesson_id: z10.string().optional(),
  kind: z10.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z10.string().min(1)
});
var FlashcardItemSchema = z10.object({
  id: z10.string().min(1),
  front: z10.string(),
  back: z10.string(),
  image_url: z10.string().optional(),
  image_alt: z10.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("flashcards"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    cards: z10.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z10.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("cloze"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    text: z10.string(),
    case_sensitive: z10.boolean().optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z10.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z10.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z10.object({
  id: z10.string().min(1),
  label: z10.string()
});
var SelfCheckBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("self_check"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z10.string(),
    answer: z10.string().optional(),
    items: z10.array(SelfCheckItemSchema).max(12).optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z10.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var NOTE_CUE_KINDS = ["copy", "own_words", "draw", "question"];
var NoteCueKindSchema = z10.enum(NOTE_CUE_KINDS);
var NoteCueBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("note_cue"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    kind: NoteCueKindSchema,
    prompt: z10.string().max(500)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WithTeacherBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("with_teacher"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    talking_points: z10.array(z10.string().max(300)).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FadedExampleBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("faded_example"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    prompt: z10.string().max(300),
    extract: z10.string().max(2e3),
    parts: z10.array(z10.object({ label: z10.string().min(1).max(40), answer: z10.string().max(600) })).min(1).max(4),
    blanks: z10.array(z10.number().int().min(0).max(3)).max(4),
    /** A step with blanks is a gate unless switched off. */
    gate: z10.boolean().optional()
  }).refine((c) => c.blanks.every((i) => i < c.parts.length) && new Set(c.blanks).size === c.blanks.length, {
    message: "Each blank must name a different part of the example.",
    path: ["blanks"]
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z10.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z10.object({
  x: z10.union([z10.string(), z10.number()]),
  y: z10.number()
});
var ChartSeriesColorSchema = z10.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z10.object({
  id: z10.string().min(1),
  name: z10.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z10.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("chart"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    chart_type: ChartTypeSchema,
    title: z10.string().optional(),
    x_label: z10.string().optional(),
    y_label: z10.string().optional(),
    series: z10.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("equation"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    latex: z10.string(),
    caption: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z10.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("diagram"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    source: DiagramSourceSchema,
    image_url: z10.string().optional(),
    image_alt: z10.string().optional(),
    svg_markup: z10.string().optional(),
    caption: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z10.object({
  id: z10.string().min(1),
  label: z10.string(),
  parent_id: z10.string().nullable().optional(),
  color: z10.string().optional(),
  x: z10.number().optional(),
  y: z10.number().optional()
});
var GraphBuildModeSchema = z10.enum(["outline", "canvas"]);
var GraphEdgeSchema = z10.object({
  id: z10.string().min(1),
  from: z10.string().min(1),
  to: z10.string().min(1),
  label: z10.string().optional()
});
var MindMapBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("mind_map"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    nodes: z10.array(GraphNodeSchema).min(1).max(24),
    edges: z10.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("concept_map"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    nodes: z10.array(GraphNodeSchema).min(1).max(24),
    edges: z10.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("whiteboard"),
  variant: z10.string().default("large"),
  visibility: VisibilitySchema,
  content: z10.object({
    document_id: z10.string().min(1),
    seed_document_id: z10.string().min(1).optional(),
    title: z10.string().optional(),
    height_px: z10.number().int().min(360).max(1400).default(640),
    published_snapshot: z10.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z10.object({
  id: z10.string().min(1),
  when: z10.string(),
  label: z10.string(),
  description: z10.string(),
  image_url: z10.string().optional(),
  image_alt: z10.string().optional(),
  link_url: z10.string().optional(),
  link_label: z10.string().optional()
});
var TimelineLayoutSchema = z10.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("timeline"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    layout: TimelineLayoutSchema.optional(),
    events: z10.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z10.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z10.object({
  id: z10.string().min(1),
  number: z10.string().optional(),
  eyebrow: z10.string(),
  title: z10.string(),
  description: z10.string(),
  image_url: z10.string().optional(),
  image_alt: z10.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("card_stack"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    cards: z10.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z10.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("collection"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    source: CollectionSourceSchema,
    title: z10.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z10.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("anthology"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("outcomes"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z10.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z10.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z10.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z10.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z10.enum(["left", "center", "right"]);
var AnnotationLineSchema = z10.object({
  id: z10.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z10.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z10.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z10.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z10.object({
  id: z10.string().min(1),
  lines: z10.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z10.object({
  kind: z10.enum(["verse", "prose"]),
  stanzas: z10.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z10.object({
  id: z10.string().min(1),
  name: z10.string().min(1),
  subgroup: z10.string().optional()
});
var AnnotationLayerSchema = z10.object({
  id: z10.string().min(1),
  name: z10.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z10.string().optional(),
  sublayers: z10.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z10.object({
  exact: z10.string().min(1),
  prefix: z10.string().optional(),
  suffix: z10.string().optional()
});
var AnnotationAnchorSchema = z10.object({
  /** Required on every stop when the annotation is a thread. */
  id: z10.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z10.string().min(1),
  line: z10.string().optional(),
  start: z10.number().int().min(0).optional(),
  end: z10.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z10.string().optional()
});
var AnnotationTechniqueRefSchema = z10.object({
  id: z10.string().min(1),
  table_version: z10.string().min(1)
});
var AnnotationCodeRefSchema = z10.object({
  id: z10.string().min(1).max(40),
  code: z10.string().regex(/^[A-Z]{1,3}$/),
  label: z10.string().max(60),
  descriptor: z10.string().max(600).default(""),
  colour: z10.enum(["blue", "sage", "peach", "gold", "lilac"]).default("blue"),
  positive: z10.boolean().default(false)
});
var AnnotationAttachmentSchema = z10.discriminatedUnion("kind", [
  z10.object({
    kind: z10.literal("link"),
    url: z10.string(),
    label: z10.string().optional()
  }),
  z10.object({
    kind: z10.literal("video"),
    url: z10.string(),
    start_seconds: z10.number().int().min(0).optional()
  }),
  z10.object({
    kind: z10.literal("audio"),
    url: z10.string(),
    title: z10.string().optional()
  }),
  z10.object({
    kind: z10.literal("image"),
    url: z10.string(),
    alt_text: z10.string()
  }),
  z10.object({
    kind: z10.literal("block"),
    block_id: z10.string().min(1)
  })
]);
var AnthologyTagSchema = z10.object({
  include: z10.boolean(),
  themes: z10.array(z10.string().trim().max(40)).max(8).default([]),
  concepts: z10.array(z10.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z10.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z10.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z10.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z10.enum(["text", "custom"]).default("text"),
  anchor_order: z10.array(z10.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z10.object({
  w: z10.string(),
  start: z10.number(),
  end: z10.number()
});
var AnnotationVoiceClipSchema = z10.object({
  id: z10.string().min(1),
  start_s: z10.number(),
  end_s: z10.number(),
  word_range: z10.tuple([z10.number().int().min(0), z10.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z10.enum(["tap", "quote", "ai", "manual"]),
  confidence: z10.number().min(0).max(1),
  approved: z10.boolean(),
  transcript_text: z10.string()
});
var AnnotationVoiceTrackSchema = z10.object({
  id: z10.string().min(1),
  layer_id: z10.string().min(1),
  kind: z10.enum(["reading", "think_aloud", "feedback"]),
  title: z10.string().min(1),
  audio: z10.object({
    media_id: z10.string().optional(),
    url: z10.string().min(1),
    duration_s: z10.number().min(0),
    mime: z10.string().min(1)
  }),
  transcript: z10.object({
    words: z10.array(AnnotationVoiceWordSchema),
    timing: z10.enum(["word", "segment", "estimated"])
  }),
  taps: z10.array(
    z10.object({
      t: z10.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z10.array(AnnotationVoiceClipSchema).default([]),
  status: z10.enum(["draft", "published"]),
  extras: z10.array(
    z10.object({
      id: z10.string().min(1),
      kind: z10.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z10.string(),
      approved: z10.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z10.object({
  id: z10.string().min(1),
  layer_id: z10.string().min(1),
  sublayer_id: z10.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z10.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  code: AnnotationCodeRefSchema.optional(),
  body: z10.object({
    html: z10.string(),
    attachments: z10.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
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
      code: z10.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
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
      code: z10.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z10.object({
  show_markers: z10.boolean().default(true),
  default_layer_id: z10.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z10.union([z10.literal(0), z10.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z10.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("annotation"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string().optional(),
    attribution: z10.string().optional(),
    text: AnnotationTextSchema,
    layers: z10.array(AnnotationLayerSchema).default([]),
    annotations: z10.array(AnnotationItemSchema).default([]),
    voice_tracks: z10.array(AnnotationVoiceTrackSchema).optional(),
    anthology: AnthologyTagSchema.optional(),
    settings: AnnotationBlockSettingsSchema.default({ show_markers: true })
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
        code: z10.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z10.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z10.object({
    id: z10.string().min(1),
    type: z10.literal("block"),
    block_type: z10.literal(blockType),
    variant: z10.string().default("medium"),
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
var TeacherNoteBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("teacher_note"),
  variant: z10.string().default("medium"),
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
  BrainstormBlockSchema,
  HingeQuestionBlockSchema,
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
var SpacerBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("spacer"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z10.lazy(
  () => z10.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z10.array(
  z10.object({
    width: z10.number().int().min(1).max(12),
    blocks: z10.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("columns"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z10.lazy(
  () => z10.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("tabs"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    tabs: z10.array(
      z10.object({
        id: z10.string().min(1),
        label: z10.string(),
        blocks: z10.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionInnerChildBlockSchema = z10.lazy(
  () => z10.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SidePathSectionSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("section"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string(),
    collapsed_in_editor: z10.boolean().optional(),
    blocks: z10.array(SectionInnerChildBlockSchema),
    side_path: z10.literal(true),
    narration: NarrationSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z10.lazy(
  () => z10.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    SidePathSectionSchema
  ])
);
var SectionLinkSchema = z10.object({
  mode: z10.literal("linked"),
  source_composition_id: z10.string().min(1)
});
var GroupSetSchema = z10.object({
  group_id: z10.string().min(1).max(64),
  class_id: z10.string().min(1).max(64),
  name: z10.string().min(1).max(120),
  tags: z10.array(z10.string().min(1).max(120)).min(1).max(8),
  students: z10.array(z10.string().min(1).max(64)).max(60),
  target: z10.number().int().min(1).max(10)
});
var SectionBlockObjectSchema = z10.object({
  id: z10.string().min(1),
  type: z10.literal("block"),
  block_type: z10.literal("section"),
  variant: z10.string().default("medium"),
  visibility: VisibilitySchema,
  content: z10.object({
    title: z10.string(),
    collapsed_in_editor: z10.boolean().optional(),
    blocks: z10.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional(),
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z10.object({ enabled: z10.boolean(), prompt: z10.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z10.boolean().optional(),
    /** Tutorial: this top-level section is the tab for the group with this id. */
    tutorial_group: TutorialGroupIdSchema.optional(),
    /** Tutorial: with tutorial_group, this section is that group's exit check (quiz questions). */
    tutorial_exit: z10.boolean().optional(),
    /** Design Sprint: this top-level section holds the guides for one phase. */
    sprint_phase: SprintPhaseKeySchema.optional(),
    /** Quiz: this top-level section is a group set, practice for one markbook group's students only. */
    group_set: GroupSetSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z10.lazy(
  () => z10.discriminatedUnion("block_type", [
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
  ClassroomToolIdSchema,
  ClassroomToolsBlockSchema,
  ClozeBlockSchema,
  CodeBlockSchema,
  CollectionBlockSchema,
  CollectionSourceSchema,
  ColumnChildBlockSchema,
  ColumnPresetSchema,
  ColumnsBlockSchema,
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
  DotPointRefSchema,
  EmbedBlockSchema,
  EmbedProviderSchema,
  EquationBlockSchema,
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
  WithTeacherBlockSchema,
  isCurriculumLinesV2,
  refineAnnotationVoiceTracks
};
