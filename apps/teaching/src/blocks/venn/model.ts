/**
 * Two-text Venn logic, kept pure for tests. Texts are A, B and (optionally) C.
 * A region names the texts a point belongs to: 'a' is A only, 'ab' both A and
 * B, 'abc' all three.
 */

export type Region = 'a' | 'b' | 'c' | 'ab' | 'ac' | 'bc' | 'abc';
export type Depth = 'surface' | 'deep';
export type TextKey = 'a' | 'b' | 'c';
export const TEXT_KEYS: readonly TextKey[] = ['a', 'b', 'c'];

export type VennPoint = {
  id: string;
  text: string;
  region: Region | null;
  depth: Depth | null;
  /** A quotation per text, by text key. */
  quotes: Partial<Record<TextKey, string>>;
  /** Shared points: how each text treats it, by text key. */
  differs: Partial<Record<TextKey, string>>;
  /** Came from the teacher's points to sort. */
  preload?: boolean;
};

export function regionsFor(count: number): Region[] {
  return count >= 3 ? ['a', 'ab', 'b', 'ac', 'abc', 'bc', 'c'] : ['a', 'ab', 'b'];
}

/** The texts a region belongs to. */
export function regionTexts(region: Region): TextKey[] {
  return TEXT_KEYS.filter((k) => region.includes(k));
}

export function isShared(region: Region | null): boolean {
  return !!region && region.length > 1;
}

export function textLabel(key: TextKey, labels: readonly string[]): string {
  const i = TEXT_KEYS.indexOf(key);
  return labels[i]?.trim() || `Text ${key.toUpperCase()}`;
}

export function regionLabel(region: Region, labels: readonly string[], count: number): string {
  const texts = regionTexts(region).map((k) => textLabel(k, labels));
  if (texts.length === 1) return `${texts[0]} only`;
  if (texts.length === count) return count === 2 ? 'Both' : 'All three';
  return `${texts.join(' and ')}`;
}

/** What a point still needs: words, a place, a level, and for shared points how each text treats it. */
export function pointGaps(point: VennPoint): string[] {
  const gaps: string[] = [];
  if (!point.text.trim()) gaps.push('Write the point');
  if (!point.region) gaps.push('Place it in the Venn');
  if (!point.depth) gaps.push('Tag it surface or deep');
  if (point.region && isShared(point.region)) {
    for (const key of regionTexts(point.region)) {
      if (!point.differs[key]?.trim()) gaps.push(`Say how text ${key.toUpperCase()} treats it`);
    }
  }
  return gaps;
}

export function pointComplete(point: VennPoint): boolean {
  return pointGaps(point).length === 0;
}

export function depthCounts(points: readonly VennPoint[]): { surface: number; deep: number; untagged: number } {
  let surface = 0;
  let deep = 0;
  let untagged = 0;
  for (const p of points) {
    if (!p.text.trim()) continue;
    if (p.depth === 'surface') surface += 1;
    else if (p.depth === 'deep') deep += 1;
    else untagged += 1;
  }
  return { surface, deep, untagged };
}

/** Suggest a deep point when there are at least two surface points and they outnumber the deep ones. */
export function shouldNudge(points: readonly VennPoint[], enabled = true): boolean {
  if (!enabled) return false;
  const { surface, deep } = depthCounts(points);
  return surface >= 2 && surface > deep;
}

/** Points per region, in region order. Unplaced points are left out. */
export function byRegion(points: readonly VennPoint[], count: number): Map<Region, VennPoint[]> {
  const map = new Map<Region, VennPoint[]>(regionsFor(count).map((r) => [r, []]));
  for (const p of points) if (p.region && map.has(p.region)) map.get(p.region)!.push(p);
  return map;
}

/** A point from saved data: only the known fields, with safe values. */
export function cleanPoint(value: unknown, count: number): VennPoint | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  const regions = regionsFor(count);
  const texts = (raw: unknown): Partial<Record<TextKey, string>> => {
    const out: Partial<Record<TextKey, string>> = {};
    if (raw && typeof raw === 'object') for (const k of TEXT_KEYS) {
      const t = (raw as Record<string, unknown>)[k];
      if (typeof t === 'string') out[k] = t;
    }
    return out;
  };
  return {
    id: v.id,
    text: typeof v.text === 'string' ? v.text : '',
    region: regions.includes(v.region as Region) ? (v.region as Region) : null,
    depth: v.depth === 'surface' || v.depth === 'deep' ? v.depth : null,
    quotes: texts(v.quotes),
    differs: texts(v.differs),
    ...(v.preload === true ? { preload: true } : {})
  };
}

/* ── View helpers (added for the Venn view) ─────────────────────────── */

export const MAX_POINTS = 30;

/** What a student keeps for one Venn: the points and the synthesis sentence (null until they edit it). */
export type VennState = { points: VennPoint[]; synthesis: string | null };

export function textCount(texts: readonly unknown[]): number {
  return texts.length >= 3 ? 3 : 2;
}

/** Gaps in words a student can act on, naming each text by its label. */
export function pointGapsLabelled(point: VennPoint, labels: readonly string[]): string[] {
  return pointGaps(point).map((gap) => {
    const m = /^Say how text ([ABC]) treats it$/.exec(gap);
    return m ? `Say how ${textLabel(m[1]!.toLowerCase() as TextKey, labels)} treats it` : gap;
  });
}

/**
 * The teacher's frame with the text letters swapped for the labels:
 * "where A …, B …" becomes "where The Tide Clock …, Salt Roads …". A capital
 * A followed by a lower-case word is an article and stays.
 */
export function fillFrame(frame: string, labels: readonly string[]): string {
  return frame.replace(/\b([ABC])\b(?!\s+[a-z])/g, (whole, letter: string) => {
    const label = labels[TEXT_KEYS.indexOf(letter.toLowerCase() as TextKey)]?.trim();
    return label || whole;
  });
}

/**
 * The student's points with the teacher's preload merged in: every preload
 * point is there once (text from the teacher), ones the teacher removed go,
 * and the student's placements and notes stay.
 */
export function withPreload(points: readonly VennPoint[], preload: ReadonlyArray<{ id: string; text: string }>): VennPoint[] {
  const live = preload.filter((p) => p.text.trim());
  const ids = new Set(live.map((p) => p.id));
  const kept = points.filter((p) => !p.preload || ids.has(p.id)).map((p) => {
    const source = p.preload ? live.find((x) => x.id === p.id) : undefined;
    return source ? { ...p, text: source.text } : p;
  });
  const have = new Set(kept.map((p) => p.id));
  const added = live.filter((p) => !have.has(p.id)).map((p): VennPoint => ({
    id: p.id, text: p.text, region: null, depth: null, quotes: {}, differs: {}, preload: true
  }));
  return [...added, ...kept];
}

/** Saved state from storage or the server: known fields only. */
export function cleanState(value: unknown, count: number): VennState {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const points = Array.isArray(v.points)
    ? v.points.map((p) => cleanPoint(p, count)).filter((p): p is VennPoint => !!p).slice(0, MAX_POINTS + 12)
    : [];
  return { points, synthesis: typeof v.synthesis === 'string' ? v.synthesis : null };
}

/** Quotes and differs only for the texts in the point's region, so a moved point sends no stale notes. */
export function trimToRegion(point: VennPoint): VennPoint {
  const keys = point.region ? regionTexts(point.region) : [];
  const pick = (rec: Partial<Record<TextKey, string>>) => {
    const out: Partial<Record<TextKey, string>> = {};
    for (const k of keys) if (rec[k]?.trim()) out[k] = rec[k]!;
    return out;
  };
  return { ...point, quotes: pick(point.quotes), differs: isShared(point.region) ? pick(point.differs) : {} };
}
