// Generated from apps/teaching/src/games/core/server-entry.ts; regenerate with scripts/generate-alchemy-schema.mjs.

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
var AI_MARK_KINDS = ["short_answer", "fill_gap", "explain_effect", "extended_response"];
function aiMarkOn(q) {
  if (!AI_MARK_KINDS.includes(q.kind)) return false;
  return q.ai_mark ?? (q.kind === "short_answer" || q.kind === "fill_gap");
}
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
function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function scrambled(list, random) {
  if (list.length < 2) return [...list];
  for (let tries = 0; tries < 8; tries++) {
    const out = shuffled(list, random);
    if (out.some((item, i) => item !== list[i])) return out;
  }
  return [...list.slice(1), list[0]];
}
function idMaker(random) {
  const used = /* @__PURE__ */ new Set();
  return () => {
    for (; ; ) {
      const id = Array.from({ length: 8 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(random() * 31)]).join("");
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
}
function techniquesOf(options, ids) {
  const map = {};
  for (const o of options) if (o.technique_id) map[ids.get(o.id)] = o.technique_id;
  return Object.keys(map).length ? { techniques: map } : {};
}
function writingSteps(q) {
  if (!q.skills?.length || !q.next_steps || !Object.keys(q.next_steps).length) return {};
  return { skills: [...q.skills], next_steps: q.next_steps };
}
function splitQuestion(q, random = Math.random) {
  const fresh = idMaker(random);
  const head = {
    id: q.id,
    kind: q.kind,
    prompt: q.prompt,
    marks: q.marks,
    has_hint: !!q.hint?.trim(),
    ...q.image ? { image: q.image } : {}
  };
  const keyHead = {
    id: q.id,
    kind: q.kind,
    marks: q.marks,
    ...q.hint?.trim() ? { hint: q.hint.trim() } : {},
    ...q.explanation?.trim() ? { explanation: q.explanation.trim() } : {},
    ...q.outcomes?.length ? { outcomes: [...q.outcomes] } : {},
    ...q.skills?.length ? { skills: [...q.skills] } : {},
    ...q.pieces?.length ? { pieces: [...q.pieces] } : {},
    ...aiMarkOn(q) ? { ai: true } : {}
  };
  switch (q.kind) {
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique": {
      const ids = new Map(q.options.map((o) => [o.id, fresh()]));
      const options = shuffled(q.options, random).map((o) => ({ id: ids.get(o.id), text: o.text }));
      const question = { ...head, kind: q.kind, options, ...q.kind === "quote_technique" ? { quote: q.quote } : {} };
      return {
        question,
        key: { ...keyHead, ...q.kind === "quote_technique" ? techniquesOf(q.options, ids) : {}, answer: { type: "choice", ids: q.correct.map((id) => ids.get(id)) } }
      };
    }
    case "true_false":
      return { question: { ...head, kind: "true_false" }, key: { ...keyHead, answer: { type: "boolean", value: q.answer } } };
    case "short_answer":
      return {
        question: { ...head, kind: "short_answer" },
        key: { ...keyHead, ...q.looking_for?.trim() ? { looking_for: q.looking_for.trim() } : {}, answer: { type: "text", accepted: q.accepted, case_sensitive: !!q.case_sensitive } }
      };
    case "fill_gap": {
      const gaps = {};
      const parts = parseGapPassage(q.passage).map((part) => {
        if (part.type === "text") return part;
        const id = fresh();
        gaps[id] = part.answers;
        return { type: "gap", id };
      });
      const bank = q.word_bank ? shuffled(Object.values(gaps).map((a) => a[0]), random) : void 0;
      return {
        question: { ...head, kind: "fill_gap", parts, ...bank ? { bank } : {} },
        key: { ...keyHead, answer: { type: "gaps", gaps } }
      };
    }
    case "matching": {
      const map = {};
      const left = [];
      const right = [];
      for (const pair of q.pairs) {
        const l = fresh();
        const r = fresh();
        map[l] = r;
        left.push({ id: l, text: pair.left });
        right.push({ id: r, text: pair.right });
      }
      return {
        question: { ...head, kind: "matching", left: shuffled(left, random), right: scrambled(right, random) },
        key: { ...keyHead, answer: { type: "map", map } }
      };
    }
    case "ordering": {
      const items = q.items.map((i) => ({ id: fresh(), text: i.text }));
      return {
        question: { ...head, kind: "ordering", items: scrambled(items, random) },
        key: { ...keyHead, answer: { type: "order", ids: items.map((i) => i.id) } }
      };
    }
    case "categorise": {
      const groupIds = new Map(q.groups.map((g) => [g.id, fresh()]));
      const map = {};
      const items = q.items.map((i) => {
        const id = fresh();
        map[id] = groupIds.get(i.group);
        return { id, text: i.text };
      });
      return {
        question: {
          ...head,
          kind: "categorise",
          groups: q.groups.map((g) => ({ id: groupIds.get(g.id), text: g.name })),
          items: shuffled(items, random)
        },
        key: { ...keyHead, answer: { type: "map", map } }
      };
    }
    case "find_it": {
      const ids = new Map(q.segments.map((s) => [s.id, fresh()]));
      return {
        question: {
          ...head,
          kind: "find_it",
          segments: q.segments.map((s) => ({ id: ids.get(s.id), text: s.text })),
          pick: q.correct.length
        },
        key: { ...keyHead, answer: { type: "choice", ids: q.correct.map((id) => ids.get(id)) } }
      };
    }
    case "spot_technique": {
      const ids = new Map(q.options.map((o) => [o.id, fresh()]));
      const options = shuffled(q.options, random).map((o) => ({ id: ids.get(o.id), text: o.text, ...(o.uses ?? 1) > 1 ? { uses: o.uses } : {} }));
      const targets = q.targets.flatMap((t) => {
        const span = locateQuote(q.passage, t.quote);
        return span ? [{ ...span, ids: t.correct.map((id) => ids.get(id)).filter((id) => !!id) }] : [];
      });
      const pick = Math.min(q.find ?? targets.length, targets.length);
      return {
        question: { ...head, kind: "spot_technique", passage: q.passage, options, pick },
        key: { ...keyHead, ...techniquesOf(q.options, ids), answer: { type: "spots", passage: q.passage, targets, pick } }
      };
    }
    case "label_image": {
      const map = {};
      const labels = [];
      const pins = q.pins.map((pin, i) => {
        const id = fresh();
        const label = fresh();
        map[id] = label;
        labels.push({ id: label, text: pin.label });
        return { id, x: pin.x, y: pin.y, n: i + 1 };
      });
      return {
        question: { ...head, kind: "label_image", image: q.image, pins, labels: scrambled(labels, random) },
        key: { ...keyHead, answer: { type: "map", map } }
      };
    }
    case "extended_response":
      return {
        question: { ...head, kind: "extended_response", ...writingSteps(q) },
        key: { ...keyHead, answer: { type: "manual", model_answer: q.model_answer, guide: q.guide } }
      };
    case "explain_effect":
      return {
        question: { ...head, kind: "explain_effect", quote: q.quote, ...q.technique ? { technique: q.technique } : {}, ...writingSteps(q) },
        key: { ...keyHead, answer: { type: "manual", model_answer: q.model_answer, guide: q.guide } }
      };
  }
}
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
        const named2 = t !== null && t !== void 0 && !!a.targets[t]?.ids.includes(spot.option);
        parts[`s${i}`] = named2;
        parts[`s${i}.found`] = t !== null && t !== void 0;
        credit += named2 ? 1 : parts[`s${i}.found`] ? 0.5 : 0;
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
function checkQuestion(input) {
  const raw = input && typeof input === "object" ? input : {};
  if (raw.kind !== "fill_gap" && QUIZ_QUESTION_KINDS.includes(raw.kind) && !String(raw.prompt ?? "").trim()) {
    return { ok: false, message: "Write the question." };
  }
  const parsed = QuizQuestionSchema.safeParse(input);
  if (parsed.success) return { ok: true, question: parsed.data };
  const issue = parsed.error.issues[0];
  if (!issue) return { ok: false, message: "Check the question." };
  if (issue.code === "custom") return { ok: false, message: issue.message };
  const field = String(issue.path[0] ?? "");
  const messages = {
    prompt: "Write the question.",
    options: "Fill in every option.",
    correct: "Tick the right answer.",
    accepted: "Give at least one accepted answer.",
    passage: "Write the sentence or quote.",
    pairs: "Fill in both sides of every pair.",
    items: "Fill in every item.",
    groups: "Name every group.",
    quote: "Paste the quote.",
    segments: "Paste a passage of at least two lines.",
    targets: "Select the words for at least one answer and name its technique.",
    pins: "Add at least two pins, each with a label.",
    image: "Choose an image.",
    marks: `Marks must be between 1 and ${QUIZ_LIMITS.marksMax}.`
  };
  if (raw.kind === "spot_technique" && field === "passage") return { ok: false, message: "Paste the passage." };
  if (raw.kind === "spot_technique" && field === "options") return { ok: false, message: "Fill in every technique." };
  return { ok: false, message: messages[field] ?? "Check the question: something is missing or too long." };
}

// apps/teaching/src/games/core/schema.ts
import { z as z3 } from "zod";
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
  settings: z3.object({ seed: Seed, directions: z3.enum(["easy", "all"]).default("all"), hints: z3.boolean().default(true) }).prefault({})
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
  message: z3.object({ length: z3.number().int(), question: z3.record(z3.string(), z3.unknown()).optional() }).optional()
});
var PublicGameLessonSchema = z3.object({
  games: z3.array(PublicGameSchema).max(GAME_LIMITS.games),
  homework_closes_at: z3.string().optional(),
  /** The publish version the keys are stored under. */
  version: z3.string()
});

// apps/teaching/src/games/core/model.ts
function normaliseAnswer(value) {
  return norm(String(value ?? "")).normalize("NFD").replace(/\p{M}+/gu, "").replace(/^(?:a|an|the)\s+/, "").replace(/[\s\-‐-―_]+/g, "");
}
function wordLengths(term) {
  return norm(term).split(/[\s\-‐-―]+/).map((w) => w.normalize("NFD").replace(/\p{M}+/gu, "").length).filter((n) => n > 0);
}
var gridWord = (term) => normaliseAnswer(term).toUpperCase();
function evidenceTags(tags, extra) {
  const out = [
    ...[...tags.outcomes ?? [], ...extra?.outcomes ?? []].map((o) => `out:${o}`),
    ...[...tags.skills ?? [], ...extra?.skills ?? []].map((s) => `skill:${s}`),
    ...[...tags.pieces ?? [], ...extra?.pieces ?? []].map((p) => `kp:${p}`),
    ...(tags.tech ?? []).map((t) => `tech:${t}`)
  ];
  return [...new Set(out)];
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
function gameItems(game) {
  switch (game.kind) {
    case "crossword":
    case "find_a_word":
    case "team_match":
    case "points_rush":
    case "wager":
    case "articulate":
    case "pictionary":
    case "who_said_it":
      return [...game.items];
    case "jeopardy":
      return [...game.categories.flatMap((c) => c.tiles.map((t) => t.item)), ...game.final ? [game.final] : []];
    case "wheel":
      return game.puzzles.flatMap((p) => [...p.bank, ...p.explain ? [p.explain] : []]);
    case "connections":
      return game.walls.flatMap((w) => w.groups);
    case "battles":
      return [];
  }
}
function itemLabel(item) {
  switch (item.shape) {
    case "term":
      return item.term.trim();
    case "question":
      return String(item.question.prompt ?? "").trim().slice(0, 200);
    case "quote":
      return item.text.trim().slice(0, 200);
    case "group":
      return item.label.trim();
  }
}
var hasTags = (t, q) => !!(t.pieces?.length || t.outcomes?.length || t.skills?.length || t.tech?.length || q?.pieces?.length || q?.outcomes?.length || q?.skills?.length);
function clueOf(item) {
  return item.clues[item.use_clue ?? 0] ?? item.clues[0];
}
var named = (game, i) => game.title.trim() ? `\u201C${game.title.trim()}\u201D` : `Game ${i + 1}`;
var KIND_NOUN = {
  crossword: "terms",
  find_a_word: "terms",
  team_match: "items",
  points_rush: "questions",
  wager: "questions",
  articulate: "cards",
  pictionary: "prompts",
  who_said_it: "quotes",
  wheel: "puzzles"
};
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
var CLUED = /* @__PURE__ */ new Set(["crossword", "find_a_word", "jeopardy", "wheel", "team_match", "points_rush"]);
var GRID = /* @__PURE__ */ new Set(["crossword", "find_a_word"]);
var GRID_MAX = 15;
function questionProblem(q) {
  const kind = q.question.kind;
  if (!GAME_QUESTION_KINDS.includes(kind)) return "a question a game can\u2019t mark (written answers need a person)";
  const checked = checkQuestion({ ...q.question, id: q.id });
  return checked.ok ? null : checked.message.replace(/\.$/, "").toLowerCase();
}
function itemProblems(game, item, where, cast) {
  const out = [];
  switch (item.shape) {
    case "term": {
      if (!item.term.trim()) {
        out.push(`${where} has a card with no term.`);
        break;
      }
      if (CLUED.has(game.kind) && !clueOf(item)?.text.trim()) out.push(`${where}: \u201C${item.term.trim()}\u201D has an empty clue.`);
      if (GRID.has(game.kind)) {
        const word = gridWord(item.term);
        if (!/^[A-Z]+$/.test(word)) out.push(`${where}: \u201C${item.term.trim()}\u201D needs letters only for the grid.`);
        else if (word.length > GRID_MAX) out.push(`${where}: \u201C${item.term.trim()}\u201D is longer than ${GRID_MAX} letters, so it won\u2019t fit the grid.`);
      }
      break;
    }
    case "question": {
      const problem = questionProblem(item);
      if (problem) out.push(`${where} has ${problem.startsWith("a question") ? problem : `a question to finish: ${problem}`}.`);
      break;
    }
    case "quote": {
      if (!item.text.trim()) out.push(`${where} has an empty quote.`);
      if (game.kind === "who_said_it") {
        if (!item.speaker) out.push(`${where}: pick who said \u201C${item.text.trim().slice(0, 40)}\u201D, or mark it fake.`);
        else if (item.speaker !== FAKE_SPEAKER && !cast?.some((c) => c.id === item.speaker)) out.push(`${where}: a quote\u2019s speaker isn\u2019t in the cast.`);
        if (item.speaker === FAKE_SPEAKER && !item.why_fake?.trim()) out.push(`${where}: say why \u201C${item.text.trim().slice(0, 40)}\u201D is fake.`);
      }
      break;
    }
    case "group":
      break;
  }
  return out;
}
function matchAnswer(item) {
  if (item.shape === "term") return normaliseAnswer(item.term);
  if (item.shape === "quote") return normaliseAnswer(item.speaker);
  if (item.shape === "question") {
    const q = item.question;
    const right = q.options?.find((o) => q.correct?.includes(o.id));
    return right ? normaliseAnswer(right.text) : "";
  }
  return "";
}
function gameIssues(lesson) {
  const g = lesson.game;
  if (!g || !g.games.length) return ["Add at least one game."];
  const out = [];
  const gameIds = g.games.map((x) => x.id);
  if (new Set(gameIds).size !== gameIds.length) out.push("Two games share an id. Delete one and add it again.");
  g.games.forEach((game, i) => {
    const where = named(game, i);
    if (!game.title.trim()) out.push(`Give game ${i + 1} a title.`);
    const items = gameItems(game);
    const ids = items.map((x) => x.id);
    if (new Set(ids).size !== ids.length) out.push(`${where}: two items share an id.`);
    const counts = COUNT_OF[game.kind];
    const n = game.kind === "wheel" ? game.puzzles.length : "items" in game ? game.items.length : 0;
    if (counts && n < counts.min) out.push(`${where} needs at least ${counts.min} ${KIND_NOUN[game.kind]}.`);
    const cast = game.kind === "who_said_it" ? game.cast : null;
    for (const item of items) out.push(...itemProblems(game, item, where, cast));
    switch (game.kind) {
      case "find_a_word": {
        if (game.message?.text.trim()) {
          const letters = gridWord(game.message.text);
          if (!/^[A-Z]+$/.test(letters)) out.push(`${where}: the hidden message needs letters only.`);
          if (game.message.question) {
            const problem = questionProblem({ id: "message", shape: "question", question: game.message.question, pieces: [], outcomes: [], skills: [], tech: [] });
            if (problem) out.push(`${where}: the hidden message question needs finishing: ${problem}.`);
          }
        }
        break;
      }
      case "jeopardy": {
        const { min } = GAME_COUNTS.jeopardy_categories;
        if (game.categories.length < min) out.push(`${where} needs at least ${min} categories.`);
        if (game.categories.some((c) => !c.title.trim())) out.push(`${where}: name every category.`);
        const sizes = new Set(game.categories.map((c) => c.tiles.length));
        if (game.categories.some((c) => c.tiles.length < GAME_COUNTS.jeopardy_tiles.min)) out.push(`${where}: each category needs at least ${GAME_COUNTS.jeopardy_tiles.min} clues.`);
        else if (sizes.size > 1) out.push(`${where}: give every category the same number of clues.`);
        if (game.categories.some((c) => new Set(c.tiles.map((t) => t.value)).size !== c.tiles.length)) out.push(`${where}: each value once per category.`);
        if (game.categories.flatMap((c) => c.tiles).filter((t) => t.double).length > 2) out.push(`${where}: flag at most 2 Doubles.`);
        break;
      }
      case "wheel": {
        for (const p of game.puzzles) {
          const letters = (p.text.toUpperCase().match(/[A-Z]/g) ?? []).length;
          const label = p.text.trim() ? `\u201C${p.text.trim().slice(0, 30)}\u201D` : "a puzzle";
          if (!letters) out.push(`${where}: ${label} is empty.`);
          if (letters > GAME_LIMITS.wheelLetters) out.push(`${where}: ${label} is over ${GAME_LIMITS.wheelLetters} letters.`);
          if (!p.category.trim()) out.push(`${where}: give ${label} a category.`);
          if (p.bank.length < GAME_COUNTS.wheel_bank.min) out.push(`${where}: ${label} needs letter questions.`);
          if (!p.explain) out.push(`${where}: ${label} needs an explain question.`);
        }
        break;
      }
      case "team_match": {
        const distinct = new Set(game.items.map(matchAnswer).filter(Boolean));
        if (game.items.length >= GAME_COUNTS.team_match.min && distinct.size < 12) out.push(`${where} needs at least 12 different answers.`);
        break;
      }
      case "battles":
        if (!game.prompt.trim() && !game.question_ref) out.push(`${where}: write the prompt students answer.`);
        if (!game.criterion.trim()) out.push(`${where}: say what makes one answer better.`);
        break;
      case "connections": {
        if (game.walls.length < GAME_COUNTS.connections_walls.min) out.push(`${where} needs a wall.`);
        game.walls.forEach((w, wi) => {
          const wall = w.title.trim() ? `${where}, wall \u201C${w.title.trim()}\u201D` : `${where}, wall ${wi + 1}`;
          if (w.groups.length !== 4) out.push(`${wall} needs 4 groups.`);
          for (const grp of w.groups) {
            if (!grp.label.trim()) out.push(`${wall}: name every group.`);
            if (grp.tiles.filter((t) => t.trim()).length < 4) out.push(`${wall}: \u201C${grp.label.trim() || "a group"}\u201D has fewer than 4 tiles.`);
          }
          const tiles = w.groups.flatMap((grp) => grp.tiles.filter((t) => t.trim()).map(normaliseAnswer));
          if (new Set(tiles).size !== tiles.length) out.push(`${wall}: two tiles say the same thing.`);
        });
        break;
      }
      case "who_said_it": {
        const { min, max } = GAME_COUNTS.cast;
        if (game.cast.length < min || game.cast.length > max) out.push(`${where} needs ${min} to ${max} characters in the cast.`);
        if (game.cast.some((c) => !c.name.trim())) out.push(`${where}: name every character.`);
        break;
      }
      default:
        break;
    }
  });
  return [...new Set(out)];
}
function gameWarnings(lesson) {
  const out = [];
  (lesson.game?.games ?? []).forEach((game, i) => {
    const where = named(game, i);
    const items = gameItems(game);
    const untagged = items.filter((x) => !hasTags(x, x.shape === "question" ? x.question : void 0)).length;
    if (untagged) out.push(`${where}: ${untagged} ${untagged === 1 ? "item has" : "items have"} no tags, so ${untagged === 1 ? "it" : "they"} won\u2019t show in Results by knowledge piece.`);
    if (game.kind === "articulate") {
      for (const t of game.items) {
        const term = normaliseAnswer(t.term);
        if (term && t.banned.some((b) => normaliseAnswer(b) && (term.includes(normaliseAnswer(b)) || normaliseAnswer(b).includes(term)))) out.push(`${where}: a banned word for \u201C${t.term.trim()}\u201D is the term itself, or part of it.`);
      }
    }
  });
  return out;
}
function shuffled2(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function freshIds(random) {
  const used = /* @__PURE__ */ new Set();
  return () => {
    for (; ; ) {
      const id = Array.from({ length: 8 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(random() * 31)]).join("");
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
}
function termKey(item) {
  return {
    shape: "term",
    answers: [item.term, ...item.accept].map((a) => a.trim()).filter(Boolean),
    decoys: item.decoys.map((d) => d.trim()).filter(Boolean),
    tags: evidenceTags(item),
    label: item.term.trim()
  };
}
function quoteKey(item, cast) {
  const name = cast.find((c) => c.id === item.speaker)?.name;
  return {
    shape: "quote",
    speaker: item.speaker,
    ...name ? { speaker_name: name } : {},
    ...item.source?.trim() ? { source: item.source.trim() } : {},
    ...item.why_fake?.trim() ? { why_fake: item.why_fake.trim() } : {},
    answers: [item.text, ...item.accept].map((a) => a.trim()).filter(Boolean),
    tags: evidenceTags(item),
    label: item.text.trim().slice(0, 200)
  };
}
function splitQuestionItem(item, random) {
  const checked = checkQuestion({ ...item.question, id: item.id });
  if (!checked.ok) return null;
  const { question, key } = splitQuestion(checked.question, random);
  const q = checked.question;
  return {
    pub: { id: item.id, shape: "question", question },
    key: { shape: "question", key, tags: evidenceTags(item, { pieces: q.pieces, outcomes: q.outcomes, skills: q.skills }), label: q.prompt.trim().slice(0, 200) }
  };
}
function publicSettings(settings) {
  const out = {};
  for (const [k, v] of Object.entries(settings)) if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  return out;
}
function splitGame(game, random = Math.random) {
  const info = GAME_KIND_INFO[game.kind];
  const keys = { kind: game.kind, title: game.title.trim(), items: {} };
  const settings = publicSettings(game.settings ?? {});
  const cast = game.kind === "who_said_it" ? game.cast : [];
  const pubItems = [];
  const question = (item) => {
    const split = splitQuestionItem(item, random);
    if (!split) throw new Error(`A question in ${game.title || game.kind} isn\u2019t finished.`);
    keys.items[item.id] = split.key;
    return split.pub;
  };
  const any = (item) => {
    if (item.shape === "term") {
      keys.items[item.id] = termKey(item);
      const clue = clueOf(item);
      return { id: item.id, shape: "term", clues: clue ? [{ kind: clue.kind, text: clue.text }] : [], lengths: wordLengths(item.term) };
    }
    if (item.shape === "question") return question(item);
    if (item.shape === "quote") {
      keys.items[item.id] = quoteKey(item, cast);
      return { id: item.id, shape: "quote", text: item.text };
    }
    return null;
  };
  let walls;
  let message;
  let count = 0;
  if (game.kind === "connections") {
    const fresh = freshIds(random);
    walls = game.walls.map((w) => {
      const tiles = {};
      const groups = w.groups.map((grp) => {
        const ids = grp.tiles.filter((t) => t.trim()).map((t) => {
          const id = fresh();
          tiles[id] = t.trim();
          return id;
        });
        return { id: grp.id, label: grp.label.trim(), why: grp.why.trim(), difficulty: grp.difficulty, tiles: ids, tags: evidenceTags(grp) };
      });
      keys.items[w.id] = { shape: "wall", label: w.title.trim(), tiles, groups };
      count += Object.keys(tiles).length;
      return { id: w.id, title: w.title.trim(), tiles: shuffled2(Object.entries(tiles), random).map(([id, text]) => ({ id, text })) };
    });
  } else if (game.kind === "wheel") {
    for (const p of game.puzzles) {
      keys.items[p.id] = { shape: "term", answers: [p.text.trim()], decoys: [], tags: evidenceTags(p), label: p.text.trim() };
      for (const item of [...p.bank, ...p.explain ? [p.explain] : []]) any(item);
    }
    count = game.puzzles.length;
  } else {
    for (const item of gameItems(game)) {
      const pub2 = any(item);
      if (pub2) pubItems.push(pub2);
    }
    count = pubItems.length;
    if (game.kind === "find_a_word" && game.message?.text.trim()) {
      const text = game.message.text.trim();
      keys.items.message = { shape: "term", answers: [text], decoys: [], tags: [], label: text };
      let q;
      if (game.message.question) q = question({ id: "message_q", shape: "question", question: game.message.question, pieces: [], outcomes: [], skills: [], tech: [] });
      message = { length: gridWord(text).length, ...q && q.shape === "question" ? { question: q.question } : {} };
    }
  }
  if (game.kind === "battles") count = 1;
  const pub = {
    id: game.id,
    title: game.title.trim(),
    kind: game.kind,
    solo: info.solo,
    live: info.live,
    count,
    settings,
    // Live-only kinds keep their content for the room.
    ...info.solo && game.kind !== "connections" ? { items: pubItems } : {},
    ...info.solo && walls ? { walls } : {},
    ...info.solo && game.kind === "who_said_it" ? { cast: game.cast.map(({ id, name, emblem, image_url }) => ({ id, name: name.trim(), ...emblem ? { emblem } : {}, ...image_url ? { image_url } : {} })) } : {},
    ...info.solo && message ? { message } : {}
  };
  return { public: pub, keys };
}

// apps/teaching/src/games/core/events.ts
import { z as z4 } from "zod";
var GAME_MOVES = ["answer", "solve", "guess", "bet", "hint", "judge", "describe", "draw", "pass", "buzz", "tap"];
var MARKED_MOVES = /* @__PURE__ */ new Set(["answer", "solve", "guess", "tap"]);
var STRENGTHS = ["live_solo", "live_team", "self_paced"];
var STRENGTH_LABELS = { live_solo: "Live", live_team: "Team", self_paced: "Homework" };
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
  strength: z4.enum(STRENGTHS)
});
var SoloEventInputSchema = z4.object({
  item: z4.string().min(1).max(40),
  move: z4.enum(GAME_MOVES),
  response: z4.unknown().optional(),
  time_ms: z4.number().int().min(0).max(36e5).optional(),
  extra: Extra.optional()
});
var SOLO_BATCH_MAX = 20;
var PLAY_EVENTS_MAX = 600;
var REVEAL_HINTS = 3;
function eventsToEvidence(keys, events) {
  const out = /* @__PURE__ */ new Map();
  const order = ["self_paced", "live_team", "live_solo"];
  const stronger = (a, b) => order.indexOf(a) >= order.indexOf(b) ? a : b;
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const walls = /* @__PURE__ */ new Map();
  for (const e of sorted) {
    if (!MARKED_MOVES.has(e.move) || typeof e.correct !== "boolean") continue;
    const key = keys.items[e.item];
    if (!key) continue;
    if (key.shape === "wall") {
      const w = walls.get(e.item) ?? { guessed: false, found: /* @__PURE__ */ new Set(), strength: e.strength };
      w.guessed = true;
      w.strength = stronger(w.strength, e.strength);
      const group = typeof e.extra?.group === "string" ? e.extra.group : null;
      if (e.correct && group) w.found.add(group);
      walls.set(e.item, w);
      continue;
    }
    const held = out.get(e.item);
    if (held) {
      held.strength = stronger(held.strength, e.strength);
      continue;
    }
    const revealed = typeof e.extra?.hints === "number" && e.extra.hints >= REVEAL_HINTS;
    const right = e.correct && !revealed;
    out.set(e.item, { item: e.item, tags: [...key.tags], share: right ? 1 : 0, why: [], source: "game", strength: e.strength });
  }
  for (const [wallId, w] of walls) {
    const key = keys.items[wallId];
    if (key?.shape !== "wall" || !w.guessed) continue;
    for (const g of key.groups) out.set(g.id, { item: g.id, tags: [...g.tags], share: w.found.has(g.id) ? 1 : 0, why: [], source: "game", strength: w.strength });
  }
  return [...out.values()];
}
function playScore(evidence) {
  return { right: evidence.filter((e) => e.share === 1).length, answered: evidence.length };
}
function missedPieces(evidence) {
  const out = /* @__PURE__ */ new Set();
  for (const e of evidence) if (e.share === 0) {
    for (const t of e.tags) if (t.startsWith("kp:")) out.add(t.slice(3));
  }
  return [...out];
}
export {
  GAME_MOVES,
  GameEventSchema,
  MARKED_MOVES,
  PLAY_EVENTS_MAX,
  REVEAL_HINTS,
  SOLO_BATCH_MAX,
  STRENGTH_LABELS,
  SoloEventInputSchema,
  checkAnswer,
  clueOf,
  eventsToEvidence,
  evidenceTags,
  gameIssues,
  gameItems,
  gameWarnings,
  gridWord,
  itemLabel,
  missedPieces,
  normaliseAnswer,
  playScore,
  splitGame,
  wordLengths
};
