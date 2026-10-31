// packages/walkthrus/board/route.ts
// Arrows between tiles, drawn the way the book draws them. Touching tiles get a chevron knot on
// their shared edge. Every other arrow runs as horizontal and vertical lines with rounded corners
// through the open space around and between clusters: a coarse grid over the board, with every
// cell near a tile blocked (so the narrow white gaps between touching tiles are never used), and
// an A* search that pays for length, more for each bend and something for sharing a lane. Arrows
// that still share a lane are pulled apart onto parallel lanes. Each starts with a small open
// circle on the source tile's edge and ends in a long narrow head at the target's edge; its label
// sits on its longest straight run as "TYPE | text". Pure geometry: no DOM.
import { textWidth } from '../../graph-blocks/graph';
import { directionBetween, edgeOf, pointInPolygon, SQRT3, type Pt } from './hex';
import type { BoardLayout, BoardTile, Box } from './layout';

export type ArrowType = 'leads_to' | 'pairs_with' | 'free';
/** `quiet` arrows (the book's own suggestions) draw without a label. */
export interface BoardArrow { id: string; from: string; to: string; type: ArrowType; label?: string; quiet?: boolean }
export interface Head { x: number; y: number; angle: number }
export interface Knot { x: number; y: number; angle: number; chevrons: 0 | 1 | 2; edge: [Pt, Pt] }
/** The book-style label: bold caps `type`, a thin divider, then `text` (which may be empty). */
export interface PlacedLabel { type: string; text: string; typeW: number; x: number; y: number; w: number; h: number; anchor: Pt }
export interface RoutedArrow {
  id: string;
  type: ArrowType;
  from: string;
  to: string;
  /** The placements (BoardTile.key) the arrow joins, since a tile may sit in several clusters. */
  fromKey: string;
  toKey: string;
  kind: 'knot' | 'path';
  /** SVG path data with rounded corners; empty for a knot. */
  d: string;
  /** The orthogonal polyline the path follows (its corner points before rounding), for hit tests. */
  points: Pt[];
  /** Small open circle on the source edge; null for a knot or a two-way arrow. */
  start: Pt | null;
  /**
   * A tile surrounded on all six sides has no clear way in, so the stub at that end crosses one
   * neighbour. The view draws such arrows above the tiles.
   */
  over: { start: boolean; end: boolean };
  heads: Head[];
  knot: Knot | null;
  dashed: boolean;
  label: PlacedLabel | null;
}

export const TYPE_CAPS: Record<ArrowType, string> = { leads_to: 'LEADS TO', pairs_with: 'PAIRS WITH', free: 'NOTE' };
export const LANE_GAP = 6;
export const HEAD_LENGTH = 18;
export const HEAD_HALF = 4.5;
export const LABEL_TYPE_FONT = 10;
export const LABEL_TEXT_FONT = 12;
export const LABEL_PAD = 10;
export const LABEL_DIVIDER = 14;
const LABEL_H = 22;

// ── segment, box and polygon tests ───────────────────────────────────────────

const inBox = (p: Pt, b: Box, m = 0): boolean => Math.abs(p.x - b.x) <= b.w / 2 + m && Math.abs(p.y - b.y) <= b.h / 2 + m;

/** Does the segment a→b touch the (centre-based) box, grown by `margin`? */
export function segmentHitsBox(a: Pt, b: Pt, box: Box, margin = 0): boolean {
  const x0 = box.x - box.w / 2 - margin;
  const x1 = box.x + box.w / 2 + margin;
  const y0 = box.y - box.h / 2 - margin;
  const y1 = box.y + box.h / 2 + margin;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

export function pathHitsBox(points: Pt[], box: Box, margin = 0): boolean {
  for (let i = 1; i < points.length; i++) if (segmentHitsBox(points[i - 1]!, points[i]!, box, margin)) return true;
  return points.length === 1 && inBox(points[0]!, box, margin);
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Distance from a point to a polygon's outline; 0 inside it. */
export function distToPolygon(p: Pt, poly: Pt[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, distToSegment(p, poly[j]!, poly[i]!));
  return best;
}

/** Does the segment come within `margin` of the polygon (or cross it)? Sampled every 2 units. */
export function segmentNearPolygon(a: Pt, b: Pt, poly: Pt[], margin: number): boolean {
  const n = Math.max(1, Math.ceil(dist(a, b) / 2));
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    if (distToPolygon(p, poly) < margin) return true;
  }
  return false;
}

function rectHitsPolygon(r: Box, poly: Pt[]): boolean {
  const corners = [
    { x: r.x - r.w / 2, y: r.y - r.h / 2 }, { x: r.x + r.w / 2, y: r.y - r.h / 2 },
    { x: r.x + r.w / 2, y: r.y + r.h / 2 }, { x: r.x - r.w / 2, y: r.y + r.h / 2 }
  ];
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  if (poly.some((p) => inBox(p, r))) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segmentHitsBox(poly[j]!, poly[i]!, r)) return true;
  return false;
}

const overlaps = (a: Box, b: Box, m = 0): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w + m && Math.abs(a.y - b.y) * 2 < a.h + b.h + m;

// ── the grid ─────────────────────────────────────────────────────────────────

/** Directions on the grid: right, down, left, up. Odd ones are vertical. */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const FREE = 0;
const SOFT = 1;
const HARD = 2;

/** A way out of a tile: a free grid cell, the direction away from the tile, and the stub to its edge. `over` stubs cross a neighbour. */
interface Port { cell: number; away: number; hit: Pt; len: number; over: boolean }

interface Grid {
  x0: number;
  y0: number;
  step: number;
  cols: number;
  rows: number;
  /** FREE; SOFT (within the margin of a tile or a cluster title: only at a steep price); HARD (inside a tile). */
  block: Uint8Array;
  /** Free cells hugging the margin cost a little more, so lanes keep to the middle of open space. */
  near: Uint8Array;
}

interface Context {
  layout: BoardLayout;
  grid: Grid;
  margin: number;
  byId: Map<string, BoardTile[]>;
  ports: Map<string, Port[]>;
}

const centreOf = (g: Grid, i: number): Pt => ({ x: g.x0 + (i % g.cols) * g.step, y: g.y0 + Math.floor(i / g.cols) * g.step });

function buildGrid(layout: BoardLayout, margin: number): Grid {
  const step = layout.size / 2;
  const pad = layout.size * 2;
  const x0 = Math.floor((layout.bounds.x - pad) / step) * step;
  const y0 = Math.floor((layout.bounds.y - pad) / step) * step;
  const cols = Math.ceil((layout.bounds.w + pad * 2) / step) + 2;
  const rows = Math.ceil((layout.bounds.h + pad * 2) / step) + 2;
  const block = new Uint8Array(cols * rows);
  const near = new Uint8Array(cols * rows);
  const span = (lo: number, hi: number, n: number): [number, number] => [Math.max(0, Math.floor(lo / step)), Math.min(n - 1, Math.ceil(hi / step))];
  for (const t of layout.tiles) {
    const reach = layout.drawn + margin + step;
    const [i0, i1] = span(t.x - reach - x0, t.x + reach - x0, cols);
    const [j0, j1] = span(t.y - reach - y0, t.y + reach - y0, rows);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = j * cols + i;
        const d = distToPolygon({ x: x0 + i * step, y: y0 + j * step }, t.corners);
        if (d === 0) block[idx] = HARD;
        else if (d < margin) block[idx] = Math.max(block[idx]!, SOFT);
        else if (d < margin + step * 0.75) near[idx] = 1;
      }
    }
  }
  for (const l of layout.labels) {
    const [i0, i1] = span(l.x - l.w / 2 - 8 - x0, l.x + l.w / 2 + 8 - x0, cols);
    const [j0, j1] = span(l.y - l.h / 2 - 8 - y0, l.y + l.h / 2 + 8 - y0, rows);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (inBox({ x: x0 + i * step, y: y0 + j * step }, l, 6)) block[j * cols + i] = Math.max(block[j * cols + i]!, SOFT);
    }
  }
  return { x0, y0, step, cols, rows, block, near };
}

/** Where a ray from `p` in direction (dx, dy) first meets the polygon's outline, within `max`. */
function rayHit(p: Pt, dx: number, dy: number, poly: Pt[], max: number): { hit: Pt; len: number } | null {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best <= max ? { hit: { x: p.x + dx * best, y: p.y + dy * best }, len: best } : null;
}

/**
 * The ways out of a tile: free cells close to it from which a straight horizontal or vertical stub
 * reaches its edge without passing near any other tile (so never down a gap between two touching
 * tiles), and clear of its corners. A tile with no such way (one surrounded on all sides) gets
 * stubs that cross a single neighbour instead.
 */
function portsOf(ctx: Context, tile: BoardTile): Port[] {
  const cached = ctx.ports.get(tile.key);
  if (cached) return cached;
  let out = scanPorts(ctx, tile, false);
  if (!out.length) out = scanPorts(ctx, tile, true);
  ctx.ports.set(tile.key, out);
  return out;
}

function scanPorts(ctx: Context, tile: BoardTile, over: boolean): Port[] {
  const { grid: g, layout } = ctx;
  const reach = ctx.margin + g.step * 1.6 + (over ? layout.size * 2 : 0);
  const out: Port[] = [];
  const others = layout.tiles.filter((t) => t.key !== tile.key && dist(t, tile) < layout.size * 5);
  const i0 = Math.max(0, Math.floor((tile.x - layout.drawn - reach - g.x0) / g.step));
  const i1 = Math.min(g.cols - 1, Math.ceil((tile.x + layout.drawn + reach - g.x0) / g.step));
  const j0 = Math.max(0, Math.floor((tile.y - layout.drawn - reach - g.y0) / g.step));
  const j1 = Math.min(g.rows - 1, Math.ceil((tile.y + layout.drawn + reach - g.y0) / g.step));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cell = j * g.cols + i;
      if (g.block[cell] !== FREE) continue;
      const c = centreOf(g, cell);
      for (let d = 0; d < 4; d++) {
        const hit = rayHit(c, DX[d]!, DY[d]!, tile.corners, reach);
        if (!hit) continue;
        if (tile.corners.some((k) => dist(k, hit.hit) < layout.drawn * 0.18)) continue;
        const nearBy = others.filter((o) => segmentHitsBox(c, hit.hit, o.box, ctx.margin));
        if (over) {
          // Cross exactly one neighbour, through its body rather than along a gap.
          const crossed = nearBy.filter((o) => segmentNearPolygon(c, hit.hit, o.corners, 3));
          if (crossed.length !== 1 || distToSegment(crossed[0]!, c, hit.hit) > layout.drawn * 0.5) continue;
          out.push({ cell, away: (d + 2) % 4, hit: hit.hit, len: hit.len + g.step * 4, over });
        } else {
          if (nearBy.some((o) => segmentNearPolygon(c, hit.hit, o.corners, ctx.margin * 0.5))) continue;
          out.push({ cell, away: (d + 2) % 4, hit: hit.hit, len: hit.len, over });
        }
      }
    }
  }
  return out;
}

// ── search ───────────────────────────────────────────────────────────────────

class Heap {
  private items: Array<[number, number]> = [];
  get size(): number { return this.items.length; }
  push(cost: number, node: number): void {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** Costs in grid steps: a bend costs as much as a few steps; reusing a lane costs most of a step. */
const BEND = 2.4;
const REUSE = 0.7;
const NEAR = 0.35;
const SOFT_COST = 40;

/** Lane use, keyed by cell × 2 + axis (0 horizontal, 1 vertical). */
type Used = Map<number, number>;
const laneKey = (state: number): number => (state >> 2) * 2 + (state & 1);

function search(ctx: Context, from: BoardTile, to: BoardTile, used: Used): { pts: Pt[]; over: { start: boolean; end: boolean } } | null {
  const g = ctx.grid;
  const starts = portsOf(ctx, from);
  const ends = portsOf(ctx, to);
  if (!starts.length || !ends.length) return null;
  const endsAt = new Map<number, Port[]>();
  for (const p of ends) endsAt.set(p.cell, [...(endsAt.get(p.cell) ?? []), p]);
  const n = g.cols * g.rows * 4;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new Heap();
  const s = g.step;
  const ti = (to.x - g.x0) / s;
  const tj = (to.y - g.y0) / s;
  const slack = (ctx.layout.drawn + ctx.margin) / s + 1.6;
  const h = (cell: number): number => Math.max(0, Math.abs((cell % g.cols) - ti) + Math.abs(Math.floor(cell / g.cols) - tj) - slack) * s;
  const startPort = new Map<number, Port>();
  for (const p of starts) {
    const st = p.cell * 4 + p.away;
    if (p.len < best[st]!) { best[st] = p.len; startPort.set(st, p); heap.push(p.len + h(p.cell), st); }
  }
  let found = -1;
  let foundPort: Port | null = null;
  let foundCost = Infinity;
  while (heap.size) {
    const [fcost, st] = heap.pop();
    const cell = st >> 2;
    const d = st & 3;
    const cost = best[st]!;
    if (fcost - h(cell) > cost + 1e-9) continue;
    if (fcost >= foundCost) break;
    for (const p of endsAt.get(cell) ?? []) {
      if (d === p.away) continue;
      const total = cost + p.len + (d === (p.away + 2) % 4 ? 0 : BEND * s);
      if (total < foundCost) { foundCost = total; found = st; foundPort = p; }
    }
    const ci = cell % g.cols;
    const cj = Math.floor(cell / g.cols);
    for (let d2 = 0; d2 < 4; d2++) {
      if (d2 === (d + 2) % 4) continue;
      const ni = ci + DX[d2]!;
      const nj = cj + DY[d2]!;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const nc = nj * g.cols + ni;
      const b = g.block[nc]!;
      if (b === HARD) continue;
      const ns = nc * 4 + d2;
      let w = s * (1 + (b === SOFT ? SOFT_COST : 0) + (g.near[nc] ? NEAR : 0) + (used.get(laneKey(ns)) ?? 0) * REUSE);
      if (d2 !== d) w += BEND * s;
      const next = cost + w;
      if (next < best[ns]!) { best[ns] = next; prev[ns] = st; heap.push(next + h(nc), ns); }
    }
  }
  if (found < 0 || !foundPort) return null;
  const chain: number[] = [];
  for (let st = found; st >= 0; st = prev[st]!) chain.push(st);
  chain.reverse();
  for (const st of chain) used.set(laneKey(st), (used.get(laneKey(st)) ?? 0) + 1);
  const first = startPort.get(chain[0]!)!;
  return { pts: simplify([first.hit, ...chain.map((st) => centreOf(g, st >> 2)), foundPort.hit]), over: { start: first.over, end: foundPort.over } };
}

/** Drop repeated and collinear points, leaving only the corners. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && dist(last, p) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      if (Math.abs(cross) < 1e-6) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

// ── parallel lanes ───────────────────────────────────────────────────────────

/** Arrows that run along the same lane move onto parallel lanes LANE_GAP apart, in id order. */
function offsetSharedLanes(paths: Array<{ id: string; pts: Pt[] }>): void {
  type Seg = { path: number; i: number; axis: 0 | 1; at: number; lo: number; hi: number };
  const lanes = new Map<string, Seg[]>();
  paths.forEach((p, path) => {
    // The end stubs stay where they meet their tiles; moving the run next to one only stretches it.
    for (let i = 1; i < p.pts.length - 2; i++) {
      const a = p.pts[i]!;
      const b = p.pts[i + 1]!;
      let seg: Seg | null = null;
      if (Math.abs(a.y - b.y) < 0.01) seg = { path, i, axis: 0, at: Math.round(a.y), lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) };
      else if (Math.abs(a.x - b.x) < 0.01) seg = { path, i, axis: 1, at: Math.round(a.x), lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) };
      if (seg) lanes.set(`${seg.axis}:${seg.at}`, [...(lanes.get(`${seg.axis}:${seg.at}`) ?? []), seg]);
    }
  });
  const shifts: Array<{ seg: Seg; by: number }> = [];
  for (const lane of lanes.values()) {
    if (lane.length < 2) continue;
    lane.sort((a, b) => a.lo - b.lo || a.path - b.path);
    // Runs of overlapping segments share the lane; each run spreads out around the lane's middle.
    let group: Seg[] = [];
    let reach = -Infinity;
    const flush = (): void => {
      const byPath = [...new Set(group.map((s) => s.path))].sort((a, b) => (paths[a]!.id < paths[b]!.id ? -1 : 1));
      if (byPath.length > 1) for (const s of group) shifts.push({ seg: s, by: (byPath.indexOf(s.path) - (byPath.length - 1) / 2) * LANE_GAP });
      group = [];
      reach = -Infinity;
    };
    for (const s of lane) {
      if (group.length && s.lo >= reach - 0.5) flush();
      group.push(s);
      reach = Math.max(reach, s.hi);
    }
    flush();
  }
  for (const { seg, by } of shifts) {
    const pts = paths[seg.path]!.pts;
    for (const k of [seg.i, seg.i + 1]) {
      const p = pts[k]!;
      pts[k] = seg.axis === 0 ? { x: p.x, y: p.y + by } : { x: p.x + by, y: p.y };
    }
  }
}

// ── drawing ──────────────────────────────────────────────────────────────────

const fx = (n: number): string => n.toFixed(1);

/** SVG path through the corner points, each corner rounded to `radius` (less on short runs). */
export function roundedPath(pts: Pt[], radius: number): string {
  let d = `M${fx(pts[0]!.x)},${fx(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const v = pts[i]!;
    const b = pts[i + 1]!;
    const la = dist(a, v);
    const lb = dist(v, b);
    const r = Math.min(radius, la / 2, lb / 2);
    if (r < 0.5) { d += `L${fx(v.x)},${fx(v.y)}`; continue; }
    const p1 = { x: v.x + ((a.x - v.x) / la) * r, y: v.y + ((a.y - v.y) / la) * r };
    const p2 = { x: v.x + ((b.x - v.x) / lb) * r, y: v.y + ((b.y - v.y) / lb) * r };
    d += `L${fx(p1.x)},${fx(p1.y)}Q${fx(v.x)},${fx(v.y)} ${fx(p2.x)},${fx(p2.y)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${fx(last.x)},${fx(last.y)}`;
}

const angleOf = (a: Pt, b: Pt): number => Math.atan2(b.y - a.y, b.x - a.x);

/** The polyline with its last run ending under the arrowhead, so no line shows past the tip. */
function trimEnd(pts: Pt[], by: number): Pt[] {
  const out = pts.slice();
  const a = out[out.length - 2]!;
  const b = out[out.length - 1]!;
  const len = dist(a, b);
  const k = Math.min(by, Math.max(0, len - 1)) / (len || 1);
  out[out.length - 1] = { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k };
  return out;
}

/** A straight fallback when no lane exists: edge to edge between the two tiles. */
function straight(a: BoardTile, b: BoardTile): Pt[] {
  const len = dist(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const out = rayHit(a, ux, uy, a.corners, Infinity);
  const back = rayHit(b, -ux, -uy, b.corners, Infinity);
  return [out?.hit ?? { x: a.x, y: a.y }, back?.hit ?? { x: b.x, y: b.y }];
}

// ── labels ───────────────────────────────────────────────────────────────────

export function labelSize(arrow: Pick<BoardArrow, 'type' | 'label'>): { type: string; text: string; typeW: number; w: number; h: number } {
  const type = TYPE_CAPS[arrow.type];
  const text = arrow.label?.trim() ?? '';
  const typeW = textWidth(type, LABEL_TYPE_FONT, 800);
  const w = Math.ceil(typeW + (text ? LABEL_DIVIDER + textWidth(text, LABEL_TEXT_FONT, 500) : 0) + LABEL_PAD * 2);
  return { type, text, typeW, w, h: LABEL_H };
}

/** On the longest straight run that leaves the pill clear of tiles, titles, other pills and (if possible) other arrows. */
function placeLabel(ctx: Context, arrow: BoardArrow, r: RoutedArrow, placed: Box[], routed: RoutedArrow[]): PlacedLabel {
  const size = labelSize(arrow);
  const { tiles, labels } = ctx.layout;
  const clear = (b: Box, strict: boolean | null): boolean => {
    if (strict !== null && tiles.some((t) => overlaps(b, t.box) && rectHitsPolygon({ ...b, w: b.w + 6, h: b.h + 6 }, t.corners))) return false;
    if (labels.some((l) => overlaps(b, l, 6))) return false;
    if (placed.some((p) => overlaps(b, p, 4))) return false;
    if (strict && routed.some((o) => o.id !== r.id && o.kind === 'path' && pathHitsBox(o.points, b, 2))) return false;
    return true;
  };
  const candidates: Pt[] = [];
  if (r.knot) {
    const [e0, e1] = r.knot.edge;
    const len = dist(e0, e1) || 1;
    const ux = (e1.x - e0.x) / len;
    const uy = (e1.y - e0.y) / len;
    for (const step of [0.9, 1.3, 1.8, 2.4, 3, 3.6]) for (const k of [1, -1]) candidates.push({ x: r.knot.x + ux * k * ctx.layout.size * step, y: r.knot.y + uy * k * ctx.layout.size * step });
  } else {
    const runs = r.points.slice(1).map((b, i) => ({ a: r.points[i]!, b, len: dist(r.points[i]!, b) }));
    runs.sort((x, y) => y.len - x.len);
    for (const run of runs) for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) candidates.push({ x: run.a.x + (run.b.x - run.a.x) * t, y: run.a.y + (run.b.y - run.a.y) * t });
  }
  const box = (p: Pt): Box => ({ x: p.x, y: p.y, w: size.w, h: size.h });
  const at = candidates.find((p) => clear(box(p), true)) ?? candidates.find((p) => clear(box(p), false)) ?? candidates.find((p) => clear(box(p), null)) ?? candidates[0] ?? { x: 0, y: 0 };
  // A knot's label sits off along its edge; the anchor is the knot, so the view can draw a leader.
  return { ...size, x: at.x, y: at.y, anchor: r.knot ? { x: r.knot.x, y: r.knot.y } : at };
}

// ── all arrows ───────────────────────────────────────────────────────────────

export interface RouteOptions {
  /** How far from a tile's edge lanes keep. Defaults to 0.3 of the grid size. */
  margin?: number;
}

/** The pair of placements to join: when a tile sits in several clusters, the nearest two. */
function pairFor(ctx: Context, arrow: BoardArrow): [BoardTile, BoardTile] | null {
  let best: [BoardTile, BoardTile] | null = null;
  let bestD = Infinity;
  for (const a of ctx.byId.get(arrow.from) ?? []) for (const b of ctx.byId.get(arrow.to) ?? []) {
    const d = dist(a, b);
    if (a.key !== b.key && d < bestD) { bestD = d; best = [a, b]; }
  }
  return best;
}

const touching = (a: BoardTile, b: BoardTile): boolean => a.cluster === b.cluster && directionBetween(a.cell, b.cell) >= 0;
const byId = <T extends { id: string }>(x: T, y: T): number => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** Route every arrow. Output is sorted by id, so input order never changes the picture. */
export function routeArrows(layout: BoardLayout, arrows: BoardArrow[], options: RouteOptions = {}): RoutedArrow[] {
  const margin = options.margin ?? layout.size * 0.3;
  const placements = new Map<string, BoardTile[]>();
  for (const t of layout.tiles) placements.set(t.id, [...(placements.get(t.id) ?? []), t]);
  const ctx: Context = { layout, grid: buildGrid(layout, margin), margin, byId: placements, ports: new Map() };
  const source = new Map<string, BoardArrow>();
  const used: Used = new Map();
  const routed: RoutedArrow[] = [];
  const paths: Array<{ id: string; pts: Pt[] }> = [];
  // Shorter arrows first, so the long ones go round them rather than the other way about.
  const pairs = [...arrows].sort(byId)
    .map((a) => ({ a, pair: a.from === a.to ? null : pairFor(ctx, a) }))
    .filter((x): x is { a: BoardArrow; pair: [BoardTile, BoardTile] } => Boolean(x.pair))
    .sort((x, y) => dist(x.pair[0], x.pair[1]) - dist(y.pair[0], y.pair[1]) || byId(x.a, y.a));
  for (const { a, pair: [ta, tb] } of pairs) {
    if (source.has(a.id)) continue;
    source.set(a.id, a);
    const base = { id: a.id, type: a.type, from: a.from, to: a.to, fromKey: ta.key, toKey: tb.key, dashed: a.type === 'free', label: null };
    if (touching(ta, tb)) {
      // edgeOf works on the cluster's own grid; shift it to where the cluster's origin sits.
      const edge = edgeOf(ta.cell, directionBetween(ta.cell, tb.cell), layout.size);
      const ox = ta.x - layout.size * 1.5 * ta.cell.q;
      const oy = ta.y - layout.size * SQRT3 * (ta.cell.r + ta.cell.q / 2);
      const sh = (p: Pt): Pt => ({ x: p.x + ox, y: p.y + oy });
      const mid = sh(edge.mid);
      const chevrons = a.type === 'leads_to' ? 1 : a.type === 'pairs_with' ? 2 : 0;
      routed.push({ ...base, kind: 'knot', d: '', points: [mid], start: null, over: { start: false, end: false }, heads: [], knot: { x: mid.x, y: mid.y, angle: angleOf(ta, tb), chevrons, edge: [sh(edge.a), sh(edge.b)] } });
      continue;
    }
    const found = search(ctx, ta, tb, used);
    const pts = found?.pts ?? straight(ta, tb);
    paths.push({ id: a.id, pts });
    routed.push({ ...base, kind: 'path', d: '', points: pts, start: null, over: found?.over ?? { start: true, end: true }, heads: [], knot: null });
  }
  offsetSharedLanes(paths);
  const radius = layout.size * 0.25;
  const pathOf = new Map(paths.map((p) => [p.id, p.pts]));
  for (const r of routed) {
    if (r.kind !== 'path') continue;
    const pts = pathOf.get(r.id)!;
    r.points = pts;
    const n = pts.length;
    const end: Head = { x: pts[n - 1]!.x, y: pts[n - 1]!.y, angle: angleOf(pts[n - 2]!, pts[n - 1]!) };
    let line = trimEnd(pts, HEAD_LENGTH * 0.6);
    if (r.type === 'pairs_with') {
      r.heads = [{ x: pts[0]!.x, y: pts[0]!.y, angle: angleOf(pts[1]!, pts[0]!) }, end];
      line = trimEnd(line.slice().reverse(), HEAD_LENGTH * 0.6).reverse();
    } else {
      r.heads = [end];
      r.start = pts[0]!;
    }
    r.d = roundedPath(line, radius);
  }
  routed.sort(byId);
  const placed: Box[] = [];
  for (const r of routed) {
    const a = source.get(r.id)!;
    // A knot's chevrons already say its type, so it takes a label only when it has words.
    if (a.quiet || (r.kind === 'knot' && !a.label?.trim())) continue;
    r.label = placeLabel(ctx, a, r, placed, routed);
    placed.push(r.label);
  }
  return routed;
}
