// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z5 } from "zod";

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

// apps/teaching/src/quiz/core.ts
import { z as z3 } from "zod";
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
var QuizQuestionKindSchema = z3.enum(QUIZ_QUESTION_KINDS);
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
var Id = z3.string().min(1).max(64);
var Text = (max) => z3.string().trim().min(1).max(max);
var OptionalText = (max) => z3.string().trim().max(max).optional();
var QuizImageSchema = z3.object({
  url: z3.string().min(1).max(2e3),
  alt: z3.string().max(300).default("")
});
var QuizChoiceSchema = z3.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z3.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z3.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z3.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizPinSchema = z3.object({
  id: Id,
  x: z3.number().min(0).max(1),
  y: z3.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  prompt: z3.string().trim().max(QUIZ_LIMITS.prompt),
  marks: z3.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional()
};
var QuizQuestionSchema = z3.discriminatedUnion("kind", [
  z3.object({ ...base, kind: z3.literal("multiple_choice"), options: z3.array(QuizChoiceSchema).min(2).max(6), correct: z3.array(Id).length(1) }),
  z3.object({ ...base, kind: z3.literal("multi_select"), options: z3.array(QuizChoiceSchema).min(2).max(8), correct: z3.array(Id).min(1).max(8) }),
  z3.object({ ...base, kind: z3.literal("true_false"), answer: z3.boolean() }),
  z3.object({
    ...base,
    kind: z3.literal("short_answer"),
    accepted: z3.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z3.boolean().optional()
  }),
  z3.object({ ...base, kind: z3.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z3.boolean().optional() }),
  z3.object({ ...base, kind: z3.literal("odd_one_out"), options: z3.array(QuizChoiceSchema).min(3).max(6), correct: z3.array(Id).length(1) }),
  z3.object({ ...base, kind: z3.literal("matching"), pairs: z3.array(QuizPairSchema).min(2).max(8) }),
  z3.object({ ...base, kind: z3.literal("ordering"), items: z3.array(QuizChoiceSchema).min(3).max(8) }),
  z3.object({
    ...base,
    kind: z3.literal("categorise"),
    groups: z3.array(QuizGroupSchema).min(2).max(4),
    items: z3.array(QuizSortItemSchema).min(2).max(16)
  }),
  z3.object({
    ...base,
    kind: z3.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z3.array(QuizChoiceSchema.extend({ technique_id: z3.string().max(64).optional() })).min(2).max(6),
    correct: z3.array(Id).length(1)
  }),
  z3.object({
    ...base,
    kind: z3.literal("find_it"),
    segments: z3.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z3.array(Id).min(1).max(40)
  }),
  z3.object({ ...base, kind: z3.literal("label_image"), image: QuizImageSchema, pins: z3.array(QuizPinSchema).min(2).max(8) }),
  z3.object({
    ...base,
    kind: z3.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z3.object({
    ...base,
    kind: z3.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z3.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z3.custom(
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
var QuizFeedbackSchema = z3.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z3.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z3.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z3.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z3.boolean().optional(),
  shuffle_questions: z3.boolean().optional(),
  shuffle_options: z3.boolean().optional(),
  attempts: z3.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z3.number().min(0).max(1).optional(),
  confidence: z3.boolean().optional(),
  closes_at: z3.string().datetime().optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z4 } from "zod";
var TkStepSchema = z4.object({
  id: z4.string().min(1),
  title: z4.string(),
  prompt: z4.string()
});
var TkRevealSchema = z4.object({
  id: z4.string().min(1),
  label: z4.string(),
  body: z4.string()
});
var TkTeacherNoteSchema = z4.object({
  what: z4.string().default(""),
  run: z4.array(z4.string()).default([]),
  say: z4.array(z4.string()).default([]),
  watch: z4.array(z4.string()).default([]),
  extra_label: z4.string().default(""),
  extra: z4.array(z4.string()).default([]),
  time: z4.string().default(""),
  source: z4.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z4.boolean().default(false)
});
var TkJotsSchema = z4.record(z4.string()).default({});
var TkItemListSchema = z4.array(z4.string().min(1)).default([]);
var ToolkitSkillContentSchema = z4.object({
  item: z4.string().min(1),
  label: z4.string(),
  definition: z4.string(),
  definition_source: z4.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  context: z4.string().default(""),
  steps: z4.array(TkStepSchema).max(8),
  show_test: z4.boolean().default(true),
  checks: z4.array(z4.string()).max(8).default([]),
  reveals: z4.array(TkRevealSchema).max(6).default([]),
  links: z4.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z4.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z4.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z4.enum(["none", "level1", "level2", "level3", "maths", "inquiry"]);
var StressVerdictSchema = z4.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z4.object({
  kind: z4.string().default(""),
  marker: z4.string().default(""),
  a: z4.string().default(""),
  b: z4.string().default("")
});
var ToolkitToolContentSchema = z4.object({
  item: z4.string().min(1),
  label: z4.string(),
  definition: z4.string(),
  definition_source: z4.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  frame: ToolFrameSchema,
  sentence: z4.string().default(""),
  steps: z4.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z4.string().default(""),
  converters: z4.array(z4.object({ id: z4.string().min(1), closed: z4.string(), open: z4.string() })).max(10).default([]),
  statements: z4.array(
    z4.object({
      id: z4.string().min(1),
      text: z4.string(),
      verdict: StressVerdictSchema,
      reason: z4.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z4.array(TkRevealSchema).max(6).default([]),
  links: z4.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z4.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z4.object({
  item: z4.string().min(1),
  label: z4.string(),
  definition: z4.string(),
  definition_source: z4.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  claim: z4.string().default(""),
  options: z4.array(z4.object({ id: z4.string().min(1), text: z4.string() })).max(8).default([]),
  probes: z4.array(z4.object({ id: z4.string().min(1), question: z4.string(), asks: z4.string() })).max(8).default([]),
  instruction: z4.string().default(""),
  model: z4.object({ label: z4.string(), body: z4.string() }).default({ label: "", body: "" }),
  discussion: z4.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z4.object({
  id: z4.string().min(1),
  tool: z4.string().min(1),
  prompt: z4.string(),
  frame: z4.string(),
  example: z4.string()
});
var ThinkingMoveContentSchema = z4.object({
  skill: z4.string().min(1),
  tools: z4.array(z4.string().min(1)).min(1).max(5),
  value: z4.string().min(1),
  community: z4.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  stimulus: z4.string().default(""),
  steps: z4.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z4.array(z4.string()).max(8).default([]),
  why: z4.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z4.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z4.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z4.object({
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  stimulus: z4.string().default(""),
  procedure: z4.enum(["sort", "create"]).default("sort"),
  questions: z4.array(z4.object({ id: z4.string().min(1), text: z4.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z4.array(z4.object({ id: z4.string().min(1), closed: z4.string(), open: z4.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z4.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z4.object({
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  concepts: z4.array(
    z4.object({
      id: z4.string().min(1),
      label: z4.string(),
      central: z4.boolean(),
      contestable: z4.boolean(),
      common: z4.boolean()
    })
  ).max(8).default([]),
  analogy: z4.object({ stem: z4.string(), example: z4.string() }).default({ stem: "", example: "" }),
  game: z4.object({
    kind: ConceptGameKindSchema,
    left: z4.string(),
    middle: z4.string(),
    right: z4.string(),
    cards: z4.array(z4.object({ id: z4.string().min(1), text: z4.string(), prompt: z4.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z4.array(z4.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z4.object({
  content: z4.string().default(""),
  skills: z4.array(z4.string().min(1)).max(2).default([]),
  tools: z4.array(z4.string().min(1)).max(6).default([]),
  values: z4.array(z4.string().min(1)).max(4).default([]),
  community: z4.array(z4.string().min(1)).max(2).default([]),
  success: z4.array(z4.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z4.object({
  variant: z4.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  concept: z4.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z4.object({
  task: z4.string().default(""),
  steps: z4.array(TkStepSchema).max(6).default([]),
  example: z4.string().default("")
});
var FluidAnalogyContentSchema = z4.object({
  kind: z4.string().min(1),
  label: z4.string(),
  definition: z4.string(),
  /** The text, character or idea students work with. */
  focus: z4.string().default(""),
  /** The level students start at. */
  level: z4.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z4.boolean().default(true),
  tiers: z4.array(AnalogyTierSchema).length(3),
  show_check: z4.boolean().default(true),
  checks: z4.array(z4.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z4.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z4.object({
  key: z4.string().min(1),
  label: z4.string().default(""),
  frame: z4.string().default(""),
  example: z4.string().default("")
});
var AnalogyStageSchema = z4.object({
  task: z4.string().default(""),
  slots: z4.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z4.object({
  label: z4.string(),
  definition: z4.string(),
  /** The text, character or idea students work with. */
  focus: z4.string().default(""),
  /** The level students start at. */
  level: z4.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z4.boolean().default(true),
  levels: z4.array(AnalogyStageSchema).length(3),
  show_check: z4.boolean().default(true),
  checks: z4.array(z4.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z4.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z4.object({
  /** Student instruction shown at the top of the block. */
  guide: z4.string().default(""),
  focus: z4.string().default(""),
  /** Types marked "This lesson". */
  types: z4.array(z4.string().min(1)).max(7).default([]),
  show_contrast: z4.boolean().default(true),
  weak: z4.string().default(""),
  strong: z4.string().default(""),
  why: z4.string().default(""),
  process: z4.array(z4.string()).max(8).default([]),
  show_check: z4.boolean().default(true),
  checks: z4.array(z4.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z4.object({
  title: z4.string().default("Teacher note"),
  html: z4.string().default("")
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
var VisibilitySchema = z5.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z5.enum([
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
  "definition",
  "code",
  "audio",
  "attachment",
  "accordion",
  "table",
  "peer_feedback",
  "question_drop",
  "quiz_question",
  "question_set",
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
var ColumnPresetSchema = z5.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z5.enum(["small", "medium", "large"]);
var VideoProviderSchema = z5.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z5.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z5.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z5.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z5.enum([
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z5.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z5.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z5.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  layout: z5.record(z5.unknown()).default({}),
  print: z5.record(z5.unknown()).default({}),
  settings: z5.record(z5.unknown()).default({})
};
var RichTextBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("rich_text"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({ html: z5.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z5.object({ text: z5.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("callout"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    style: CalloutStyleSchema,
    title: z5.string().optional(),
    body: z5.string(),
    related_to: z5.object({
      block_id: z5.string().min(1),
      question_id: z5.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    url: z5.string(),
    alt_text: z5.string(),
    caption: z5.string().optional(),
    annotations: z5.array(
      z5.object({
        id: z5.string().min(1),
        body: z5.string().min(1),
        selector: z5.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z5.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z5.object({
  id: z5.string().min(1),
  url: z5.string(),
  alt_text: z5.string(),
  caption: z5.string().optional()
});
var GalleryBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    layout: GalleryLayoutSchema,
    items: z5.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z5.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    provider: VideoProviderSchema,
    external_id: z5.string(),
    url: z5.string().optional(),
    start_seconds: z5.number().int().positive().optional(),
    title: z5.string().optional(),
    caption: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("embed"),
  variant: z5.string().default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    url: z5.string(),
    title: z5.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("html"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({ html: z5.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z5.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z5.object({
  enabled: z5.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z5.string().min(1),
  system: z5.string(),
  max_tokens: z5.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("html_app"),
  variant: z5.string().default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    html: z5.string(),
    height_px: z5.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("quote"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    quote: z5.string(),
    attribution: z5.string().optional(),
    source: z5.string().optional(),
    reference: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DividerBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("divider"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("definition"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    term: z5.string(),
    definition: z5.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("code"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    code: z5.string(),
    language: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("audio"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    url: z5.string(),
    title: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("attachment"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    url: z5.string(),
    title: z5.string(),
    filename: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z5.object({
  title: z5.string(),
  body: z5.string()
});
var AccordionBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("accordion"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    items: z5.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("table"),
  variant: z5.string().default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    headers: z5.array(z5.string()),
    rows: z5.array(z5.array(z5.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z5.object({
  id: z5.string().min(1),
  prompt: z5.string(),
  kind: QuestionKindSchema,
  options: z5.array(z5.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
var PeerFeedbackBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("peer_feedback"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    prompt: z5.string().max(4e3),
    strength_prompt: z5.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z5.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionDropBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("question_drop"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    target_quiz_id: z5.string().max(64).default(""),
    prompt: z5.string().max(500).default(""),
    kinds: z5.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z5.number().int().min(1).max(20).default(1),
    marks_max: z5.number().int().min(1).max(20).default(3),
    per_student: z5.number().int().min(1).max(5).default(1),
    accepting: z5.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("quiz_question"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z5.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("question_set"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    questions: z5.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z5.object({
  block_id: z5.string().min(1),
  annotation_id: z5.string().min(1),
  lesson_id: z5.string().optional(),
  kind: z5.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z5.string().min(1)
});
var FlashcardItemSchema = z5.object({
  id: z5.string().min(1),
  front: z5.string(),
  back: z5.string(),
  image_url: z5.string().optional(),
  image_alt: z5.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("flashcards"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    cards: z5.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z5.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("cloze"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    text: z5.string(),
    case_sensitive: z5.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z5.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z5.object({
  id: z5.string().min(1),
  label: z5.string()
});
var SelfCheckBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("self_check"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z5.string(),
    answer: z5.string().optional(),
    items: z5.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z5.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z5.object({
  x: z5.union([z5.string(), z5.number()]),
  y: z5.number()
});
var ChartSeriesColorSchema = z5.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z5.object({
  id: z5.string().min(1),
  name: z5.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z5.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("chart"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    chart_type: ChartTypeSchema,
    title: z5.string().optional(),
    x_label: z5.string().optional(),
    y_label: z5.string().optional(),
    series: z5.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("equation"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    latex: z5.string(),
    caption: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z5.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("diagram"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    source: DiagramSourceSchema,
    image_url: z5.string().optional(),
    image_alt: z5.string().optional(),
    svg_markup: z5.string().optional(),
    caption: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z5.object({
  id: z5.string().min(1),
  label: z5.string(),
  parent_id: z5.string().nullable().optional(),
  color: z5.string().optional(),
  x: z5.number().optional(),
  y: z5.number().optional()
});
var GraphBuildModeSchema = z5.enum(["outline", "canvas"]);
var GraphEdgeSchema = z5.object({
  id: z5.string().min(1),
  from: z5.string().min(1),
  to: z5.string().min(1),
  label: z5.string().optional()
});
var MindMapBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("mind_map"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    nodes: z5.array(GraphNodeSchema).min(1).max(24),
    edges: z5.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("concept_map"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    nodes: z5.array(GraphNodeSchema).min(1).max(24),
    edges: z5.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("whiteboard"),
  variant: z5.string().default("large"),
  visibility: VisibilitySchema,
  content: z5.object({
    document_id: z5.string().min(1),
    seed_document_id: z5.string().min(1).optional(),
    title: z5.string().optional(),
    height_px: z5.number().int().min(360).max(1400).default(640),
    published_snapshot: z5.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z5.object({
  id: z5.string().min(1),
  when: z5.string(),
  label: z5.string(),
  description: z5.string(),
  image_url: z5.string().optional(),
  image_alt: z5.string().optional(),
  link_url: z5.string().optional(),
  link_label: z5.string().optional()
});
var TimelineLayoutSchema = z5.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("timeline"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    layout: TimelineLayoutSchema.optional(),
    events: z5.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z5.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z5.object({
  id: z5.string().min(1),
  number: z5.string().optional(),
  eyebrow: z5.string(),
  title: z5.string(),
  description: z5.string(),
  image_url: z5.string().optional(),
  image_alt: z5.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("card_stack"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    cards: z5.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z5.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("collection"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    source: CollectionSourceSchema,
    title: z5.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z5.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("anthology"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("outcomes"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z5.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z5.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z5.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z5.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z5.enum(["left", "center", "right"]);
var AnnotationLineSchema = z5.object({
  id: z5.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z5.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z5.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z5.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z5.object({
  id: z5.string().min(1),
  lines: z5.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z5.object({
  kind: z5.enum(["verse", "prose"]),
  stanzas: z5.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z5.object({
  id: z5.string().min(1),
  name: z5.string().min(1),
  subgroup: z5.string().optional()
});
var AnnotationLayerSchema = z5.object({
  id: z5.string().min(1),
  name: z5.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z5.string().optional(),
  sublayers: z5.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z5.object({
  exact: z5.string().min(1),
  prefix: z5.string().optional(),
  suffix: z5.string().optional()
});
var AnnotationAnchorSchema = z5.object({
  /** Required on every stop when the annotation is a thread. */
  id: z5.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z5.string().min(1),
  line: z5.string().optional(),
  start: z5.number().int().min(0).optional(),
  end: z5.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z5.string().optional()
});
var AnnotationTechniqueRefSchema = z5.object({
  id: z5.string().min(1),
  table_version: z5.string().min(1)
});
var AnnotationAttachmentSchema = z5.discriminatedUnion("kind", [
  z5.object({
    kind: z5.literal("link"),
    url: z5.string(),
    label: z5.string().optional()
  }),
  z5.object({
    kind: z5.literal("video"),
    url: z5.string(),
    start_seconds: z5.number().int().min(0).optional()
  }),
  z5.object({
    kind: z5.literal("audio"),
    url: z5.string(),
    title: z5.string().optional()
  }),
  z5.object({
    kind: z5.literal("image"),
    url: z5.string(),
    alt_text: z5.string()
  }),
  z5.object({
    kind: z5.literal("block"),
    block_id: z5.string().min(1)
  })
]);
var AnthologyTagSchema = z5.object({
  include: z5.boolean(),
  themes: z5.array(z5.string().trim().max(40)).max(8).default([]),
  concepts: z5.array(z5.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z5.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z5.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z5.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z5.enum(["text", "custom"]).default("text"),
  anchor_order: z5.array(z5.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z5.object({
  w: z5.string(),
  start: z5.number(),
  end: z5.number()
});
var AnnotationVoiceClipSchema = z5.object({
  id: z5.string().min(1),
  start_s: z5.number(),
  end_s: z5.number(),
  word_range: z5.tuple([z5.number().int().min(0), z5.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z5.enum(["tap", "quote", "ai", "manual"]),
  confidence: z5.number().min(0).max(1),
  approved: z5.boolean(),
  transcript_text: z5.string()
});
var AnnotationVoiceTrackSchema = z5.object({
  id: z5.string().min(1),
  layer_id: z5.string().min(1),
  kind: z5.enum(["reading", "think_aloud", "feedback"]),
  title: z5.string().min(1),
  audio: z5.object({
    media_id: z5.string().optional(),
    url: z5.string().min(1),
    duration_s: z5.number().min(0),
    mime: z5.string().min(1)
  }),
  transcript: z5.object({
    words: z5.array(AnnotationVoiceWordSchema),
    timing: z5.enum(["word", "segment", "estimated"])
  }),
  taps: z5.array(
    z5.object({
      t: z5.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z5.array(AnnotationVoiceClipSchema).default([]),
  status: z5.enum(["draft", "published"]),
  extras: z5.array(
    z5.object({
      id: z5.string().min(1),
      kind: z5.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z5.string(),
      approved: z5.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z5.object({
  id: z5.string().min(1),
  layer_id: z5.string().min(1),
  sublayer_id: z5.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z5.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  body: z5.object({
    html: z5.string(),
    attachments: z5.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z5.ZodIssueCode.custom,
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
      code: z5.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z5.ZodIssueCode.custom,
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
      code: z5.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z5.object({
  show_markers: z5.boolean().default(true),
  default_layer_id: z5.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z5.union([z5.literal(0), z5.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z5.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("annotation"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string().optional(),
    attribution: z5.string().optional(),
    text: AnnotationTextSchema,
    layers: z5.array(AnnotationLayerSchema).default([]),
    annotations: z5.array(AnnotationItemSchema).default([]),
    voice_tracks: z5.array(AnnotationVoiceTrackSchema).optional(),
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
        code: z5.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z5.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z5.object({
    id: z5.string().min(1),
    type: z5.literal("block"),
    block_type: z5.literal(blockType),
    variant: z5.string().default("medium"),
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
var TeacherNoteBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("teacher_note"),
  variant: z5.string().default("medium"),
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
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  PeerFeedbackBlockSchema,
  QuestionDropBlockSchema,
  QuizQuestionBlockSchema,
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
var SpacerBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("spacer"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z5.lazy(
  () => z5.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z5.array(
  z5.object({
    width: z5.number().int().min(1).max(12),
    blocks: z5.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z5.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("columns"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z5.lazy(
  () => z5.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("tabs"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    tabs: z5.array(
      z5.object({
        id: z5.string().min(1),
        label: z5.string(),
        blocks: z5.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z5.lazy(
  () => z5.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z5.object({
  mode: z5.literal("linked"),
  source_composition_id: z5.string().min(1)
});
var SectionBlockObjectSchema = z5.object({
  id: z5.string().min(1),
  type: z5.literal("block"),
  block_type: z5.literal("section"),
  variant: z5.string().default("medium"),
  visibility: VisibilitySchema,
  content: z5.object({
    title: z5.string(),
    collapsed_in_editor: z5.boolean().optional(),
    blocks: z5.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z5.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z5.lazy(
  () => z5.discriminatedUnion("block_type", [
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
  ClozeBlockSchema,
  CodeBlockSchema,
  CollectionBlockSchema,
  CollectionSourceSchema,
  ColumnChildBlockSchema,
  ColumnPresetSchema,
  ColumnsBlockSchema,
  ConceptFeaturesBlockSchema,
  ConceptMapBlockSchema,
  DIAGRAM_IMAGE_PUBLISH_URL_ISSUE,
  DefinitionBlockSchema,
  DiagramBlockSchema,
  DiagramSourceSchema,
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
  MediaSizeVariantSchema,
  MindMapBlockSchema,
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
  ToolkitSkillBlockSchema,
  ToolkitToolBlockSchema,
  ToolkitValueBlockSchema,
  VideoBlockSchema,
  VideoProviderSchema,
  VisibilitySchema,
  WhiteboardBlockSchema,
  refineAnnotationVoiceTracks
};
