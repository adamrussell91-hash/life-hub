/**
 * Memory processes for the neural map, as pure functions over a similarity index of your notes.
 *
 * - Latent cause inference: in the order you wrote them, does each note update an existing line
 *   of thinking, or is it surprising enough to start a new one? (A Chinese-restaurant-process
 *   style choice: existing causes pull with the similarity they hold, a new cause with a fixed
 *   concentration.)
 * - Attractor dynamics: a cue settles into one stable cluster rather than fading out.
 * - Reinstatement: what else was active when a note was written.
 * - Representational differentiation: notes so alike they compete, and what tells them apart.
 */
import { tokenize } from "../lib/lexicalRetrieve";
import { candidatePairs, jaccard, scoreCandidates } from "./showAllEdges";
import { noteTime } from "./showAllInsights";
import type { GraphNodeDatum } from "./keywordGraph";

export type Partner = { j: number; score: number };

export type MemoryIndex = {
  ids: string[];
  index: Map<string, number>;
  tokens: Set<string>[];
  /** Plain lower-case words (unstemmed), for showing people what differs. */
  words: Set<string>[];
  /** Strongest partners first (topic + words), at most `keep` per note. */
  partners: Partner[][];
  /** The same candidates scored on words alone: what a note says, not how it is filed. */
  content: Partner[][];
  /** Epoch ms written, or null. */
  time: Array<number | null>;
  topic: Array<string | undefined>;
  labels: string[];
};

/** Index every live note once: tokens, topics, and its strongest similarity partners. */
export function buildMemoryIndex(
  nodes: GraphNodeDatum[],
  textFor: (node: GraphNodeDatum) => string,
  keep = 16,
): MemoryIndex {
  const leaves = nodes.filter(node => node.kind === "leaf" && !node.departing);
  const ids = leaves.map(node => node.id);
  const tagSets = leaves.map(node => new Set(node.hubLabels ?? (node.parentKeyword ? [node.parentKeyword] : [])));
  const tokens = leaves.map(
    (node, i) => new Set(tokenize(`${node.label} ${textFor(node)} ${[...tagSets[i]!].join(" ")}`)),
  );
  const tagFreq = new Map<string, number>();
  for (const tags of tagSets) for (const tag of tags) tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
  const { candidates } = candidatePairs(tagSets, tokens);
  const scored = scoreCandidates(candidates, tagSets, tokens, tagFreq);
  const partners = leaves.map(() => [] as Partner[]);
  for (const pair of scored) {
    partners[pair.a]!.push({ j: pair.b, score: pair.score });
    partners[pair.b]!.push({ j: pair.a, score: pair.score });
  }
  const content: Partner[][] = [];
  partners.forEach((list, i) => {
    list.sort((x, y) => y.score - x.score || x.j - y.j);
    list.length = Math.min(list.length, keep * 3);
    content.push(
      list
        .map(({ j }) => ({ j, score: jaccard(tokens[i]!, tokens[j]!) }))
        .filter(item => item.score > 0)
        .sort((x, y) => y.score - x.score || x.j - y.j),
    );
    list.length = Math.min(list.length, keep);
  });
  return {
    ids,
    index: new Map(ids.map((id, i) => [id, i])),
    tokens,
    words: leaves.map(node => new Set(`${node.label} ${textFor(node)}`.toLowerCase().match(/[\p{L}][\p{L}\p{N}'-]{3,}/gu) ?? [])),
    partners,
    content,
    time: leaves.map(node => noteTime(node)),
    topic: leaves.map(node => node.parentKeyword),
    labels: leaves.map(node => node.label),
  };
}

/** Writing order: undated notes first (they were there before the record starts), then by date. */
export function writingOrder(mem: MemoryIndex) {
  return mem.ids
    .map((_, i) => i)
    .sort((a, b) => (mem.time[a] ?? -Infinity) - (mem.time[b] ?? -Infinity) || mem.ids[a]!.localeCompare(mem.ids[b]!));
}

// ---------- Latent cause inference ----------

export type CauseStep = {
  note: string;
  cause: number;
  /** 0 = exactly what an existing line predicted, 1 = nothing like anything before. */
  error: number;
  kind: "join" | "stretch" | "birth";
  /** The earlier note it attached to most strongly (absent for a birth). */
  via?: string;
};

export type LatentCause = {
  id: number;
  founder: string;
  born: number | null;
  members: string[];
  /** The topic most of its notes sit in. */
  topic?: string;
};

export type LatentCauses = { steps: CauseStep[]; byNote: Map<string, CauseStep>; causes: LatentCause[] };

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/**
 * Walk your notes in the order you wrote them, judging each on what it says (its words, not its
 * tags). Each existing line of thinking explains the new note as well as its closest member does
 * (with a whisker of credit for every member that also matches); a brand-new line needs only
 * `alpha`. Explained well → it joins. Explained only just → it stretches that line. Not explained
 * → a new line of thinking is born.
 */
export function inferLatentCauses(
  mem: MemoryIndex,
  opts: { alpha?: number; stretch?: number } = {},
): LatentCauses {
  // A new line has to be more surprising than about a third of your notes are to their nearest.
  const alpha = opts.alpha ?? quantile(mem.content.map(list => list[0]?.score ?? 0), 0.35);
  const stretch = opts.stretch ?? 1.4;
  const cause = new Array<number>(mem.ids.length).fill(-1);
  const causes: LatentCause[] = [];
  const steps: CauseStep[] = [];
  for (const i of writingOrder(mem)) {
    const fit = new Map<number, { best: number; via: number; n: number }>();
    for (const { j, score } of mem.content[i]!) {
      const c = cause[j]!;
      if (c < 0) continue; // not written yet
      const seen = fit.get(c);
      if (!seen) fit.set(c, { best: score, via: j, n: 1 });
      else seen.n += 1;
    }
    let best = -1;
    let bestFit = 0;
    let via = -1;
    for (const [c, item] of fit) {
      const value = item.best + 0.02 * Math.log(item.n);
      if (value > bestFit || (value === bestFit && c < best)) {
        best = c;
        bestFit = value;
        via = item.via;
      }
    }
    const error = alpha > 0 ? alpha / (alpha + bestFit) : 0;
    let step: CauseStep;
    if (best < 0 || bestFit < alpha) {
      const id = causes.length;
      causes.push({ id, founder: mem.ids[i]!, born: mem.time[i] ?? null, members: [] });
      step = { note: mem.ids[i]!, cause: id, error: best < 0 ? 1 : error, kind: "birth" };
    } else {
      step = {
        note: mem.ids[i]!,
        cause: best,
        error,
        kind: bestFit < alpha * stretch ? "stretch" : "join",
        via: mem.ids[via],
      };
    }
    cause[i] = step.cause;
    causes[step.cause]!.members.push(step.note);
    steps.push(step);
  }
  for (const line of causes) {
    const counts = new Map<string, number>();
    for (const id of line.members) {
      const topic = mem.topic[mem.index.get(id)!];
      if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    line.topic = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  }
  return { steps, byNote: new Map(steps.map(step => [step.note, step])), causes };
}

/** The lines of thinking worth naming: ones that grew past `minSize` notes, oldest first. */
export function linesOfThinking(result: LatentCauses, minSize = 8) {
  return result.causes
    .filter(line => line.members.length >= minSize)
    .sort((a, b) => (a.born ?? -Infinity) - (b.born ?? -Infinity) || a.id - b.id);
}

// ---------- Attractor dynamics ----------

export type Settling = {
  /** Activity after each step: note id → 0–1. The last frame is the attractor. */
  frames: Array<Map<string, number>>;
  /** Members of the final stable state, strongest first. */
  attractor: string[];
  /** Topics that held activity at the start, and the one it settled into. */
  competing: string[];
  settledTopic?: string;
};

/**
 * A cue settles into a stable pattern. Each step every note takes in the activity of its partners
 * (recurrent excitation) plus the cue, then only the `k` most active stay on (inhibition). Repeat
 * until the active set stops changing: the network has fallen into an attractor — the cluster the
 * cue most belongs to, even when the cue was vague or split between ideas.
 */
export function settleAttractor(
  mem: MemoryIndex,
  seeds: string[],
  opts: { k?: number; steps?: number; cue?: number } = {},
): Settling {
  const k = opts.k ?? 36;
  const maxSteps = opts.steps ?? 14;
  const cueWeight = opts.cue ?? 0.35;
  const cue = new Map<number, number>();
  for (const id of seeds) {
    const i = mem.index.get(id);
    if (i != null) cue.set(i, 1);
  }
  let active = new Map(cue);
  const toFrame = (state: Map<number, number>) => {
    const top = Math.max(1e-9, ...state.values());
    return new Map([...state.entries()].map(([i, value]) => [mem.ids[i]!, value / top]));
  };
  const frames = [toFrame(active)];
  let previous = "";
  for (let step = 0; step < maxSteps; step++) {
    const next = new Map<number, number>();
    for (const [i, value] of active) {
      for (const { j, score } of mem.partners[i]!) next.set(j, (next.get(j) ?? 0) + value * score);
      // A note keeps a little of its own activity, so the state does not flicker.
      next.set(i, (next.get(i) ?? 0) + value * 0.5);
    }
    // The cue keeps nudging only early on; later the network settles on its own.
    const nudge = cueWeight * Math.max(0, 1 - step / 4);
    for (const [i, value] of cue) next.set(i, (next.get(i) ?? 0) + value * nudge * Math.max(1, ...next.values()));
    const kept = [...next.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k);
    const top = kept[0]?.[1] || 1;
    active = new Map(kept.map(([i, value]) => [i, value / top]));
    frames.push(toFrame(active));
    const signature = kept.map(([i]) => i).sort((a, b) => a - b).join(",");
    if (signature === previous && step >= 3) break;
    previous = signature;
  }
  const attractor = [...frames[frames.length - 1]!.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  const topicsIn = (frame: Map<string, number>) => {
    const counts = new Map<string, number>();
    for (const [id, value] of frame) {
      const topic = mem.topic[mem.index.get(id)!];
      if (topic) counts.set(topic, (counts.get(topic) ?? 0) + value);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  // "Competing" = topics holding real activity one step after the cue fired.
  const early = topicsIn(frames[Math.min(1, frames.length - 1)]!);
  const earlyTotal = early.reduce((sum, [, value]) => sum + value, 0) || 1;
  return {
    frames,
    attractor,
    competing: early.filter(([, value]) => value / earlyTotal >= 0.15).map(([topic]) => topic).slice(0, 4),
    settledTopic: topicsIn(frames[frames.length - 1]!)[0]?.[0],
  };
}

// ---------- Reinstatement ----------

export type Reinstatement = {
  /** Notes written within the window around it, nearest in time first. */
  context: string[];
  /** Its strongest associations, whenever they were written. */
  associations: string[];
  /** Topics you were working in at the time, busiest first. */
  topics: Array<{ topic: string; count: number }>;
  written: number | null;
};

/** What was active when a note was written: the notes around it in time, and what it calls up. */
export function reinstate(mem: MemoryIndex, id: string, windowDays = 4, limit = 24): Reinstatement {
  const i = mem.index.get(id);
  if (i == null) return { context: [], associations: [], topics: [], written: null };
  const written = mem.time[i] ?? null;
  const context: Array<{ id: string; gap: number }> = [];
  if (written != null) {
    const span = windowDays * 86_400_000;
    mem.time.forEach((time, j) => {
      if (j === i || time == null || Math.abs(time - written) > span) return;
      context.push({ id: mem.ids[j]!, gap: Math.abs(time - written) });
    });
  }
  context.sort((a, b) => a.gap - b.gap || a.id.localeCompare(b.id));
  const counts = new Map<string, number>();
  for (const { id: other } of context) {
    const topic = mem.topic[mem.index.get(other)!];
    if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return {
    context: context.slice(0, limit).map(item => item.id),
    associations: mem.partners[i]!.slice(0, 8).map(({ j }) => mem.ids[j]!),
    topics: [...counts.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
    written,
  };
}

// ---------- Representational differentiation ----------

const COMMON = new Set(["with", "from", "that", "this", "their", "into", "about", "through", "these", "those", "which", "while", "where", "what", "when", "will", "your", "they", "them", "than", "then", "also", "more", "most", "such", "some", "other", "each", "been", "have", "has", "were", "being", "over", "under", "between", "within", "without", "using", "used"]);

export type Twin = {
  a: string;
  b: string;
  /** 0–1 overlap of their words. */
  alike: number;
  /** Words only one of them uses: what tells them apart. */
  onlyA: string[];
  onlyB: string[];
};

/**
 * Notes that compete: so alike in words and topic that one could stand in for the other.
 * For each pair, the rarest words each uses and the other does not — the difference worth
 * sharpening (or the sign that they should be one note).
 */
export function findTwins(mem: MemoryIndex, opts: { min?: number; limit?: number } = {}): Twin[] {
  const min = opts.min ?? 0.45;
  const limit = opts.limit ?? 12;
  const df = new Map<string, number>();
  for (const set of mem.words) for (const word of set) df.set(word, (df.get(word) ?? 0) + 1);
  const seen = new Set<string>();
  const twins: Twin[] = [];
  mem.partners.forEach((list, i) => {
    for (const { j } of list) {
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const alike = jaccard(mem.tokens[i]!, mem.tokens[j]!);
      if (alike < min) continue;
      // "Week 4 Lecture" and "Week 9 Lecture" are a series, not rivals.
      const numbers = (label: string) => (label.match(/\d+/g) ?? []).join(",");
      if (numbers(mem.labels[i]!) !== numbers(mem.labels[j]!)) continue;
      const distinct = (left: Set<string>, right: Set<string>) =>
        [...left]
          .filter(word => !COMMON.has(word) && !right.has(word) && !right.has(word.replace(/s$/, "")) && !right.has(`${word}s`))
          .sort((x, y) => (df.get(x) ?? 0) - (df.get(y) ?? 0) || x.localeCompare(y))
          .slice(0, 4);
      const [a, b] = mem.ids[i]! < mem.ids[j]! ? [i, j] : [j, i];
      twins.push({ a: mem.ids[a]!, b: mem.ids[b]!, alike, onlyA: distinct(mem.words[a]!, mem.words[b]!), onlyB: distinct(mem.words[b]!, mem.words[a]!) });
    }
  });
  twins.sort((x, y) => y.alike - x.alike || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  // One pair per note, so a cluster of near-copies does not fill the list.
  const used = new Set<string>();
  const out: Twin[] = [];
  for (const twin of twins) {
    if (used.has(twin.a) || used.has(twin.b)) continue;
    used.add(twin.a);
    used.add(twin.b);
    out.push(twin);
    if (out.length >= limit) break;
  }
  return out;
}
