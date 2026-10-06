import type { AtlasLand } from "./atlasLayout";

/**
 * A book's coastline, shared by the Archipelago and the book's own map. Shapes are in
 * island units (centre 0, 0; the coast lies near radius 1) and depend only on the book's
 * key, so a book keeps its outline as its notes change; only its size moves. Each source
 * is a soft hill; the coast is where their sum crosses SEA_LEVEL.
 */

export const SEA_LEVEL = 0.42;
/** An island's coast sits at about COAST × its packing radius, leaving its islets room before the next island. */
export const COAST = 0.86;

export type ShapeSource = { x: number; y: number; amp: number; sigma: number; stretch: number; angle: number };
export type IslandShape = { base: ShapeSource[]; islets: ShapeSource[] };
type Hill = { x: number; y: number; amp: number; sigma: number; stretch?: number; angle?: number };
type Pt = { x: number; y: number };

export function islandRadius(noteCount: number) {
  return Math.round(58 + Math.sqrt(Math.max(0, noteCount)) * 17);
}

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function rolls(key: string) {
  let n = 0;
  return () => hash(`${key}#${(n += 1)}`);
}

// A lone body of amp 1 meets the sea at radius 1 when exp(-1 / (2σ²)) = SEA_LEVEL.
const BODY_SIGMA = Math.sqrt(1 / (2 * Math.log(1 / SEA_LEVEL)));

export function islandShape(key: string): IslandShape {
  const roll = rolls(`${key}:shape`);
  // Near-round: never stretched past 1.3, so no island reads as a sausage.
  const base: ShapeSource[] = [{ x: 0, y: 0, amp: 1, sigma: BODY_SIGMA * 0.92, stretch: 1 + roll() * 0.3, angle: roll() * Math.PI }];
  // Headlands: short and broad, spread round the coast so no two crowd one side.
  const heads = 3 + Math.floor(roll() * 3);
  const turn = roll() * Math.PI * 2;
  for (let k = 0; k < heads; k += 1) {
    const a = turn + ((k + 0.2 + roll() * 0.6) / heads) * Math.PI * 2;
    const dist = 0.55 + roll() * 0.2;
    base.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, amp: 0.35 + roll() * 0.25, sigma: 0.2 + roll() * 0.08, stretch: 1.2 + roll() * 0.6, angle: a });
  }
  if (roll() < 0.6) {
    // A bay pressed into one shore.
    const a = roll() * Math.PI * 2;
    base.push({ x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.85, amp: -0.45, sigma: 0.2, stretch: 1.5, angle: a + Math.PI / 2 });
  }
  const islets: ShapeSource[] = [];
  const count = Math.floor(roll() * 3);
  for (let k = 0; k < count; k += 1) {
    const a = roll() * Math.PI * 2;
    const dist = 1.22 + roll() * 0.14;
    islets.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, amp: 0.75, sigma: 0.06 + roll() * 0.04, stretch: 1 + roll() * 0.6, angle: roll() * Math.PI });
  }
  return { base, islets };
}

/** One hill's height at (x, y): the same formula as the terrain renderer, without its noise. */
export function sourceHeight(s: Hill, x: number, y: number) {
  const k = Math.max(0.2, s.stretch ?? 1);
  const c = Math.cos(s.angle ?? 0);
  const si = Math.sin(s.angle ?? 0);
  const ex = x - s.x;
  const ey = y - s.y;
  const u = ex * c + ey * si;
  const v = ey * c - ex * si;
  return s.amp * Math.exp(-(u * u / k + v * v * k) / (2 * s.sigma * s.sigma));
}

export function shapeHeight(sources: Hill[], x: number, y: number) {
  let e = 0;
  for (const s of sources) e += sourceHeight(s, x, y);
  return e;
}

/** How far the coast reaches along a bearing, in island units: the first point out from the centre that is sea. */
export function reachAt(shape: IslandShape, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let r = 0.02; r < 2; r += 0.01) if (shapeHeight(shape.base, c * r, s * r) < SEA_LEVEL) return r - 0.005;
  return 2;
}

/** Where the coast faces a bearing, in island units. */
export function shoreAt(shape: IslandShape, angle: number): Pt {
  const r = reachAt(shape, angle);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

/** A shape placed in world space (centre x, y; coast radius r) as Atlas land for the terrain renderer. */
export function landFor(shape: IslandShape, x: number, y: number, r: number, province: string, vote = true): AtlasLand[] {
  return [...shape.base, ...shape.islets].map(s => ({ province, x: x + s.x * r, y: y + s.y * r, amp: s.amp, sigma: s.sigma * r, stretch: s.stretch, angle: s.angle, vote }));
}

/**
 * Two joined books: a neck of land filling the strait between their facing shores `a`
 * and `b`, `width` across. Each half votes for its own book, so the border falls midway.
 */
export function neckLand(a: Pt, b: Pt, width: number, fromKey: string, toKey: string): AtlasLand[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  // amp 0.8 meets the sea about 1.14σ out, so across = width / 2.3 gives the neck its width.
  const across = width / 2.3;
  const along = len / 4 + width * 0.6;
  const sigma = Math.sqrt(along * across);
  const stretch = along / across;
  return ([[fromKey, 0.25], [toKey, 0.75]] as const).map(([province, t]) => ({ province, x: a.x + dx * t, y: a.y + dy * t, amp: 0.8, sigma, stretch, angle, vote: true }));
}
