// Generated from apps/teaching/src/lab/model.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/lab/schema.ts
import { z } from "zod";
var LAB_LEVELS = ["supplied", "students", "pairs"];
var LAB_JUDGE = ["pick", "rate"];
var LAB_LANGUAGE_LEVELS = ["Form", "Sentence", "Word"];
var LabFeatureSchema = z.object({
  name: z.string().min(1).max(60),
  level: z.enum(LAB_LANGUAGE_LEVELS)
});
var LabPairSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  students: z.array(z.string().min(1).max(64)).min(1).max(4)
});
var LabSettingsSchema = z.object({
  class_id: z.string().max(64).default(""),
  level: z.enum(LAB_LEVELS),
  question: z.string().max(200).default(""),
  why: z.string().max(400).default(""),
  /** Pairs design it: the claim the class tests. */
  claim: z.string().max(200).optional(),
  /** The two supplied levels: what stays the same. */
  same: z.string().max(300).optional(),
  /** The two supplied levels: what changes, two to five options. */
  options: z.array(z.string().max(40)).max(5).optional(),
  /** You supply it: one text per option. */
  texts: z.array(z.string().max(4e3)).max(5).optional(),
  /** Pairs design it: the text every pair changes. Line breaks are kept. */
  control: z.string().max(4e3).optional(),
  /** Students write it: what to write. */
  task: z.string().max(300).optional(),
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().max(200).default(""),
  /** Rate on a line: the two end labels. */
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),
  /** Pairs design it: the quality readers rate, as one adjective ("hesitant"). It words predictions and verdicts: "less hesitant". */
  trait: z.string().max(40).optional(),
  /** Counts as a win (pick: choices ahead) or a change (rate: points out of 10). Set before any data. */
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(20), z.string().max(200)).optional(),
  features: z.array(LabFeatureSchema).max(12).optional(),
  pairs: z.array(LabPairSchema).max(20).optional(),
  /** Teacher only. */
  debrief: z.string().max(1200).default(""),
  explain_prompt: z.string().max(400).default("")
});
var PublicLabSchema = z.object({
  level: z.enum(LAB_LEVELS),
  question: z.string().max(200),
  why: z.string().max(400),
  claim: z.string().max(200).optional(),
  same: z.string().max(300).optional(),
  options: z.array(z.string().max(40)).max(5).optional(),
  task: z.string().max(300).optional(),
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().max(200),
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),
  trait: z.string().max(40).optional(),
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(20), z.string().max(200)).optional(),
  features: z.array(LabFeatureSchema).max(12).optional(),
  explain_prompt: z.string().max(400)
});

// apps/teaching/src/lab/model.ts
var STEPS = {
  supplied: ["Question", "Predict", "Test", "Result", "Explain"],
  students: ["Question", "Predict", "Make", "Test", "Result", "Explain"],
  pairs: ["Question", "Design", "Predict", "Test", "Result", "Name it", "Explain"]
};
function stepsFor(level) {
  return [...STEPS[level] ?? STEPS.supplied];
}
function tokenise(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim().split(/\s+/).filter(Boolean)).filter((words) => words.length > 0);
  const out = [];
  lines.forEach((words, li) => {
    words.forEach((w, wi) => out.push({ w, line: li + 1, br: wi === words.length - 1 && li < lines.length - 1 }));
  });
  return out;
}
function markEdits(tokens, edit = {}) {
  const cut = new Set(edit.cut ?? []);
  const join = new Set(edit.join ?? []);
  const brk = new Set(edit.brk ?? []);
  const rep = edit.rep ?? {};
  return tokens.map((t, i) => {
    const word = typeof rep[i] === "string" && rep[i].trim() && rep[i].trim() !== t.w ? rep[i].trim() : null;
    const isCut = cut.has(i);
    const breakAfter = t.br ? !join.has(i) : brk.has(i) && i < tokens.length - 1;
    const replaced = word !== null && !isCut;
    const moved = breakAfter !== t.br;
    return { ...t, shown: replaced ? word : t.w, cut: isCut, replaced, breakAfter, moved, changed: isCut || replaced || moved };
  });
}
function applyEdits(tokens, edit = {}) {
  const lines = [[]];
  for (const t of markEdits(tokens, edit)) {
    if (!t.cut) lines[lines.length - 1].push(t.shown);
    if (t.breakAfter) lines.push([]);
  }
  const kept = lines.filter((l) => l.length > 0).map((l) => l.join(" "));
  return { text: kept.join("\n"), lines: kept };
}
function describeEdits(tokens, edit = {}) {
  const marked = markEdits(tokens, edit);
  const out = [];
  let i = 0;
  while (i < marked.length) {
    if (!marked[i].changed) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < marked.length && marked[j + 1].changed) j += 1;
    const run = marked.slice(i, j + 1);
    const cuts = run.filter((t) => t.cut);
    const reps = run.filter((t) => t.replaced);
    if (cuts.length) out.push(`cut "${cuts.map((t) => t.w).join(" ")}"`);
    if (reps.length) out.push(`changed "${reps.map((t) => t.w).join(" ")}" to "${reps.map((t) => t.shown).join(" ")}"`);
    for (const t of run) if (t.br && !t.breakAfter) out.push(`joined lines ${t.line} and ${t.line + 1}`);
    for (const t of run) if (!t.br && t.breakAfter) out.push(`broke line ${t.line} after "${t.shown}"`);
    i = j + 1;
  }
  return out;
}
function hasChange(tokens, edit = {}) {
  return markEdits(tokens, edit).some((t) => t.changed);
}
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
var range = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
function spread(readers, things, per, banned, counts, random) {
  const order = shuffled(things, random);
  const rank = new Map(order.map((t, i) => [t, i]));
  for (const t of things) if (!counts.has(t)) counts.set(t, 0);
  const got = /* @__PURE__ */ new Map();
  for (const reader of readers) {
    const own = banned(reader);
    const allowed = order.filter((t) => t !== own).sort((a, b) => counts.get(a) - counts.get(b) || rank.get(a) - rank.get(b));
    const mine = allowed.slice(0, per);
    for (const t of mine) counts.set(t, counts.get(t) + 1);
    got.set(reader, mine);
  }
  for (let guard = 0; guard < readers.length * things.length; guard += 1) {
    const byCount = [...things].sort((a, b) => counts.get(a) - counts.get(b) || rank.get(a) - rank.get(b));
    const low = byCount[0];
    const high = byCount[byCount.length - 1];
    if (low === void 0 || high === void 0 || counts.get(high) - counts.get(low) <= 1) break;
    const reader = readers.find((r) => got.get(r).includes(high) && !got.get(r).includes(low) && banned(r) !== low);
    if (!reader) break;
    got.set(reader, got.get(reader).map((t) => t === high ? low : t));
    counts.set(high, counts.get(high) - 1);
    counts.set(low, counts.get(low) + 1);
  }
  return got;
}
function readingCounts(input, existing) {
  const counts = /* @__PURE__ */ new Map();
  for (const items of Object.values(existing)) {
    for (const item of items) {
      const key = item.kind === "writer" ? item.writer : item.kind === "version" ? item.pair : item.kind === "text" ? String(item.version) : null;
      if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (input.kind === "split") {
    for (const v of range(input.versions)) if (!counts.has(String(v))) counts.set(String(v), 0);
  }
  return counts;
}
function dealFor(input, readers, existing, random) {
  const out = {};
  if (input.kind === "set") {
    for (const s of readers) out[s] = [{ kind: "set", order: shuffled(range(input.options), random) }];
    return out;
  }
  const counts = readingCounts(input, existing);
  if (input.kind === "split") {
    const tie = shuffled(range(input.versions), random);
    for (const s of shuffled(readers, random)) {
      const version = [...tie].sort((a, b) => counts.get(String(a)) - counts.get(String(b)) || tie.indexOf(a) - tie.indexOf(b))[0] ?? 0;
      counts.set(String(version), (counts.get(String(version)) ?? 0) + 1);
      out[s] = [{ kind: "text", version }];
    }
    return out;
  }
  if (input.kind === "writers") {
    const got2 = spread(shuffled(readers, random), input.writers, input.per ?? 6, (r) => r, counts, random);
    for (const s of readers) {
      out[s] = shuffled(got2.get(s) ?? [], random).map((writer) => ({ kind: "writer", writer, order: shuffled(range(input.options), random) }));
    }
    return out;
  }
  const got = spread(shuffled(readers, random), input.versions, input.per ?? 4, (r) => input.pairOf[r] ?? null, counts, random);
  for (const s of readers) {
    const items = [
      ...range(input.controls ?? 2).map(() => ({ kind: "control" })),
      ...(got.get(s) ?? []).map((pair) => ({ kind: "version", pair }))
    ];
    out[s] = shuffled(items, random);
  }
  return out;
}
function deal(input, seed) {
  return dealFor(input, input.students, {}, seededRandom(seed));
}
function dealLate(input, existing, student, seed) {
  return dealFor(input, [student], existing, seededRandom(`${seed}:${student}`))[student] ?? [];
}
var round1 = (n) => Math.round(n * 10) / 10;
function mean(values) {
  return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}
function shift(controlRatings, versionRatings) {
  return round1(mean(versionRatings) - mean(controlRatings));
}
function verdict(shiftValue, threshold) {
  if (shiftValue <= -threshold) return -1;
  if (shiftValue >= threshold) return 1;
  return 0;
}
function pickResult(counts, threshold) {
  const order = counts.map((_, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);
  const top = order[0] ?? 0;
  const lead = order.length > 1 ? round1(counts[top] - counts[order[1]]) : round1(counts[top] ?? 0);
  return { order, top, lead, win: order.length > 1 && lead > 0 && lead >= threshold };
}
var MIN_READERS = 4;
function levelGroups(trials, features) {
  return LAB_LANGUAGE_LEVELS.map((level) => {
    const own = trials.filter((t) => t.feature !== null && t.readers >= MIN_READERS && features[t.feature]?.level === level);
    return { level, trials: own.length, meanAbsShift: own.length ? round1(own.reduce((a, t) => a + Math.abs(t.shift), 0) / own.length) : 0 };
  }).sort((a, b) => b.meanAbsShift - a.meanAbsShift);
}
function setResult(input) {
  const values = range(input.options).map((i) => input.judge === "pick" ? input.picks[i] ?? 0 : mean(input.ratings[i] ?? []));
  const n = range(input.options).map((i) => input.judge === "pick" ? input.picks[i] ?? 0 : (input.ratings[i] ?? []).length);
  return { values, n, predictions: range(input.options).map((i) => input.predictions[i] ?? 0), readers: input.readers, ...pickResult(values, input.threshold) };
}
var lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);
function setHeadline(o) {
  const { result, options } = o;
  const winner = options[result.top] ?? "";
  const first = !result.win ? "Too close to call." : o.judge === "pick" ? `${winner} won.` : `The ${lower(winner)} version scored highest.`;
  if (o.mine !== void 0) {
    if (o.mine === null) return first;
    return `${first} ${result.win && o.mine === result.top ? "You called it." : `You predicted ${lower(options[o.mine] ?? "")}.`}`;
  }
  const most = Math.max(0, ...result.predictions);
  if (most === 0) return first;
  const common = result.predictions.indexOf(most);
  return `${first} ${result.win && common === result.top ? "Most of us predicted it." : `Most of us predicted ${lower(options[common] ?? "")}.`}`;
}
function setEvidence(o) {
  const list = o.result.order.map((i) => `${o.options[i]} ${o.result.values[i]}`).join(", ");
  const total = o.result.values.reduce((a, b) => a + b, 0);
  return o.judge === "pick" ? `${list} of ${total} ${total === 1 ? "choice" : "choices"}.` : `${list} out of 10, on average.`;
}
function explainQuestion(o) {
  if (o.prompt && o.prompt.trim()) return o.prompt.trim();
  if (o.level === "pairs") return "Does the evidence support the claim?";
  if (o.result?.win && o.options?.[o.result.top]) return o.judge === "pick" ? `Why did ${lower(o.options[o.result.top])} win?` : `Why did the ${lower(o.options[o.result.top])} version score highest?`;
  return "What explains the result?";
}
var MAX_REPLACEMENT = 40;
function sanitiseEdit(tokens, raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const inside = (i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < tokens.length;
  const indexes = (value, keep) => [...new Set(Array.isArray(value) ? value.filter(inside) : [])].filter(keep).sort((a, b) => a - b);
  const cut = indexes(src.cut, () => true);
  const join = indexes(src.join, (i) => tokens[i].br);
  const brk = indexes(src.brk, (i) => !tokens[i].br && i < tokens.length - 1);
  const rep = {};
  if (src.rep && typeof src.rep === "object" && !Array.isArray(src.rep)) {
    for (const [key, value] of Object.entries(src.rep)) {
      const i = Number(key);
      const word = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, MAX_REPLACEMENT) : "";
      if (inside(i) && word && word !== tokens[i].w) rep[i] = word;
    }
  }
  return {
    ...cut.length ? { cut } : {},
    ...Object.keys(rep).length ? { rep } : {},
    ...join.length ? { join } : {},
    ...brk.length ? { brk } : {}
  };
}
var PREDICTION_WORDS = { "-1": "lower", "0": "about the same", "1": "higher" };
var TRAIT_WORDS = { "-1": "less", "0": "about as", "1": "more" };
var traitOf = (trait) => typeof trait === "string" ? trait.trim() : "";
function predictionWord(value, trait) {
  const t = traitOf(trait);
  if (!t) return PREDICTION_WORDS[String(value)] ?? "";
  const word = TRAIT_WORDS[String(value)];
  return word ? `${word} ${t}` : "";
}
var predictionStem = (trait) => traitOf(trait) ? "the speaker will sound\u2026" : "readers will rate it\u2026";
function changeVerdict(value, trait) {
  if (traitOf(trait)) return `Your change made the speaker sound ${predictionWord(value, trait)}.`;
  return value === 0 ? "Your change made no clear difference." : `Your change moved the rating ${predictionWord(value)}.`;
}
function findingEnds(trait) {
  const t = traitOf(trait);
  return t ? [`Less ${t}`, "More"] : ["Rated lower", "Rated higher"];
}
function levelHeadline(groups) {
  const [top, second] = groups;
  if (!top || top.trials === 0 || top.meanAbsShift === 0) return groups.some((g) => g.trials > 0) ? "Too close to call between the levels" : "The pairs are naming what they changed";
  if (second && second.trials > 0 && second.meanAbsShift === top.meanAbsShift) return `The ${top.level.toLowerCase()} and ${second.level.toLowerCase()} levels moved readers the same`;
  return `The ${top.level.toLowerCase()} level moved readers most`;
}
function formatShift(value) {
  return `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${Math.abs(value).toFixed(1)}`;
}
function changeLabel(desc) {
  const text = desc.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function pairFindings(o) {
  return {
    control: { mean: mean(o.control), n: o.control.length },
    trials: o.trials.map((t) => {
      const moved = t.ratings.length && o.control.length ? shift(o.control, t.ratings) : 0;
      const v = verdict(moved, o.threshold);
      return {
        id: t.id,
        desc: describeEdits(o.tokens, t.edit),
        mean: mean(t.ratings),
        n: t.ratings.length,
        shift: moved,
        verdict: v,
        pred: t.pred,
        held: t.pred !== null && t.ratings.length > 0 && v === t.pred,
        thin: t.ratings.length < MIN_READERS,
        feature: t.feature
      };
    })
  };
}
function biggestShift(trials) {
  const by = (list) => list.reduce((best, t) => best === null || Math.abs(t.shift) > Math.abs(best.shift) ? t : best, null);
  return by(trials.filter((t) => !t.thin)) ?? by(trials);
}
export {
  MIN_READERS,
  applyEdits,
  biggestShift,
  changeLabel,
  changeVerdict,
  deal,
  dealLate,
  describeEdits,
  explainQuestion,
  findingEnds,
  formatShift,
  hasChange,
  levelGroups,
  levelHeadline,
  markEdits,
  mean,
  pairFindings,
  pickResult,
  predictionStem,
  predictionWord,
  sanitiseEdit,
  seededRandom,
  setEvidence,
  setHeadline,
  setResult,
  shift,
  shuffled,
  stepsFor,
  tokenise,
  verdict
};
