// Generated from apps/teaching/src/games/core/room-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/games/core/events.ts
import { z as z4 } from "zod";

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
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}
function matchText(given, accepted, caseSensitive = false) {
  const g = norm(given, caseSensitive);
  if (!g) return "wrong";
  const options = accepted.map((a) => norm(a, caseSensitive));
  if (options.includes(g)) return "exact";
  const near = options.some((a) => a.length >= 5 && editDistance(g, a) <= (a.length >= 10 ? 2 : 1));
  return near ? "near" : "wrong";
}
function roundMarks(value) {
  return Math.round(value * 2) / 2;
}
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var strings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
var stringMap = (v) => isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e) => typeof e[1] === "string")) : {};
function hasAnswer(response) {
  if (!isRecord(response)) return false;
  if (typeof response.value === "boolean") return true;
  if (typeof response.text === "string") return response.text.trim().length > 0;
  if (Array.isArray(response.selected)) return response.selected.length > 0;
  if (Array.isArray(response.order)) return response.order.length > 0;
  if (Array.isArray(response.spots)) return response.spots.length > 0;
  for (const field of ["gaps", "map"]) {
    if (isRecord(response[field])) return Object.values(response[field]).some((v) => typeof v === "string" && v.trim());
  }
  return false;
}
function markResponse(key, response) {
  const max = key.marks;
  const r = isRecord(response) ? response : {};
  const full = (ok, parts) => ({ score: ok ? max : 0, max, correct: ok, ...parts ? { parts } : {} });
  const share = (right, total, parts) => {
    const score = total ? roundMarks(Math.max(0, right) / total * max) : 0;
    return { score, max, correct: score === max, parts };
  };
  const a = key.answer;
  switch (a.type) {
    case "boolean":
      return full(typeof r.value === "boolean" && r.value === a.value);
    case "text": {
      const match = matchText(typeof r.text === "string" ? r.text : "", a.accepted, a.case_sensitive);
      if (match === "exact") return full(true);
      if (key.ai && hasAnswer(r)) return { score: null, max, correct: null, pending: "ai" };
      if (match === "near") return { score: null, max, correct: null, pending: "near_miss" };
      return full(false);
    }
    case "manual":
      return hasAnswer(r) ? { score: null, max, correct: null, pending: key.ai ? "ai" : "manual" } : full(false);
    case "choice": {
      const picked = new Set(strings(r.selected));
      const right = new Set(a.ids);
      const parts = Object.fromEntries([...picked].map((id) => [id, right.has(id)]));
      const single = key.kind === "multiple_choice" || key.kind === "odd_one_out" || key.kind === "quote_technique";
      if (single) return full(picked.size === 1 && right.has([...picked][0]), parts);
      let hits = 0;
      let misses = 0;
      for (const id of picked) {
        if (right.has(id)) hits++;
        else misses++;
      }
      return share(hits - misses, right.size, parts);
    }
    case "gaps": {
      const given = stringMap(r.gaps);
      const parts = {};
      let right = 0;
      let waiting = false;
      for (const [id, accepted] of Object.entries(a.gaps)) {
        const exact = matchText(given[id] ?? "", accepted) === "exact";
        if (!exact && key.ai && (given[id] ?? "").trim()) {
          waiting = true;
          continue;
        }
        parts[id] = exact;
        if (exact) right++;
      }
      if (waiting) return { score: null, max, correct: null, pending: "ai", parts };
      return share(right, Object.keys(a.gaps).length, parts);
    }
    case "map": {
      const given = stringMap(r.map);
      const parts = {};
      let right = 0;
      for (const [from, to] of Object.entries(a.map)) {
        parts[from] = given[from] === to;
        if (parts[from]) right++;
      }
      return share(right, Object.keys(a.map).length, parts);
    }
    case "spots": {
      const words = passageWords(a.passage);
      const spots = spotList(r.spots).slice(0, a.pick);
      const found = matchSpots(words, spots, a.targets);
      const parts = {};
      let credit = 0;
      spots.forEach((spot, i) => {
        const t = found[i];
        const named = t !== null && t !== void 0 && !!a.targets[t]?.ids.includes(spot.option);
        parts[`s${i}`] = named;
        parts[`s${i}.found`] = t !== null && t !== void 0;
        credit += named ? 1 : parts[`s${i}.found`] ? 0.5 : 0;
      });
      return share(credit, a.pick, parts);
    }
    case "order": {
      const given = strings(r.order);
      const parts = {};
      let right = 0;
      a.ids.forEach((id, i) => {
        parts[id] = given[i] === id;
        if (parts[id]) right++;
      });
      return share(right, a.ids.length, parts);
    }
  }
}
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
function cleanResponse(kind, response) {
  if (!isRecord(response)) return null;
  const cap = (s) => s.slice(0, QUIZ_LIMITS.response);
  switch (kind) {
    case "true_false":
      return typeof response.value === "boolean" ? { value: response.value } : null;
    case "short_answer":
    case "extended_response":
    case "explain_effect":
      return typeof response.text === "string" ? { text: cap(response.text) } : null;
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique":
    case "find_it":
      return { selected: [...new Set(strings(response.selected))].slice(0, 40) };
    case "fill_gap":
      return { gaps: Object.fromEntries(Object.entries(stringMap(response.gaps)).slice(0, 60).map(([k, v]) => [k, v.slice(0, 200)])) };
    case "matching":
    case "categorise":
    case "label_image":
      return { map: Object.fromEntries(Object.entries(stringMap(response.map)).slice(0, 60)) };
    case "ordering":
      return { order: strings(response.order).slice(0, 40) };
    case "spot_technique":
      return { spots: spotList(response.spots).slice(0, 12) };
  }
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

// apps/teaching/src/games/core/events.ts
var GAME_MOVES = ["answer", "solve", "guess", "bet", "hint", "judge", "describe", "draw", "pass", "buzz", "tap"];
var MARKED_MOVES = /* @__PURE__ */ new Set(["answer", "solve", "guess", "tap"]);
var STRENGTHS = ["live_solo", "live_team", "self_paced"];
var Extra = z4.record(z4.string().max(40), z4.union([z4.number(), z4.string().max(200), z4.boolean()]));
var GameEventSchema = z4.object({
  seq: z4.number().int().min(0),
  at: z4.number().int().min(0),
  game: GameKindSchema,
  play_id: z4.string().min(1).max(40),
  owner: z4.string().min(1).max(64),
  student_id: z4.string().max(64).optional(),
  team: z4.string().max(40).optional(),
  /** Item id within the game (a wall id for a Connections guess). */
  item: z4.string().min(1).max(40),
  move: z4.enum(GAME_MOVES),
  /** The cleaned answer. */
  response: z4.unknown().optional(),
  correct: z4.boolean().nullable().optional(),
  /** From the item shown to the move. */
  time_ms: z4.number().int().min(0).max(36e5).optional(),
  /** Per kind: hints, bet, letters_showing, confused_with, group, one_away… */
  extra: Extra.optional(),
  strength: z4.enum(STRENGTHS),
  /** The phone's own id for the move: a batch sent twice never stores it twice. */
  cid: z4.string().max(40).optional()
});
var SoloEventInputSchema = z4.object({
  /** Made by the phone's queue, once per move, so a retried batch is recognised (games.mjs dedupes on it). */
  cid: z4.string().regex(/^[A-Za-z0-9_-]{6,40}$/).optional(),
  item: z4.string().min(1).max(40),
  move: z4.enum(GAME_MOVES),
  response: z4.unknown().optional(),
  time_ms: z4.number().int().min(0).max(36e5).optional(),
  extra: Extra.optional()
});
var PLAY_EVENTS_MAX = 600;
var REVEAL_HINTS = 3;

// apps/teaching/src/games/generators/wordsearch.ts
function lineBetween(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return null;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  return Array.from({ length: n + 1 }, (_, i) => [from[0] + sx * i, from[1] + sy * i]);
}
function readSelection(rows, from, to) {
  const size = rows.length;
  const cells = lineBetween(from, to);
  if (!cells) return null;
  let out = "";
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    out += rows[y]?.[x] ?? "";
  }
  return out;
}
function fullLine(size, p) {
  let { dx, dy } = p;
  if (dx < 0 || dx === 0 && dy < 0) {
    dx = -dx;
    dy = -dy;
  }
  let x = p.x;
  let y = p.y;
  while (x - dx >= 0 && x - dx < size && y - dy >= 0 && y - dy < size) {
    x -= dx;
    y -= dy;
  }
  return { x, y, dx, dy };
}

// apps/teaching/src/games/core/model.ts
function normaliseAnswer(value) {
  return norm(String(value ?? "")).normalize("NFD").replace(/\p{M}+/gu, "").replace(/^(?:a|an|the)\s+/, "").replace(/[\s\-‐-―_]+/g, "");
}
function gameTotal(keys) {
  return Object.values(keys.items).reduce((n, key) => n + (key.shape === "wall" ? key.groups.length : 1), 0);
}
var isRecord2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var textOf = (r) => isRecord2(r) && typeof r.text === "string" ? r.text.slice(0, 400) : "";
function checkAnswer(key, response) {
  switch (key.shape) {
    case "term": {
      const given = normaliseAnswer(textOf(response));
      const kept = { text: textOf(response) };
      if (!given) return { correct: false, response: kept };
      if (key.answers.some((a) => normaliseAnswer(a) === given)) return { correct: true, response: kept };
      const decoy = key.decoys.find((d) => normaliseAnswer(d) === given);
      return { correct: false, response: kept, ...decoy ? { decoy } : {} };
    }
    case "question": {
      const cleaned = cleanResponse(key.key.kind, response);
      const mark = markResponse(key.key, cleaned);
      return { correct: mark.correct === true, mark, response: cleaned };
    }
    case "quote": {
      if (isRecord2(response) && typeof response.speaker === "string") {
        const speaker = response.speaker.slice(0, 40);
        return { correct: speaker === key.speaker, response: { speaker } };
      }
      const given = normaliseAnswer(textOf(response));
      return { correct: !!given && key.answers.some((a) => normaliseAnswer(a) === given), response: { text: textOf(response) } };
    }
    case "wall": {
      const picked = isRecord2(response) && Array.isArray(response.tiles) ? [...new Set(response.tiles.filter((t) => typeof t === "string" && t in key.tiles))].slice(0, 4) : [];
      const kept = { tiles: picked };
      if (picked.length !== 4) return { correct: false, response: kept };
      const hit = key.groups.find((g) => picked.every((t) => g.tiles.includes(t)));
      if (hit) return { correct: true, group: hit.id, response: kept };
      const oneAway = key.groups.some((g) => picked.filter((t) => g.tiles.includes(t)).length === 3);
      return { correct: false, one_away: oneAway, response: kept };
    }
  }
}
var cellKey = (x, y) => `${x},${y}`;
function crosswordHint(grid, itemId, step, typed) {
  const e = grid.entries.find((x) => x.id === itemId);
  if (!e) return [];
  const cellsOf = (x) => Array.from(x.word, (ch, i) => ({ x: x.dir === "across" ? x.x + i : x.x, y: x.dir === "down" ? x.y + i : x.y, ch }));
  const mine = cellsOf(e);
  if (step >= 3) return mine;
  if (step === 2) {
    const at = new Set(mine.map((c) => cellKey(c.x, c.y)));
    return grid.entries.filter((x) => x.dir !== e.dir && cellsOf(x).some((c) => at.has(cellKey(c.x, c.y)))).map((x) => cellsOf(x)[0]);
  }
  const given = typed.toUpperCase();
  return [mine.find((c, i) => given[i] !== c.ch) ?? mine[0]];
}
function wordHint(grid, itemId, step) {
  const p = grid.placements.find((x) => !x.decoy && x.id === itemId);
  if (!p) return {};
  return { first: p.word[0], ...step >= 2 ? { length: p.word.length } : {}, ...step >= 3 ? { line: fullLine(grid.size, p) } : {} };
}
var point = (v, size) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < size) ? [v[0], v[1]] : null;
function checkSelection(grid, clue, response) {
  const r = isRecord2(response) ? response : {};
  const from = point(r.from, grid.size);
  const to = point(r.to, grid.size);
  const text = from && to ? readSelection(grid.rows, from, to) : null;
  if (!from || !to || !text || text.length < 2) return { item: null, correct: null, response: null };
  const kept = { from, to, text };
  const reversed = [...text].reverse().join("");
  const hit = grid.placements.filter((p) => p.word === text || p.word === reversed);
  const own = clue ? hit.find((p) => !p.decoy && p.id === clue) : hit.find((p) => !p.decoy);
  if (own) return { item: own.id, correct: true, response: kept };
  const other = hit[0];
  if (!other) return { item: clue, correct: null, response: kept };
  if (clue) return { item: clue, correct: false, decoy: other.label, response: kept };
  return { item: other.owner, correct: null, decoy: other.label, response: kept };
}
var COUNT_OF = {
  crossword: GAME_COUNTS.crossword,
  find_a_word: GAME_COUNTS.find_a_word,
  team_match: GAME_COUNTS.team_match,
  points_rush: GAME_COUNTS.points_rush,
  wager: GAME_COUNTS.wager,
  articulate: GAME_COUNTS.articulate,
  pictionary: GAME_COUNTS.pictionary,
  who_said_it: GAME_COUNTS.who_said_it,
  wheel: GAME_COUNTS.wheel
};

// apps/teaching/src/games/core/mark.ts
function revealFor(kind, key, check) {
  if (key.shape === "quote" && kind === "who_said_it") return { speaker: key.speaker, ...key.source ? { source: key.source } : {}, ...key.why_fake ? { why_fake: key.why_fake } : {} };
  if (key.shape === "wall" && check.group) {
    const g = key.groups.find((x) => x.id === check.group);
    return g ? { group: { id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: g.tiles } } : void 0;
  }
  if (key.shape === "question" && kind !== "points_rush") return { key: key.key };
  return void 0;
}
var wallMistakes = (game) => Number(game?.settings?.mistakes) || 4;
function markMove(game, keys, history, e, now, who) {
  const kind = keys.kind;
  if (e.cid) {
    const repeat = history.find((x) => x.cid === e.cid);
    if (repeat) return { result: repeat.reply ?? { item: repeat.item }, stored: null };
  }
  const grid = keys.grid ?? null;
  const hintsOn = (item2) => history.filter((x) => x.move === "hint" && x.item === item2).length;
  const solved = (item2) => history.some((x) => x.item === item2 && x.correct === true);
  const selection = kind === "find_a_word" && grid?.kind === "wordsearch" && e.move === "answer" && (e.item === "any" || keys.items[e.item]?.shape === "term");
  const key = keys.items[e.item];
  if (!key && !selection) return { result: { item: e.item }, stored: null, error: "bad_item" };
  const extra = { ...e.extra ?? {} };
  for (const k of ["group", "one_away", "confused_with", "hints"]) delete extra[k];
  let item = e.item;
  let correct = null;
  let response;
  let keep = true;
  const out = { item: e.item };
  if (selection && grid?.kind === "wordsearch") {
    const check = checkSelection(grid, e.item === "any" ? null : e.item, e.response);
    if (!check.item || !check.response) return { result: { item: e.item, correct: false }, stored: null };
    item = check.item;
    response = check.response;
    if (check.correct === true && solved(item)) return { result: { item, correct: true, again: true }, stored: null };
    if (check.correct !== null) correct = check.correct;
    if (check.decoy) extra.confused_with = check.decoy;
    if (check.correct === null && !check.decoy) keep = false;
    extra.hints = hintsOn(item);
    Object.assign(out, { item, correct: check.correct === true, ...check.decoy ? { decoy: true } : {} });
  } else if (key && MARKED_MOVES.has(e.move)) {
    const check = checkAnswer(key, e.response);
    correct = check.correct;
    response = check.response;
    if (check.group) extra.group = check.group;
    if (check.one_away) extra.one_away = true;
    if (check.decoy) extra.confused_with = check.decoy;
    if (grid && key.shape === "term") extra.hints = hintsOn(e.item);
    Object.assign(out, { correct, ...check.one_away ? { one_away: true } : {}, ...check.decoy ? { decoy: true } : {} });
    const reveal = revealFor(kind, key, check);
    if (reveal) out.reveal = reveal;
  } else if (e.move === "pass" && key?.shape === "wall") {
    const wrong = history.filter((x) => x.item === e.item && x.move === "guess" && x.correct === false).length;
    if (wrong >= wallMistakes(game)) {
      const got = new Set(history.filter((x) => x.item === e.item && x.correct === true && typeof x.extra?.group === "string").map((x) => x.extra?.group));
      out.reveal = { groups: key.groups.filter((g) => !got.has(g.id)).map(({ id, label, why, difficulty, tiles }) => ({ id, label, why, difficulty, tiles })) };
    }
  } else if (e.move === "hint" && grid && key?.shape === "term") {
    const step = Math.min(REVEAL_HINTS, hintsOn(e.item) + 1);
    extra.hints = step;
    if (grid.hints !== false) {
      if (grid.kind === "crossword") {
        const r = e.response;
        const typed = typeof r?.letters === "string" ? r.letters.slice(0, 15) : "";
        response = { letters: typed };
        out.reveal = { step, cells: crosswordHint(grid, e.item, step, typed) };
      } else out.reveal = { step, ...wordHint(grid, e.item, step) };
    }
  }
  if (correct === true && grid?.kind === "wordsearch" && grid.message) {
    const terms = Object.entries(keys.items).filter(([, x]) => x.shape === "term").map(([id]) => id);
    if (terms.every((id) => id === item || solved(id))) out.reveal = { ...out.reveal ?? {}, message: grid.message };
  }
  if (!keep) return { result: out, stored: null };
  const stored = {
    at: now,
    game: kind,
    play_id: who.play_id,
    owner: who.owner,
    ...who.student_id ? { student_id: who.student_id } : {},
    item,
    move: e.move,
    ...response !== void 0 ? { response } : {},
    ...correct !== null ? { correct } : {},
    ...e.time_ms !== void 0 ? { time_ms: e.time_ms } : {},
    ...Object.keys(extra).length ? { extra } : {},
    strength: who.strength,
    ...e.cid ? { cid: e.cid, reply: out } : {}
  };
  return { result: out, stored };
}
function quotePoints(correct, fake, ms, seconds) {
  if (!correct) return 0;
  const share = Math.max(0, 1 - ms / Math.max(1, seconds * 1e3));
  return (100 + Math.round(share * 10) * 10) * (fake ? 2 : 1);
}

// apps/teaching/src/games/core/room-protocol.ts
var ROOM_LIMITS = {
  seats: 40,
  /** Messages per seat per 10 s before the room starts dropping them. */
  burst: 60,
  countdownMs: 3e3,
  pacedSeconds: 20,
  /** A room closes itself (and folds) after this. */
  lifeMs: 6 * 60 * 60 * 1e3,
  /** Fold retries with backoff for this long. */
  foldRetryMs: 24 * 60 * 60 * 1e3,
  /** Client: switch to HTTPS polling if the socket isn't open in this time, or drops this many times in a minute. */
  socketOpenMs: 4e3,
  socketDropsPerMinute: 3,
  pollMs: 1e3,
  pingEveryMs: 3e4,
  /** Show at most this many on the board's leaderboard for individual games. */
  leaderboardTop: 5
};

// apps/teaching/src/games/core/room-rules.ts
var registry = /* @__PURE__ */ new Map();
function registerRules(rules) {
  registry.set(rules.kind, rules);
}
function rulesFor(kind) {
  return registry.get(kind);
}

// apps/teaching/src/games/core/room-core.ts
var RACE_KINDS = /* @__PURE__ */ new Set(["crossword", "find_a_word", "connections"]);
var PACED_KINDS = /* @__PURE__ */ new Set(["who_said_it"]);
var GROUP_COLOURS = { 1: "gold", 2: "green", 3: "blue", 4: "purple" };
var TICKER_MAX = 8;
var SEEN_MAX = 200;
var RATE_WINDOW_MS = 1e4;
var CLASS_WALL_MAX = 8;
function roomStyle(kind) {
  if (RACE_KINDS.has(kind)) return "race";
  if (PACED_KINDS.has(kind)) return "paced";
  if (rulesFor(kind)) return "custom";
  return null;
}
function roomTeams(kind) {
  if (RACE_KINDS.has(kind) || PACED_KINDS.has(kind)) return null;
  const t = rulesFor(kind)?.teams;
  return t ? { ...t } : null;
}
var rulesOf = (s) => s.config.style === "custom" ? rulesFor(s.config.game.kind) : void 0;
function teamCount(s) {
  const t = rulesOf(s)?.teams;
  if (!t) return 0;
  const raw = Math.round(Number(s.config.teams?.count ?? t.default));
  return Math.max(t.min, Math.min(t.max, Number.isFinite(raw) ? raw : t.default));
}
var keysOf = (s) => s.config.keys;
var isStudent = (role) => role === "student";
var pacedItems = (s) => (s.config.game.items ?? []).map((i) => i.id);
function itemSeconds(s) {
  const raw = Number(s.config.item_seconds ?? s.config.game.settings?.seconds);
  return Number.isFinite(raw) && raw > 0 ? Math.max(5, Math.min(300, Math.round(raw))) : ROOM_LIMITS.pacedSeconds;
}
function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function nextRandom(s) {
  const a = (s.rng ?? 0) + 1831565813 >>> 0;
  s.rng = a;
  let t = a;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function initialState(config, now) {
  const s = {
    config,
    phase: "lobby",
    seq: 0,
    seats: {},
    history: {},
    item_index: -1,
    ticker: [],
    board_view: "race",
    seen: {},
    conns: {},
    students: {},
    kicked: {},
    rate: {},
    last: {},
    first: {},
    at: now,
    rng: seedOf(config.room)
  };
  const rules = rulesOf(s);
  if (rules) {
    if (rules.teams) s.team_scores = {};
    const k = safe(() => rules.init(rulesCtx(s, now, null)));
    s.custom = isRulesError(k) ? {} : k;
  }
  return s;
}
var isRulesError = (x) => !!x && typeof x === "object" && "error" in x && !!x.error && typeof x.error.code === "string";
var SNAG = { error: { code: "rules_failed", message: "The game hit a snag. Try that again." } };
function safe(fn) {
  try {
    return fn();
  } catch {
    return SNAG;
  }
}
var teamsInUse = (s) => [...new Set(Object.values(s.seats).map((x) => x.team).filter((t) => t !== void 0))].sort((a, b) => a - b);
function smallestTeam(s, count) {
  const size = new Array(count).fill(0);
  for (const seat of Object.values(s.seats)) if (seat.team !== void 0 && seat.team < count) size[seat.team] += 1;
  let best = 0;
  for (let t = 1; t < count; t += 1) if (size[t] < size[best]) best = t;
  return best;
}
function fillTeams(s) {
  const count = teamCount(s);
  if (!count) return;
  for (const seat of Object.values(s.seats)) if (seat.team === void 0 || seat.team >= count) seat.team = smallestTeam(s, count);
}
function shuffleTeams(s) {
  const count = teamCount(s);
  if (!count) return;
  const seats = Object.values(s.seats);
  for (let i = seats.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  seats.forEach((seat, i) => seat.team = i % count);
}
function rulesCtx(s, now, fx) {
  const write = fx !== null;
  const keys = keysOf(s);
  const teamOf = (owner) => s.seats[owner]?.team ?? s.kicked?.[owner]?.team;
  const store = (owner, event) => {
    const history = s.history[owner] ??= [];
    if (history.length >= PLAY_EVENTS_MAX) return false;
    const team = teamOf(owner);
    history.push({ ...event, ...team !== void 0 ? { team: String(team) } : {}, seq: history.length });
    return true;
  };
  const view = { rng: s.rng };
  return {
    now,
    config: s.config,
    game: s.config.game,
    keys,
    random: () => write ? nextRandom(s) : nextRandom(view),
    seats: () => Object.values(s.seats),
    seat: (owner) => s.seats[owner],
    teams: () => teamsInUse(s),
    members: (team) => Object.values(s.seats).filter((x) => x.team === team).map((x) => x.owner),
    mark(owner, event, strength = "live_solo") {
      const history = s.history[owner] ?? [];
      if (write && history.length >= PLAY_EVENTS_MAX) return { error: { code: "too_many", message: "This game has had enough answers." } };
      const who = { play_id: s.config.room, owner, ...s.students?.[owner] ? { student_id: s.students[owner] } : {}, strength };
      const out = markMove(s.config.game, keys, history, event, now, who);
      if (out.error) return { error: { code: "bad_item", message: "That isn\u2019t in this game." } };
      if (write && out.stored) store(owner, out.stored);
      return { result: out.result, stored: out.stored ? { ...out.stored } : null };
    },
    record(owner, event) {
      if (!write) return;
      const { strength, ...rest } = event;
      store(owner, { ...rest, at: now, game: keys.kind, play_id: s.config.room, owner, ...s.students?.[owner] ? { student_id: s.students[owner] } : {}, strength: strength ?? "live_solo" });
    },
    addScore(owner, points) {
      const seat = s.seats[owner];
      if (write && seat && Number.isFinite(points)) seat.score += points;
    },
    setScore(owner, points) {
      const seat = s.seats[owner];
      if (write && seat && Number.isFinite(points)) seat.score = points;
    },
    addTeamScore(team, points) {
      if (!write || !Number.isFinite(points)) return;
      const scores = s.team_scores ??= {};
      scores[team] = (scores[team] ?? 0) + points;
    },
    teamScore: (team) => s.team_scores?.[team] ?? 0,
    setProgress(owner, progress) {
      const seat = s.seats[owner];
      if (!write || !seat) return;
      if (progress) seat.progress = progress;
      else delete seat.progress;
    },
    ticker(text, initials) {
      if (!write) return;
      s.ticker.unshift({ initials: initials ?? "", text: String(text).slice(0, 120), at: now });
      s.ticker.length = Math.min(s.ticker.length, TICKER_MAX);
    },
    send(owner, msg) {
      if (write) fx.push({ kind: "send", owner, msg });
    },
    setTimer(endsAt) {
      if (write) s.ends_at = endsAt !== void 0 && Number.isFinite(endsAt) ? endsAt : void 0;
    },
    end() {
      if (write) endGame(s, now, fx, { finish: false });
    }
  };
}
function runRules(s, now, fx, hook) {
  const rules = rulesOf(s);
  if (!rules) return SNAG;
  return safe(() => hook(rules, rulesCtx(s, now, fx), s.custom));
}
function wallsOf(keys) {
  return Object.entries(keys.items).filter((e) => e[1].shape === "wall");
}
function groupDifficulty(keys, groupId) {
  for (const [, w] of wallsOf(keys)) {
    const g = w.groups.find((x) => x.id === groupId);
    if (g) return g.difficulty;
  }
  return 1;
}
var mistakesAllowed = (s) => Number(s.config.game.settings?.mistakes) || 4;
function raceProgress(s, owner) {
  const keys = keysOf(s);
  const events = s.history[owner] ?? [];
  const total = gameTotal(keys);
  if (keys.kind === "connections") {
    const walls = wallsOf(keys);
    const limit = mistakesAllowed(s);
    const found = [];
    const wrong = /* @__PURE__ */ new Map();
    let lastWall = walls[0]?.[0] ?? "";
    for (const e of events) {
      if (e.move !== "guess") continue;
      lastWall = e.item;
      if (e.correct === true && typeof e.extra?.group === "string" && !found.includes(e.extra.group)) found.push(e.extra.group);
      if (e.correct === false) wrong.set(e.item, (wrong.get(e.item) ?? 0) + 1);
    }
    const over = walls.every(([id, w]) => (wrong.get(id) ?? 0) >= limit || w.groups.every((g) => found.includes(g.id)));
    return {
      progress: { done: found.length, total, mistakes: wrong.get(lastWall) ?? 0, mistakes_max: limit, groups: found.map((g) => groupDifficulty(keys, g)) },
      score: found.length,
      done: walls.length > 0 && over
    };
  }
  const solved = new Set(events.filter((e) => e.correct === true).map((e) => e.item));
  return { progress: { done: solved.size, total }, score: solved.size, done: total > 0 && solved.size >= total };
}
function firstText(s, item, group) {
  const game = s.config.game;
  if (game.kind === "connections") {
    if (!group) return null;
    return { key: `g:${group}`, text: `found the ${GROUP_COLOURS[groupDifficulty(keysOf(s), group)] ?? "gold"} group` };
  }
  if (game.grid?.kind === "crossword") {
    const entry = game.grid.entries.find((x) => x.item === item);
    return entry ? { key: `i:${item}`, text: `solved ${entry.number} ${entry.dir}` } : null;
  }
  if (game.kind === "find_a_word") {
    if (keysOf(s).items[item]?.shape === "question") return { key: `i:${item}`, text: "answered the hidden message" };
    const at = (game.items ?? []).findIndex((x) => x.id === item);
    return at >= 0 ? { key: `i:${item}`, text: `found word ${at + 1}` } : null;
  }
  return null;
}
function studentSeats(s) {
  return Object.values(s.seats).sort((a, b) => b.score - a.score || a.initials.localeCompare(b.initials) || a.owner.localeCompare(b.owner));
}
function ranks(s) {
  const out = /* @__PURE__ */ new Map();
  let rank = 0;
  let prev = null;
  studentSeats(s).forEach((seat, i) => {
    if (seat.score !== prev) rank = i + 1;
    prev = seat.score;
    out.set(seat.owner, rank);
  });
  return out;
}
function classWall(s) {
  const keys = keysOf(s);
  if (keys.kind !== "connections") return [];
  const counts = /* @__PURE__ */ new Map();
  for (const events of Object.values(s.history)) {
    for (const e of events) {
      if (e.move !== "guess" || e.correct !== false) continue;
      const wall = keys.items[e.item];
      if (wall?.shape !== "wall") continue;
      const tiles = e.response?.tiles ?? [];
      const groupOf = (t) => wall.groups.find((g) => g.tiles.includes(t))?.id;
      for (let i = 0; i < tiles.length; i += 1) {
        for (let j = i + 1; j < tiles.length; j += 1) {
          const ti = tiles[i];
          const tj = tiles[j];
          if (groupOf(ti) === groupOf(tj)) continue;
          const [a, b] = [wall.tiles[ti] ?? "", wall.tiles[tj] ?? ""].sort();
          const k = `${a}\0${b}`;
          const row = counts.get(k) ?? { a, b, count: 0 };
          row.count += 1;
          counts.set(k, row);
        }
      }
    }
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.a.localeCompare(y.a)).slice(0, CLASS_WALL_MAX);
}
function seatRestore(s, owner) {
  if (s.config.style !== "race") return void 0;
  const keys = keysOf(s);
  const events = s.history[owner] ?? [];
  if (!events.length) return void 0;
  if (keys.kind === "connections") {
    const limit = mistakesAllowed(s);
    const walls = [];
    for (const [id, w] of wallsOf(keys)) {
      const mine = events.filter((e) => e.item === id && e.move === "guess");
      if (!mine.length) continue;
      const found = /* @__PURE__ */ new Set();
      const guesses = mine.map((e) => {
        if (e.correct === true && typeof e.extra?.group === "string") found.add(e.extra.group);
        const tiles = e.response?.tiles ?? [];
        return { tiles: tiles.filter((t) => typeof t === "string"), correct: e.correct === true };
      });
      const mistakes = guesses.filter((g) => !g.correct).length;
      const out2 = mistakes >= limit && found.size < w.groups.length;
      const group = (g, isFound) => ({ id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: [...g.tiles], found: isFound });
      const groups = [...found].map((gid) => w.groups.find((g) => g.id === gid)).filter((g) => !!g).map((g) => group(g, true));
      if (out2) groups.push(...w.groups.filter((g) => !found.has(g.id)).sort((a, b) => a.difficulty - b.difficulty).map((g) => group(g, false)));
      walls.push({ wall: id, groups, guesses, mistakes, out: out2 });
    }
    return walls.length ? { walls } : void 0;
  }
  const grid = keys.grid ?? null;
  const solved = [];
  const done = /* @__PURE__ */ new Set();
  const hintCount = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.move === "hint") hintCount.set(e.item, (hintCount.get(e.item) ?? 0) + 1);
    if (e.correct !== true || done.has(e.item) || keys.items[e.item]?.shape !== "term") continue;
    done.add(e.item);
    const r = e.response ?? {};
    const hints2 = Math.min(3, Number(e.extra?.hints) || hintCount.get(e.item) || 0);
    const point2 = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n)) ? [p[0], p[1]] : void 0;
    const from = point2(r.from);
    const to = point2(r.to);
    solved.push({ item: e.item, hints: hints2, ...typeof r.text === "string" ? { text: r.text.slice(0, 40) } : {}, ...from && to ? { from, to } : {} });
  }
  const hints = {};
  for (const [item, n] of hintCount) {
    if (done.has(item)) continue;
    const step = Math.min(3, n);
    hints[item] = { step, ...grid?.kind === "wordsearch" && grid.hints !== false ? wordHint(grid, item, step) : {} };
  }
  const out = {};
  if (solved.length) out.solved = solved;
  if (Object.keys(hints).length) out.hints = hints;
  const terms = Object.entries(keys.items).filter(([, x]) => x.shape === "term").map(([id]) => id);
  if (grid?.kind === "wordsearch" && grid.message && terms.length && terms.every((id) => done.has(id))) out.message = grid.message;
  return Object.keys(out).length ? out : void 0;
}
function pacedItemView(s) {
  if (!s.item) return void 0;
  const { choices: _choices, ...item } = s.item;
  return { ...item, answered: [...item.answered] };
}
var sharedCache = /* @__PURE__ */ new WeakMap();
function sharedOf(s) {
  const held = sharedCache.get(s);
  if (held && held.seq === s.seq) return held;
  const all = studentSeats(s);
  const rank = ranks(s);
  const shared = { seq: s.seq, all, rank, leaderboard: all.slice(0, ROOM_LIMITS.leaderboardTop).map((x) => ({ initials: x.initials, score: x.score, rank: rank.get(x.owner) ?? 0 })) };
  const count = teamCount(s);
  if (count) {
    const rows = Array.from({ length: count }, (_, team) => ({ team, score: s.team_scores?.[team] ?? 0, members: all.filter((x) => x.team === team).sort((a, b) => a.initials.localeCompare(b.initials)).map((x) => x.initials), rank: 0 }));
    const sorted = rows.slice().sort((a, b) => b.score - a.score || a.team - b.team);
    sorted.forEach((r, i) => r.rank = i > 0 && sorted[i - 1].score === r.score ? sorted[i - 1].rank : i + 1);
    shared.teams = rows;
    shared.leaderboard = sorted.map((r) => ({ initials: `Team ${r.team + 1}`, score: r.score, rank: r.rank, team: r.team }));
  }
  sharedCache.set(s, shared);
  return shared;
}
function publicView(state, role, owner, now = state.at ?? 0, opts = {}) {
  const s = state;
  const shared = sharedOf(s);
  const { all, rank } = shared;
  const view = {
    room: s.config.room,
    code: s.config.code,
    kind: s.config.game.kind,
    style: s.config.style,
    title: s.config.game.title,
    phase: s.phase,
    now,
    ...s.ends_at !== void 0 && s.phase !== "paused" ? { ends_at: s.ends_at } : {},
    seats: isStudent(role) ? [] : all.map((x) => ({ ...x, ...x.progress ? { progress: { ...x.progress, ...x.progress.groups ? { groups: [...x.progress.groups] } : {} } } : {} })),
    ticker: s.config.style !== "paced" ? s.ticker.slice(0, TICKER_MAX) : [],
    leaderboard: shared.leaderboard.map((x) => ({ ...x })),
    board_view: s.board_view,
    seq: s.seq
  };
  const item = pacedItemView(s);
  if (item) view.item = item;
  if (s.phase === "paused" && s.paused_left_ms !== void 0) view.paused_left_ms = s.paused_left_ms;
  if (shared.teams) {
    const mine = isStudent(role) ? s.seats[owner]?.team : void 0;
    view.teams = shared.teams.map((t) => ({ ...t, members: !isStudent(role) || t.team === mine ? [...t.members] : [] }));
  }
  const rules = rulesOf(s);
  if (rules) {
    const part = safe(() => rules.view(rulesCtx(s, now, null), s.custom, role, owner));
    if (!isRulesError(part) && part !== void 0) view.kind_view = part;
  }
  if (isStudent(role)) {
    const seat = s.seats[owner];
    const last = s.last?.[owner];
    const restore = opts.restore && seat ? seatRestore(s, owner) : void 0;
    view.you = { owner, ...seat ? { seat: { ...seat } } : {}, ...last ? { last } : {}, ...seat ? { rank: rank.get(owner) ?? 0 } : {}, ...restore ? { restore } : {} };
  } else {
    view.you = { owner };
    if (s.config.game.kind === "connections" && (role === "teacher" || s.board_view === "class_wall" || s.phase === "ended" || s.phase === "folded")) view.class_wall = shared.wall ??= classWall(s);
  }
  return view;
}
function viewDelta(prev, next) {
  const patch = {};
  for (const k of Object.keys(prev)) if (!(k in next)) return null;
  for (const [k, v] of Object.entries(next)) {
    if (k === "now" || k === "seq") continue;
    if (JSON.stringify(prev[k]) !== JSON.stringify(v)) patch[k] = v;
  }
  return patch;
}
function nextAlarm(s) {
  if (s.phase === "ended" || s.phase === "folded") return null;
  const life = s.config.opened_at + ROOM_LIMITS.lifeMs;
  if ((s.phase === "countdown" || s.phase === "playing") && s.ends_at !== void 0) return Math.min(s.ends_at, life);
  return life;
}
function foldPayload(s) {
  const seats = [...Object.values(s.seats), ...Object.values(s.kicked ?? {})];
  const events = [];
  for (const [owner, list] of Object.entries(s.history)) {
    for (const e of list) {
      const { reply: _reply, ...rest } = e;
      events.push({ ...rest, owner });
    }
  }
  return {
    room: s.config.room,
    lesson_id: s.config.lesson_id,
    class_id: s.config.class_id,
    game_id: s.config.game.id,
    kind: s.config.game.kind,
    started_at: s.started_at ?? s.config.opened_at,
    ended_at: s.ended_at ?? s.at ?? s.config.opened_at,
    strength: "live_solo",
    seats: seats.map((x) => ({ owner: x.owner, ...s.students?.[x.owner] ? { student_id: s.students[x.owner] } : {}, initials: x.initials, ...x.team !== void 0 ? { team: x.team } : {}, score: x.score })),
    ...s.team_scores ? { team_scores: { ...s.team_scores } } : {},
    events
  };
}
var ack = (fx, owner, conn, rid, body) => fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "ack", ...rid ? { rid } : {}, ...body } });
var fail = (fx, owner, conn, rid, code, message) => ack(fx, owner, conn, rid, { error: { code, message } });
function remember(s, owner, rid, result) {
  if (!rid) return;
  const mine = s.seen[owner] ??= {};
  mine[rid] = result;
  const ids = Object.keys(mine);
  if (ids.length > SEEN_MAX) for (const id of ids.slice(0, ids.length - SEEN_MAX)) delete mine[id];
}
function newSeat(s, owner, initials) {
  const seat = { owner, initials, connected: true, score: 0 };
  if (s.config.style === "race") seat.progress = raceProgress(s, owner).progress;
  else if (s.config.style === "paced") seat.progress = { done: 0, total: pacedItems(s).length };
  const count = teamCount(s);
  if (count) seat.team = smallestTeam(s, count);
  return seat;
}
function openItem(s, index, now) {
  const ids = pacedItems(s);
  const id = ids[index];
  if (id === void 0) return;
  const ends = now + itemSeconds(s) * 1e3;
  s.item_index = index;
  s.item = { item: id, index, of: ids.length, opened_at: now, ends_at: ends, answered: [], choices: {} };
  s.ends_at = ends;
}
function revealItem(s) {
  const item = s.item;
  if (!item || item.revealed) return;
  const key = keysOf(s).items[item.item];
  const counts = {};
  for (const c of Object.values(item.choices)) counts[c.choice] = (counts[c.choice] ?? 0) + 1;
  const reveal = key ? revealFor(keysOf(s).kind, key, {}) : void 0;
  item.revealed = { counts, reveal };
  const fake = key?.shape === "quote" && key.speaker === FAKE_SPEAKER;
  const seconds = itemSeconds(s);
  for (const [owner, seat] of Object.entries(s.seats)) {
    const choice = item.choices[owner];
    const event = choice ? [...s.history[owner] ?? []].reverse().find((e) => e.item === item.item && e.move === "answer") : void 0;
    const correct = event?.correct === true;
    if (choice) {
      seat.score += quotePoints(correct, fake, Math.max(0, choice.at - item.opened_at), seconds);
      if (correct && seat.progress) seat.progress = { ...seat.progress, done: seat.progress.done + 1 };
    }
    (s.last ??= {})[owner] = { item: item.item, ...choice ? { correct } : {}, ...reveal ? { reveal } : {} };
  }
  s.ends_at = void 0;
}
function endGame(s, now, fx, opts = {}) {
  if (s.phase === "ended" || s.phase === "folded") return;
  if (s.config.style === "paced") revealItem(s);
  if (s.config.style === "custom" && opts.finish !== false && rulesOf(s)?.finish) {
    runRules(s, now, fx, (r, ctx, k) => r.finish?.(ctx, k));
    if (s.phase === "ended") return;
  }
  s.phase = "ended";
  s.ended_at = now;
  s.ends_at = void 0;
  s.paused_left_ms = void 0;
  fx.push({ kind: "fold", payload: foldPayload(s) });
}
function onConnect(s, a, now, fx) {
  const { owner, role, conn } = a;
  const close = (msg) => fx.push({ kind: "close", owner, ...conn ? { conn } : {}, msg });
  let changed = false;
  if (isStudent(role)) {
    if (s.kicked?.[owner]) return close({ t: "kicked" }), false;
    const initials = a.student_id ? s.config.roster[a.student_id] : void 0;
    if (!a.student_id || !initials) return close({ t: "error", code: "not_on_list", message: "You\u2019re not on this class list. Ask your teacher." }), false;
    const seat = s.seats[owner];
    if (seat) {
      if (!seat.connected) changed = true;
      seat.connected = true;
    } else if (s.phase !== "ended" && s.phase !== "folded") {
      if (Object.keys(s.seats).length >= ROOM_LIMITS.seats) return close({ t: "error", code: "room_full", message: "This game is full." }), false;
      s.seats[owner] = newSeat(s, owner, initials);
      s.history[owner] ??= [];
      (s.students ??= {})[owner] = a.student_id;
      changed = true;
    }
    if (changed) seatChanged(s, owner, now, fx);
  }
  const conns = s.conns ??= {};
  const old = conns[owner];
  if (old && conn && old !== conn) fx.push({ kind: "close", owner, conn: old, msg: { t: "replaced" } });
  if (conn) conns[owner] = conn;
  fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "snapshot", view: publicView(s, role, owner, now, { restore: true }) } });
  return changed;
}
function seatChanged(s, owner, now, fx) {
  if (s.config.style === "custom" && (s.phase === "playing" || s.phase === "paused") && rulesOf(s)?.seatChanged) runRules(s, now, fx, (r, ctx, k) => r.seatChanged?.(ctx, k, owner));
}
function onDisconnect(s, a, now, fx) {
  const conns = s.conns ??= {};
  if (a.conn && conns[a.owner] && conns[a.owner] !== a.conn) return false;
  delete conns[a.owner];
  const seat = s.seats[a.owner];
  if (!seat || !seat.connected) return false;
  seat.connected = false;
  seatChanged(s, a.owner, now, fx);
  return true;
}
function rateLimited(s, owner, now, burst = ROOM_LIMITS.burst) {
  const rate = s.rate ??= {};
  const r = rate[owner];
  if (!r || now - r.at >= RATE_WINDOW_MS) {
    rate[owner] = { at: now, n: 1 };
    return false;
  }
  r.n += 1;
  return r.n > burst;
}
function validMove(ev) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return false;
  const e = ev;
  if (typeof e.item !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(e.item)) return false;
  if (typeof e.move !== "string" || !GAME_MOVES.includes(e.move)) return false;
  if (e.cid !== void 0 && (typeof e.cid !== "string" || !/^[A-Za-z0-9_-]{6,40}$/.test(e.cid))) return false;
  if (e.time_ms !== void 0 && (typeof e.time_ms !== "number" || !Number.isInteger(e.time_ms) || e.time_ms < 0 || e.time_ms > 36e5)) return false;
  if (e.extra !== void 0 && (typeof e.extra !== "object" || e.extra === null || Array.isArray(e.extra) || Object.keys(e.extra).length > 20)) return false;
  try {
    if (JSON.stringify(e.response ?? null).length > 2e3) return false;
  } catch {
    return false;
  }
  return true;
}
var PHASE_ERRORS = {
  lobby: ["not_started", "The game hasn\u2019t started yet."],
  countdown: ["not_started", "Nearly: the game is about to start."],
  paused: ["paused", "The game is paused."],
  ended: ["ended", "This game has finished."],
  folded: ["ended", "This game has finished."]
};
function onMove(s, owner, conn, msg, now, fx) {
  const seat = s.seats[owner];
  if (!seat) return fail(fx, owner, conn, msg.rid, "no_seat", "Join the game first."), false;
  const phaseError = PHASE_ERRORS[s.phase];
  if (phaseError) return fail(fx, owner, conn, msg.rid, phaseError[0], phaseError[1]), false;
  if (!validMove(msg.event)) return fail(fx, owner, conn, msg.rid, "bad_event", "That move couldn\u2019t be read."), false;
  const history = s.history[owner] ??= [];
  if (history.length >= PLAY_EVENTS_MAX) return fail(fx, owner, conn, msg.rid, "too_many", "This game has had enough answers."), false;
  const keys = keysOf(s);
  const who = { play_id: s.config.room, owner, ...s.students?.[owner] ? { student_id: s.students[owner] } : {}, strength: "live_solo" };
  if (s.config.style === "custom") {
    const out = runRules(s, now, fx, (r, ctx, k) => r.move(ctx, k, owner, msg.event));
    if (isRulesError(out)) return fail(fx, owner, conn, msg.rid, out.error.code, out.error.message), false;
    const result2 = out && typeof out === "object" ? out : { item: msg.event.item };
    remember(s, owner, msg.rid, result2);
    (s.last ??= {})[owner] = result2;
    ack(fx, owner, conn, msg.rid, { result: result2 });
    return true;
  }
  if (s.config.style === "paced") {
    const item = s.item;
    if (!item || item.revealed || msg.event.item !== item.item) return fail(fx, owner, conn, msg.rid, "not_open", "That quote has closed."), false;
    if (msg.event.move !== "answer") return fail(fx, owner, conn, msg.rid, "bad_event", "Pick an answer."), false;
    if (item.choices[owner]) return fail(fx, owner, conn, msg.rid, "answered", "You\u2019ve already answered this one."), false;
    const event = { ...msg.event, time_ms: Math.min(36e5, Math.max(0, now - item.opened_at)) };
    const { stored: stored2, error: error2 } = markMove(s.config.game, keys, history, event, now, who);
    if (error2 || !stored2) return fail(fx, owner, conn, msg.rid, "bad_item", "That isn\u2019t in this game."), false;
    history.push({ ...stored2, seq: history.length });
    const r = stored2.response;
    const choice = typeof r?.speaker === "string" ? r.speaker : "text";
    item.choices[owner] = { choice, at: now };
    item.answered.push(owner);
    const result2 = { item: item.item };
    remember(s, owner, msg.rid, result2);
    ack(fx, owner, conn, msg.rid, { result: result2 });
    const live = Object.values(s.seats).filter((x) => x.connected);
    if (live.length > 0 && live.every((x) => item.choices[x.owner])) revealItem(s);
    return true;
  }
  const { result, stored, error } = markMove(s.config.game, keys, history, msg.event, now, who);
  if (error) return fail(fx, owner, conn, msg.rid, "bad_item", "That isn\u2019t in this game."), false;
  remember(s, owner, msg.rid, result);
  (s.last ??= {})[owner] = result;
  ack(fx, owner, conn, msg.rid, { result });
  if (!stored) return false;
  history.push({ ...stored, seq: history.length });
  const p = raceProgress(s, owner);
  seat.progress = p.progress;
  seat.score = p.score;
  if (p.done) seat.finished = true;
  if (stored.correct === true) {
    const first = firstText(s, stored.item, typeof stored.extra?.group === "string" ? stored.extra.group : void 0);
    if (first && !s.first?.[first.key]) {
      (s.first ??= {})[first.key] = true;
      s.ticker.unshift({ initials: seat.initials, text: first.text, at: now });
      s.ticker.length = Math.min(s.ticker.length, TICKER_MAX);
    }
  }
  return true;
}
var CONTROL_NAME = /^[A-Za-z0-9_-]{1,40}$/;
function kindControl(s, owner, role, op, now, fx) {
  const rules = rulesOf(s);
  if (!rules?.control) return { error: { code: "bad_control", message: "This game has no such control." } };
  const name = op.op === "kind" ? op.name : op.op;
  if (typeof name !== "string" || !CONTROL_NAME.test(name)) return { error: { code: "bad_control", message: "Unknown control." } };
  const data = op.op === "kind" ? op.data : void 0;
  try {
    if (data !== void 0 && JSON.stringify(data).length > 4e3) return { error: { code: "bad_control", message: "That was too much to send at once." } };
  } catch {
    return { error: { code: "bad_control", message: "That couldn\u2019t be read." } };
  }
  if (s.phase === "ended" || s.phase === "folded") return { error: { code: "ended", message: "This game has finished." } };
  if (s.phase === "paused") return { error: { code: "paused", message: "The game is paused." } };
  if (s.phase === "countdown") return { error: { code: "not_started", message: "Nearly: the game is about to start." } };
  if (s.phase === "lobby" && (isStudent(role) || op.op !== "kind")) return { error: { code: "not_started", message: "The game hasn\u2019t started yet." } };
  const control = { name, ...data !== void 0 ? { data } : {} };
  const out = runRules(s, now, fx, (r, ctx, k) => r.control?.(ctx, k, control, { owner, role }));
  return isRulesError(out) ? out : null;
}
function onControl(s, owner, role, conn, rid, op, now, fx) {
  const ok = () => {
    remember(s, owner, rid, null);
    ack(fx, owner, conn, rid, {});
    return true;
  };
  const no = (code, message) => (fail(fx, owner, conn, rid, code, message), false);
  const paced = s.config.style === "paced";
  if (s.config.style === "custom" && (op.op === "kind" || op.op === "next" || op.op === "reveal")) {
    const err = kindControl(s, owner, role, op, now, fx);
    return err ? no(err.error.code, err.error.message) : ok();
  }
  switch (op.op) {
    case "start":
      if (s.phase !== "lobby") return no("started", "The game has already started.");
      s.phase = "countdown";
      s.ends_at = now + ROOM_LIMITS.countdownMs;
      return ok();
    case "pause":
      if (s.phase !== "playing") return no("not_playing", "Only a running game can pause.");
      s.phase = "paused";
      s.paused_left_ms = s.ends_at !== void 0 ? Math.max(0, s.ends_at - now) : void 0;
      return ok();
    case "resume": {
      if (s.phase !== "paused") return no("not_paused", "The game isn\u2019t paused.");
      s.phase = "playing";
      if (s.paused_left_ms !== void 0) {
        const ends = now + s.paused_left_ms;
        if (s.item && !s.item.revealed) {
          const shift = ends - s.item.ends_at;
          s.item.opened_at += shift;
          s.item.ends_at = ends;
          for (const c of Object.values(s.item.choices)) c.at += shift;
        }
        s.ends_at = ends;
      }
      s.paused_left_ms = void 0;
      return ok();
    }
    case "add_time": {
      const ms = Math.max(1, Math.min(300, Math.round(Number(op.seconds) || 0))) * 1e3;
      if (s.phase === "paused" && s.paused_left_ms !== void 0) s.paused_left_ms += ms;
      else if ((s.phase === "playing" || s.phase === "countdown") && s.ends_at !== void 0) s.ends_at += ms;
      else return no("no_timer", "There\u2019s no timer running.");
      if (s.item && !s.item.revealed && s.phase !== "paused") s.item.ends_at = s.ends_at;
      if (s.item && !s.item.revealed && s.phase === "paused") s.item.ends_at += ms;
      return ok();
    }
    case "reveal":
      if (!paced) return no("not_paced", "Each player sees their own answers in this game.");
      if (s.phase !== "playing" || !s.item || s.item.revealed) return no("not_open", "Nothing to reveal.");
      revealItem(s);
      return ok();
    case "next": {
      if (!paced) return no("not_paced", "Everyone plays at their own pace in this game.");
      if (s.phase !== "playing") return no("not_playing", "Start or resume the game first.");
      revealItem(s);
      const at = s.item_index + 1;
      if (at >= pacedItems(s).length) endGame(s, now, fx);
      else openItem(s, at, now);
      return ok();
    }
    case "kick": {
      const seat = s.seats[op.owner];
      if (!seat) return no("no_seat", "That player isn\u2019t here.");
      delete s.seats[op.owner];
      (s.kicked ??= {})[op.owner] = { ...seat, connected: false };
      if (s.conns) delete s.conns[op.owner];
      if (s.item) s.item.answered = s.item.answered.filter((x) => x !== op.owner);
      fx.push({ kind: "close", owner: op.owner, msg: { t: "kicked" } });
      seatChanged(s, op.owner, now, fx);
      return ok();
    }
    case "move_team": {
      const count = teamCount(s);
      if (!count) return no("no_teams", "This game isn\u2019t played in teams.");
      if (s.phase !== "lobby") return no("started", "Teams are set once the game starts.");
      const seat = s.seats[op.owner];
      if (!seat) return no("no_seat", "That player isn\u2019t here.");
      const team = Number(op.team);
      if (!Number.isInteger(team) || team < 0 || team >= count) return no("bad_team", "There\u2019s no such team.");
      seat.team = team;
      return ok();
    }
    case "shuffle_teams":
      if (!teamCount(s)) return no("no_teams", "This game isn\u2019t played in teams.");
      if (s.phase !== "lobby") return no("started", "Teams are set once the game starts.");
      shuffleTeams(s);
      return ok();
    case "board_view":
      if (op.view !== "race" && op.view !== "class_wall") return no("bad_view", "Unknown view.");
      s.board_view = op.view;
      return ok();
    case "end":
      if (s.phase === "ended" || s.phase === "folded") return no("ended", "This game has finished.");
      endGame(s, now, fx);
      return ok();
    default:
      return no("bad_control", "Unknown control.");
  }
}
function onMsg(s, a, now, fx) {
  const { owner, role, msg, conn } = a;
  if (!msg || typeof msg !== "object" || typeof msg.t !== "string") {
    fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "error", code: "bad_message", message: "That message couldn\u2019t be read." } });
    return false;
  }
  const rid = typeof msg.rid === "string" ? msg.rid.slice(0, 64) : void 0;
  if (msg.t === "ping") {
    fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "pong", ...rid ? { rid } : {}, sent: Number(msg.sent) || 0, now } });
    return false;
  }
  if (rateLimited(s, owner, now, rulesOf(s)?.burst ?? ROOM_LIMITS.burst)) return fail(fx, owner, conn, rid, "slow_down", "Too many moves at once. Wait a moment."), false;
  if (rid && s.seen[owner] && rid in s.seen[owner]) {
    const result = s.seen[owner][rid];
    ack(fx, owner, conn, rid, result ? { result } : {});
    return false;
  }
  switch (msg.t) {
    case "hello":
      fx.push({ kind: "send", owner, ...conn ? { conn } : {}, msg: { t: "snapshot", view: publicView(s, role, owner, now, { restore: true }) } });
      return false;
    case "move":
      if (!isStudent(role)) return fail(fx, owner, conn, rid, "not_a_player", "Only players make moves."), false;
      return onMove(s, owner, conn, { ...msg, ...rid ? { rid } : {} }, now, fx);
    case "finish": {
      const seat = s.seats[owner];
      if (!isStudent(role) || !seat) return fail(fx, owner, conn, rid, "no_seat", "Join the game first."), false;
      remember(s, owner, rid, null);
      ack(fx, owner, conn, rid, {});
      if (seat.finished) return false;
      seat.finished = true;
      return true;
    }
    case "control": {
      const op = msg.op ?? {};
      if (isStudent(role)) {
        if (s.config.style !== "custom" || op.op !== "kind") return fail(fx, owner, conn, rid, "not_allowed", "Only your teacher can do that."), false;
        if (!s.seats[owner]) return fail(fx, owner, conn, rid, "no_seat", "Join the game first."), false;
      }
      return onControl(s, owner, role, conn, rid, op, now, fx);
    }
    default:
      return fail(fx, owner, conn, rid, "bad_message", "That message couldn\u2019t be read."), false;
  }
}
function onTick(s, now, fx) {
  if (s.phase === "ended" || s.phase === "folded") return false;
  if (now >= s.config.opened_at + ROOM_LIMITS.lifeMs) {
    endGame(s, now, fx);
    return true;
  }
  if (s.phase === "countdown" && s.ends_at !== void 0 && now >= s.ends_at) {
    s.phase = "playing";
    s.started_at = now;
    s.ends_at = void 0;
    if (s.config.style === "paced") openItem(s, 0, now);
    if (s.config.style === "custom") {
      fillTeams(s);
      runRules(s, now, fx, (r, ctx, k) => r.start(ctx, k));
    }
    return true;
  }
  if (s.config.style === "custom" && s.phase === "playing" && s.ends_at !== void 0 && now >= s.ends_at) {
    s.ends_at = void 0;
    runRules(s, now, fx, (r, ctx, k) => r.tick?.(ctx, k));
    return true;
  }
  if (s.phase === "playing" && s.item && !s.item.revealed && now >= s.item.ends_at) {
    revealItem(s);
    return true;
  }
  return false;
}
var reduce = (state, action, now) => {
  const s = state;
  const fx = [];
  const alarmBefore = nextAlarm(s);
  sharedCache.delete(s);
  s.at = now;
  let changed = false;
  switch (action.type) {
    case "connect":
      changed = onConnect(s, action, now, fx);
      break;
    case "disconnect":
      changed = onDisconnect(s, action, now, fx);
      break;
    case "msg":
      changed = onMsg(s, action, now, fx);
      break;
    case "tick":
      changed = onTick(s, now, fx);
      break;
    case "folded":
      if (s.phase !== "folded") {
        s.phase = "folded";
        s.folded = true;
        changed = true;
      }
      break;
  }
  if (changed) {
    s.seq += 1;
    fx.push({ kind: "broadcast" });
  }
  const alarmAfter = nextAlarm(s);
  if (alarmAfter !== null && alarmAfter !== alarmBefore) fx.push({ kind: "alarm", at: alarmAfter });
  return { state: s, effects: fx };
};

// apps/teaching/src/games/core/room-ticket.ts
var TICKET_LIFE_MS = { student: 3 * 60 * 60 * 1e3, teacher: 6 * 60 * 60 * 1e3, board: 6 * 60 * 60 * 1e3 };
var SIGNATURE_HEADER = "x-game-room-signature";
var SIGNATURE_SKEW_MS = 5 * 60 * 1e3;
var enc = new TextEncoder();
var dec = new TextDecoder();
function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
var keyCache = /* @__PURE__ */ new Map();
function hmacKey(secret) {
  if (!secret || secret.length < 16) throw new Error("GAME_ROOM_SECRET is missing or too short.");
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, key);
  }
  return key;
}
async function sign(secret, text) {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(text))));
}
async function verify(secret, text, sig) {
  const bytes = unb64url(sig);
  if (!bytes || bytes.length !== 32) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), bytes, enc.encode(text));
}
var ROLES = /* @__PURE__ */ new Set(["teacher", "student", "board"]);
async function signTicket(secret, payload, now) {
  const full = { ...payload, exp: payload.exp ?? now + TICKET_LIFE_MS[payload.role] };
  const body = b64url(enc.encode(JSON.stringify(full)));
  return `${body}.${await sign(secret, body)}`;
}
async function verifyTicket(secret, token, now, expect = {}) {
  if (typeof token !== "string" || token.length > 2e3) return { ok: false, code: "bad_ticket" };
  const [body, sig, more] = token.split(".");
  if (!body || !sig || more !== void 0) return { ok: false, code: "bad_ticket" };
  if (!await verify(secret, body, sig)) return { ok: false, code: "bad_ticket" };
  const bytes = unb64url(body);
  let payload;
  try {
    payload = JSON.parse(dec.decode(bytes ?? new Uint8Array()));
  } catch {
    return { ok: false, code: "bad_ticket" };
  }
  if (!payload || typeof payload.room !== "string" || typeof payload.owner !== "string" || !ROLES.has(payload.role) || typeof payload.exp !== "number") return { ok: false, code: "bad_ticket" };
  if (payload.exp <= now) return { ok: false, code: "expired" };
  if (expect.room !== void 0 && payload.room !== expect.room) return { ok: false, code: "wrong_room" };
  if (expect.roles && !expect.roles.includes(payload.role)) return { ok: false, code: "wrong_role" };
  return { ok: true, ticket: payload };
}
async function signBody(secret, body, now) {
  return `t=${now},s=${await sign(secret, `${now}.${body}`)}`;
}
async function verifyBody(secret, body, header, now) {
  const m = /^t=(\d{1,16}),s=([A-Za-z0-9_-]{20,100})$/.exec(String(header ?? ""));
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > SIGNATURE_SKEW_MS) return false;
  return verify(secret, `${t}.${body}`, m[2]);
}
function ticketFromAuthorization(header) {
  const m = /^Ticket\s+(\S+)$/.exec(String(header ?? "").trim());
  return m ? m[1] : null;
}
export {
  GROUP_COLOURS,
  ROOM_LIMITS,
  SIGNATURE_HEADER,
  SIGNATURE_SKEW_MS,
  TICKET_LIFE_MS,
  classWall,
  foldPayload,
  initialState,
  markMove,
  nextAlarm,
  publicView,
  quotePoints,
  reduce,
  registerRules,
  roomStyle,
  roomTeams,
  rulesFor,
  seatRestore,
  signBody,
  signTicket,
  teamCount,
  ticketFromAuthorization,
  verifyBody,
  verifyTicket,
  viewDelta
};
