// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z6 } from "zod";

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

// apps/teaching/src/quiz/core.ts
import { z as z4 } from "zod";
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
var QuizQuestionKindSchema = z4.enum(QUIZ_QUESTION_KINDS);
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
var Id = z4.string().min(1).max(64);
var Text = (max) => z4.string().trim().min(1).max(max);
var OptionalText = (max) => z4.string().trim().max(max).optional();
var QuizImageSchema = z4.object({
  url: z4.string().min(1).max(2e3),
  alt: z4.string().max(300).default("")
});
var QuizChoiceSchema = z4.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z4.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z4.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z4.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizPinSchema = z4.object({
  id: Id,
  x: z4.number().min(0).max(1),
  y: z4.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z4.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z4.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional()
};
var QuizQuestionSchema = z4.discriminatedUnion("kind", [
  z4.object({ ...base, kind: z4.literal("multiple_choice"), options: z4.array(QuizChoiceSchema).min(2).max(6), correct: z4.array(Id).length(1) }),
  z4.object({ ...base, kind: z4.literal("multi_select"), options: z4.array(QuizChoiceSchema).min(2).max(8), correct: z4.array(Id).min(1).max(8) }),
  z4.object({ ...base, kind: z4.literal("true_false"), answer: z4.boolean() }),
  z4.object({
    ...base,
    kind: z4.literal("short_answer"),
    accepted: z4.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z4.boolean().optional()
  }),
  z4.object({ ...base, kind: z4.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z4.boolean().optional() }),
  z4.object({ ...base, kind: z4.literal("odd_one_out"), options: z4.array(QuizChoiceSchema).min(3).max(6), correct: z4.array(Id).length(1) }),
  z4.object({ ...base, kind: z4.literal("matching"), pairs: z4.array(QuizPairSchema).min(2).max(8) }),
  z4.object({ ...base, kind: z4.literal("ordering"), items: z4.array(QuizChoiceSchema).min(3).max(8) }),
  z4.object({
    ...base,
    kind: z4.literal("categorise"),
    groups: z4.array(QuizGroupSchema).min(2).max(4),
    items: z4.array(QuizSortItemSchema).min(2).max(16)
  }),
  z4.object({
    ...base,
    kind: z4.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z4.array(QuizChoiceSchema.extend({ technique_id: z4.string().max(64).optional() })).min(2).max(6),
    correct: z4.array(Id).length(1)
  }),
  z4.object({
    ...base,
    kind: z4.literal("find_it"),
    segments: z4.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z4.array(Id).min(1).max(40)
  }),
  z4.object({ ...base, kind: z4.literal("label_image"), image: QuizImageSchema, pins: z4.array(QuizPinSchema).min(2).max(8) }),
  z4.object({
    ...base,
    kind: z4.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z4.object({
    ...base,
    kind: z4.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z4.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z4.custom(
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
var QuizFeedbackSchema = z4.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z4.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z4.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z4.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z4.boolean().optional(),
  shuffle_questions: z4.boolean().optional(),
  shuffle_options: z4.boolean().optional(),
  attempts: z4.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z4.number().min(0).max(1).optional(),
  confidence: z4.boolean().optional(),
  closes_at: z4.string().datetime().optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z5 } from "zod";
var TkStepSchema = z5.object({
  id: z5.string().min(1),
  title: z5.string(),
  prompt: z5.string()
});
var TkRevealSchema = z5.object({
  id: z5.string().min(1),
  label: z5.string(),
  body: z5.string()
});
var TkTeacherNoteSchema = z5.object({
  what: z5.string().default(""),
  run: z5.array(z5.string()).default([]),
  say: z5.array(z5.string()).default([]),
  watch: z5.array(z5.string()).default([]),
  extra_label: z5.string().default(""),
  extra: z5.array(z5.string()).default([]),
  time: z5.string().default(""),
  source: z5.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z5.boolean().default(false)
});
var TkJotsSchema = z5.record(z5.string()).default({});
var TkItemListSchema = z5.array(z5.string().min(1)).default([]);
var ToolkitSkillContentSchema = z5.object({
  item: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  definition_source: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  context: z5.string().default(""),
  steps: z5.array(TkStepSchema).max(8),
  show_test: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  reveals: z5.array(TkRevealSchema).max(6).default([]),
  links: z5.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z5.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z5.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z5.preprocess(
  (value) => value === "level2" ? "none" : value,
  z5.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z5.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z5.object({
  kind: z5.string().default(""),
  marker: z5.string().default(""),
  a: z5.string().default(""),
  b: z5.string().default("")
});
var ToolkitToolContentSchema = z5.object({
  item: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  definition_source: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  frame: ToolFrameSchema,
  sentence: z5.string().default(""),
  steps: z5.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z5.string().default(""),
  converters: z5.array(z5.object({ id: z5.string().min(1), closed: z5.string(), open: z5.string() })).max(10).default([]),
  statements: z5.array(
    z5.object({
      id: z5.string().min(1),
      text: z5.string(),
      verdict: StressVerdictSchema,
      reason: z5.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z5.array(TkRevealSchema).max(6).default([]),
  links: z5.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z5.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z5.object({
  item: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  definition_source: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  claim: z5.string().default(""),
  options: z5.array(z5.object({ id: z5.string().min(1), text: z5.string() })).max(8).default([]),
  probes: z5.array(z5.object({ id: z5.string().min(1), question: z5.string(), asks: z5.string() })).max(8).default([]),
  instruction: z5.string().default(""),
  model: z5.object({ label: z5.string(), body: z5.string() }).default({ label: "", body: "" }),
  discussion: z5.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z5.object({
  id: z5.string().min(1),
  tool: z5.string().min(1),
  prompt: z5.string(),
  frame: z5.string(),
  example: z5.string()
});
var ThinkingMoveContentSchema = z5.object({
  skill: z5.string().min(1),
  tools: z5.array(z5.string().min(1)).min(1).max(5),
  value: z5.string().min(1),
  community: z5.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  stimulus: z5.string().default(""),
  steps: z5.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z5.array(z5.string()).max(8).default([]),
  why: z5.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z5.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z5.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z5.object({
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  stimulus: z5.string().default(""),
  procedure: z5.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z5.boolean().default(false),
  questions: z5.array(z5.object({ id: z5.string().min(1), text: z5.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z5.array(z5.object({ id: z5.string().min(1), closed: z5.string(), open: z5.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z5.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z5.object({
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  concepts: z5.array(
    z5.object({
      id: z5.string().min(1),
      label: z5.string(),
      central: z5.boolean(),
      contestable: z5.boolean(),
      common: z5.boolean()
    })
  ).max(8).default([]),
  analogy: z5.object({ stem: z5.string(), example: z5.string() }).default({ stem: "", example: "" }),
  game: z5.object({
    kind: ConceptGameKindSchema,
    left: z5.string(),
    middle: z5.string(),
    right: z5.string(),
    cards: z5.array(z5.object({ id: z5.string().min(1), text: z5.string(), prompt: z5.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z5.array(z5.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z5.object({
  content: z5.string().default(""),
  skills: z5.array(z5.string().min(1)).max(2).default([]),
  tools: z5.array(z5.string().min(1)).max(6).default([]),
  values: z5.array(z5.string().min(1)).max(4).default([]),
  community: z5.array(z5.string().min(1)).max(2).default([]),
  success: z5.array(z5.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z5.object({
  variant: z5.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  concept: z5.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z5.object({
  task: z5.string().default(""),
  steps: z5.array(TkStepSchema).max(6).default([]),
  example: z5.string().default("")
});
var FluidAnalogyContentSchema = z5.object({
  kind: z5.string().min(1),
  label: z5.string(),
  definition: z5.string(),
  /** The text, character or idea students work with. */
  focus: z5.string().default(""),
  /** The level students start at. */
  level: z5.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z5.boolean().default(true),
  tiers: z5.array(AnalogyTierSchema).length(3),
  show_check: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z5.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z5.object({
  key: z5.string().min(1),
  label: z5.string().default(""),
  frame: z5.string().default(""),
  example: z5.string().default("")
});
var AnalogyStageSchema = z5.object({
  task: z5.string().default(""),
  slots: z5.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z5.object({
  label: z5.string(),
  definition: z5.string(),
  /** The text, character or idea students work with. */
  focus: z5.string().default(""),
  /** The level students start at. */
  level: z5.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z5.boolean().default(true),
  levels: z5.array(AnalogyStageSchema).length(3),
  show_check: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z5.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z5.object({
  /** Student instruction shown at the top of the block. */
  guide: z5.string().default(""),
  focus: z5.string().default(""),
  /** Types marked "This lesson". */
  types: z5.array(z5.string().min(1)).max(7).default([]),
  show_contrast: z5.boolean().default(true),
  weak: z5.string().default(""),
  strong: z5.string().default(""),
  why: z5.string().default(""),
  process: z5.array(z5.string()).max(8).default([]),
  show_check: z5.boolean().default(true),
  checks: z5.array(z5.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z5.object({
  title: z5.string().default("Teacher note"),
  html: z5.string().default("")
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
var VisibilitySchema = z6.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z6.enum([
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
var ColumnPresetSchema = z6.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z6.enum(["small", "medium", "large"]);
var VideoProviderSchema = z6.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z6.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z6.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z6.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z6.enum([
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
var QuestionKindSchema = z6.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z6.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z6.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  layout: z6.record(z6.unknown()).default({}),
  print: z6.record(z6.unknown()).default({}),
  settings: z6.record(z6.unknown()).default({})
};
var RichTextBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("rich_text"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({ html: z6.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z6.object({ text: z6.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("callout"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    style: CalloutStyleSchema,
    title: z6.string().optional(),
    body: z6.string(),
    related_to: z6.object({
      block_id: z6.string().min(1),
      question_id: z6.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    alt_text: z6.string(),
    caption: z6.string().optional(),
    annotations: z6.array(
      z6.object({
        id: z6.string().min(1),
        body: z6.string().min(1),
        selector: z6.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z6.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z6.object({
  id: z6.string().min(1),
  url: z6.string(),
  alt_text: z6.string(),
  caption: z6.string().optional()
});
var GalleryBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    layout: GalleryLayoutSchema,
    items: z6.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z6.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    provider: VideoProviderSchema,
    external_id: z6.string(),
    url: z6.string().optional(),
    start_seconds: z6.number().int().positive().optional(),
    title: z6.string().optional(),
    caption: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("embed"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    title: z6.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("html"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({ html: z6.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z6.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z6.object({
  enabled: z6.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z6.string().min(1),
  system: z6.string(),
  max_tokens: z6.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("html_app"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    html: z6.string(),
    height_px: z6.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("quote"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    quote: z6.string(),
    attribution: z6.string().optional(),
    source: z6.string().optional(),
    reference: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z6.object({
  label: z6.string().max(60),
  minutes: z6.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z6.enum([
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
var DividerBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("divider"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z6.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z6.array(TimerSegmentSchema).max(8).default([])
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("classroom_tools"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    timer_stack: z6.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("countdown"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z6.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z6.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z6.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z6.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("definition"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    term: z6.string(),
    definition: z6.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("code"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    code: z6.string(),
    language: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("audio"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   */
  content: z6.object({
    url: z6.string(),
    title: z6.string().optional(),
    mode: z6.enum(["listen", "respond", "viva"]).default("listen"),
    prompt: z6.string().max(4e3).optional(),
    time_limit_s: z6.number().int().min(30).max(300).optional(),
    student_chooses_time: z6.boolean().optional(),
    scaffold: z6.array(z6.object({ label: z6.string().max(80), weight: z6.number().min(0.5).max(3).default(1) })).max(8).optional(),
    code_groups: z6.array(z6.enum(["composition", "viva", "speaking"])).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("attachment"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    url: z6.string(),
    title: z6.string(),
    filename: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z6.object({
  title: z6.string(),
  body: z6.string()
});
var AccordionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("accordion"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    items: z6.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("table"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    headers: z6.array(z6.string()),
    rows: z6.array(z6.array(z6.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z6.object({
  id: z6.string().min(1),
  prompt: z6.string(),
  kind: QuestionKindSchema,
  options: z6.array(z6.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
var PeerFeedbackBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("peer_feedback"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    prompt: z6.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z6.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z6.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z6.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("brainstorm"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    question: z6.string().max(500).default(""),
    safety: z6.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z6.union([z6.literal(0), z6.literal(1), z6.literal(3), z6.literal(5)]).default(3),
    max_length: z6.number().int().min(20).max(280).default(140),
    layout: z6.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z6.enum([
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
var CurriculumLinesLevelSchema = z6.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z6.object({
  id: z6.string().min(1).max(64),
  name: z6.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z6.object({
  id: z6.string().min(1).max(64),
  strand_id: z6.string().min(1).max(64),
  week: z6.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z6.string().max(120).default(""),
  lesson_id: z6.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z6.object({
  id: z6.string().min(1).max(64),
  week: z6.number().int().min(1).max(20),
  label: z6.string().max(80).default(""),
  lesson_id: z6.string().min(1).max(64).optional(),
  strand_ids: z6.array(z6.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z6.object({
  label: z6.string().max(80).default("Assessment task"),
  detail: z6.string().max(160).optional(),
  when: z6.string().max(24).optional(),
  lesson_id: z6.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z6.object({
  title: z6.string().max(120).optional(),
  weeks: z6.number().int().min(1).max(20).default(8),
  strands: z6.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z6.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z6.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var NetworkLineModeSchema = z6.enum(["train", "metro", "light_rail"]);
var NetworkLineSchema = z6.object({
  id: z6.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z6.string().max(60).default(""),
  short: z6.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave")
});
var LineStopSchema = z6.object({
  line_id: z6.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional()
});
var NetworkNudgesSchema = z6.record(
  z6.string().min(1).max(160),
  z6.object({ dx: z6.number().min(-2e3).max(2e3), dy: z6.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z6.object({
  id: z6.string().min(1).max(64),
  line_id: z6.string().min(1).max(64),
  after_lesson_id: z6.string().min(1).max(64).optional(),
  kind: z6.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z6.string().min(1).max(64).optional(),
  block_id: z6.string().min(1).max(120).optional(),
  label: z6.string().max(120).default("")
});
var CurriculumGateSchema = z6.object({
  id: z6.string().min(1).max(64),
  after_lesson_id: z6.string().min(1).max(64).optional(),
  label: z6.string().max(80).default(""),
  lesson_id: z6.string().min(1).max(64).optional(),
  line_ids: z6.array(z6.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z6.object({
  version: z6.literal(2),
  title: z6.string().max(120).optional(),
  rail_stops: z6.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z6.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z6.array(z6.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z6.array(z6.string().min(1).max(64)).max(200).optional(),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("curriculum_lines"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
function isCurriculumLinesV2(content) {
  return content.version === 2;
}
var QuestionDropBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("question_drop"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    target_quiz_id: z6.string().max(64).default(""),
    prompt: z6.string().max(500).default(""),
    kinds: z6.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z6.number().int().min(1).max(20).default(1),
    marks_max: z6.number().int().min(1).max(20).default(3),
    per_student: z6.number().int().min(1).max(5).default(1),
    accepting: z6.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("discern_confirm"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    target_block_id: z6.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("quiz_question"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z6.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("question_set"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    questions: z6.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z6.object({
  block_id: z6.string().min(1),
  annotation_id: z6.string().min(1),
  lesson_id: z6.string().optional(),
  kind: z6.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z6.string().min(1)
});
var FlashcardItemSchema = z6.object({
  id: z6.string().min(1),
  front: z6.string(),
  back: z6.string(),
  image_url: z6.string().optional(),
  image_alt: z6.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("flashcards"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    cards: z6.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z6.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("cloze"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    text: z6.string(),
    case_sensitive: z6.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z6.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z6.object({
  id: z6.string().min(1),
  label: z6.string()
});
var SelfCheckBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("self_check"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z6.string(),
    answer: z6.string().optional(),
    items: z6.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z6.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z6.object({
  x: z6.union([z6.string(), z6.number()]),
  y: z6.number()
});
var ChartSeriesColorSchema = z6.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z6.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("chart"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    chart_type: ChartTypeSchema,
    title: z6.string().optional(),
    x_label: z6.string().optional(),
    y_label: z6.string().optional(),
    series: z6.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("equation"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    latex: z6.string(),
    caption: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z6.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("diagram"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    source: DiagramSourceSchema,
    image_url: z6.string().optional(),
    image_alt: z6.string().optional(),
    svg_markup: z6.string().optional(),
    caption: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z6.object({
  id: z6.string().min(1),
  label: z6.string(),
  parent_id: z6.string().nullable().optional(),
  color: z6.string().optional(),
  x: z6.number().optional(),
  y: z6.number().optional()
});
var GraphBuildModeSchema = z6.enum(["outline", "canvas"]);
var GraphEdgeSchema = z6.object({
  id: z6.string().min(1),
  from: z6.string().min(1),
  to: z6.string().min(1),
  label: z6.string().optional()
});
var MindMapBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("mind_map"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    nodes: z6.array(GraphNodeSchema).min(1).max(24),
    edges: z6.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("concept_map"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    nodes: z6.array(GraphNodeSchema).min(1).max(24),
    edges: z6.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("whiteboard"),
  variant: z6.string().default("large"),
  visibility: VisibilitySchema,
  content: z6.object({
    document_id: z6.string().min(1),
    seed_document_id: z6.string().min(1).optional(),
    title: z6.string().optional(),
    height_px: z6.number().int().min(360).max(1400).default(640),
    published_snapshot: z6.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z6.object({
  id: z6.string().min(1),
  when: z6.string(),
  label: z6.string(),
  description: z6.string(),
  image_url: z6.string().optional(),
  image_alt: z6.string().optional(),
  link_url: z6.string().optional(),
  link_label: z6.string().optional()
});
var TimelineLayoutSchema = z6.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("timeline"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    layout: TimelineLayoutSchema.optional(),
    events: z6.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z6.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z6.object({
  id: z6.string().min(1),
  number: z6.string().optional(),
  eyebrow: z6.string(),
  title: z6.string(),
  description: z6.string(),
  image_url: z6.string().optional(),
  image_alt: z6.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("card_stack"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    cards: z6.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z6.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("collection"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    source: CollectionSourceSchema,
    title: z6.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z6.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("anthology"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("outcomes"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z6.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z6.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z6.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z6.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z6.enum(["left", "center", "right"]);
var AnnotationLineSchema = z6.object({
  id: z6.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z6.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z6.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z6.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z6.object({
  id: z6.string().min(1),
  lines: z6.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z6.object({
  kind: z6.enum(["verse", "prose"]),
  stanzas: z6.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string().min(1),
  subgroup: z6.string().optional()
});
var AnnotationLayerSchema = z6.object({
  id: z6.string().min(1),
  name: z6.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z6.string().optional(),
  sublayers: z6.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z6.object({
  exact: z6.string().min(1),
  prefix: z6.string().optional(),
  suffix: z6.string().optional()
});
var AnnotationAnchorSchema = z6.object({
  /** Required on every stop when the annotation is a thread. */
  id: z6.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z6.string().min(1),
  line: z6.string().optional(),
  start: z6.number().int().min(0).optional(),
  end: z6.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z6.string().optional()
});
var AnnotationTechniqueRefSchema = z6.object({
  id: z6.string().min(1),
  table_version: z6.string().min(1)
});
var AnnotationCodeRefSchema = z6.object({
  id: z6.string().min(1).max(40),
  code: z6.string().regex(/^[A-Z]{1,3}$/),
  label: z6.string().max(60),
  descriptor: z6.string().max(600).default(""),
  colour: z6.enum(["blue", "sage", "peach", "gold", "lilac"]).default("blue"),
  positive: z6.boolean().default(false)
});
var AnnotationAttachmentSchema = z6.discriminatedUnion("kind", [
  z6.object({
    kind: z6.literal("link"),
    url: z6.string(),
    label: z6.string().optional()
  }),
  z6.object({
    kind: z6.literal("video"),
    url: z6.string(),
    start_seconds: z6.number().int().min(0).optional()
  }),
  z6.object({
    kind: z6.literal("audio"),
    url: z6.string(),
    title: z6.string().optional()
  }),
  z6.object({
    kind: z6.literal("image"),
    url: z6.string(),
    alt_text: z6.string()
  }),
  z6.object({
    kind: z6.literal("block"),
    block_id: z6.string().min(1)
  })
]);
var AnthologyTagSchema = z6.object({
  include: z6.boolean(),
  themes: z6.array(z6.string().trim().max(40)).max(8).default([]),
  concepts: z6.array(z6.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z6.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z6.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z6.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z6.enum(["text", "custom"]).default("text"),
  anchor_order: z6.array(z6.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z6.object({
  w: z6.string(),
  start: z6.number(),
  end: z6.number()
});
var AnnotationVoiceClipSchema = z6.object({
  id: z6.string().min(1),
  start_s: z6.number(),
  end_s: z6.number(),
  word_range: z6.tuple([z6.number().int().min(0), z6.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z6.enum(["tap", "quote", "ai", "manual"]),
  confidence: z6.number().min(0).max(1),
  approved: z6.boolean(),
  transcript_text: z6.string()
});
var AnnotationVoiceTrackSchema = z6.object({
  id: z6.string().min(1),
  layer_id: z6.string().min(1),
  kind: z6.enum(["reading", "think_aloud", "feedback"]),
  title: z6.string().min(1),
  audio: z6.object({
    media_id: z6.string().optional(),
    url: z6.string().min(1),
    duration_s: z6.number().min(0),
    mime: z6.string().min(1)
  }),
  transcript: z6.object({
    words: z6.array(AnnotationVoiceWordSchema),
    timing: z6.enum(["word", "segment", "estimated"])
  }),
  taps: z6.array(
    z6.object({
      t: z6.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z6.array(AnnotationVoiceClipSchema).default([]),
  status: z6.enum(["draft", "published"]),
  extras: z6.array(
    z6.object({
      id: z6.string().min(1),
      kind: z6.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z6.string(),
      approved: z6.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z6.object({
  id: z6.string().min(1),
  layer_id: z6.string().min(1),
  sublayer_id: z6.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z6.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  code: AnnotationCodeRefSchema.optional(),
  body: z6.object({
    html: z6.string(),
    attachments: z6.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
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
      code: z6.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
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
      code: z6.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z6.object({
  show_markers: z6.boolean().default(true),
  default_layer_id: z6.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z6.union([z6.literal(0), z6.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z6.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("annotation"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string().optional(),
    attribution: z6.string().optional(),
    text: AnnotationTextSchema,
    layers: z6.array(AnnotationLayerSchema).default([]),
    annotations: z6.array(AnnotationItemSchema).default([]),
    voice_tracks: z6.array(AnnotationVoiceTrackSchema).optional(),
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
        code: z6.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z6.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z6.object({
    id: z6.string().min(1),
    type: z6.literal("block"),
    block_type: z6.literal(blockType),
    variant: z6.string().default("medium"),
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
var TeacherNoteBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("teacher_note"),
  variant: z6.string().default("medium"),
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
var SpacerBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("spacer"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z6.array(
  z6.object({
    width: z6.number().int().min(1).max(12),
    blocks: z6.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("columns"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("tabs"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    tabs: z6.array(
      z6.object({
        id: z6.string().min(1),
        label: z6.string(),
        blocks: z6.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z6.object({
  mode: z6.literal("linked"),
  source_composition_id: z6.string().min(1)
});
var SectionBlockObjectSchema = z6.object({
  id: z6.string().min(1),
  type: z6.literal("block"),
  block_type: z6.literal("section"),
  variant: z6.string().default("medium"),
  visibility: VisibilitySchema,
  content: z6.object({
    title: z6.string(),
    collapsed_in_editor: z6.boolean().optional(),
    blocks: z6.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z6.lazy(
  () => z6.discriminatedUnion("block_type", [
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
