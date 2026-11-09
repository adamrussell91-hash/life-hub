// Generated from apps/teaching/src/rotation/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/rotation/schema.ts
import { z as z3 } from "zod";

// apps/teaching/src/quiz/core.ts
import { z as z2 } from "zod";

// apps/teaching/src/quiz/writing.ts
import { z } from "zod";
var WRITING_CHECKS = ["off", "flag", "block"];
var WritingCheckSchema = z.enum(WRITING_CHECKS);

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
var QuizQuestionKindSchema = z2.enum(QUIZ_QUESTION_KINDS);
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
var Id = z2.string().min(1).max(64);
var Text = (max) => z2.string().trim().min(1).max(max);
var OptionalText = (max) => z2.string().trim().max(max).optional();
var QuizImageSchema = z2.object({
  url: z2.string().min(1).max(2e3),
  alt: z2.string().max(300).default("")
});
var QuizChoiceSchema = z2.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z2.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z2.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z2.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z2.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z2.array(Id).min(1).max(10)
});
var QuizPinSchema = z2.object({
  id: Id,
  x: z2.number().min(0).max(1),
  y: z2.number().min(0).max(1),
  label: Text(120)
});
var NextStepEntrySchema = z2.object({
  lines: z2.array(z2.string().max(160)).length(5),
  /** Lines the teacher changed by hand; Regenerate keeps these. */
  edited: z2.array(z2.boolean()).length(5),
  /** Hash of the question, skills and ladder it was built from (bankSource), for the stale note. */
  source: z2.string().max(32)
});
var NextStepBankSchema = z2.record(z2.string().min(1).max(64), NextStepEntrySchema);
var SkillRefPattern = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z2.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z2.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z2.array(z2.string().min(1).max(64)).max(8).optional(),
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z2.array(z2.string().regex(SkillRefPattern, "Pick a skill from the list.")).max(8).optional(),
  /** Knowledge pieces this question checks (deep understandings), for the unit's tracking. */
  pieces: z2.array(z2.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).optional()
};
var QuizQuestionSchema = z2.discriminatedUnion("kind", [
  z2.object({ ...base, kind: z2.literal("multiple_choice"), options: z2.array(QuizChoiceSchema).min(2).max(6), correct: z2.array(Id).length(1) }),
  z2.object({ ...base, kind: z2.literal("multi_select"), options: z2.array(QuizChoiceSchema).min(2).max(8), correct: z2.array(Id).min(1).max(8) }),
  z2.object({ ...base, kind: z2.literal("true_false"), answer: z2.boolean() }),
  z2.object({
    ...base,
    kind: z2.literal("short_answer"),
    accepted: z2.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z2.boolean().optional(),
    /** What a right answer says, for the AI marker. Optional. */
    looking_for: OptionalText(QUIZ_LIMITS.note),
    ai_mark: z2.boolean().optional()
  }),
  z2.object({ ...base, kind: z2.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z2.boolean().optional(), ai_mark: z2.boolean().optional() }),
  z2.object({ ...base, kind: z2.literal("odd_one_out"), options: z2.array(QuizChoiceSchema).min(3).max(6), correct: z2.array(Id).length(1) }),
  z2.object({ ...base, kind: z2.literal("matching"), pairs: z2.array(QuizPairSchema).min(2).max(8) }),
  z2.object({ ...base, kind: z2.literal("ordering"), items: z2.array(QuizChoiceSchema).min(3).max(8) }),
  z2.object({
    ...base,
    kind: z2.literal("categorise"),
    groups: z2.array(QuizGroupSchema).min(2).max(4),
    items: z2.array(QuizSortItemSchema).min(2).max(16)
  }),
  z2.object({
    ...base,
    kind: z2.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z2.array(QuizChoiceSchema.extend({ technique_id: z2.string().max(64).optional() })).min(2).max(6),
    correct: z2.array(Id).length(1)
  }),
  z2.object({
    ...base,
    kind: z2.literal("find_it"),
    segments: z2.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z2.array(Id).min(1).max(40)
  }),
  z2.object({
    ...base,
    kind: z2.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z2.array(
      QuizChoiceSchema.extend({
        technique_id: z2.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z2.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z2.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z2.number().int().min(1).max(12).optional()
  }),
  z2.object({ ...base, kind: z2.literal("label_image"), image: QuizImageSchema, pins: z2.array(QuizPinSchema).min(2).max(8) }),
  z2.object({
    ...base,
    kind: z2.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z2.boolean().optional()
  }),
  z2.object({
    ...base,
    kind: z2.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model),
    next_steps: NextStepBankSchema.optional(),
    ai_mark: z2.boolean().optional()
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z2.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z2.custom(
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
var QuizFeedbackSchema = z2.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z2.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z2.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z2.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z2.boolean().optional(),
  shuffle_questions: z2.boolean().optional(),
  shuffle_options: z2.boolean().optional(),
  attempts: z2.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z2.number().min(0).max(1).optional(),
  confidence: z2.boolean().optional(),
  /** Written answers: off, flag how they were typed, or also block paste. Blank means flag. */
  writing_check: WritingCheckSchema.optional(),
  closes_at: z2.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z2.number().int().min(1).max(100).optional(),
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z2.array(z2.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z2.string().max(64).optional(),
  follow_up_flag: z2.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z2.string().max(64).optional()
});
function norm(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().replace(/^["']+|["'.,!?;:]+$/g, "").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

// apps/teaching/src/rotation/schema.ts
var ROTATION_KINDS = ["facts", "concepts", "procedures", "analysis", "perspectives", "teacher"];
var ROTATION_KIND_INFO = {
  facts: { label: "Facts and vocabulary", mode: "Retrieval: flashcards and quiz", blocks: ["flashcards", "quiz_question"] },
  concepts: { label: "Concepts and principles", mode: "Elaboration: concept map", blocks: ["concept_map", "rich_text"] },
  procedures: { label: "Procedures and skills", mode: "Worked then faded example", blocks: ["faded_example", "rich_text"] },
  analysis: { label: "Analysis and evaluation", mode: "Close reading: annotate, then argue", blocks: ["annotation", "hinge_question"] },
  perspectives: { label: "Perspectives and values", mode: "Positions: take a side, then justify it", blocks: ["continuum_line", "rich_text"] },
  teacher: { label: "Teacher station", mode: "Small group with the teacher", blocks: ["with_teacher"] }
};
var ROTATION_LEVELS = ["support", "core", "extend"];
var ROTATION_LEVEL_LABELS = { support: "Support", core: "Core", extend: "Extend" };
var ROTATION_DIALS = ["guided", "standard", "open"];
var ROTATION_DIAL_LABELS = { guided: "Guided", standard: "Standard", open: "Open" };
var ROTATION_PATHS = ["fixed", "free_all", "choose_n", "must_may", "unlocks"];
var ROTATION_PATH_LABELS = {
  fixed: "Fixed order",
  free_all: "Free order, all stations",
  choose_n: "Choose some of the stations",
  must_may: "Must-do plus may-do",
  unlocks: "Unlocks (one station opens another)"
};
var ROTATION_FALLBACKS = ["choose_n_minus_1", "skip_finale_build", "none"];
var ROTATION_FALLBACK_LABELS = {
  choose_n_minus_1: "Drop one station: they choose all but one",
  skip_finale_build: "Skip the finale build",
  none: "Nothing: keep going"
};
var ROTATION_ROLES = ["recall", "goal", "step", "hint", "gate", "after", "done", "exit"];
var ROTATION_ROLE_LABELS = {
  recall: "Arrival recall",
  goal: "Goal",
  step: "Step",
  hint: "Hint",
  gate: "Gate",
  after: "Step after the gate",
  done: "Done when",
  exit: "Exit check"
};
var ROTATION_ROLE_ORDER = ["recall", "goal", "step", "hint", "gate", "after", "done", "exit"];
var DEFAULT_LINK_WORDS = ["causes", "makes worse", "is evidence for", "slows recovery of"];
var DEFAULT_FINALE_FORMATS = ["One-page brief", "Annotated diagram", "Two-minute talk"];
var DEFAULT_DEBRIEF = ["Why did you choose that order? Would you choose it again?", "Which piece changed your explanation the most?"];
var Id2 = z3.string().regex(/^[a-z0-9_-]{1,40}$/);
var WRITTEN_CHECKS = ["technique_named", "exact_quote", "technique_fits", "effect_linked"];
var WRITTEN_CHECK_LABELS = {
  technique_named: "Technique named correctly",
  exact_quote: "Exact quote from the passage",
  technique_fits: "The technique is really at work in that quote",
  effect_linked: "The effect links to the idea"
};
var WrittenGateSchema = z3.object({
  prompt: z3.string().max(600).default(""),
  passage: z3.string().max(4e3).default(""),
  /** One mark per point. */
  marks: z3.number().int().min(1).max(6).default(3),
  /** What each effect must link to: "isolation". */
  idea: z3.string().max(120).default(""),
  checks: z3.array(z3.enum(WRITTEN_CHECKS)).max(4).default(["technique_named", "exact_quote", "technique_fits", "effect_linked"]),
  different_techniques: z3.boolean().default(true),
  pass_at: z3.number().int().min(1).max(6).default(3),
  pass_at_support: z3.number().int().min(1).max(6).optional(),
  /** Optional: quotes the teacher expects and the techniques that fit them. The checker may accept others it can justify. */
  answer_key: z3.array(z3.object({ quote: z3.string().max(400), techniques: z3.array(z3.string().max(80)).max(6) })).max(12).optional(),
  max_checks: z3.number().int().min(1).max(6).default(3),
  /** Teacher only; never sent to students or to the checker. */
  model_answer: z3.string().max(3e3).optional(),
  /** Daily cap per class in A$. At the cap, written gates become teacher checks for the rest of the day. */
  daily_cap_aud: z3.number().min(0).max(50).default(3)
});
var StationSchema = z3.object({
  id: Id2,
  title: z3.string().max(120).default(""),
  kind: z3.enum(ROTATION_KINDS).default("concepts"),
  strand: z3.string().max(40).optional(),
  outcomes: z3.array(z3.string().max(200)).max(6).default([]),
  minutes: z3.number().int().min(1).max(90).default(10),
  seats: z3.number().int().min(1).max(40).default(6),
  /** "Back bench". A QR code links to the station. */
  location: z3.string().max(80).optional(),
  must_do: z3.boolean().optional(),
  unlock_after: z3.array(Id2).max(8).optional(),
  /** One letter or a short code, breakout only. */
  token: z3.string().max(4).optional(),
  /** The evidence card text this station produces. */
  piece: z3.string().max(300).default(""),
  /** Marks an offline station done. */
  offline_code: z3.string().max(20).optional(),
  /** Map position, 0 to 100 each way. Absent: laid out automatically. */
  x: z3.number().min(0).max(100).optional(),
  y: z3.number().min(0).max(100).optional(),
  /** The station's gate, when it is a written answer. A hinge gate is a block in the section instead. */
  written_gate: WrittenGateSchema.optional(),
  /** Teacher station only: what to say to a group sent here, per misconception. */
  script: z3.string().max(600).optional()
});
var PretestItemSchema = z3.object({
  id: Id2,
  station: Id2,
  /** Saved half-written while drafting; publish runs the full check. */
  question: QuizQuestionDraftSchema,
  /** Missing it routes the student to the teacher station. */
  misconception: z3.boolean().optional()
});
var LockOptionSchema = z3.object({ id: Id2, text: z3.string().max(300) });
var LockQuestionSchema = z3.object({
  prompt: z3.string().max(500).default(""),
  options: z3.array(LockOptionSchema).max(5).default([]),
  correct_id: z3.string().max(40).default("")
});
var RotationFinaleSchema = z3.object({
  lock: LockQuestionSchema.optional(),
  /** The build: what students write, with their board's cards and links in place. */
  build_prompt: z3.string().max(400).default("Write your recommendation, using your evidence."),
  formats: z3.array(z3.string().max(60)).max(5).default([...DEFAULT_FINALE_FORMATS]),
  debrief: z3.array(z3.string().max(300)).max(4).default([...DEFAULT_DEBRIEF])
});
var RotationSettingsSchema = z3.object({
  class_id: z3.string().max(64).default(""),
  dial: z3.enum(ROTATION_DIALS).default("standard"),
  /** Extend passed at two stations opens route choice. */
  fade_dial: z3.boolean().default(true),
  path: z3.enum(ROTATION_PATHS).default("free_all"),
  choose_n: z3.number().int().min(1).max(8).optional(),
  evidence: z3.enum(["board", "list"]).default("board"),
  link_words: z3.array(z3.string().min(1).max(40)).min(2).max(6).default([...DEFAULT_LINK_WORDS]),
  stations: z3.array(StationSchema).max(9).default([]),
  pretest: z3.array(PretestItemSchema).max(30).default([]),
  finale: RotationFinaleSchema.default({ build_prompt: "Write your recommendation, using your evidence.", formats: [...DEFAULT_FINALE_FORMATS], debrief: [...DEFAULT_DEBRIEF] }),
  /** Breakout framing; optional. */
  story: z3.object({ title: z3.string().max(120), intro: z3.string().max(800) }).optional(),
  behind_fallback: z3.enum(ROTATION_FALLBACKS).default("choose_n_minus_1"),
  /** Lesson length when it isn't scheduled; the timetable's wins when it is. */
  minutes: z3.number().int().min(10).max(240).optional()
});
var PublicWrittenGateSchema = WrittenGateSchema.pick({ prompt: true, passage: true, marks: true, idea: true, checks: true, different_techniques: true, pass_at: true, pass_at_support: true, max_checks: true });
var PublicStationSchema = StationSchema.omit({ written_gate: true, offline_code: true, script: true }).extend({
  written_gate: PublicWrittenGateSchema.optional(),
  has_offline_code: z3.boolean().optional()
});
var PublicRotationSchema = z3.object({
  dial: z3.enum(ROTATION_DIALS),
  fade_dial: z3.boolean(),
  path: z3.enum(ROTATION_PATHS),
  choose_n: z3.number().int().optional(),
  evidence: z3.enum(["board", "list"]),
  link_words: z3.array(z3.string()),
  stations: z3.array(PublicStationSchema),
  finale: z3.object({
    lock: z3.object({ prompt: z3.string(), options: z3.array(LockOptionSchema) }).optional(),
    build_prompt: z3.string(),
    formats: z3.array(z3.string()),
    debrief: z3.array(z3.string())
  }),
  story: z3.object({ title: z3.string(), intro: z3.string() }).optional(),
  behind_fallback: z3.enum(ROTATION_FALLBACKS),
  pretest_count: z3.number().int()
});
var PRESETS = ["carousel", "choice", "teacher_led", "breakout"];
var PRESET_INFO = {
  carousel: { label: "Carousel", blurb: "Fixed order \xB7 every station", path: "fixed", dial: "guided", evidence: "list" },
  choice: { label: "Choice board", blurb: "Must-do plus may-do", path: "must_may", dial: "open", evidence: "board" },
  teacher_led: { label: "Teacher-led", blurb: "Pretest routes groups", path: "free_all", dial: "guided", evidence: "list" },
  breakout: { label: "Breakout", blurb: "Story, letters, final lock", path: "free_all", dial: "standard", evidence: "board" }
};
var DIAL_TABLE = [
  { row: "Route", guided: "Next station recommended for you", standard: "Recommended, you can pick another", open: "You choose" },
  { row: "Level", guided: "Set by the pretest", standard: "Pretest level, you can change it", open: "Pretest level, you can change it" },
  { row: "Hints", guided: "Offered after a minute", standard: "Open when you ask", open: "Open when you ask" },
  { row: "Finale format", guided: "One format", standard: "Pick one of three", open: "Any format" }
];
export {
  DEFAULT_DEBRIEF,
  DEFAULT_FINALE_FORMATS,
  DEFAULT_LINK_WORDS,
  DIAL_TABLE,
  LockOptionSchema,
  LockQuestionSchema,
  PRESETS,
  PRESET_INFO,
  PretestItemSchema,
  PublicRotationSchema,
  PublicStationSchema,
  PublicWrittenGateSchema,
  ROTATION_DIALS,
  ROTATION_DIAL_LABELS,
  ROTATION_FALLBACKS,
  ROTATION_FALLBACK_LABELS,
  ROTATION_KINDS,
  ROTATION_KIND_INFO,
  ROTATION_LEVELS,
  ROTATION_LEVEL_LABELS,
  ROTATION_PATHS,
  ROTATION_PATH_LABELS,
  ROTATION_ROLES,
  ROTATION_ROLE_LABELS,
  ROTATION_ROLE_ORDER,
  RotationFinaleSchema,
  RotationSettingsSchema,
  StationSchema,
  WRITTEN_CHECKS,
  WRITTEN_CHECK_LABELS,
  WrittenGateSchema
};
