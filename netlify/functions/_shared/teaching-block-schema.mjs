// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z7 } from "zod";

// apps/teaching/src/schemas/common.ts
import { z } from "zod";
var StatusSchema = z.enum(["active", "archived", "trashed"]);
var IsoDateSchema = z.string().datetime();
var CommonFields = {
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};
var TrashFieldsSchema = z.object({
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(["active", "archived"]).optional(),
  trash_reason: z.string().min(1).optional()
});
var TrashFields = {
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(["active", "archived"]).optional(),
  trash_reason: z.string().min(1).optional()
};

// apps/teaching/src/schemas/kaplan.ts
import { z as z2 } from "zod";
var KaplanLensSchema = z2.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z2.tuple([
  z2.string().max(1200),
  z2.string().max(1200),
  z2.string().max(1200)
]);
var KaplanQualifierSchema = z2.object({
  lens: KaplanLensSchema,
  focus: z2.string().trim().max(200).default(""),
  mode: z2.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z2.tuple([
    z2.string().max(1200).nullable(),
    z2.string().max(1200).nullable(),
    z2.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z2.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z2.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/schemas/discern.ts
import { z as z3 } from "zod";
var DiscernModeSchema = z3.enum(["own", "theirs"]);
var DiscernInitialTypeSchema = z3.enum(["scale", "choose", "write"]);
var DiscernScalePresetSchema = z3.enum(["agree", "extent", "effect", "verdict"]);
var DiscernQualifierSchema = z3.object({
  /** own: the student's answer. theirs: a character's or historical figure's choice. */
  mode: DiscernModeSchema.default("own"),
  who: z3.string().trim().max(80).default(""),
  /** What is being judged. Fills every default prompt. */
  focus: z3.string().trim().max(200).default(""),
  /** Optional evidence source, e.g. "the poems" or "Source B". */
  source: z3.string().trim().max(120).default(""),
  initial: z3.object({
    type: DiscernInitialTypeSchema.default("scale"),
    preset: DiscernScalePresetSchema.default("agree"),
    /** Scale points or choices. Empty scale points fall back to the preset. */
    options: z3.array(z3.string().trim().max(60)).max(5).default([])
  }).default({}),
  /** Teacher overrides for the five step prompts; an empty string keeps the default. */
  prompts: z3.array(z3.string().max(1200)).length(5).optional(),
  /** "Their choice" only: students also plot how settled the character is across key moments. */
  character_tail: z3.object({
    enabled: z3.boolean().default(false),
    moments: z3.array(z3.string().trim().max(80)).max(6).default([])
  }).optional()
});

// apps/teaching/src/schemas/lens.ts
import { z as z4 } from "zod";
var LensAttachmentSchema = z4.object({
  id: z4.string().min(1).max(60),
  config: z4.record(z4.unknown())
});
var LensAttachmentsSchema = z4.array(LensAttachmentSchema).max(6).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message: "Use each lens once per block." });
  }
});
var LensLevelSchema = z4.enum(["support", "core", "extend"]);
var StepTextSchema = z4.string().max(1200);
var WindowsMirrorsConfigSchema = z4.object({
  focus: z4.string().trim().max(200).default(""),
  answer_with: z4.enum(["window", "mirror", "both", "choice"]).default("both"),
  level: LensLevelSchema.default("core"),
  student_level: z4.boolean().default(true),
  mode: z4.enum(["notes", "discussion"]).default("notes"),
  /** Teacher overrides keyed `${level}.${stepId}`; empty keeps the default. */
  prompts: z4.record(StepTextSchema).optional(),
  supports: z4.record(StepTextSchema.nullable()).optional(),
  examples: z4.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
var SteppedLensConfigSchema = WindowsMirrorsConfigSchema.omit({ answer_with: true });

// apps/teaching/src/quiz/core.ts
import { z as z5 } from "zod";
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
  "label_image",
  "extended_response",
  "explain_effect"
];
var QuizQuestionKindSchema = z5.enum(QUIZ_QUESTION_KINDS);
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
var Id = z5.string().min(1).max(64);
var Text = (max) => z5.string().trim().min(1).max(max);
var OptionalText = (max) => z5.string().trim().max(max).optional();
var QuizImageSchema = z5.object({
  url: z5.string().min(1).max(2e3),
  alt: z5.string().max(300).default("")
});
var QuizChoiceSchema = z5.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z5.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z5.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z5.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizPinSchema = z5.object({
  id: Id,
  x: z5.number().min(0).max(1),
  y: z5.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z5.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z5.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional()
};
var QuizQuestionSchema = z5.discriminatedUnion("kind", [
  z5.object({ ...base, kind: z5.literal("multiple_choice"), options: z5.array(QuizChoiceSchema).min(2).max(6), correct: z5.array(Id).length(1) }),
  z5.object({ ...base, kind: z5.literal("multi_select"), options: z5.array(QuizChoiceSchema).min(2).max(8), correct: z5.array(Id).min(1).max(8) }),
  z5.object({ ...base, kind: z5.literal("true_false"), answer: z5.boolean() }),
  z5.object({
    ...base,
    kind: z5.literal("short_answer"),
    accepted: z5.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z5.boolean().optional()
  }),
  z5.object({ ...base, kind: z5.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z5.boolean().optional() }),
  z5.object({ ...base, kind: z5.literal("odd_one_out"), options: z5.array(QuizChoiceSchema).min(3).max(6), correct: z5.array(Id).length(1) }),
  z5.object({ ...base, kind: z5.literal("matching"), pairs: z5.array(QuizPairSchema).min(2).max(8) }),
  z5.object({ ...base, kind: z5.literal("ordering"), items: z5.array(QuizChoiceSchema).min(3).max(8) }),
  z5.object({
    ...base,
    kind: z5.literal("categorise"),
    groups: z5.array(QuizGroupSchema).min(2).max(4),
    items: z5.array(QuizSortItemSchema).min(2).max(16)
  }),
  z5.object({
    ...base,
    kind: z5.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z5.array(QuizChoiceSchema.extend({ technique_id: z5.string().max(64).optional() })).min(2).max(6),
    correct: z5.array(Id).length(1)
  }),
  z5.object({
    ...base,
    kind: z5.literal("find_it"),
    segments: z5.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z5.array(Id).min(1).max(40)
  }),
  z5.object({ ...base, kind: z5.literal("label_image"), image: QuizImageSchema, pins: z5.array(QuizPinSchema).min(2).max(8) }),
  z5.object({
    ...base,
    kind: z5.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z5.object({
    ...base,
    kind: z5.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z5.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z5.custom(
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
var QuizFeedbackSchema = z5.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z5.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z5.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z5.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z5.boolean().optional(),
  shuffle_questions: z5.boolean().optional(),
  shuffle_options: z5.boolean().optional(),
  attempts: z5.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z5.number().min(0).max(1).optional(),
  confidence: z5.boolean().optional(),
  closes_at: z5.string().datetime().optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z6 } from "zod";
var TkStepSchema = z6.object({
  id: z6.string().min(1),
  title: z6.string(),
  prompt: z6.string()
});
var TkRevealSchema = z6.object({
  id: z6.string().min(1),
  label: z6.string(),
  body: z6.string()
});
var TkTeacherNoteSchema = z6.object({
  what: z6.string().default(""),
  run: z6.array(z6.string()).default([]),
  say: z6.array(z6.string()).default([]),
  watch: z6.array(z6.string()).default([]),
  extra_label: z6.string().default(""),
  extra: z6.array(z6.string()).default([]),
  time: z6.string().default(""),
  source: z6.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z6.boolean().default(false)
});
var TkJotsSchema = z6.record(z6.string()).default({});
var TkItemListSchema = z6.array(z6.string().min(1)).default([]);
var ToolkitSkillContentSchema = z6.object({
  item: z6.string().min(1),
  label: z6.string(),
  definition: z6.string(),
  definition_source: z6.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  context: z6.string().default(""),
  steps: z6.array(TkStepSchema).max(8),
  show_test: z6.boolean().default(true),
  checks: z6.array(z6.string()).max(8).default([]),
  reveals: z6.array(TkRevealSchema).max(6).default([]),
  links: z6.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z6.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z6.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z6.preprocess(
  (value) => value === "level2" ? "none" : value,
  z6.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z6.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z6.object({
  kind: z6.string().default(""),
  marker: z6.string().default(""),
  a: z6.string().default(""),
  b: z6.string().default("")
});
var ToolkitToolContentSchema = z6.object({
  item: z6.string().min(1),
  label: z6.string(),
  definition: z6.string(),
  definition_source: z6.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  frame: ToolFrameSchema,
  sentence: z6.string().default(""),
  steps: z6.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z6.string().default(""),
  converters: z6.array(z6.object({ id: z6.string().min(1), closed: z6.string(), open: z6.string() })).max(10).default([]),
  statements: z6.array(
    z6.object({
      id: z6.string().min(1),
      text: z6.string(),
      verdict: StressVerdictSchema,
      reason: z6.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z6.array(TkRevealSchema).max(6).default([]),
  links: z6.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z6.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z6.object({
  item: z6.string().min(1),
  label: z6.string(),
  definition: z6.string(),
  definition_source: z6.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  claim: z6.string().default(""),
  options: z6.array(z6.object({ id: z6.string().min(1), text: z6.string() })).max(8).default([]),
  probes: z6.array(z6.object({ id: z6.string().min(1), question: z6.string(), asks: z6.string() })).max(8).default([]),
  instruction: z6.string().default(""),
  model: z6.object({ label: z6.string(), body: z6.string() }).default({ label: "", body: "" }),
  discussion: z6.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z6.object({
  id: z6.string().min(1),
  tool: z6.string().min(1),
  prompt: z6.string(),
  frame: z6.string(),
  example: z6.string()
});
var ThinkingMoveContentSchema = z6.object({
  skill: z6.string().min(1),
  tools: z6.array(z6.string().min(1)).min(1).max(5),
  value: z6.string().min(1),
  community: z6.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  stimulus: z6.string().default(""),
  steps: z6.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z6.array(z6.string()).max(8).default([]),
  why: z6.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z6.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z6.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z6.object({
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  stimulus: z6.string().default(""),
  procedure: z6.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z6.boolean().default(false),
  questions: z6.array(z6.object({ id: z6.string().min(1), text: z6.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z6.array(z6.object({ id: z6.string().min(1), closed: z6.string(), open: z6.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z6.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z6.object({
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  concepts: z6.array(
    z6.object({
      id: z6.string().min(1),
      label: z6.string(),
      central: z6.boolean(),
      contestable: z6.boolean(),
      common: z6.boolean()
    })
  ).max(8).default([]),
  analogy: z6.object({ stem: z6.string(), example: z6.string() }).default({ stem: "", example: "" }),
  game: z6.object({
    kind: ConceptGameKindSchema,
    left: z6.string(),
    middle: z6.string(),
    right: z6.string(),
    cards: z6.array(z6.object({ id: z6.string().min(1), text: z6.string(), prompt: z6.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z6.array(z6.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z6.object({
  content: z6.string().default(""),
  skills: z6.array(z6.string().min(1)).max(2).default([]),
  tools: z6.array(z6.string().min(1)).max(6).default([]),
  values: z6.array(z6.string().min(1)).max(4).default([]),
  community: z6.array(z6.string().min(1)).max(2).default([]),
  success: z6.array(z6.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z6.object({
  variant: z6.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  concept: z6.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z6.object({
  task: z6.string().default(""),
  steps: z6.array(TkStepSchema).max(6).default([]),
  example: z6.string().default("")
});
var FluidAnalogyContentSchema = z6.object({
  kind: z6.string().min(1),
  label: z6.string(),
  definition: z6.string(),
  /** The text, character or idea students work with. */
  focus: z6.string().default(""),
  /** The level students start at. */
  level: z6.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z6.boolean().default(true),
  tiers: z6.array(AnalogyTierSchema).length(3),
  show_check: z6.boolean().default(true),
  checks: z6.array(z6.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z6.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z6.object({
  key: z6.string().min(1),
  label: z6.string().default(""),
  frame: z6.string().default(""),
  example: z6.string().default("")
});
var AnalogyStageSchema = z6.object({
  task: z6.string().default(""),
  slots: z6.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z6.object({
  label: z6.string(),
  definition: z6.string(),
  /** The text, character or idea students work with. */
  focus: z6.string().default(""),
  /** The level students start at. */
  level: z6.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z6.boolean().default(true),
  levels: z6.array(AnalogyStageSchema).length(3),
  show_check: z6.boolean().default(true),
  checks: z6.array(z6.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z6.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z6.object({
  /** Student instruction shown at the top of the block. */
  guide: z6.string().default(""),
  focus: z6.string().default(""),
  /** Types marked "This lesson". */
  types: z6.array(z6.string().min(1)).max(7).default([]),
  show_contrast: z6.boolean().default(true),
  weak: z6.string().default(""),
  strong: z6.string().default(""),
  why: z6.string().default(""),
  process: z6.array(z6.string()).max(8).default([]),
  show_check: z6.boolean().default(true),
  checks: z6.array(z6.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z6.object({
  title: z6.string().default("Teacher note"),
  html: z6.string().default("")
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
var VisibilitySchema = z7.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z7.enum([
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
  "continuum_line",
  "curriculum_lines",
  "quiz_question",
  "question_set",
  "discern_confirm",
  "flashcards",
  "cloze",
  "self_check",
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
var ColumnPresetSchema = z7.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z7.enum(["small", "medium", "large"]);
var VideoProviderSchema = z7.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z7.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z7.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z7.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z7.enum([
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
var QuestionKindSchema = z7.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z7.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z7.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
  layout: z7.record(z7.unknown()).default({}),
  print: z7.record(z7.unknown()).default({}),
  settings: z7.record(z7.unknown()).default({})
};
var RichTextBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("rich_text"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({ html: z7.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z7.object({ text: z7.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("callout"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    style: CalloutStyleSchema,
    title: z7.string().optional(),
    body: z7.string(),
    related_to: z7.object({
      block_id: z7.string().min(1),
      question_id: z7.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    url: z7.string(),
    alt_text: z7.string(),
    caption: z7.string().optional(),
    annotations: z7.array(
      z7.object({
        id: z7.string().min(1),
        body: z7.string().min(1),
        selector: z7.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z7.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z7.object({
  id: z7.string().min(1),
  url: z7.string(),
  alt_text: z7.string(),
  caption: z7.string().optional()
});
var GalleryBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    layout: GalleryLayoutSchema,
    items: z7.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z7.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    provider: VideoProviderSchema,
    external_id: z7.string(),
    url: z7.string().optional(),
    start_seconds: z7.number().int().positive().optional(),
    title: z7.string().optional(),
    caption: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("embed"),
  variant: z7.string().default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    url: z7.string(),
    title: z7.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("html"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({ html: z7.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z7.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z7.object({
  enabled: z7.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z7.string().min(1),
  system: z7.string(),
  max_tokens: z7.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("html_app"),
  variant: z7.string().default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    html: z7.string(),
    height_px: z7.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("quote"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    quote: z7.string(),
    attribution: z7.string().optional(),
    source: z7.string().optional(),
    reference: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z7.object({
  label: z7.string().max(60),
  minutes: z7.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z7.enum([
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
var DividerBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("divider"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z7.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z7.array(TimerSegmentSchema).max(8).default([])
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("classroom_tools"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    timer_stack: z7.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("countdown"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z7.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z7.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z7.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z7.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("definition"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    term: z7.string(),
    definition: z7.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("code"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    code: z7.string(),
    language: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("audio"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    url: z7.string(),
    title: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("attachment"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    url: z7.string(),
    title: z7.string(),
    filename: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z7.object({
  title: z7.string(),
  body: z7.string()
});
var AccordionBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("accordion"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    items: z7.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("table"),
  variant: z7.string().default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    headers: z7.array(z7.string()),
    rows: z7.array(z7.array(z7.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z7.object({
  id: z7.string().min(1),
  prompt: z7.string(),
  kind: QuestionKindSchema,
  options: z7.array(z7.string()).optional(),
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z7.enum(["beginner", "detective", "judge", "inventor"]).optional()
});
var PeerFeedbackBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("peer_feedback"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    prompt: z7.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z7.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z7.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z7.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ContinuumStatementSchema = z7.object({
  id: z7.string().min(1),
  text: z7.string().max(300).default(""),
  snap: z7.boolean().default(false)
});
var ContinuumLineBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("continuum_line"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    stimulus: z7.object({
      kind: z7.enum(["text", "image", "video"]).default("text"),
      text: z7.string().max(2e3).default(""),
      url: z7.string().max(2e3).default(""),
      alt_text: z7.string().max(500).default("")
    }).default({ kind: "text", text: "", url: "", alt_text: "" }),
    scale: z7.object({
      left: z7.string().max(40).default("Implied"),
      right: z7.string().max(40).default("Not implied"),
      stops: z7.array(z7.string().max(40)).max(3).default([])
    }).default({ left: "Implied", right: "Not implied", stops: [] }),
    statements: z7.array(ContinuumStatementSchema).max(10).default([]),
    pace: z7.enum(["teacher", "student"]).default("teacher"),
    replace: z7.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("brainstorm"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    question: z7.string().max(500).default(""),
    safety: z7.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z7.union([z7.literal(0), z7.literal(1), z7.literal(3), z7.literal(5)]).default(3),
    max_length: z7.number().int().min(20).max(280).default(140),
    layout: z7.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z7.enum([
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
var CurriculumLinesLevelSchema = z7.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z7.object({
  id: z7.string().min(1).max(64),
  name: z7.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z7.object({
  id: z7.string().min(1).max(64),
  strand_id: z7.string().min(1).max(64),
  week: z7.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z7.string().max(120).default(""),
  lesson_id: z7.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z7.object({
  id: z7.string().min(1).max(64),
  week: z7.number().int().min(1).max(20),
  label: z7.string().max(80).default(""),
  lesson_id: z7.string().min(1).max(64).optional(),
  strand_ids: z7.array(z7.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z7.object({
  label: z7.string().max(80).default("Assessment task"),
  detail: z7.string().max(160).optional(),
  when: z7.string().max(24).optional(),
  lesson_id: z7.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z7.object({
  title: z7.string().max(120).optional(),
  weeks: z7.number().int().min(1).max(20).default(8),
  strands: z7.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z7.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z7.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var NetworkLineModeSchema = z7.enum(["train", "metro", "light_rail"]);
var NetworkLineSchema = z7.object({
  id: z7.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z7.string().max(60).default(""),
  short: z7.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave")
});
var LineStopSchema = z7.object({
  line_id: z7.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional()
});
var NetworkNudgesSchema = z7.record(
  z7.string().min(1).max(160),
  z7.object({ dx: z7.number().min(-2e3).max(2e3), dy: z7.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z7.object({
  id: z7.string().min(1).max(64),
  line_id: z7.string().min(1).max(64),
  after_lesson_id: z7.string().min(1).max(64).optional(),
  kind: z7.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z7.string().min(1).max(64).optional(),
  block_id: z7.string().min(1).max(120).optional(),
  label: z7.string().max(120).default("")
});
var CurriculumGateSchema = z7.object({
  id: z7.string().min(1).max(64),
  after_lesson_id: z7.string().min(1).max(64).optional(),
  label: z7.string().max(80).default(""),
  lesson_id: z7.string().min(1).max(64).optional(),
  line_ids: z7.array(z7.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z7.object({
  version: z7.literal(2),
  title: z7.string().max(120).optional(),
  rail_stops: z7.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z7.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z7.array(z7.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z7.array(z7.string().min(1).max(64)).max(200).optional(),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("curriculum_lines"),
  variant: z7.string().default("large"),
  visibility: VisibilitySchema,
  content: z7.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
function isCurriculumLinesV2(content) {
  return content.version === 2;
}
var QuestionDropBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("question_drop"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    target_quiz_id: z7.string().max(64).default(""),
    prompt: z7.string().max(500).default(""),
    kinds: z7.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z7.number().int().min(1).max(20).default(1),
    marks_max: z7.number().int().min(1).max(20).default(3),
    per_student: z7.number().int().min(1).max(5).default(1),
    accepting: z7.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("discern_confirm"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    target_block_id: z7.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("quiz_question"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z7.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("question_set"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    questions: z7.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z7.enum(["standard", "human_experience_table", "anchor_bridge", "question_levels", "because_but_so"]).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z7.object({
      rows: z7.number().int().min(3).max(5).default(3),
      example: z7.boolean().default(true)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z7.object({
  block_id: z7.string().min(1),
  annotation_id: z7.string().min(1),
  lesson_id: z7.string().optional(),
  kind: z7.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z7.string().min(1)
});
var FlashcardItemSchema = z7.object({
  id: z7.string().min(1),
  front: z7.string(),
  back: z7.string(),
  image_url: z7.string().optional(),
  image_alt: z7.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("flashcards"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    cards: z7.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z7.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("cloze"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    text: z7.string(),
    case_sensitive: z7.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z7.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z7.object({
  id: z7.string().min(1),
  label: z7.string()
});
var SelfCheckBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("self_check"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z7.string(),
    answer: z7.string().optional(),
    items: z7.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z7.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z7.object({
  x: z7.union([z7.string(), z7.number()]),
  y: z7.number()
});
var ChartSeriesColorSchema = z7.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z7.object({
  id: z7.string().min(1),
  name: z7.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z7.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("chart"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    chart_type: ChartTypeSchema,
    title: z7.string().optional(),
    x_label: z7.string().optional(),
    y_label: z7.string().optional(),
    series: z7.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("equation"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    latex: z7.string(),
    caption: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z7.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("diagram"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    source: DiagramSourceSchema,
    image_url: z7.string().optional(),
    image_alt: z7.string().optional(),
    svg_markup: z7.string().optional(),
    caption: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z7.object({
  id: z7.string().min(1),
  label: z7.string(),
  parent_id: z7.string().nullable().optional(),
  color: z7.string().optional(),
  x: z7.number().optional(),
  y: z7.number().optional()
});
var GraphBuildModeSchema = z7.enum(["outline", "canvas"]);
var GraphEdgeSchema = z7.object({
  id: z7.string().min(1),
  from: z7.string().min(1),
  to: z7.string().min(1),
  label: z7.string().optional()
});
var MindMapBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("mind_map"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    nodes: z7.array(GraphNodeSchema).min(1).max(24),
    edges: z7.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("concept_map"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    nodes: z7.array(GraphNodeSchema).min(1).max(24),
    edges: z7.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("whiteboard"),
  variant: z7.string().default("large"),
  visibility: VisibilitySchema,
  content: z7.object({
    document_id: z7.string().min(1),
    seed_document_id: z7.string().min(1).optional(),
    title: z7.string().optional(),
    height_px: z7.number().int().min(360).max(1400).default(640),
    published_snapshot: z7.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z7.object({
  id: z7.string().min(1),
  when: z7.string(),
  label: z7.string(),
  description: z7.string(),
  image_url: z7.string().optional(),
  image_alt: z7.string().optional(),
  link_url: z7.string().optional(),
  link_label: z7.string().optional()
});
var TimelineLayoutSchema = z7.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("timeline"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    layout: TimelineLayoutSchema.optional(),
    events: z7.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z7.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z7.object({
  id: z7.string().min(1),
  number: z7.string().optional(),
  eyebrow: z7.string(),
  title: z7.string(),
  description: z7.string(),
  image_url: z7.string().optional(),
  image_alt: z7.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("card_stack"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    cards: z7.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z7.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("collection"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    source: CollectionSourceSchema,
    title: z7.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z7.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("anthology"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("outcomes"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z7.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z7.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z7.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z7.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z7.enum(["left", "center", "right"]);
var AnnotationLineSchema = z7.object({
  id: z7.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z7.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z7.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z7.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z7.object({
  id: z7.string().min(1),
  lines: z7.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z7.object({
  kind: z7.enum(["verse", "prose"]),
  stanzas: z7.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z7.object({
  id: z7.string().min(1),
  name: z7.string().min(1),
  subgroup: z7.string().optional()
});
var AnnotationLayerSchema = z7.object({
  id: z7.string().min(1),
  name: z7.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z7.string().optional(),
  sublayers: z7.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z7.object({
  exact: z7.string().min(1),
  prefix: z7.string().optional(),
  suffix: z7.string().optional()
});
var AnnotationAnchorSchema = z7.object({
  /** Required on every stop when the annotation is a thread. */
  id: z7.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z7.string().min(1),
  line: z7.string().optional(),
  start: z7.number().int().min(0).optional(),
  end: z7.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z7.string().optional()
});
var AnnotationTechniqueRefSchema = z7.object({
  id: z7.string().min(1),
  table_version: z7.string().min(1)
});
var AnnotationAttachmentSchema = z7.discriminatedUnion("kind", [
  z7.object({
    kind: z7.literal("link"),
    url: z7.string(),
    label: z7.string().optional()
  }),
  z7.object({
    kind: z7.literal("video"),
    url: z7.string(),
    start_seconds: z7.number().int().min(0).optional()
  }),
  z7.object({
    kind: z7.literal("audio"),
    url: z7.string(),
    title: z7.string().optional()
  }),
  z7.object({
    kind: z7.literal("image"),
    url: z7.string(),
    alt_text: z7.string()
  }),
  z7.object({
    kind: z7.literal("block"),
    block_id: z7.string().min(1)
  })
]);
var AnthologyTagSchema = z7.object({
  include: z7.boolean(),
  themes: z7.array(z7.string().trim().max(40)).max(8).default([]),
  concepts: z7.array(z7.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z7.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z7.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z7.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z7.enum(["text", "custom"]).default("text"),
  anchor_order: z7.array(z7.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z7.object({
  w: z7.string(),
  start: z7.number(),
  end: z7.number()
});
var AnnotationVoiceClipSchema = z7.object({
  id: z7.string().min(1),
  start_s: z7.number(),
  end_s: z7.number(),
  word_range: z7.tuple([z7.number().int().min(0), z7.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z7.enum(["tap", "quote", "ai", "manual"]),
  confidence: z7.number().min(0).max(1),
  approved: z7.boolean(),
  transcript_text: z7.string()
});
var AnnotationVoiceTrackSchema = z7.object({
  id: z7.string().min(1),
  layer_id: z7.string().min(1),
  kind: z7.enum(["reading", "think_aloud", "feedback"]),
  title: z7.string().min(1),
  audio: z7.object({
    media_id: z7.string().optional(),
    url: z7.string().min(1),
    duration_s: z7.number().min(0),
    mime: z7.string().min(1)
  }),
  transcript: z7.object({
    words: z7.array(AnnotationVoiceWordSchema),
    timing: z7.enum(["word", "segment", "estimated"])
  }),
  taps: z7.array(
    z7.object({
      t: z7.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z7.array(AnnotationVoiceClipSchema).default([]),
  status: z7.enum(["draft", "published"]),
  extras: z7.array(
    z7.object({
      id: z7.string().min(1),
      kind: z7.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z7.string(),
      approved: z7.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z7.object({
  id: z7.string().min(1),
  layer_id: z7.string().min(1),
  sublayer_id: z7.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z7.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  body: z7.object({
    html: z7.string(),
    attachments: z7.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
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
      code: z7.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
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
      code: z7.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z7.object({
  show_markers: z7.boolean().default(true),
  default_layer_id: z7.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z7.union([z7.literal(0), z7.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z7.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("annotation"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string().optional(),
    attribution: z7.string().optional(),
    text: AnnotationTextSchema,
    layers: z7.array(AnnotationLayerSchema).default([]),
    annotations: z7.array(AnnotationItemSchema).default([]),
    voice_tracks: z7.array(AnnotationVoiceTrackSchema).optional(),
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
        code: z7.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z7.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z7.object({
    id: z7.string().min(1),
    type: z7.literal("block"),
    block_type: z7.literal(blockType),
    variant: z7.string().default("medium"),
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
var TeacherNoteBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("teacher_note"),
  variant: z7.string().default("medium"),
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
  ContinuumLineBlockSchema,
  CurriculumLinesBlockSchema,
  QuizQuestionBlockSchema,
  DiscernConfirmBlockSchema,
  QuestionSetBlockSchema,
  FlashcardsBlockSchema,
  ClozeBlockSchema,
  SelfCheckBlockSchema,
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
var SpacerBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("spacer"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z7.lazy(
  () => z7.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z7.array(
  z7.object({
    width: z7.number().int().min(1).max(12),
    blocks: z7.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("columns"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z7.lazy(
  () => z7.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("tabs"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    tabs: z7.array(
      z7.object({
        id: z7.string().min(1),
        label: z7.string(),
        blocks: z7.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z7.lazy(
  () => z7.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z7.object({
  mode: z7.literal("linked"),
  source_composition_id: z7.string().min(1)
});
var SectionBlockObjectSchema = z7.object({
  id: z7.string().min(1),
  type: z7.literal("block"),
  block_type: z7.literal("section"),
  variant: z7.string().default("medium"),
  visibility: VisibilitySchema,
  content: z7.object({
    title: z7.string(),
    collapsed_in_editor: z7.boolean().optional(),
    blocks: z7.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z7.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z7.lazy(
  () => z7.discriminatedUnion("block_type", [
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
  EmbedBlockSchema,
  EmbedProviderSchema,
  EquationBlockSchema,
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
  HeadingBlockSchema,
  HeadingVariantSchema,
  HtmlAppAiProviderSchema,
  HtmlAppAiSchema,
  HtmlAppBlockSchema,
  HtmlBlockSchema,
  ImageBlockSchema,
  LineStopSchema,
  MediaSizeVariantSchema,
  MindMapBlockSchema,
  NetworkLineModeSchema,
  NetworkLineSchema,
  NetworkNudgesSchema,
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
  RichTextBlockSchema,
  SectionBlockSchema,
  SectionChildBlockSchema,
  SectionLinkSchema,
  SelfCheckBlockSchema,
  SelfCheckItemSchema,
  SelfCheckModeSchema,
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
  isCurriculumLinesV2,
  refineAnnotationVoiceTracks
};
