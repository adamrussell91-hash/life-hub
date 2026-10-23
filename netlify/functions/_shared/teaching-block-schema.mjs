// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z9 } from "zod";

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

// apps/teaching/src/quiz/core.ts
import { z as z7 } from "zod";
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
var QuizQuestionKindSchema = z7.enum(QUIZ_QUESTION_KINDS);
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
var Id = z7.string().min(1).max(64);
var Text = (max) => z7.string().trim().min(1).max(max);
var OptionalText = (max) => z7.string().trim().max(max).optional();
var QuizImageSchema = z7.object({
  url: z7.string().min(1).max(2e3),
  alt: z7.string().max(300).default("")
});
var QuizChoiceSchema = z7.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z7.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z7.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z7.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z7.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z7.array(Id).min(1).max(10)
});
var QuizPinSchema = z7.object({
  id: Id,
  x: z7.number().min(0).max(1),
  y: z7.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z7.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z7.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z7.array(z7.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z7.array(z7.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/, "Pick a skill from the list.")).max(8).optional()
};
var QuizQuestionSchema = z7.discriminatedUnion("kind", [
  z7.object({ ...base, kind: z7.literal("multiple_choice"), options: z7.array(QuizChoiceSchema).min(2).max(6), correct: z7.array(Id).length(1) }),
  z7.object({ ...base, kind: z7.literal("multi_select"), options: z7.array(QuizChoiceSchema).min(2).max(8), correct: z7.array(Id).min(1).max(8) }),
  z7.object({ ...base, kind: z7.literal("true_false"), answer: z7.boolean() }),
  z7.object({
    ...base,
    kind: z7.literal("short_answer"),
    accepted: z7.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z7.boolean().optional()
  }),
  z7.object({ ...base, kind: z7.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z7.boolean().optional() }),
  z7.object({ ...base, kind: z7.literal("odd_one_out"), options: z7.array(QuizChoiceSchema).min(3).max(6), correct: z7.array(Id).length(1) }),
  z7.object({ ...base, kind: z7.literal("matching"), pairs: z7.array(QuizPairSchema).min(2).max(8) }),
  z7.object({ ...base, kind: z7.literal("ordering"), items: z7.array(QuizChoiceSchema).min(3).max(8) }),
  z7.object({
    ...base,
    kind: z7.literal("categorise"),
    groups: z7.array(QuizGroupSchema).min(2).max(4),
    items: z7.array(QuizSortItemSchema).min(2).max(16)
  }),
  z7.object({
    ...base,
    kind: z7.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z7.array(QuizChoiceSchema.extend({ technique_id: z7.string().max(64).optional() })).min(2).max(6),
    correct: z7.array(Id).length(1)
  }),
  z7.object({
    ...base,
    kind: z7.literal("find_it"),
    segments: z7.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z7.array(Id).min(1).max(40)
  }),
  z7.object({
    ...base,
    kind: z7.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z7.array(
      QuizChoiceSchema.extend({
        technique_id: z7.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z7.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z7.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z7.number().int().min(1).max(12).optional()
  }),
  z7.object({ ...base, kind: z7.literal("label_image"), image: QuizImageSchema, pins: z7.array(QuizPinSchema).min(2).max(8) }),
  z7.object({
    ...base,
    kind: z7.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z7.object({
    ...base,
    kind: z7.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z7.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z7.custom(
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
var QuizFeedbackSchema = z7.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z7.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z7.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z7.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z7.boolean().optional(),
  shuffle_questions: z7.boolean().optional(),
  shuffle_options: z7.boolean().optional(),
  attempts: z7.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z7.number().min(0).max(1).optional(),
  confidence: z7.boolean().optional(),
  closes_at: z7.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z7.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z7.array(z7.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z7.string().max(64).optional(),
  follow_up_flag: z7.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z7.string().max(64).optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/schemas/toolkit.ts
import { z as z8 } from "zod";
var TkStepSchema = z8.object({
  id: z8.string().min(1),
  title: z8.string(),
  prompt: z8.string()
});
var TkRevealSchema = z8.object({
  id: z8.string().min(1),
  label: z8.string(),
  body: z8.string()
});
var TkTeacherNoteSchema = z8.object({
  what: z8.string().default(""),
  run: z8.array(z8.string()).default([]),
  say: z8.array(z8.string()).default([]),
  watch: z8.array(z8.string()).default([]),
  extra_label: z8.string().default(""),
  extra: z8.array(z8.string()).default([]),
  time: z8.string().default(""),
  source: z8.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z8.boolean().default(false)
});
var TkJotsSchema = z8.record(z8.string()).default({});
var TkItemListSchema = z8.array(z8.string().min(1)).default([]);
var ToolkitSkillContentSchema = z8.object({
  item: z8.string().min(1),
  label: z8.string(),
  definition: z8.string(),
  definition_source: z8.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  context: z8.string().default(""),
  steps: z8.array(TkStepSchema).max(8),
  show_test: z8.boolean().default(true),
  checks: z8.array(z8.string()).max(8).default([]),
  reveals: z8.array(TkRevealSchema).max(6).default([]),
  links: z8.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z8.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z8.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z8.preprocess(
  (value) => value === "level2" ? "none" : value,
  z8.enum(["none", "level1", "level3", "maths", "inquiry"])
);
var StressVerdictSchema = z8.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z8.object({
  kind: z8.string().default(""),
  marker: z8.string().default(""),
  a: z8.string().default(""),
  b: z8.string().default("")
});
var ToolkitToolContentSchema = z8.object({
  item: z8.string().min(1),
  label: z8.string(),
  definition: z8.string(),
  definition_source: z8.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  frame: ToolFrameSchema,
  sentence: z8.string().default(""),
  steps: z8.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z8.string().default(""),
  converters: z8.array(z8.object({ id: z8.string().min(1), closed: z8.string(), open: z8.string() })).max(10).default([]),
  statements: z8.array(
    z8.object({
      id: z8.string().min(1),
      text: z8.string(),
      verdict: StressVerdictSchema,
      reason: z8.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z8.array(TkRevealSchema).max(6).default([]),
  links: z8.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z8.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z8.object({
  item: z8.string().min(1),
  label: z8.string(),
  definition: z8.string(),
  definition_source: z8.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  claim: z8.string().default(""),
  options: z8.array(z8.object({ id: z8.string().min(1), text: z8.string() })).max(8).default([]),
  probes: z8.array(z8.object({ id: z8.string().min(1), question: z8.string(), asks: z8.string() })).max(8).default([]),
  instruction: z8.string().default(""),
  model: z8.object({ label: z8.string(), body: z8.string() }).default({ label: "", body: "" }),
  discussion: z8.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z8.object({
  id: z8.string().min(1),
  tool: z8.string().min(1),
  prompt: z8.string(),
  frame: z8.string(),
  example: z8.string()
});
var ThinkingMoveContentSchema = z8.object({
  skill: z8.string().min(1),
  tools: z8.array(z8.string().min(1)).min(1).max(5),
  value: z8.string().min(1),
  community: z8.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  stimulus: z8.string().default(""),
  steps: z8.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z8.array(z8.string()).max(8).default([]),
  why: z8.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z8.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z8.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z8.object({
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  stimulus: z8.string().default(""),
  procedure: z8.enum(["sort", "create"]).default("sort"),
  /** Students send their own questions and place them on the quadrant (live, published lesson). */
  collect_questions: z8.boolean().default(false),
  questions: z8.array(z8.object({ id: z8.string().min(1), text: z8.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z8.array(z8.object({ id: z8.string().min(1), closed: z8.string(), open: z8.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z8.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z8.object({
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  concepts: z8.array(
    z8.object({
      id: z8.string().min(1),
      label: z8.string(),
      central: z8.boolean(),
      contestable: z8.boolean(),
      common: z8.boolean()
    })
  ).max(8).default([]),
  analogy: z8.object({ stem: z8.string(), example: z8.string() }).default({ stem: "", example: "" }),
  game: z8.object({
    kind: ConceptGameKindSchema,
    left: z8.string(),
    middle: z8.string(),
    right: z8.string(),
    cards: z8.array(z8.object({ id: z8.string().min(1), text: z8.string(), prompt: z8.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z8.array(z8.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z8.object({
  content: z8.string().default(""),
  skills: z8.array(z8.string().min(1)).max(2).default([]),
  tools: z8.array(z8.string().min(1)).max(6).default([]),
  values: z8.array(z8.string().min(1)).max(4).default([]),
  community: z8.array(z8.string().min(1)).max(2).default([]),
  success: z8.array(z8.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z8.object({
  variant: z8.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  concept: z8.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z8.object({
  task: z8.string().default(""),
  steps: z8.array(TkStepSchema).max(6).default([]),
  example: z8.string().default("")
});
var FluidAnalogyContentSchema = z8.object({
  kind: z8.string().min(1),
  label: z8.string(),
  definition: z8.string(),
  /** The text, character or idea students work with. */
  focus: z8.string().default(""),
  /** The level students start at. */
  level: z8.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z8.boolean().default(true),
  tiers: z8.array(AnalogyTierSchema).length(3),
  show_check: z8.boolean().default(true),
  checks: z8.array(z8.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z8.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogySlotSchema = z8.object({
  key: z8.string().min(1),
  label: z8.string().default(""),
  frame: z8.string().default(""),
  example: z8.string().default("")
});
var AnalogyStageSchema = z8.object({
  task: z8.string().default(""),
  slots: z8.array(AnalogySlotSchema).max(12).default([])
});
var AnalogyMoveContentSchema = z8.object({
  label: z8.string(),
  definition: z8.string(),
  /** The text, character or idea students work with. */
  focus: z8.string().default(""),
  /** The level students start at. */
  level: z8.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z8.boolean().default(true),
  levels: z8.array(AnalogyStageSchema).length(3),
  show_check: z8.boolean().default(true),
  checks: z8.array(z8.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z8.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z8.object({
  /** Student instruction shown at the top of the block. */
  guide: z8.string().default(""),
  focus: z8.string().default(""),
  /** Types marked "This lesson". */
  types: z8.array(z8.string().min(1)).max(7).default([]),
  show_contrast: z8.boolean().default(true),
  weak: z8.string().default(""),
  strong: z8.string().default(""),
  why: z8.string().default(""),
  process: z8.array(z8.string()).max(8).default([]),
  show_check: z8.boolean().default(true),
  checks: z8.array(z8.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z8.object({
  title: z8.string().default("Teacher note"),
  html: z8.string().default("")
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
var VisibilitySchema = z9.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z9.enum([
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
var ColumnPresetSchema = z9.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z9.enum(["small", "medium", "large"]);
var VideoProviderSchema = z9.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z9.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z9.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z9.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z9.enum([
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
var QuestionKindSchema = z9.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z9.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z9.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
  layout: z9.record(z9.unknown()).default({}),
  print: z9.record(z9.unknown()).default({}),
  settings: z9.record(z9.unknown()).default({})
};
var RichTextBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("rich_text"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({ html: z9.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var NarrationSchema = z9.object({
  url: z9.string().min(1),
  duration_s: z9.number().min(0).max(900),
  transcript: z9.string().max(8e3).optional()
});
var RevealSchema = z9.enum(["all", "one"]);
var HeadingBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z9.object({
    text: z9.string(),
    narration: NarrationSchema.optional(),
    /** Lecture: what the teacher plans to say, e.g. imported speaker notes. Teacher-only. */
    script: z9.string().max(8e3).optional(),
    reveal: RevealSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("callout"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    style: CalloutStyleSchema,
    title: z9.string().optional(),
    body: z9.string(),
    related_to: z9.object({
      block_id: z9.string().min(1),
      question_id: z9.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    url: z9.string(),
    alt_text: z9.string(),
    caption: z9.string().optional(),
    annotations: z9.array(
      z9.object({
        id: z9.string().min(1),
        body: z9.string().min(1),
        selector: z9.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z9.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z9.object({
  id: z9.string().min(1),
  url: z9.string(),
  alt_text: z9.string(),
  caption: z9.string().optional()
});
var GalleryBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    layout: GalleryLayoutSchema,
    items: z9.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z9.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    provider: VideoProviderSchema,
    external_id: z9.string(),
    url: z9.string().optional(),
    start_seconds: z9.number().int().positive().optional(),
    title: z9.string().optional(),
    caption: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("embed"),
  variant: z9.string().default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    url: z9.string(),
    title: z9.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("html"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({ html: z9.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z9.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z9.object({
  enabled: z9.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z9.string().min(1),
  system: z9.string(),
  max_tokens: z9.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("html_app"),
  variant: z9.string().default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    html: z9.string(),
    height_px: z9.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("quote"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    quote: z9.string(),
    attribution: z9.string().optional(),
    source: z9.string().optional(),
    reference: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimerSegmentSchema = z9.object({
  label: z9.string().max(60),
  minutes: z9.number().min(0.25).max(180)
});
var ClassroomToolIdSchema = z9.enum([
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
var DividerBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("divider"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    /** The faint gear at the end of the rule that slides out the classroom tools. */
    tools: z9.boolean().default(true),
    /** Timers saved with the lesson, ready when it opens. */
    timer_stack: z9.array(TimerSegmentSchema).max(8).default([])
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var ClassroomToolsBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("classroom_tools"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    timer_stack: z9.array(TimerSegmentSchema).max(8).default([]),
    /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
    start_tool: ClassroomToolIdSchema.optional()
  }).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var CountdownBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("countdown"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().max(200).default(""),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z9.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z9.string().regex(/^(\d{2}:\d{2})?$/).default(""),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z9.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
    note: z9.string().max(400).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("definition"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    term: z9.string(),
    definition: z9.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("code"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    code: z9.string(),
    language: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("audio"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   */
  content: z9.object({
    url: z9.string(),
    title: z9.string().optional(),
    mode: z9.enum(["listen", "respond", "viva"]).default("listen"),
    prompt: z9.string().max(4e3).optional(),
    time_limit_s: z9.number().int().min(30).max(300).optional(),
    student_chooses_time: z9.boolean().optional(),
    scaffold: z9.array(z9.object({ label: z9.string().max(80), weight: z9.number().min(0.5).max(3).default(1) })).max(8).optional(),
    code_groups: z9.array(z9.enum(["composition", "viva", "speaking"])).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("attachment"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    url: z9.string(),
    title: z9.string(),
    filename: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z9.object({
  title: z9.string(),
  body: z9.string()
});
var AccordionBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("accordion"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    items: z9.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("table"),
  variant: z9.string().default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    headers: z9.array(z9.string()),
    rows: z9.array(z9.array(z9.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z9.object({
  id: z9.string().min(1),
  prompt: z9.string(),
  kind: QuestionKindSchema,
  options: z9.array(z9.string()).optional(),
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z9.enum(["beginner", "detective", "judge", "inventor"]).optional(),
  /** Reasoning chart format: which logic this question walks. Absent means Student's choice. */
  logic: LogicSchema.optional()
});
var PeerFeedbackBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("peer_feedback"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    prompt: z9.string().max(4e3),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z9.enum(["comments", "annotate"]).default("comments"),
    strength_prompt: z9.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z9.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ContinuumStatementSchema = z9.object({
  id: z9.string().min(1),
  text: z9.string().max(300).default(""),
  snap: z9.boolean().default(false)
});
var ContinuumLineBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("continuum_line"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    stimulus: z9.object({
      kind: z9.enum(["text", "image", "video"]).default("text"),
      text: z9.string().max(2e3).default(""),
      url: z9.string().max(2e3).default(""),
      alt_text: z9.string().max(500).default("")
    }).default({ kind: "text", text: "", url: "", alt_text: "" }),
    scale: z9.object({
      left: z9.string().max(40).default("Implied"),
      right: z9.string().max(40).default("Not implied"),
      stops: z9.array(z9.string().max(40)).max(3).default([])
    }).default({ left: "Implied", right: "Not implied", stops: [] }),
    statements: z9.array(ContinuumStatementSchema).max(10).default([]),
    pace: z9.enum(["teacher", "student"]).default("teacher"),
    replace: z9.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var BrainstormBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("brainstorm"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    question: z9.string().max(500).default(""),
    safety: z9.enum(["instant", "approve", "reveal"]).default("approve"),
    per_student: z9.union([z9.literal(0), z9.literal(1), z9.literal(3), z9.literal(5)]).default(3),
    max_length: z9.number().int().min(20).max(280).default(140),
    layout: z9.enum(["grid", "cloud", "groups"]).default("grid")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HingeOptionSchema = z9.object({
  id: z9.string().min(1).max(40),
  text: z9.string().max(300).default(""),
  misconception: z9.string().max(300).default("")
});
var HingeBackupSchema = z9.object({
  prompt: z9.string().max(500).default(""),
  options: z9.array(HingeOptionSchema).max(5).default([]),
  correct_id: z9.string().max(40).default(""),
  source: z9.enum(["teacher", "ann"]).default("teacher")
});
var HingeQuestionBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("hinge_question"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    prompt: z9.string().max(500).default(""),
    options: z9.array(HingeOptionSchema).max(5).default([]),
    correct_id: z9.string().max(40).default(""),
    seconds: z9.union([z9.literal(0), z9.literal(30), z9.literal(60), z9.literal(90), z9.literal(120)]).default(60),
    move_on: z9.number().int().min(1).max(100).default(80),
    reteach: z9.number().int().min(0).max(99).default(50),
    /** A parallel question for the re-check after re-teaching. Teacher-written, or drafted by Ann in focus view. */
    backup: HingeBackupSchema.optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z9.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CurriculumLinesColourSchema = z9.enum([
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
var CurriculumLinesLevelSchema = z9.enum(["introduced", "reinforced", "mastered"]);
var CurriculumLinesStrandSchema = z9.object({
  id: z9.string().min(1).max(64),
  name: z9.string().max(60).default(""),
  colour: CurriculumLinesColourSchema.default("wave")
});
var CurriculumLinesStationSchema = z9.object({
  id: z9.string().min(1).max(64),
  strand_id: z9.string().min(1).max(64),
  week: z9.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default("reinforced"),
  label: z9.string().max(120).default(""),
  lesson_id: z9.string().min(1).max(64).optional()
});
var CurriculumLinesCheckpointSchema = z9.object({
  id: z9.string().min(1).max(64),
  week: z9.number().int().min(1).max(20),
  label: z9.string().max(80).default(""),
  lesson_id: z9.string().min(1).max(64).optional(),
  strand_ids: z9.array(z9.string().min(1).max(64)).min(1).max(8)
});
var CurriculumLinesTerminusSchema = z9.object({
  label: z9.string().max(80).default("Assessment task"),
  detail: z9.string().max(160).optional(),
  when: z9.string().max(24).optional(),
  lesson_id: z9.string().min(1).max(64).optional()
});
var CurriculumLinesV1ContentSchema = z9.object({
  title: z9.string().max(120).optional(),
  weeks: z9.number().int().min(1).max(20).default(8),
  strands: z9.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z9.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z9.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var NetworkLineModeSchema = z9.enum(["train", "metro", "light_rail"]);
var LineAlignmentSchema = z9.discriminatedUnion("kind", [
  z9.object({ kind: z9.literal("points"), group: z9.enum(["U", "R"]) }),
  z9.object({ kind: z9.literal("concept"), key: z9.string().regex(/^[A-Z]{2,5}$/) }),
  z9.object({ kind: z9.literal("strand"), strand: z9.enum(SKILL_STRANDS) })
]);
var DotPointRefSchema = z9.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/);
var NetworkLineSchema = z9.object({
  id: z9.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z9.string().max(60).default(""),
  short: z9.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default("wave"),
  alignment: LineAlignmentSchema.optional()
});
var LessonKindSchema = z9.enum(["lesson", "workshop", "lecture"]);
var AfterLessonIdsSchema = z9.array(z9.string().min(1).max(64)).max(6);
var LessonRouteRoleSchema = z9.enum(["support", "extension"]);
var LessonSkipRuleSchema = z9.string().trim().max(80);
var LineStopSchema = z9.object({
  line_id: z9.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional(),
  /** Set from the lesson's dot points; it follows them until the teacher takes it off. */
  auto: z9.literal(true).optional()
});
var LineOffSchema = z9.array(z9.string().min(1).max(64)).max(24);
var NetworkNudgesSchema = z9.record(
  z9.string().min(1).max(160),
  z9.object({ dx: z9.number().min(-2e3).max(2e3), dy: z9.number().min(-2e3).max(2e3) })
).refine((value) => Object.keys(value).length <= 120, { message: "At most 120 nudges" });
var CurriculumRailStopSchema = z9.object({
  id: z9.string().min(1).max(64),
  line_id: z9.string().min(1).max(64),
  after_lesson_id: z9.string().min(1).max(64).optional(),
  kind: z9.enum(["stop", "extension", "support"]).default("stop"),
  lesson_id: z9.string().min(1).max(64).optional(),
  block_id: z9.string().min(1).max(120).optional(),
  label: z9.string().max(120).default(""),
  /** Who may take the straight track past a support stop, e.g. "90%+ on the techniques quiz". */
  skip_rule: z9.string().max(80).optional()
});
var CurriculumGateSchema = z9.object({
  id: z9.string().min(1).max(64),
  after_lesson_id: z9.string().min(1).max(64).optional(),
  label: z9.string().max(80).default(""),
  lesson_id: z9.string().min(1).max(64).optional(),
  line_ids: z9.array(z9.string().min(1).max(64)).max(24).default([])
});
var CurriculumLinesV2ContentSchema = z9.object({
  version: z9.literal(2),
  title: z9.string().max(120).optional(),
  rail_stops: z9.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z9.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z9.array(z9.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z9.array(z9.string().min(1).max(64)).max(200).optional(),
  /** The syllabus focus area this unit covers; unset is worked out from the unit's title. */
  focus_area: z9.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  terminus: CurriculumLinesTerminusSchema.default({ label: "Assessment task" })
});
var CurriculumLinesBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("curriculum_lines"),
  variant: z9.string().default("large"),
  visibility: VisibilitySchema,
  content: z9.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout,
  ...blockTimestamps
});
function isCurriculumLinesV2(content) {
  return content.version === 2;
}
var QuestionDropBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("question_drop"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    target_quiz_id: z9.string().max(64).default(""),
    prompt: z9.string().max(500).default(""),
    kinds: z9.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z9.number().int().min(1).max(20).default(1),
    marks_max: z9.number().int().min(1).max(20).default(3),
    per_student: z9.number().int().min(1).max(5).default(1),
    accepting: z9.boolean().default(true)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiscernConfirmBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("discern_confirm"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    target_block_id: z9.string().max(120).default("")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuizQuestionBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("quiz_question"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z9.string().max(200).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("question_set"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    questions: z9.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z9.enum(["standard", "human_experience_table", "anchor_bridge", "question_levels", "because_but_so", "reasoning_chart"]).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z9.object({
      rows: z9.number().int().min(3).max(5).default(3),
      example: z9.boolean().default(true)
    }).optional(),
    /** Reasoning chart settings, kept when switching format away and back. */
    reasoning: z9.object({
      level: LensLevelSchema.default("core"),
      student_level: z9.boolean().default(true)
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z9.object({
  block_id: z9.string().min(1),
  annotation_id: z9.string().min(1),
  lesson_id: z9.string().optional(),
  kind: z9.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z9.string().min(1)
});
var FlashcardItemSchema = z9.object({
  id: z9.string().min(1),
  front: z9.string(),
  back: z9.string(),
  image_url: z9.string().optional(),
  image_alt: z9.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("flashcards"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    cards: z9.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z9.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("cloze"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    text: z9.string(),
    case_sensitive: z9.boolean().optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z9.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z9.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z9.object({
  id: z9.string().min(1),
  label: z9.string()
});
var SelfCheckBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("self_check"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z9.string(),
    answer: z9.string().optional(),
    items: z9.array(SelfCheckItemSchema).max(12).optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z9.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var NOTE_CUE_KINDS = ["copy", "own_words", "draw", "question"];
var NoteCueKindSchema = z9.enum(NOTE_CUE_KINDS);
var NoteCueBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("note_cue"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    kind: NoteCueKindSchema,
    prompt: z9.string().max(500)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WithTeacherBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("with_teacher"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    talking_points: z9.array(z9.string().max(300)).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FadedExampleBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("faded_example"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    prompt: z9.string().max(300),
    extract: z9.string().max(2e3),
    parts: z9.array(z9.object({ label: z9.string().min(1).max(40), answer: z9.string().max(600) })).min(1).max(4),
    blanks: z9.array(z9.number().int().min(0).max(3)).max(4),
    /** A step with blanks is a gate unless switched off. */
    gate: z9.boolean().optional()
  }).refine((c) => c.blanks.every((i) => i < c.parts.length) && new Set(c.blanks).size === c.blanks.length, {
    message: "Each blank must name a different part of the example.",
    path: ["blanks"]
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z9.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z9.object({
  x: z9.union([z9.string(), z9.number()]),
  y: z9.number()
});
var ChartSeriesColorSchema = z9.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z9.object({
  id: z9.string().min(1),
  name: z9.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z9.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("chart"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    chart_type: ChartTypeSchema,
    title: z9.string().optional(),
    x_label: z9.string().optional(),
    y_label: z9.string().optional(),
    series: z9.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("equation"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    latex: z9.string(),
    caption: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z9.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("diagram"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    source: DiagramSourceSchema,
    image_url: z9.string().optional(),
    image_alt: z9.string().optional(),
    svg_markup: z9.string().optional(),
    caption: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z9.object({
  id: z9.string().min(1),
  label: z9.string(),
  parent_id: z9.string().nullable().optional(),
  color: z9.string().optional(),
  x: z9.number().optional(),
  y: z9.number().optional()
});
var GraphBuildModeSchema = z9.enum(["outline", "canvas"]);
var GraphEdgeSchema = z9.object({
  id: z9.string().min(1),
  from: z9.string().min(1),
  to: z9.string().min(1),
  label: z9.string().optional()
});
var MindMapBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("mind_map"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    nodes: z9.array(GraphNodeSchema).min(1).max(24),
    edges: z9.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("concept_map"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    nodes: z9.array(GraphNodeSchema).min(1).max(24),
    edges: z9.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("whiteboard"),
  variant: z9.string().default("large"),
  visibility: VisibilitySchema,
  content: z9.object({
    document_id: z9.string().min(1),
    seed_document_id: z9.string().min(1).optional(),
    title: z9.string().optional(),
    height_px: z9.number().int().min(360).max(1400).default(640),
    published_snapshot: z9.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z9.object({
  id: z9.string().min(1),
  when: z9.string(),
  label: z9.string(),
  description: z9.string(),
  image_url: z9.string().optional(),
  image_alt: z9.string().optional(),
  link_url: z9.string().optional(),
  link_label: z9.string().optional()
});
var TimelineLayoutSchema = z9.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("timeline"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    layout: TimelineLayoutSchema.optional(),
    events: z9.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z9.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z9.object({
  id: z9.string().min(1),
  number: z9.string().optional(),
  eyebrow: z9.string(),
  title: z9.string(),
  description: z9.string(),
  image_url: z9.string().optional(),
  image_alt: z9.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("card_stack"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    cards: z9.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z9.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("collection"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    source: CollectionSourceSchema,
    title: z9.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z9.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("anthology"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("outcomes"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z9.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z9.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z9.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z9.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z9.enum(["left", "center", "right"]);
var AnnotationLineSchema = z9.object({
  id: z9.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z9.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z9.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z9.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z9.object({
  id: z9.string().min(1),
  lines: z9.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z9.object({
  kind: z9.enum(["verse", "prose"]),
  stanzas: z9.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z9.object({
  id: z9.string().min(1),
  name: z9.string().min(1),
  subgroup: z9.string().optional()
});
var AnnotationLayerSchema = z9.object({
  id: z9.string().min(1),
  name: z9.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z9.string().optional(),
  sublayers: z9.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z9.object({
  exact: z9.string().min(1),
  prefix: z9.string().optional(),
  suffix: z9.string().optional()
});
var AnnotationAnchorSchema = z9.object({
  /** Required on every stop when the annotation is a thread. */
  id: z9.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z9.string().min(1),
  line: z9.string().optional(),
  start: z9.number().int().min(0).optional(),
  end: z9.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z9.string().optional()
});
var AnnotationTechniqueRefSchema = z9.object({
  id: z9.string().min(1),
  table_version: z9.string().min(1)
});
var AnnotationCodeRefSchema = z9.object({
  id: z9.string().min(1).max(40),
  code: z9.string().regex(/^[A-Z]{1,3}$/),
  label: z9.string().max(60),
  descriptor: z9.string().max(600).default(""),
  colour: z9.enum(["blue", "sage", "peach", "gold", "lilac"]).default("blue"),
  positive: z9.boolean().default(false)
});
var AnnotationAttachmentSchema = z9.discriminatedUnion("kind", [
  z9.object({
    kind: z9.literal("link"),
    url: z9.string(),
    label: z9.string().optional()
  }),
  z9.object({
    kind: z9.literal("video"),
    url: z9.string(),
    start_seconds: z9.number().int().min(0).optional()
  }),
  z9.object({
    kind: z9.literal("audio"),
    url: z9.string(),
    title: z9.string().optional()
  }),
  z9.object({
    kind: z9.literal("image"),
    url: z9.string(),
    alt_text: z9.string()
  }),
  z9.object({
    kind: z9.literal("block"),
    block_id: z9.string().min(1)
  })
]);
var AnthologyTagSchema = z9.object({
  include: z9.boolean(),
  themes: z9.array(z9.string().trim().max(40)).max(8).default([]),
  concepts: z9.array(z9.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z9.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z9.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z9.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z9.enum(["text", "custom"]).default("text"),
  anchor_order: z9.array(z9.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z9.object({
  w: z9.string(),
  start: z9.number(),
  end: z9.number()
});
var AnnotationVoiceClipSchema = z9.object({
  id: z9.string().min(1),
  start_s: z9.number(),
  end_s: z9.number(),
  word_range: z9.tuple([z9.number().int().min(0), z9.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z9.enum(["tap", "quote", "ai", "manual"]),
  confidence: z9.number().min(0).max(1),
  approved: z9.boolean(),
  transcript_text: z9.string()
});
var AnnotationVoiceTrackSchema = z9.object({
  id: z9.string().min(1),
  layer_id: z9.string().min(1),
  kind: z9.enum(["reading", "think_aloud", "feedback"]),
  title: z9.string().min(1),
  audio: z9.object({
    media_id: z9.string().optional(),
    url: z9.string().min(1),
    duration_s: z9.number().min(0),
    mime: z9.string().min(1)
  }),
  transcript: z9.object({
    words: z9.array(AnnotationVoiceWordSchema),
    timing: z9.enum(["word", "segment", "estimated"])
  }),
  taps: z9.array(
    z9.object({
      t: z9.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z9.array(AnnotationVoiceClipSchema).default([]),
  status: z9.enum(["draft", "published"]),
  extras: z9.array(
    z9.object({
      id: z9.string().min(1),
      kind: z9.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z9.string(),
      approved: z9.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z9.object({
  id: z9.string().min(1),
  layer_id: z9.string().min(1),
  sublayer_id: z9.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z9.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  code: AnnotationCodeRefSchema.optional(),
  body: z9.object({
    html: z9.string(),
    attachments: z9.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z9.ZodIssueCode.custom,
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
      code: z9.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z9.ZodIssueCode.custom,
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
      code: z9.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z9.object({
  show_markers: z9.boolean().default(true),
  default_layer_id: z9.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z9.union([z9.literal(0), z9.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z9.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("annotation"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string().optional(),
    attribution: z9.string().optional(),
    text: AnnotationTextSchema,
    layers: z9.array(AnnotationLayerSchema).default([]),
    annotations: z9.array(AnnotationItemSchema).default([]),
    voice_tracks: z9.array(AnnotationVoiceTrackSchema).optional(),
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
        code: z9.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z9.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z9.object({
    id: z9.string().min(1),
    type: z9.literal("block"),
    block_type: z9.literal(blockType),
    variant: z9.string().default("medium"),
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
var TeacherNoteBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("teacher_note"),
  variant: z9.string().default("medium"),
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
var SpacerBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("spacer"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z9.lazy(
  () => z9.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z9.array(
  z9.object({
    width: z9.number().int().min(1).max(12),
    blocks: z9.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z9.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("columns"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z9.lazy(
  () => z9.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("tabs"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    tabs: z9.array(
      z9.object({
        id: z9.string().min(1),
        label: z9.string(),
        blocks: z9.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionInnerChildBlockSchema = z9.lazy(
  () => z9.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SidePathSectionSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("section"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string(),
    collapsed_in_editor: z9.boolean().optional(),
    blocks: z9.array(SectionInnerChildBlockSchema),
    side_path: z9.literal(true),
    narration: NarrationSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z9.lazy(
  () => z9.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    SidePathSectionSchema
  ])
);
var SectionLinkSchema = z9.object({
  mode: z9.literal("linked"),
  source_composition_id: z9.string().min(1)
});
var SectionBlockObjectSchema = z9.object({
  id: z9.string().min(1),
  type: z9.literal("block"),
  block_type: z9.literal("section"),
  variant: z9.string().default("medium"),
  visibility: VisibilitySchema,
  content: z9.object({
    title: z9.string(),
    collapsed_in_editor: z9.boolean().optional(),
    blocks: z9.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional(),
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z9.object({ enabled: z9.boolean(), prompt: z9.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z9.boolean().optional(),
    /** Tutorial: this top-level section is the tab for the group with this id. */
    tutorial_group: TutorialGroupIdSchema.optional(),
    /** Tutorial: with tutorial_group, this section is that group's exit check (quiz questions). */
    tutorial_exit: z9.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z9.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z9.lazy(
  () => z9.discriminatedUnion("block_type", [
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
  LessonKindSchema,
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
