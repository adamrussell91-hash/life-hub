// Generated from apps/teaching/src/quiz/core.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/quiz/core.ts
import { z } from "zod";
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
var QuizQuestionKindSchema = z.enum(QUIZ_QUESTION_KINDS);
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
function isManualKind(kind) {
  return QUIZ_KIND_INFO[kind].manual;
}
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
var Id = z.string().min(1).max(64);
var Text = (max) => z.string().trim().min(1).max(max);
var OptionalText = (max) => z.string().trim().max(max).optional();
var QuizImageSchema = z.object({
  url: z.string().min(1).max(2e3),
  alt: z.string().max(300).default("")
});
var QuizChoiceSchema = z.object({ id: Id, text: Text(QUIZ_LIMITS.option) });
var QuizPairSchema = z.object({ id: Id, left: Text(QUIZ_LIMITS.option), right: Text(QUIZ_LIMITS.option) });
var QuizGroupSchema = z.object({ id: Id, name: Text(120) });
var QuizSortItemSchema = z.object({ id: Id, text: Text(QUIZ_LIMITS.option), group: Id });
var QuizSpotTargetSchema = z.object({
  id: Id,
  /** The words, copied exactly from the passage. */
  quote: Text(QUIZ_LIMITS.option),
  /** Every technique a fair marker would accept for these words. */
  correct: z.array(Id).min(1).max(10)
});
var QuizPinSchema = z.object({
  id: Id,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: Text(120)
});
var base = {
  id: Id,
  // A missing prompt reads as empty: fill-the-gap questions need none, and the
  // other kinds are still told to write one by questionProblems.
  prompt: z.string().trim().max(QUIZ_LIMITS.prompt).default(""),
  marks: z.number().int().min(1).max(QUIZ_LIMITS.marksMax),
  hint: OptionalText(QUIZ_LIMITS.hint),
  explanation: OptionalText(QUIZ_LIMITS.explanation),
  image: QuizImageSchema.optional(),
  /** Syllabus outcome ids for the markbook. None means the lesson's outcomes. Capped like a criterion's (MARKBOOK_LIMITS.outcomes). */
  outcomes: z.array(z.string().min(1).max(64)).max(8).optional()
};
var QuizQuestionSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("multiple_choice"), options: z.array(QuizChoiceSchema).min(2).max(6), correct: z.array(Id).length(1) }),
  z.object({ ...base, kind: z.literal("multi_select"), options: z.array(QuizChoiceSchema).min(2).max(8), correct: z.array(Id).min(1).max(8) }),
  z.object({ ...base, kind: z.literal("true_false"), answer: z.boolean() }),
  z.object({
    ...base,
    kind: z.literal("short_answer"),
    accepted: z.array(Text(QUIZ_LIMITS.answer)).min(1).max(10),
    case_sensitive: z.boolean().optional()
  }),
  z.object({ ...base, kind: z.literal("fill_gap"), passage: Text(QUIZ_LIMITS.passage), word_bank: z.boolean().optional() }),
  z.object({ ...base, kind: z.literal("odd_one_out"), options: z.array(QuizChoiceSchema).min(3).max(6), correct: z.array(Id).length(1) }),
  z.object({ ...base, kind: z.literal("matching"), pairs: z.array(QuizPairSchema).min(2).max(8) }),
  z.object({ ...base, kind: z.literal("ordering"), items: z.array(QuizChoiceSchema).min(3).max(8) }),
  z.object({
    ...base,
    kind: z.literal("categorise"),
    groups: z.array(QuizGroupSchema).min(2).max(4),
    items: z.array(QuizSortItemSchema).min(2).max(16)
  }),
  z.object({
    ...base,
    kind: z.literal("quote_technique"),
    quote: Text(QUIZ_LIMITS.passage),
    options: z.array(QuizChoiceSchema.extend({ technique_id: z.string().max(64).optional() })).min(2).max(6),
    correct: z.array(Id).length(1)
  }),
  z.object({
    ...base,
    kind: z.literal("find_it"),
    segments: z.array(QuizChoiceSchema.extend({ text: Text(QUIZ_LIMITS.passage) })).min(2).max(40),
    correct: z.array(Id).min(1).max(40)
  }),
  z.object({
    ...base,
    kind: z.literal("spot_technique"),
    passage: Text(QUIZ_LIMITS.passage),
    options: z.array(
      QuizChoiceSchema.extend({
        technique_id: z.string().max(64).optional(),
        /** How many times students may name it: 2 for a passage with two similes. */
        uses: z.number().int().min(1).max(12).optional()
      })
    ).min(2).max(10),
    targets: z.array(QuizSpotTargetSchema).min(1).max(12),
    /** How many students must find. Fewer than the targets means any of them will do. */
    find: z.number().int().min(1).max(12).optional()
  }),
  z.object({ ...base, kind: z.literal("label_image"), image: QuizImageSchema, pins: z.array(QuizPinSchema).min(2).max(8) }),
  z.object({
    ...base,
    kind: z.literal("extended_response"),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  }),
  z.object({
    ...base,
    kind: z.literal("explain_effect"),
    quote: Text(QUIZ_LIMITS.passage),
    technique: OptionalText(120),
    model_answer: OptionalText(QUIZ_LIMITS.model),
    guide: OptionalText(QUIZ_LIMITS.model)
  })
]).superRefine((q, ctx) => {
  for (const message of questionProblems(q)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});
var QuizQuestionDraftSchema = z.custom(
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
function writeGapPassage(parts) {
  return parts.map((part) => part.type === "text" ? part.text : `[[${part.answers.map((a) => a.replace(/[[\]|]/g, "")).join("|")}]]`).join("");
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
var QuizFeedbackSchema = z.enum(["instant", "end", "released"]);
var QuizSettingsSchema = z.object({
  /** Whole-quiz countdown in minutes. */
  timer_minutes: z.number().int().min(1).max(180).optional(),
  /** Per-question countdown in seconds. */
  question_seconds: z.number().int().min(10).max(600).optional(),
  /** Hard timers lock answers at zero; soft timers only show the time. */
  timer_hard: z.boolean().optional(),
  shuffle_questions: z.boolean().optional(),
  shuffle_options: z.boolean().optional(),
  attempts: z.number().int().min(1).max(5).optional(),
  feedback: QuizFeedbackSchema.optional(),
  /** Share of a question's marks a hint costs, 0 to 1. */
  hint_cost: z.number().min(0).max(1).optional(),
  confidence: z.boolean().optional(),
  closes_at: z.string().datetime().optional(),
  /** Live quiz in focus view: a question revealed under this share right stops at a checkpoint. Blank means 80. */
  move_on: z.number().int().min(1).max(100).optional()
});
var DEFAULT_QUIZ_SETTINGS = {
  attempts: 1,
  feedback: "end",
  hint_cost: 0.5,
  timer_hard: false,
  shuffle_questions: false,
  shuffle_options: true,
  confidence: false
};
function resolveQuizSettings(settings) {
  return { ...DEFAULT_QUIZ_SETTINGS, ...settings ?? {} };
}
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
    ...q.outcomes?.length ? { outcomes: [...q.outcomes] } : {}
  };
  switch (q.kind) {
    case "multiple_choice":
    case "multi_select":
    case "odd_one_out":
    case "quote_technique": {
      const ids = new Map(q.options.map((o) => [o.id, fresh()]));
      const options = shuffled(q.options, random).map((o) => ({ id: ids.get(o.id), text: o.text }));
      const question = { ...head, kind: q.kind, options, ...q.kind === "quote_technique" ? { quote: q.quote } : {} };
      return { question, key: { ...keyHead, answer: { type: "choice", ids: q.correct.map((id) => ids.get(id)) } } };
    }
    case "true_false":
      return { question: { ...head, kind: "true_false" }, key: { ...keyHead, answer: { type: "boolean", value: q.answer } } };
    case "short_answer":
      return {
        question: { ...head, kind: "short_answer" },
        key: { ...keyHead, answer: { type: "text", accepted: q.accepted, case_sensitive: !!q.case_sensitive } }
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
        key: { ...keyHead, answer: { type: "spots", passage: q.passage, targets, pick } }
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
        question: { ...head, kind: "extended_response" },
        key: { ...keyHead, answer: { type: "manual", model_answer: q.model_answer, guide: q.guide } }
      };
    case "explain_effect":
      return {
        question: { ...head, kind: "explain_effect", quote: q.quote, ...q.technique ? { technique: q.technique } : {} },
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
      if (match === "near") return { score: null, max, correct: null, pending: "near_miss" };
      return full(false);
    }
    case "manual":
      return hasAnswer(r) ? { score: null, max, correct: null, pending: "manual" } : full(false);
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
      for (const [id, accepted] of Object.entries(a.gaps)) {
        parts[id] = matchText(given[id] ?? "", accepted) === "exact";
        if (parts[id]) right++;
      }
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
function afterHint(score, max, hinted, hintCost) {
  if (!hinted || score <= 0) return score;
  return Math.max(0, roundMarks(score - max * hintCost));
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
function blankQuestion(kind, id, marks = 1, newId = () => Math.random().toString(36).slice(2, 10)) {
  const shared = { id, prompt: "", marks };
  const opts = (n) => Array.from({ length: n }, () => ({ id: newId(), text: "" }));
  switch (kind) {
    case "multiple_choice":
    case "odd_one_out":
    case "quote_technique": {
      return { ...shared, kind, options: opts(4), correct: [], ...kind === "quote_technique" ? { quote: "" } : {} };
    }
    case "multi_select":
      return { ...shared, kind, options: opts(4), correct: [] };
    case "true_false":
      return { ...shared, kind, answer: true };
    case "short_answer":
      return { ...shared, kind, accepted: [""] };
    case "fill_gap":
      return { ...shared, kind, passage: "", word_bank: false };
    case "matching":
      return { ...shared, kind, pairs: Array.from({ length: 3 }, () => ({ id: newId(), left: "", right: "" })) };
    case "ordering":
      return { ...shared, kind, items: opts(3) };
    case "categorise": {
      const groups = [
        { id: newId(), name: "" },
        { id: newId(), name: "" }
      ];
      return {
        ...shared,
        kind,
        groups,
        items: Array.from({ length: 4 }, (_, i) => ({ id: newId(), text: "", group: groups[i % 2].id }))
      };
    }
    case "find_it":
      return { ...shared, kind, segments: [], correct: [] };
    case "spot_technique":
      return { ...shared, kind, passage: "", options: opts(4), targets: [] };
    case "label_image":
      return { ...shared, kind, image: { url: "", alt: "" }, pins: [] };
    case "extended_response":
      return { ...shared, kind, marks: Math.max(marks, 1) };
    case "explain_effect":
      return { ...shared, kind, quote: "" };
  }
}
function segmentPassage(passage) {
  const lines = passage.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return lines;
  return (passage.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
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
export {
  DEFAULT_QUIZ_SETTINGS,
  QUIZ_KIND_INFO,
  QUIZ_LIMITS,
  QUIZ_QUESTION_KINDS,
  QuizFeedbackSchema,
  QuizImageSchema,
  QuizQuestionDraftSchema,
  QuizQuestionKindSchema,
  QuizQuestionSchema,
  QuizSettingsSchema,
  afterHint,
  blankQuestion,
  checkQuestion,
  cleanResponse,
  hasAnswer,
  isManualKind,
  locateQuote,
  markResponse,
  matchSpots,
  matchText,
  norm,
  parseGapPassage,
  passageWords,
  questionProblems,
  resolveQuizSettings,
  roundMarks,
  segmentPassage,
  spanFinds,
  splitQuestion,
  writeGapPassage
};
