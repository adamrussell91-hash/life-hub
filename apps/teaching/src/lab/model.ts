import { LAB_LANGUAGE_LEVELS, type LabFeature, type LabJudge, type LabLanguageLevel, type LabLevel, type LabStep } from './schema';

/**
 * The lab's logic: steps, the control text as tokens and a pair's edits to
 * it, who reads what, and what the ratings show. No DOM and no network, so
 * the same file is bundled for the server (netlify/functions/_shared/lab-model.mjs).
 */

const STEPS: Record<LabLevel, LabStep[]> = {
  supplied: ['Question', 'Predict', 'Test', 'Result', 'Explain'],
  students: ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'],
  pairs: ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain']
};

/** The steps a level runs, in order. */
export function stepsFor(level: LabLevel): LabStep[] {
  return [...(STEPS[level] ?? STEPS.supplied)];
}

// ---------------------------------------------------------------------------
// The control text and a pair's edits
// ---------------------------------------------------------------------------

/** One word of the control. `br` is true on the last word of a line that has a line after it. */
export type Token = { w: string; line: number; br: boolean };
/** A pair's version, as changes against the control's tokens (by index). */
export type Edit = { cut?: number[]; rep?: Record<number, string>; join?: number[]; brk?: number[] };
/** A token with its edits laid over it, for the bench and the board. */
export type MarkedToken = Token & {
  /** The word a reader sees: the replacement, else the original. */
  shown: string;
  cut: boolean;
  replaced: boolean;
  /** A line break follows this word in the pair's version. */
  breakAfter: boolean;
  /** The break after this word was added or taken away. */
  moved: boolean;
  /** Anything about this token differs from the control. */
  changed: boolean;
};

/** Words split on spaces; blank lines are dropped and each line's last word carries the break. */
export function tokenise(text: string): Token[] {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim().split(/\s+/).filter(Boolean)).filter((words) => words.length > 0);
  const out: Token[] = [];
  lines.forEach((words, li) => {
    words.forEach((w, wi) => out.push({ w, line: li + 1, br: wi === words.length - 1 && li < lines.length - 1 }));
  });
  return out;
}

export function markEdits(tokens: Token[], edit: Edit = {}): MarkedToken[] {
  const cut = new Set(edit.cut ?? []);
  const join = new Set(edit.join ?? []);
  const brk = new Set(edit.brk ?? []);
  const rep = edit.rep ?? {};
  return tokens.map((t, i) => {
    const word = typeof rep[i] === 'string' && rep[i]!.trim() && rep[i]!.trim() !== t.w ? rep[i]!.trim() : null;
    const isCut = cut.has(i);
    const breakAfter = t.br ? !join.has(i) : brk.has(i) && i < tokens.length - 1;
    const replaced = word !== null && !isCut;
    const moved = breakAfter !== t.br;
    return { ...t, shown: replaced ? word! : t.w, cut: isCut, replaced, breakAfter, moved, changed: isCut || replaced || moved };
  });
}

/** What a reader sees: the version's lines, with no marks. */
export function applyEdits(tokens: Token[], edit: Edit = {}): { text: string; lines: string[] } {
  const lines: string[][] = [[]];
  for (const t of markEdits(tokens, edit)) {
    if (!t.cut) lines[lines.length - 1]!.push(t.shown);
    if (t.breakAfter) lines.push([]);
  }
  const kept = lines.filter((l) => l.length > 0).map((l) => l.join(' '));
  return { text: kept.join('\n'), lines: kept };
}

/** One phrase per run of changed words: 'cut "I think,"', 'joined lines 5 and 6', 'broke line 3 after "settled"', 'changed "meant" to "wanted"'. */
export function describeEdits(tokens: Token[], edit: Edit = {}): string[] {
  const marked = markEdits(tokens, edit);
  const out: string[] = [];
  let i = 0;
  while (i < marked.length) {
    if (!marked[i]!.changed) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < marked.length && marked[j + 1]!.changed) j += 1;
    const run = marked.slice(i, j + 1);
    const cuts = run.filter((t) => t.cut);
    const reps = run.filter((t) => t.replaced);
    if (cuts.length) out.push(`cut "${cuts.map((t) => t.w).join(' ')}"`);
    if (reps.length) out.push(`changed "${reps.map((t) => t.w).join(' ')}" to "${reps.map((t) => t.shown).join(' ')}"`);
    for (const t of run) if (t.br && !t.breakAfter) out.push(`joined lines ${t.line} and ${t.line + 1}`);
    for (const t of run) if (!t.br && t.breakAfter) out.push(`broke line ${t.line} after "${t.shown}"`);
    i = j + 1;
  }
  return out;
}

/** True when the edit changes anything a reader would see. */
export function hasChange(tokens: Token[], edit: Edit = {}): boolean {
  return markEdits(tokens, edit).some((t) => t.changed);
}

// ---------------------------------------------------------------------------
// Who reads what
// ---------------------------------------------------------------------------

export type ReadingItem =
  /** You supply it, rated: one of the teacher's texts. */
  | { kind: 'text'; version: number }
  /** You supply it, pick one: every text, in this order, labels hidden. */
  | { kind: 'set'; order: number[] }
  /** Students write it: one writer's versions, in this order, labels hidden. */
  | { kind: 'writer'; writer: string; order: number[] }
  /** Pairs design it: the unchanged control. */
  | { kind: 'control' }
  /** Pairs design it: one pair's version. */
  | { kind: 'version'; pair: string };

export type DealInput =
  | { kind: 'split'; students: string[]; versions: number }
  | { kind: 'set'; students: string[]; options: number }
  | { kind: 'writers'; students: string[]; writers: string[]; options: number; per?: number }
  | { kind: 'pairs'; students: string[]; pairOf: Record<string, string>; versions: string[]; per?: number; controls?: number };

export type Deal = Record<string, ReadingItem[]>;

/** A small seeded generator (mulberry32 over a string hash), so a deal can be tested and made again. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const range = (n: number): number[] => Array.from({ length: Math.max(0, n) }, (_, i) => i);

/**
 * Hands each reader up to `per` things to read, never one they may not have,
 * so every thing gets as close to the same number of readers as the class allows.
 */
function spread(readers: string[], things: string[], per: number, banned: (reader: string) => string | null, counts: Map<string, number>, random: () => number): Map<string, string[]> {
  const order = shuffled(things, random);
  const rank = new Map(order.map((t, i) => [t, i]));
  for (const t of things) if (!counts.has(t)) counts.set(t, 0);
  const got = new Map<string, string[]>();
  for (const reader of readers) {
    const own = banned(reader);
    const allowed = order.filter((t) => t !== own).sort((a, b) => counts.get(a)! - counts.get(b)! || rank.get(a)! - rank.get(b)!);
    const mine = allowed.slice(0, per);
    for (const t of mine) counts.set(t, counts.get(t)! + 1);
    got.set(reader, mine);
  }
  // Even out: move a reading from the most read thing to the least read, while a reader can take the swap.
  for (let guard = 0; guard < readers.length * things.length; guard += 1) {
    const byCount = [...things].sort((a, b) => counts.get(a)! - counts.get(b)! || rank.get(a)! - rank.get(b)!);
    const low = byCount[0];
    const high = byCount[byCount.length - 1];
    if (low === undefined || high === undefined || counts.get(high)! - counts.get(low)! <= 1) break;
    const reader = readers.find((r) => got.get(r)!.includes(high) && !got.get(r)!.includes(low) && banned(r) !== low);
    if (!reader) break;
    got.set(reader, got.get(reader)!.map((t) => (t === high ? low : t)));
    counts.set(high, counts.get(high)! - 1);
    counts.set(low, counts.get(low)! + 1);
  }
  return got;
}

function readingCounts(input: DealInput, existing: Deal): Map<string, number> {
  const counts = new Map<string, number>();
  for (const items of Object.values(existing)) {
    for (const item of items) {
      const key = item.kind === 'writer' ? item.writer : item.kind === 'version' ? item.pair : item.kind === 'text' ? String(item.version) : null;
      if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (input.kind === 'split') for (const v of range(input.versions)) if (!counts.has(String(v))) counts.set(String(v), 0);
  return counts;
}

function dealFor(input: DealInput, readers: string[], existing: Deal, random: () => number): Deal {
  const out: Deal = {};
  if (input.kind === 'set') {
    for (const s of readers) out[s] = [{ kind: 'set', order: shuffled(range(input.options), random) }];
    return out;
  }
  const counts = readingCounts(input, existing);
  if (input.kind === 'split') {
    // Equal random groups, one per version: each reader joins the smallest group so far.
    const tie = shuffled(range(input.versions), random);
    for (const s of shuffled(readers, random)) {
      const version = [...tie].sort((a, b) => counts.get(String(a))! - counts.get(String(b))! || tie.indexOf(a) - tie.indexOf(b))[0] ?? 0;
      counts.set(String(version), (counts.get(String(version)) ?? 0) + 1);
      out[s] = [{ kind: 'text', version }];
    }
    return out;
  }
  if (input.kind === 'writers') {
    const got = spread(shuffled(readers, random), input.writers, input.per ?? 6, (r) => r, counts, random);
    for (const s of readers) {
      out[s] = shuffled(got.get(s) ?? [], random).map((writer) => ({ kind: 'writer', writer, order: shuffled(range(input.options), random) }));
    }
    return out;
  }
  const got = spread(shuffled(readers, random), input.versions, input.per ?? 4, (r) => input.pairOf[r] ?? null, counts, random);
  for (const s of readers) {
    const items: ReadingItem[] = [
      ...range(input.controls ?? 2).map((): ReadingItem => ({ kind: 'control' })),
      ...(got.get(s) ?? []).map((pair): ReadingItem => ({ kind: 'version', pair }))
    ];
    out[s] = shuffled(items, random);
  }
  return out;
}

/** Every reader's list for the Test step. The same input and seed give the same deal. */
export function deal(input: DealInput, seed: string): Deal {
  return dealFor(input, input.students, {}, seededRandom(seed));
}

/** A reader who joined after the deal: a list that keeps the counts as even as they can be. */
export function dealLate(input: DealInput, existing: Deal, student: string, seed: string): ReadingItem[] {
  return dealFor(input, [student], existing, seededRandom(`${seed}:${student}`))[student] ?? [];
}

// ---------------------------------------------------------------------------
// What the readings show
// ---------------------------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The average, to one decimal place. Zero for no values. */
export function mean(values: number[]): number {
  return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

/** How far a version moved readers from the control: the difference of the two averages. */
export function shift(controlRatings: number[], versionRatings: number[]): number {
  return round1(mean(versionRatings) - mean(controlRatings));
}

/** -1 less, 1 more, 0 when the shift is under the threshold. */
export function verdict(shiftValue: number, threshold: number): -1 | 0 | 1 {
  if (shiftValue <= -threshold) return -1;
  if (shiftValue >= threshold) return 1;
  return 0;
}

export type PickResult = { order: number[]; top: number; lead: number; win: boolean };

/** The options from most to least, the leader, its lead over the next, and whether that lead counts. */
export function pickResult(counts: number[], threshold: number): PickResult {
  const order = counts.map((_, i) => i).sort((a, b) => counts[b]! - counts[a]! || a - b);
  const top = order[0] ?? 0;
  const lead = order.length > 1 ? round1(counts[top]! - counts[order[1]!]!) : round1(counts[top] ?? 0);
  return { order, top, lead, win: order.length > 1 && lead > 0 && lead >= threshold };
}

export type LabTrial = { feature: number | null; shift: number; readers: number };
export type LevelGroup = { level: LabLanguageLevel; trials: number; meanAbsShift: number };
/** A version needs this many readers before its shift is counted. */
export const MIN_READERS = 4;

/** The pairs' trials by level of language, biggest average shift first. Trials with fewer than four readers are left out. */
export function levelGroups(trials: LabTrial[], features: LabFeature[]): LevelGroup[] {
  return LAB_LANGUAGE_LEVELS.map((level) => {
    const own = trials.filter((t) => t.feature !== null && t.readers >= MIN_READERS && features[t.feature]?.level === level);
    return { level, trials: own.length, meanAbsShift: own.length ? round1(own.reduce((a, t) => a + Math.abs(t.shift), 0) / own.length) : 0 };
  }).sort((a, b) => b.meanAbsShift - a.meanAbsShift);
}

// ---------------------------------------------------------------------------
// The two supplied levels: the class result in words
// ---------------------------------------------------------------------------

/** The class result for a supplied or students-write lab, as the server sends it once Result is open. */
export type SetResult = {
  /** Per option: choices (pick) or the average rating out of 10 (rate). */
  values: number[];
  /** Per option: how many readings stand behind the value. */
  n: number[];
  /** Per option: how many students predicted it. */
  predictions: number[];
  readers: number;
} & PickResult;

export function setResult(input: { judge: LabJudge; options: number; picks: number[]; ratings: number[][]; predictions: number[]; readers: number; threshold: number }): SetResult {
  const values = range(input.options).map((i) => (input.judge === 'pick' ? input.picks[i] ?? 0 : mean(input.ratings[i] ?? [])));
  const n = range(input.options).map((i) => (input.judge === 'pick' ? input.picks[i] ?? 0 : (input.ratings[i] ?? []).length));
  return { values, n, predictions: range(input.options).map((i) => input.predictions[i] ?? 0), readers: input.readers, ...pickResult(values, input.threshold) };
}

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** "Sound won. Most of us predicted sight." A lead under the threshold is too close to call, and nobody's prediction held. */
export function setHeadline(o: { options: string[]; judge: LabJudge; result: SetResult; mine?: number | null }): string {
  const { result, options } = o;
  const winner = options[result.top] ?? '';
  const first = !result.win ? 'Too close to call.' : o.judge === 'pick' ? `${winner} won.` : `The ${lower(winner)} version scored highest.`;
  if (o.mine !== undefined) {
    if (o.mine === null) return first;
    return `${first} ${result.win && o.mine === result.top ? 'You called it.' : `You predicted ${lower(options[o.mine] ?? '')}.`}`;
  }
  const most = Math.max(0, ...result.predictions);
  if (most === 0) return first;
  const common = result.predictions.indexOf(most);
  return `${first} ${result.win && common === result.top ? 'Most of us predicted it.' : `Most of us predicted ${lower(options[common] ?? '')}.`}`;
}

/** "Active 7.9, Passive 5.1 out of 10, on average." */
export function setEvidence(o: { options: string[]; judge: LabJudge; result: SetResult }): string {
  const list = o.result.order.map((i) => `${o.options[i]} ${o.result.values[i]}`).join(', ');
  const total = o.result.values.reduce((a, b) => a + b, 0);
  return o.judge === 'pick' ? `${list} of ${total} ${total === 1 ? 'choice' : 'choices'}.` : `${list} out of 10, on average.`;
}

/** The Explain step's question when the teacher left the prompt blank. */
export function explainQuestion(o: { level: LabLevel; judge: LabJudge; options?: string[]; prompt?: string; result?: SetResult | null }): string {
  if (o.prompt && o.prompt.trim()) return o.prompt.trim();
  if (o.level === 'pairs') return 'Does the evidence support the claim?';
  if (o.result?.win && o.options?.[o.result.top]) return o.judge === 'pick' ? `Why did ${lower(o.options[o.result.top]!)} win?` : `Why did the ${lower(o.options[o.result.top]!)} version score highest?`;
  return 'What explains the result?';
}

// ---------------------------------------------------------------------------
// Pairs design it: an edit as it is saved, and what the class's trials found
// ---------------------------------------------------------------------------

const MAX_REPLACEMENT = 40;

/** An edit as the server keeps it: indexes inside the control, in order, each word of a replacement trimmed. Anything else is dropped. */
export function sanitiseEdit(tokens: Token[], raw: unknown): Edit {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const inside = (i: unknown): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < tokens.length;
  const indexes = (value: unknown, keep: (i: number) => boolean): number[] =>
    [...new Set(Array.isArray(value) ? value.filter(inside) : [])].filter(keep).sort((a, b) => a - b);
  const cut = indexes(src.cut, () => true);
  const join = indexes(src.join, (i) => tokens[i]!.br);
  const brk = indexes(src.brk, (i) => !tokens[i]!.br && i < tokens.length - 1);
  const rep: Record<number, string> = {};
  if (src.rep && typeof src.rep === 'object' && !Array.isArray(src.rep)) {
    for (const [key, value] of Object.entries(src.rep as Record<string, unknown>)) {
      const i = Number(key);
      const word = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, MAX_REPLACEMENT) : '';
      if (inside(i) && word && word !== tokens[i]!.w) rep[i] = word;
    }
  }
  return {
    ...(cut.length ? { cut } : {}),
    ...(Object.keys(rep).length ? { rep } : {}),
    ...(join.length ? { join } : {}),
    ...(brk.length ? { brk } : {})
  };
}

/** What a pair predicts its change will do to the rating: -1 lower, 0 about the same, 1 higher. */
export type PairPrediction = -1 | 0 | 1;
const PREDICTION_WORDS: Record<string, string> = { '-1': 'lower', '0': 'about the same', '1': 'higher' };
export const predictionWord = (value: number): string => PREDICTION_WORDS[String(value)] ?? '';

/** "+1.2", "−0.8", "0.0". */
export function formatShift(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`;
}

/** A change in a sentence of its own: 'Cut "I think,"'. */
export function changeLabel(desc: string[]): string {
  const text = desc.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type FindingInput = { id: string; edit: Edit; ratings: number[]; pred: PairPrediction | null; feature: number | null };
/** One pair's trial once the readings are in. */
export type Finding = {
  id: string;
  /** The change in words, from `describeEdits`. */
  desc: string[];
  mean: number;
  /** How many ratings the version got. */
  n: number;
  shift: number;
  verdict: -1 | 0 | 1;
  pred: PairPrediction | null;
  /** The pair's prediction matched what readers did. */
  held: boolean;
  /** Fewer than four readers: drawn pale and left out of the level comparison. */
  thin: boolean;
  feature: number | null;
};

/** Every pair's trial against the control's ratings. */
export function pairFindings(o: { tokens: Token[]; threshold: number; control: number[]; trials: FindingInput[] }): { control: { mean: number; n: number }; trials: Finding[] } {
  return {
    control: { mean: mean(o.control), n: o.control.length },
    trials: o.trials.map((t) => {
      const moved = t.ratings.length && o.control.length ? shift(o.control, t.ratings) : 0;
      const v = verdict(moved, o.threshold);
      return {
        id: t.id, desc: describeEdits(o.tokens, t.edit), mean: mean(t.ratings), n: t.ratings.length, shift: moved, verdict: v,
        pred: t.pred, held: t.pred !== null && t.ratings.length > 0 && v === t.pred, thin: t.ratings.length < MIN_READERS, feature: t.feature
      };
    })
  };
}

/** The trial that moved readers most. Trials with enough readers come first. Null when there are none. */
export function biggestShift<T extends { shift: number; thin: boolean }>(trials: T[]): T | null {
  const by = (list: T[]): T | null => list.reduce<T | null>((best, t) => (best === null || Math.abs(t.shift) > Math.abs(best.shift) ? t : best), null);
  return by(trials.filter((t) => !t.thin)) ?? by(trials);
}
