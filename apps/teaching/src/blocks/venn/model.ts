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
