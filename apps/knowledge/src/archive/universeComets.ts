import type { PageManifestEntry } from "../domain/page";
import { topicKeywords } from "./keywordGraph";
import { hashUnit, type SolarModel } from "./solarModel";
import { TAU } from "./universeDraw";

/**
 * Comets are the notes that bridge the rarest three-topic combinations: for every note that
 * spans three planets, compare how often each pair of its planets co-occurs against chance.
 * The least expected combinations win, one note per combination, at most 20.
 */

export const COMET_LIMIT = 20;

export type Comet = {
  pageId: string;
  title: string;
  excerpt: string;
  /** Planet body indices, in tag order. */
  planets: number[];
  colors: string[];
  a: number;
  e: number;
  w: number;
  m0: number;
  period: number;
};

/** Owner planet label for each topic tag (a minor topic belongs to the planet it orbits). */
export function planetOfTag(model: SolarModel) {
  const owner = new Map<string, number>();
  for (const body of model.bodies) {
    if (body.kind === "planet") owner.set(body.label, body.idx);
    else if (body.kind === "minor" && body.parent >= 0) owner.set(body.label, body.parent);
  }
  return owner;
}

function pair(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function selectCometNotes(entries: PageManifestEntry[], model: SolarModel, limit = COMET_LIMIT) {
  const owner = planetOfTag(model);
  const total = entries.length;
  const planetCount = new Map<number, number>();
  const pairCount = new Map<string, number>();
  const spans = entries.map(entry => {
    const planets: number[] = [];
    for (const tag of topicKeywords(entry.tags)) {
      const planet = owner.get(tag);
      if (planet != null && !planets.includes(planet)) planets.push(planet);
    }
    for (const p of planets) planetCount.set(p, (planetCount.get(p) ?? 0) + 1);
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const key = pair(planets[i]!, planets[j]!);
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
    return planets;
  });
  const scored: Array<{ index: number; score: number; key: string }> = [];
  spans.forEach((planets, index) => {
    if (planets.length < 3) return;
    const three = planets.slice(0, 3);
    let score = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const a = three[i]!;
        const b = three[j]!;
        const expected = ((planetCount.get(a) ?? 0) * (planetCount.get(b) ?? 0)) / Math.max(total, 1);
        score += Math.log(Math.max(expected, 1e-9) / Math.max(pairCount.get(pair(a, b)) ?? 1, 1));
      }
    }
    scored.push({ index, score, key: [...three].sort((x, y) => x - y).join(",") });
  });
  scored.sort((x, y) => y.score - x.score || entries[x.index]!.id.localeCompare(entries[y.index]!.id));
  const seen = new Set<string>();
  const picked: Array<{ entry: PageManifestEntry; planets: number[] }> = [];
  for (const item of scored) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    picked.push({ entry: entries[item.index]!, planets: spans[item.index]!.slice(0, 3) });
    if (picked.length >= limit) break;
  }
  return picked;
}

export function buildComets(entries: PageManifestEntry[], model: SolarModel, limit = COMET_LIMIT): Comet[] {
  const radii = model.planets.map(planet => planet.a).filter(a => a > 0).sort((a, b) => a - b);
  const inner = radii[0] ?? 400;
  const outer = radii.at(-1) ?? 3000;
  return selectCometNotes(entries, model, limit).map(({ entry, planets }, index) => {
    const id = `comet:${entry.id}`;
    return {
      pageId: entry.id,
      title: entry.title,
      excerpt: entry.excerpt,
      planets,
      colors: planets.map(p => model.bodies[p]!.color),
      a: inner * 0.9 + (outer * 0.85 - inner * 0.9) * hashUnit(`${id}:a`),
      e: 0.6 + hashUnit(`${id}:e`) * 0.28,
      w: hashUnit(`${id}:w`) * TAU,
      m0: hashUnit(`${id}:m`) * TAU,
      period: 80 + hashUnit(`${id}:p`) * 120 + index,
    };
  });
}

/** Offset from the Hub at orbit time `clock`, solving Kepler's equation so comets whip round the Hub and dawdle far out. */
export function cometOffset(comet: Pick<Comet, "a" | "e" | "w" | "m0" | "period">, clock: number) {
  const mean = comet.m0 + (clock / comet.period) * TAU;
  let ecc = mean;
  for (let i = 0; i < 6; i++) ecc -= (ecc - comet.e * Math.sin(ecc) - mean) / (1 - comet.e * Math.cos(ecc));
  const x = comet.a * (Math.cos(ecc) - comet.e);
  const y = comet.a * Math.sqrt(1 - comet.e * comet.e) * Math.sin(ecc);
  const cw = Math.cos(comet.w);
  const sw = Math.sin(comet.w);
  return { x: x * cw - y * sw, y: (x * sw + y * cw) * 0.82 };
}

/** Mean anomaly in [0, TAU). Crossing 0 is perihelion — the comet rounding the Hub. */
export function cometMeanAnomaly(comet: Pick<Comet, "m0" | "period">, clock: number) {
  return (((comet.m0 + (clock / comet.period) * TAU) % TAU) + TAU) % TAU;
}

/** The tail traces where the comet has just been, so it always streaks behind its direction of travel. */
export const COMET_TAIL_WINDOW = 0.045;
