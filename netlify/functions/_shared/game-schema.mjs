// Generated from apps/teaching/src/games/core/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/games/core/schema.ts
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
var QUIZ_KIND_INFO = {
  multiple_choice: { label: "Multiple choice", blurb: "Pick the one right answer.", tier: 1, manual: false },
  multi_select: { label: "Multi-select", blurb: "Pick every answer that applies.", tier: 1, manual: false },
  true_false: { label: "True or false", blurb: "Is the statement true or false?", tier: 1, manual: false },
  short_answer: { label: "Short answer", blurb: "Type a word or a short phrase.", tier: 1, manual: false },
  fill_gap: { label: "Fill the gap", blurb: "Fill the missing words in a sentence or quote.", tier: 1, manual: false },
  odd_one_out: { label: "Odd one out", blurb: "Spot the one that doesn\u2019t belong.", tier: 1, manual: false },
  matching: { label: "Matching pairs", blurb: "Match each item to its partner.", tier: 2, manual: false },
  ordering: { label: "Put in order", blurb: "Put the items in the right order.", tier: 2, manual: false },
  categorise: { label: "Sort into groups", blurb: "Sort each item into its group.", tier: 2, manual: false },
  quote_technique: { label: "Quote \u2192 technique", blurb: "Name the technique in a quote.", tier: 2, manual: false },
  find_it: { label: "Find it in the text", blurb: "Tap the line that answers the question.", tier: 2, manual: false },
  spot_technique: { label: "Spot the technique", blurb: "Select the words in a passage, then name the technique.", tier: 2, manual: false },
  label_image: { label: "Label the image", blurb: "Match each label to its pin on the image.", tier: 2, manual: false },
  extended_response: { label: "Extended response", blurb: "Write a paragraph. Your teacher marks it.", tier: 3, manual: true },
  explain_effect: { label: "Explain the effect", blurb: "Explain the effect of a technique. Your teacher marks it.", tier: 3, manual: true }
};
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

// apps/teaching/src/games/core/schema.ts
var GAME_KINDS = [
  "crossword",
  "find_a_word",
  "jeopardy",
  "wheel",
  "team_match",
  "points_rush",
  "battles",
  "wager",
  "connections",
  "articulate",
  "pictionary",
  "who_said_it"
];
var GameKindSchema = z3.enum(GAME_KINDS);
var GAME_KIND_INFO = {
  crossword: { label: "Crossword", solo: true, live: true, team: false, shapes: ["term"] },
  find_a_word: { label: "Find-a-word", solo: true, live: true, team: false, shapes: ["term"] },
  jeopardy: { label: "Jeopardy", solo: false, live: true, team: true, shapes: ["question", "term"] },
  wheel: { label: "Wheel of Fortune", solo: false, live: true, team: true, shapes: ["quote", "question", "term"] },
  team_match: { label: "Team match", solo: false, live: true, team: true, shapes: ["term", "quote", "question"] },
  points_rush: { label: "Points rush", solo: true, live: true, team: false, shapes: ["question", "term"] },
  battles: { label: "Short-answer battles", solo: false, live: true, team: false, shapes: [] },
  wager: { label: "Wager", solo: false, live: true, team: false, shapes: ["question"] },
  connections: { label: "Connections wall", solo: true, live: true, team: false, shapes: ["group"] },
  articulate: { label: "Articulate", solo: false, live: true, team: true, shapes: ["term"] },
  pictionary: { label: "Pictionary", solo: false, live: true, team: false, shapes: ["term", "quote"] },
  who_said_it: { label: "Who said it?", solo: true, live: true, team: false, shapes: ["quote"] }
};
var GAME_LIMITS = {
  games: 8,
  title: 80,
  term: 60,
  clue: 300,
  clues: 4,
  accept: 6,
  banned: 5,
  decoys: 3,
  word: 60,
  drawPrompt: 200,
  quote: 600,
  source: 120,
  whyFake: 300,
  label: 80,
  tile: 60,
  why: 300,
  cast: 8,
  castName: 60,
  category: 40,
  /** Letters in a Wheel puzzle (A–Z only). */
  wheelLetters: 60,
  wheelText: 120,
  message: 40,
  prompt: 1e3,
  criterion: 200,
  chips: 6,
  chip: 60
};
var GAME_COUNTS = {
  crossword: { min: 6, max: 30 },
  find_a_word: { min: 6, max: 20 },
  jeopardy_categories: { min: 3, max: 6 },
  jeopardy_tiles: { min: 3, max: 5 },
  wheel: { min: 3, max: 8 },
  wheel_bank: { min: 1, max: 20 },
  team_match: { min: 12, max: 40 },
  points_rush: { min: 10, max: 60 },
  wager: { min: 5, max: 15 },
  connections_walls: { min: 1, max: 6 },
  articulate: { min: 6, max: 60 },
  pictionary: { min: 3, max: 40 },
  who_said_it: { min: 8, max: 30 },
  cast: { min: 2, max: 8 }
};
var ItemIdSchema = z3.string().regex(/^[a-z0-9_-]{1,40}$/);
var Text2 = (max) => z3.string().max(max).default("");
var OptText = (max) => z3.string().max(max).optional();
var ItemTagsShape = {
  /** Knowledge pieces (`kp_…`) this item checks. */
  pieces: z3.array(z3.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).default([]),
  /** Syllabus outcome ids. */
  outcomes: z3.array(z3.string().min(1).max(64)).max(8).default([]),
  /** Skills-continuum sub-strands, `strand.sub`. */
  skills: z3.array(z3.string().regex(SkillRefPattern)).max(8).default([]),
  /** Technique catalogue ids. */
  tech: z3.array(z3.string().min(1).max(64)).max(6).default([])
};
var CLUE_KINDS = ["definition", "example", "quote"];
var ClueSchema = z3.object({ kind: z3.enum(CLUE_KINDS).default("definition"), text: Text2(GAME_LIMITS.clue) });
var TermItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("term"),
  term: Text2(GAME_LIMITS.term),
  /** Other spellings that count as right ("colour", "color"). */
  accept: z3.array(z3.string().max(GAME_LIMITS.term)).max(GAME_LIMITS.accept).default([]),
  clues: z3.array(ClueSchema).max(GAME_LIMITS.clues).default([]),
  /** Which clue this game uses (crossword, find-a-word). Absent: the first. */
  use_clue: z3.number().int().min(0).max(GAME_LIMITS.clues - 1).optional(),
  /** Articulate: words the describer can't say. */
  banned: z3.array(z3.string().max(GAME_LIMITS.word)).max(GAME_LIMITS.banned).default([]),
  /** Find-a-word: plausible wrong terms placed in the grid for this clue. */
  decoys: z3.array(z3.string().max(GAME_LIMITS.word)).max(GAME_LIMITS.decoys).default([]),
  /** Pictionary: what to draw, when it isn't the term itself. */
  draw_prompt: OptText(GAME_LIMITS.drawPrompt),
  ...ItemTagsShape
});
var GAME_QUESTION_KINDS = QUIZ_QUESTION_KINDS.filter((k) => !QUIZ_KIND_INFO[k].manual);
var QuestionItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("question"),
  question: QuizQuestionDraftSchema,
  ...ItemTagsShape
});
var FAKE_SPEAKER = "fake";
var QuoteItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("quote"),
  text: Text2(GAME_LIMITS.quote),
  /** A cast member's id, or 'fake'. Empty while being written. */
  speaker: z3.string().max(40).default(""),
  /** Act, scene, chapter. */
  source: OptText(GAME_LIMITS.source),
  why_fake: OptText(GAME_LIMITS.whyFake),
  /** Pictionary and Wheel: other answers that count (key words of the line). */
  accept: z3.array(z3.string().max(GAME_LIMITS.quote)).max(GAME_LIMITS.accept).default([]),
  ...ItemTagsShape
});
var CastMemberSchema = z3.object({
  id: ItemIdSchema,
  name: Text2(GAME_LIMITS.castName),
  /** A letter or emoji for the card. */
  emblem: OptText(8),
  image_url: OptText(2e3)
});
var GroupItemSchema = z3.object({
  id: ItemIdSchema,
  shape: z3.literal("group"),
  label: Text2(GAME_LIMITS.label),
  tiles: z3.array(z3.string().max(GAME_LIMITS.tile)).max(4).default([]),
  difficulty: z3.number().int().min(1).max(4).default(1),
  why: Text2(GAME_LIMITS.why),
  ...ItemTagsShape
});
var ItemSchema = z3.discriminatedUnion("shape", [TermItemSchema, QuestionItemSchema, QuoteItemSchema, GroupItemSchema]);
var TermOrQuestion = z3.discriminatedUnion("shape", [TermItemSchema, QuestionItemSchema]);
var TermQuoteOrQuestion = z3.discriminatedUnion("shape", [TermItemSchema, QuoteItemSchema, QuestionItemSchema]);
var TermOrQuote = z3.discriminatedUnion("shape", [TermItemSchema, QuoteItemSchema]);
var Seconds = (min, max, dflt) => z3.number().int().min(min).max(max).default(dflt);
var Seed = z3.number().int().min(0).max(2 ** 31 - 1).default(1);
var RESERVED_GAME_IDS = ["keys", "current"];
var GameIdSchema = ItemIdSchema.refine((id) => !RESERVED_GAME_IDS.includes(id), "That game id is reserved.");
var base2 = { id: GameIdSchema, title: Text2(GAME_LIMITS.title) };
var CrosswordSchema = z3.object({
  ...base2,
  kind: z3.literal("crossword"),
  items: z3.array(TermItemSchema).max(GAME_COUNTS.crossword.max).default([]),
  settings: z3.object({ seed: Seed, locked: z3.boolean().default(false), hints: z3.boolean().default(true) }).prefault({})
});
var FindAWordSchema = z3.object({
  ...base2,
  kind: z3.literal("find_a_word"),
  items: z3.array(TermItemSchema).max(GAME_COUNTS.find_a_word.max).default([]),
  /** Optional hidden message spelled by the leftover letters, and the question asked about it. */
  message: z3.object({ text: Text2(GAME_LIMITS.message), question: QuizQuestionDraftSchema.optional() }).optional(),
  settings: z3.object({ seed: Seed, locked: z3.boolean().default(false), directions: z3.enum(["easy", "all"]).default("all"), hints: z3.boolean().default(true) }).prefault({})
});
var JEOPARDY_VALUES = [100, 200, 300, 400, 500];
var JeopardyTileSchema = z3.object({
  id: ItemIdSchema,
  value: z3.number().int().refine((v) => JEOPARDY_VALUES.includes(v), "Pick 100 to 500."),
  double: z3.boolean().default(false),
  item: TermOrQuestion
});
var JeopardySchema = z3.object({
  ...base2,
  kind: z3.literal("jeopardy"),
  categories: z3.array(z3.object({ id: ItemIdSchema, title: Text2(GAME_LIMITS.category), tiles: z3.array(JeopardyTileSchema).max(GAME_COUNTS.jeopardy_tiles.max).default([]) })).max(GAME_COUNTS.jeopardy_categories.max).default([]),
  final: QuestionItemSchema.optional(),
  settings: z3.object({ seconds: Seconds(10, 120, 30), picker_bonus: z3.number().min(1).max(2).default(1.5) }).prefault({})
});
var WheelPuzzleSchema = z3.object({
  id: ItemIdSchema,
  category: Text2(GAME_LIMITS.category),
  /** The line to solve: a quote or a short key line. */
  text: Text2(GAME_LIMITS.wheelText),
  /** Questions that earn letters. */
  bank: z3.array(TermOrQuestion).max(GAME_COUNTS.wheel_bank.max).default([]),
  /** Everyone answers this once the puzzle is solved. */
  explain: QuestionItemSchema.optional(),
  ...ItemTagsShape
});
var WheelSchema = z3.object({
  ...base2,
  kind: z3.literal("wheel"),
  puzzles: z3.array(WheelPuzzleSchema).max(GAME_COUNTS.wheel.max).default([]),
  settings: z3.object({ vowel_cost: z3.number().int().min(0).max(1e3).default(250), lockout_seconds: Seconds(5, 60, 20) }).prefault({})
});
var WRONG_TAPS = ["back3", "start"];
var WRONG_TAP_LABELS = { back3: "Back 3", start: "Back to start" };
var TeamMatchSchema = z3.object({
  ...base2,
  kind: z3.literal("team_match"),
  items: z3.array(TermQuoteOrQuestion).max(GAME_COUNTS.team_match.max).default([]),
  settings: z3.object({
    /** A wrong tap by any member: back 3 steps (default) or back to the start (Adam, 11 Nov). */
    wrong_tap: z3.enum(WRONG_TAPS).default("back3"),
    track: z3.number().int().min(6).max(20).default(12),
    team_size: z3.number().int().min(3).max(4).default(4)
  }).prefault({})
});
var PointsRushSchema = z3.object({
  ...base2,
  kind: z3.literal("points_rush"),
  items: z3.array(TermOrQuestion).max(GAME_COUNTS.points_rush.max).default([]),
  settings: z3.object({ minutes: z3.number().int().min(5).max(15).default(8), class_goal: z3.number().int().min(0).max(1e6).default(0) }).prefault({})
});
var BattlesSchema = z3.object({
  ...base2,
  kind: z3.literal("battles"),
  prompt: Text2(GAME_LIMITS.prompt),
  criterion: Text2(GAME_LIMITS.criterion),
  chips: z3.array(z3.string().max(GAME_LIMITS.chip)).max(GAME_LIMITS.chips).default([]),
  /** Or point at an existing question, as comparative judgement does. */
  question_ref: z3.object({ lesson_id: z3.string().min(1).max(80), block_id: z3.string().min(1).max(80) }).optional(),
  settings: z3.object({ write_minutes: z3.number().int().min(2).max(8).default(4) }).prefault({}),
  ...ItemTagsShape
});
var WagerSchema = z3.object({
  ...base2,
  kind: z3.literal("wager"),
  items: z3.array(QuestionItemSchema).max(GAME_COUNTS.wager.max).default([]),
  settings: z3.object({
    start: z3.number().int().min(10).max(1e4).default(100),
    min_bet: z3.number().int().min(1).max(1e3).default(10),
    seconds: Seconds(10, 120, 30),
    /** Right answers get this share of their bet on top. */
    house_bonus: z3.number().min(0).max(2).default(0.5),
    rescue: z3.boolean().default(true),
    final_all_in: z3.boolean().default(true)
  }).prefault({})
});
var ConnectionsWallSchema = z3.object({ id: ItemIdSchema, title: Text2(GAME_LIMITS.title), groups: z3.array(GroupItemSchema).max(4).default([]) });
var ConnectionsSchema = z3.object({
  ...base2,
  kind: z3.literal("connections"),
  walls: z3.array(ConnectionsWallSchema).max(GAME_COUNTS.connections_walls.max).default([]),
  settings: z3.object({ mistakes: z3.number().int().min(1).max(8).default(4) }).prefault({})
});
var ArticulateSchema = z3.object({
  ...base2,
  kind: z3.literal("articulate"),
  items: z3.array(TermItemSchema).max(GAME_COUNTS.articulate.max).default([]),
  settings: z3.object({ seconds: Seconds(30, 60, 45), passes: z3.number().int().min(0).max(3).default(2), quick_check: z3.boolean().default(true), quick_check_items: z3.number().int().min(3).max(5).default(4) }).prefault({})
});
var PictionarySchema = z3.object({
  ...base2,
  kind: z3.literal("pictionary"),
  items: z3.array(TermOrQuote).max(GAME_COUNTS.pictionary.max).default([]),
  settings: z3.object({ seconds: Seconds(60, 90, 75), drawers: z3.enum(["team", "class"]).default("class") }).prefault({})
});
var WhoSaidItSchema = z3.object({
  ...base2,
  kind: z3.literal("who_said_it"),
  cast: z3.array(CastMemberSchema).max(GAME_COUNTS.cast.max).default([]),
  items: z3.array(QuoteItemSchema).max(GAME_COUNTS.who_said_it.max).default([]),
  settings: z3.object({ seconds: Seconds(10, 60, 20) }).prefault({})
});
var GameSchema = z3.discriminatedUnion("kind", [
  CrosswordSchema,
  FindAWordSchema,
  JeopardySchema,
  WheelSchema,
  TeamMatchSchema,
  PointsRushSchema,
  BattlesSchema,
  WagerSchema,
  ConnectionsSchema,
  ArticulateSchema,
  PictionarySchema,
  WhoSaidItSchema
]);
var GameLessonSchema = z3.object({
  games: z3.array(GameSchema).max(GAME_LIMITS.games).default([]),
  /** Solo play (homework) closes at this time. Absent: open. */
  homework_closes_at: z3.string().datetime().optional()
});
var PublicTermSchema = z3.object({
  id: z3.string(),
  shape: z3.literal("term"),
  clues: z3.array(ClueSchema),
  lengths: z3.array(z3.number().int())
});
var PublicQuestionItemSchema = z3.object({ id: z3.string(), shape: z3.literal("question"), question: z3.record(z3.string(), z3.unknown()) });
var PublicQuoteSchema = z3.object({ id: z3.string(), shape: z3.literal("quote"), text: z3.string() });
var PublicItemSchema = z3.discriminatedUnion("shape", [PublicTermSchema, PublicQuestionItemSchema, PublicQuoteSchema]);
var PublicWallSchema = z3.object({ id: z3.string(), title: z3.string(), tiles: z3.array(z3.object({ id: z3.string(), text: z3.string() })) });
var PublicCrosswordGridSchema = z3.object({
  kind: z3.literal("crossword"),
  width: z3.number().int(),
  height: z3.number().int(),
  entries: z3.array(z3.object({ item: z3.string(), number: z3.number().int(), dir: z3.enum(["across", "down"]), x: z3.number().int(), y: z3.number().int(), length: z3.number().int() }))
});
var PublicWordGridSchema = z3.object({ kind: z3.literal("wordsearch"), size: z3.number().int(), rows: z3.array(z3.string()) });
var PublicGridSchema = z3.discriminatedUnion("kind", [PublicCrosswordGridSchema, PublicWordGridSchema]);
var PublicGameSchema = z3.object({
  id: z3.string(),
  title: z3.string(),
  kind: GameKindSchema,
  solo: z3.boolean(),
  live: z3.boolean(),
  /** Questions, clues or tiles in the game, for the card. */
  count: z3.number().int(),
  /** Settings students may see (timers, mistakes allowed, wrong tap rule…). */
  settings: z3.record(z3.string(), z3.union([z3.string(), z3.number(), z3.boolean()])),
  /** Solo kinds only. */
  items: z3.array(PublicItemSchema).optional(),
  walls: z3.array(PublicWallSchema).optional(),
  cast: z3.array(CastMemberSchema.pick({ id: true, name: true, emblem: true, image_url: true })).optional(),
  message: z3.object({ length: z3.number().int(), question: z3.record(z3.string(), z3.unknown()).optional() }).optional(),
  /** Crossword and find-a-word: the grid, built at publish. */
  grid: PublicGridSchema.optional()
});
var PublicGameLessonSchema = z3.object({
  games: z3.array(PublicGameSchema).max(GAME_LIMITS.games),
  homework_closes_at: z3.string().optional(),
  /** The publish version the keys are stored under. */
  version: z3.string()
});
export {
  ArticulateSchema,
  BattlesSchema,
  CLUE_KINDS,
  CastMemberSchema,
  ClueSchema,
  ConnectionsSchema,
  ConnectionsWallSchema,
  CrosswordSchema,
  FAKE_SPEAKER,
  FindAWordSchema,
  GAME_COUNTS,
  GAME_KINDS,
  GAME_KIND_INFO,
  GAME_LIMITS,
  GAME_QUESTION_KINDS,
  GameIdSchema,
  GameKindSchema,
  GameLessonSchema,
  GameSchema,
  GroupItemSchema,
  ItemIdSchema,
  ItemSchema,
  ItemTagsShape,
  JEOPARDY_VALUES,
  JeopardySchema,
  JeopardyTileSchema,
  PictionarySchema,
  PointsRushSchema,
  PublicCrosswordGridSchema,
  PublicGameLessonSchema,
  PublicGameSchema,
  PublicGridSchema,
  PublicItemSchema,
  PublicQuestionItemSchema,
  PublicQuoteSchema,
  PublicTermSchema,
  PublicWallSchema,
  PublicWordGridSchema,
  QuestionItemSchema,
  QuoteItemSchema,
  RESERVED_GAME_IDS,
  TeamMatchSchema,
  TermItemSchema,
  WRONG_TAPS,
  WRONG_TAP_LABELS,
  WagerSchema,
  WheelPuzzleSchema,
  WheelSchema,
  WhoSaidItSchema
};
