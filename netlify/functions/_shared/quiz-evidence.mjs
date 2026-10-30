// Generated from apps/teaching/src/quiz/evidence.ts; regenerate with scripts/generate-alchemy-schema.mjs.

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
  skills: z2.array(z2.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/, "Pick a skill from the list.")).max(8).optional()
};
var QuizQuestionSchema = z2.discriminatedUnion("kind", [
  z2.object({ ...base, kind: z2.literal("multiple_choice"), options: z2.array(QuizChoiceSchema).min(2).max(6), correct: z2.array(Id).length(1) }),
  z2.object({ ...base, kind: z2.literal("multi_select"), options: z2.array(QuizChoiceSchema).min(2).max(8), correct: z2.array(Id).min(1).max(8) }),
  z2.object({ ...base, kind: z2.literal("true_false"), answer: z2.boolean() }),
  z2.object({
    ...base,
    kind: z2.literal("short_answer"),
    accepted: z2.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z2.boolean().optional()
  }),
  z2.object({ ...base, kind: z2.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z2.boolean().optional() }),
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
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z2.object({
    ...base,
    kind: z2.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
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
  const unique2 = (ids, what) => {
    if (new Set(ids).size !== ids.length) out.push(`Two ${what} share an id.`);
  };
  switch (q.kind) {
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique": {
      unique2(q.options.map((o) => o.id), "options");
      const ids = new Set(q.options.map((o) => o.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tick the right answer.");
      if (new Set(q.options.map((o) => norm(o.text))).size !== q.options.length) out.push("Two options say the same thing.");
      break;
    }
    case "find_it": {
      unique2(q.segments.map((s) => s.id), "lines");
      const ids = new Set(q.segments.map((s) => s.id));
      if (!q.correct.length || q.correct.some((id) => !ids.has(id))) out.push("Tap the line or lines that answer the question.");
      if (q.correct.length >= q.segments.length) out.push("Leave at least one line that isn\u2019t an answer.");
      break;
    }
    case "spot_technique": {
      unique2(q.options.map((o) => o.id), "techniques");
      unique2(q.targets.map((t) => t.id), "answers");
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
      unique2(q.pairs.map((p) => p.id), "pairs");
      if (new Set(q.pairs.map((p) => norm(p.right))).size !== q.pairs.length) out.push("Two pairs have the same right-hand side.");
      break;
    case "ordering":
      unique2(q.items.map((i) => i.id), "items");
      break;
    case "categorise": {
      unique2(q.groups.map((g) => g.id), "groups");
      unique2(q.items.map((i) => i.id), "items");
      const groups = new Set(q.groups.map((g) => g.id));
      if (q.items.some((i) => !groups.has(i.group))) out.push("Put every item in a group.");
      break;
    }
    case "label_image":
      unique2(q.pins.map((p) => p.id), "pins");
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
function spanFinds(words, spot, target) {
  const content = (i) => {
    const key = wordKey(words[i]?.text ?? "");
    return !!key && !FILLER.has(key);
  };
  const targetWords = [];
  for (let i = target.from; i <= target.to; i++) targetWords.push(i);
  const meaningful = targetWords.filter(content);
  const pool = meaningful.length ? meaningful : targetWords;
  const caught = pool.filter((i) => i >= spot.from && i <= spot.to).length;
  if (caught < Math.max(1, Math.ceil(pool.length / 3))) return false;
  const overlap = Math.max(0, Math.min(spot.to, target.to) - Math.max(spot.from, target.from) + 1);
  const spill = spot.to - spot.from + 1 - overlap;
  return spill <= Math.max(4, targetWords.length);
}
function matchSpots(words, spots, targets) {
  const pairs = [];
  spots.forEach(
    (spot, s) => targets.forEach((target, t) => {
      if (!spanFinds(words, spot, target)) return;
      const overlap = Math.min(spot.to, target.to) - Math.max(spot.from, target.from) + 1;
      const union = Math.max(spot.to, target.to) - Math.min(spot.from, target.from) + 1;
      pairs.push({ s, t, fit: overlap / union });
    })
  );
  pairs.sort((a, b) => b.fit - a.fit || a.s - b.s);
  const out = spots.map(() => null);
  const taken = /* @__PURE__ */ new Set();
  for (const pair of pairs) {
    if (out[pair.s] !== null || taken.has(pair.t)) continue;
    out[pair.s] = pair.t;
    taken.add(pair.t);
  }
  return out;
}
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
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function spotList(v) {
  if (!Array.isArray(v)) return [];
  const at = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 5e3 ? n : null;
  return v.flatMap((x) => {
    if (!isRecord(x) || typeof x.option !== "string") return [];
    const a = at(x.from);
    const b = at(x.to);
    if (a === null || b === null) return [];
    return [{ from: Math.min(a, b), to: Math.max(a, b), option: x.option.slice(0, 64) }];
  });
}

// apps/teaching/src/quiz/evidence.ts
function techTag(id, text) {
  return id ? `tech:${id}` : `tech:~${norm(text)}`;
}
var isRecord2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var strings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
var unique = (xs) => [...new Set(xs)];
function textOf(question, id) {
  const q = question;
  for (const field of ["options", "segments", "items", "labels", "left", "right", "groups"]) {
    const list = q[field];
    if (!Array.isArray(list)) continue;
    const hit = list.find((o) => o?.id === id);
    if (hit) return String(hit.text ?? "");
  }
  if (question.kind === "label_image") {
    const pin = question.pins.find((p) => p.id === id);
    if (pin) return `Pin ${pin.n}`;
  }
  return "";
}
function techOf(question, key, optionId) {
  if (question.kind !== "quote_technique" && question.kind !== "spot_technique") return null;
  const id = key.techniques?.[optionId];
  const text = textOf(question, optionId);
  if (!id && !text.trim()) return null;
  return techTag(id || void 0, text);
}
function answerEvidence(input) {
  const { question, key } = input;
  const base2 = [
    ...(key.outcomes?.length ? key.outcomes : input.fallbackOutcomes ?? []).map((o) => `out:${o}`),
    ...(key.skills ?? []).map((s) => `skill:${s}`)
  ];
  const codes = (input.codes ?? []).map((id) => ({ type: "code", id }));
  const share = input.awarded === null ? null : key.marks > 0 ? Math.min(1, Math.max(0, input.awarded / key.marks)) : null;
  const r = isRecord2(input.response) ? input.response : {};
  const a = key.answer;
  const one = (tags, why) => [
    { item: key.id, tags: unique([...base2, ...tags]), share, why: share === null || share >= 1 ? [] : [...why, ...codes] }
  ];
  switch (a.type) {
    case "spots":
      return spotEvidence(input, a, base2, codes);
    case "choice": {
      const right = new Set(a.ids);
      const targets = a.ids.map((id) => techOf(question, key, id)).filter((t) => !!t);
      const why = strings(r.selected).filter((id) => !right.has(id)).map((id) => {
        const as = techOf(question, key, id);
        return as && targets[0] ? { type: "named", as, target: targets[0] } : { type: "option", id, text: textOf(question, id) };
      });
      return one(targets, why);
    }
    case "map": {
      const given = isRecord2(r.map) ? r.map : {};
      const why = Object.entries(a.map).filter(([from, to]) => given[from] !== to).map(([from]) => ({ type: "placement", id: from, text: textOf(question, from) }));
      return one([], why);
    }
    case "order": {
      const given = strings(r.order);
      const why = a.ids.filter((id, i) => given[i] !== id).map((id) => ({ type: "placement", id, text: textOf(question, id) }));
      return one([], why);
    }
    default:
      return one([], []);
  }
}
function spotEvidence(input, a, base2, codes) {
  const { question, key } = input;
  const r = isRecord2(input.response) ? input.response : {};
  const spots = spotList(r.spots).slice(0, a.pick);
  const found = matchSpots(passageWords(a.passage), spots, a.targets);
  const every = a.pick >= a.targets.length;
  const out = [];
  a.targets.forEach((target, t) => {
    const techs = target.ids.map((id) => techOf(question, key, id)).filter((x) => !!x);
    const tags = unique([...base2, ...techs]);
    const first = techs[0];
    const item = `${key.id}#${t}`;
    const at = found.findIndex((f) => f === t);
    if (at === -1) {
      if (every) out.push({ item, tags, share: 0, why: [...first ? [{ type: "not_found", target: first }] : [], ...codes] });
      return;
    }
    const spot = spots[at];
    const named = target.ids.includes(spot.option);
    const as = techOf(question, key, spot.option);
    out.push({ item, tags, share: named ? 1 : 0.5, why: named ? [] : [...as && first ? [{ type: "named", as, target: first }] : [], ...codes] });
  });
  return out;
}
export {
  answerEvidence,
  techTag
};
