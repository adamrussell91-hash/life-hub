/**
 * Impulses for the neural map: signals that travel along fibres like a charge down a neuron.
 * Pure geometry and scheduling; forceGraph draws them.
 *
 * A signal is a list of hops. Each hop runs from one note to a linked note over a stretch of
 * time. Path plays one signal end to end, Walk plays a slow one the camera rides, and Spark lets
 * one thought fan out through the network, weakening as it goes (spreading activation).
 */
import { noteNeighbours, noteTime } from "./showAllInsights";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export type Point = { x: number; y: number };
export type Quad = { p0: Point; c: Point; p2: Point };

/** A point a fraction `t` along a quadratic curve. */
export function quadPoint({ p0, c, p2 }: Quad, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  };
}

/** The piece of a quadratic curve between t0 and t1, itself a quadratic (blossoming). */
export function subQuad(q: Quad, t0: number, t1: number): Quad {
  const a = Math.max(0, Math.min(1, t0));
  const b = Math.max(0, Math.min(1, t1));
  const w0 = (1 - a) * (1 - b);
  const w1 = (1 - a) * b + a * (1 - b);
  const w2 = a * b;
  return {
    p0: quadPoint(q, a),
    c: { x: w0 * q.p0.x + w1 * q.c.x + w2 * q.p2.x, y: w0 * q.p0.y + w1 * q.c.y + w2 * q.p2.y },
    p2: quadPoint(q, b),
  };
}

/** Reverse a curve so t runs the other way. */
export function flipQuad(q: Quad): Quad {
  return { p0: q.p2, c: q.c, p2: q.p0 };
}

export type Hop = {
  from: string;
  to: string;
  /** ms after the signal starts. */
  start: number;
  duration: number;
  /** 0–1: how strong the charge is on this hop (brightness). */
  strength: number;
};

/** Ease in and out, so a charge gathers, runs and settles rather than sliding at constant speed. */
export function easeInOut(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** One signal along a route, hop after hop. `pause` is a short rest at each note. */
export function routeHops(route: string[], hopMs: number, pause = 0): Hop[] {
  const hops: Hop[] = [];
  for (let i = 1; i < route.length; i++) {
    hops.push({ from: route[i - 1]!, to: route[i]!, start: (i - 1) * (hopMs + pause), duration: hopMs, strength: 1 });
  }
  return hops;
}

export function signalLength(hops: Hop[]) {
  return hops.reduce((end, hop) => Math.max(end, hop.start + hop.duration), 0);
}

/**
 * Where the charge is at time `t`: the hop it is on and how far along (eased), or null before
 * it starts / after it ends.
 */
export function headAt(hops: Hop[], t: number) {
  for (const hop of hops) {
    if (t >= hop.start && t < hop.start + hop.duration) return { hop, at: easeInOut((t - hop.start) / hop.duration) };
  }
  return null;
}

/** Words worth matching: lower-case, 3+ letters, no stop words. */
export function thoughtWords(text: string) {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "what", "how", "why", "are", "was", "about", "into", "your", "you", "have", "has", "not", "but", "can", "does", "will"]);
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(word => !stop.has(word));
}

/**
 * The notes a thought lands on first: titles count three times as much as excerpts, topics once.
 * Best first; at most `limit`.
 */
export function sparkSeeds(
  nodes: GraphNodeDatum[],
  thought: string,
  textFor: (node: GraphNodeDatum) => string,
  limit = 5,
) {
  const words = thoughtWords(thought);
  if (!words.length) return [];
  const scored: Array<{ id: string; score: number }> = [];
  for (const node of nodes) {
    if (node.kind !== "leaf" || node.departing) continue;
    const title = node.label.toLowerCase();
    const body = textFor(node).toLowerCase();
    const topic = (node.parentKeyword ?? "").toLowerCase();
    let score = 0;
    for (const word of words) {
      if (title.includes(word)) score += 3;
      if (body.includes(word)) score += 1;
      if (topic.includes(word)) score += 1;
    }
    if (score > 0) scored.push({ id: node.id, score: score / words.length });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map(item => item.id);
}

export type Spark = {
  hops: Hop[];
  /** How strongly each reached note lit up (seeds are 1). */
  level: Map<string, number>;
  /** When each note first lit, ms after the spark. */
  litAt: Map<string, number>;
};

/**
 * Spreading activation: the seeds fire, each note passes a share of its charge to its strongest
 * few links, the charge fades with every hop, and it stops once it is too faint. What lights up
 * is what your notes associate with the thought, including things you never filed together.
 */
export function spreadSpark(
  links: GraphLinkDatum[],
  seeds: string[],
  opts: { decay?: number; fanOut?: number; floor?: number; hopMs?: number; maxNotes?: number } = {},
): Spark {
  const decay = opts.decay ?? 0.62;
  const fanOut = opts.fanOut ?? 4;
  const floor = opts.floor ?? 0.08;
  const hopMs = opts.hopMs ?? 900;
  const maxNotes = opts.maxNotes ?? 260;
  const neighbours = noteNeighbours(links);
  const level = new Map<string, number>();
  const litAt = new Map<string, number>();
  const hops: Hop[] = [];
  let wave = seeds.map((id, index) => ({ id, charge: 1, at: index * 140 }));
  for (const seed of wave) {
    level.set(seed.id, 1);
    litAt.set(seed.id, seed.at);
  }
  while (wave.length && level.size < maxNotes) {
    const next: typeof wave = [];
    for (const { id, charge, at } of wave) {
      const all = neighbours.get(id) ?? [];
      // Link strength is judged against this note's strongest link, visited or not.
      const strongest = all[0]?.weight ?? 1;
      const out = all.filter(item => !level.has(item.id)).slice(0, fanOut);
      for (const item of out) {
        if (level.size >= maxNotes) break;
        const passed = charge * decay * (0.55 + 0.45 * (item.weight / strongest));
        if (passed < floor || level.has(item.id)) continue;
        // Weaker links carry the charge a little slower, so a wave fans out unevenly, like a nerve.
        const duration = hopMs * (1.25 - 0.4 * (item.weight / strongest));
        hops.push({ from: id, to: item.id, start: at, duration, strength: passed });
        level.set(item.id, passed);
        litAt.set(item.id, at + duration);
        next.push({ id: item.id, charge: passed, at: at + duration });
      }
    }
    wave = next;
  }
  return { hops, level, litAt };
}

export type Echo = { id: string; label: string; level: number; written: number | null; forgotten: boolean };

/**
 * What came back: the notes the spark reached that the thought did not name outright — the
 * associations — strongest first, with notes older than a year flagged as forgotten.
 */
export function sparkEchoes(
  nodes: GraphNodeDatum[],
  spark: Spark,
  seeds: string[],
  now: number,
  limit = 8,
  /** The thought's words: notes whose titles say them outright are not associations. */
  named: string[] = [],
): Echo[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const seedSet = new Set(seeds);
  const yearAgo = now - 365 * 86_400_000;
  const echoes: Echo[] = [];
  for (const [id, level] of spark.level) {
    if (seedSet.has(id)) continue;
    const node = byId.get(id);
    if (!node || node.kind !== "leaf") continue;
    const title = node.label.toLowerCase();
    if (named.some(word => title.includes(word))) continue;
    const written = noteTime(node);
    echoes.push({ id, label: node.label, level, written, forgotten: written != null && written < yearAgo });
  }
  // A forgotten note that still answers is worth more than a fresh one you already remember.
  const worth = (echo: Echo) => echo.level * (echo.forgotten ? 1.35 : 1);
  echoes.sort((a, b) => worth(b) - worth(a) || a.id.localeCompare(b.id));
  return echoes.slice(0, limit);
}
