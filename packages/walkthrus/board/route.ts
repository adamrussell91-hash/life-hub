// packages/walkthrus/board/route.ts
// Arrows between tiles. Touching tiles get a chevron knot on their shared edge. Other arrows run
// along the lattice of hexagon edges (the white gaps between tiles, and the open space around
// clusters), are pulled straight wherever the way is clear, then rounded into curves. Every tile,
// tab, title, cluster label and other arrow's label is an obstacle. Pure geometry: no DOM.
import { placeChips, textWidth, type Chip } from '../../graph-blocks/graph';
import {
  DIRS, addCell, cellKey, directionBetween, edgeOf, pixelToAxial, pointInPolygon, SQRT3,
  type Cell, type Pt
} from './hex';
import type { BoardLayout, BoardTile, Box } from './layout';

export type ArrowType = 'leads_to' | 'pairs_with' | 'free';
export interface BoardArrow { id: string; from: string; to: string; type: ArrowType; label?: string }
export interface Head { x: number; y: number; angle: number }
export interface Knot { x: number; y: number; angle: number; chevrons: 0 | 1 | 2; edge: [Pt, Pt] }
export interface PlacedLabel { text: string; x: number; y: number; w: number; h: number; anchor: Pt }
export interface RoutedArrow {
  id: string;
  type: ArrowType;
  from: string;
  to: string;
  kind: 'knot' | 'path';
  /** SVG path data; empty for a knot. */
  d: string;
  /** The curve sampled as a polyline, for hit tests. */
  points: Pt[];
  heads: Head[];
  knot: Knot | null;
  dashed: boolean;
  label: PlacedLabel | null;
}

const CHIP_H = 22;
const CORNER_RADIUS = 10;
const BOX_MARGIN = 4;
const CHANNEL_COST = 2.6;
const CLEAR_EDGE_BIAS = 0.8;
const REUSE_COST = 0.6;
const PASSES = 3;

// ── segment and box tests ────────────────────────────────────────────────────

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

function pointAlong(points: Pt[], t: number): Pt {
  if (points.length === 1) return points[0]!;
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const l = dist(points[i - 1]!, points[i]!); lens.push(l); total += l; }
  let want = total * t;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i]! || i === lens.length - 1) {
      const f = lens[i]! ? Math.min(1, want / lens[i]!) : 0;
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    want -= lens[i]!;
  }
  return points[points.length - 1]!;
}

// ── context: tiles, obstacles and the edge lattice ──────────────────────────

interface Graph {
  pts: Pt[];
  adj: Array<Array<{ to: number; w: number; mult: number; key: string; a: Pt; b: Pt }>>;
  index: Map<string, number>;
}

interface Context {
  layout: BoardLayout;
  byCell: Map<string, BoardTile>;
  byId: Map<string, BoardTile>;
  staticBoxes: Box[];
  graph: Graph;
}

const nodeKey = (p: Pt): string => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`;

function buildGraph(layout: BoardLayout, byCell: Map<string, BoardTile>, staticBoxes: Box[]): Graph {
  const { size, bounds } = layout;
  const pad = size * 2;
  const x0 = bounds.x - pad;
  const x1 = bounds.x + bounds.w + pad;
  const y0 = bounds.y - pad;
  const y1 = bounds.y + bounds.h + pad;
  const graph: Graph = { pts: [], adj: [], index: new Map() };
  const node = (p: Pt): number => {
    const k = nodeKey(p);
    let i = graph.index.get(k);
    if (i === undefined) { i = graph.pts.length; graph.index.set(k, i); graph.pts.push(p); graph.adj.push([]); }
    return i;
  };
  const seen = new Set<string>();
  const qMin = Math.floor(x0 / (1.5 * size)) - 1;
  const qMax = Math.ceil(x1 / (1.5 * size)) + 1;
  for (let q = qMin; q <= qMax; q++) {
    const rMin = Math.floor(y0 / (SQRT3 * size) - q / 2) - 1;
    const rMax = Math.ceil(y1 / (SQRT3 * size) - q / 2) + 1;
    for (let r = rMin; r <= rMax; r++) {
      const cell: Cell = { q, r };
      for (let d = 0; d < 6; d++) {
        const { a, b, mid } = edgeOf(cell, d, size);
        const ka = nodeKey(a);
        const kb = nodeKey(b);
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(ek)) continue;
        seen.add(ek);
        const other = addCell(cell, DIRS[d]!);
        const occupied = (byCell.has(cellKey(cell)) ? 1 : 0) + (byCell.has(cellKey(other)) ? 1 : 0);
        const mult = occupied === 2 ? CHANNEL_COST : 1;
        const ia = node(a);
        const im = node(mid);
        const ib = node(b);
        for (const [u, v, pu, pv] of [[ia, im, a, mid], [im, ib, mid, b]] as const) {
          if (staticBoxes.some((box) => segmentHitsBox(pu, pv, box, BOX_MARGIN))) continue;
          const len = dist(pu, pv);
          const key = u < v ? `${u}-${v}` : `${v}-${u}`;
          graph.adj[u]!.push({ to: v, w: len * mult, mult, key, a: pu, b: pv });
          graph.adj[v]!.push({ to: u, w: len * mult, mult, key, a: pv, b: pu });
        }
      }
    }
  }
  return graph;
}

function makeContext(layout: BoardLayout): Context {
  const byCell = new Map(layout.tiles.map((t) => [cellKey(t.cell), t]));
  const byId = new Map(layout.tiles.map((t) => [t.id, t]));
  const staticBoxes = [...layout.labels];
  return { layout, byCell, byId, staticBoxes, graph: buildGraph(layout, byCell, staticBoxes) };
}

// ── shortest path over the edge lattice ──────────────────────────────────────

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

function edgeMidNodes(ctx: Context, tile: BoardTile): Array<{ node: number; bias: number }> {
  const out: Array<{ node: number; bias: number }> = [];
  for (let d = 0; d < 6; d++) {
    const { mid } = edgeOf(tile.cell, d, ctx.layout.size);
    const node = ctx.graph.index.get(nodeKey(mid));
    if (node === undefined) continue;
    const blocked = ctx.byCell.has(cellKey(addCell(tile.cell, DIRS[d]!)));
    out.push({ node, bias: blocked ? CLEAR_EDGE_BIAS * ctx.layout.size : 0 });
  }
  return out;
}

function shortestPath(ctx: Context, from: BoardTile, to: BoardTile, extra: Box[], used: Map<string, number>): Pt[] | null {
  const g = ctx.graph;
  const best = new Array<number>(g.pts.length).fill(Infinity);
  const prev = new Array<number>(g.pts.length).fill(-1);
  const heap = new Heap();
  for (const s of edgeMidNodes(ctx, from)) {
    if (s.bias < best[s.node]!) { best[s.node] = s.bias; heap.push(s.bias, s.node); }
  }
  const targets = new Map(edgeMidNodes(ctx, to).map((t) => [t.node, t.bias]));
  let bestEnd = -1;
  let bestTotal = Infinity;
  while (heap.size) {
    const [cost, u] = heap.pop();
    if (cost > best[u]!) continue;
    if (cost >= bestTotal) break;
    const tb = targets.get(u);
    if (tb !== undefined && cost + tb < bestTotal) { bestTotal = cost + tb; bestEnd = u; }
    for (const e of g.adj[u]!) {
      if (extra.length && extra.some((box) => segmentHitsBox(e.a, e.b, box, BOX_MARGIN))) continue;
      const w = e.w + (used.get(e.key) ?? 0) * REUSE_COST * (e.w / Math.max(e.mult, 1));
      const next = cost + w;
      if (next < best[e.to]!) { best[e.to] = next; prev[e.to] = u; heap.push(next, e.to); }
    }
  }
  if (bestEnd < 0) return null;
  const nodes: number[] = [];
  for (let n = bestEnd; n >= 0; n = prev[n]!) nodes.push(n);
  nodes.reverse();
  for (let i = 1; i < nodes.length; i++) {
    const key = nodes[i - 1]! < nodes[i]! ? `${nodes[i - 1]}-${nodes[i]}` : `${nodes[i]}-${nodes[i - 1]}`;
    used.set(key, (used.get(key) ?? 0) + 1);
  }
  return nodes.map((n) => g.pts[n]!);
}

/** Pull the lattice path straight wherever a direct segment clears every tile and box. */
function pull(ctx: Context, pts: Pt[], extra: Box[]): Pt[] {
  const boxes = [...ctx.staticBoxes, ...extra];
  const free = (a: Pt, b: Pt): boolean => {
    if (boxes.some((box) => segmentHitsBox(a, b, box, BOX_MARGIN))) return false;
    const n = Math.max(1, Math.ceil(dist(a, b) / 3));
    for (let i = 0; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      const tile = ctx.byCell.get(cellKey(pixelToAxial(p, ctx.layout.size)));
      if (tile && pointInPolygon(p, tile.corners)) return false;
    }
    return true;
  };
  const out: Pt[] = [pts[0]!];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !free(pts[i]!, pts[j]!)) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}

function round(pts: Pt[]): { d: string; samples: Pt[] } {
  const f = (n: number): string => n.toFixed(1);
  if (pts.length === 2) return { d: `M${f(pts[0]!.x)},${f(pts[0]!.y)}L${f(pts[1]!.x)},${f(pts[1]!.y)}`, samples: pts };
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  const samples: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const v = pts[i]!;
    const b = pts[i + 1]!;
    const r = Math.min(CORNER_RADIUS, dist(a, v) / 2, dist(v, b) / 2);
    const p1 = { x: v.x + ((a.x - v.x) / dist(a, v)) * r, y: v.y + ((a.y - v.y) / dist(a, v)) * r };
    const p2 = { x: v.x + ((b.x - v.x) / dist(b, v)) * r, y: v.y + ((b.y - v.y) / dist(b, v)) * r };
    d += `L${f(p1.x)},${f(p1.y)}Q${f(v.x)},${f(v.y)} ${f(p2.x)},${f(p2.y)}`;
    samples.push(p1);
    for (const t of [0.25, 0.5, 0.75]) {
      const u = 1 - t;
      samples.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * v.y + t * t * p2.y });
    }
    samples.push(p2);
  }
  const last = pts[pts.length - 1]!;
  d += `L${f(last.x)},${f(last.y)}`;
  samples.push(last);
  return { d, samples };
}

// ── one arrow ────────────────────────────────────────────────────────────────

const angleOf = (a: Pt, b: Pt): number => Math.atan2(b.y - a.y, b.x - a.x);

function headsFor(type: ArrowType, pts: Pt[]): Head[] {
  const n = pts.length;
  const end = { x: pts[n - 1]!.x, y: pts[n - 1]!.y, angle: angleOf(pts[n - 2]!, pts[n - 1]!) };
  if (type !== 'pairs_with') return [end];
  return [{ x: pts[0]!.x, y: pts[0]!.y, angle: angleOf(pts[1]!, pts[0]!) }, end];
}

function routePath(ctx: Context, arrow: BoardArrow, extra: Box[], used: Map<string, number>): RoutedArrow | null {
  const a = ctx.byId.get(arrow.from);
  const b = ctx.byId.get(arrow.to);
  if (!a || !b || a.id === b.id) return null;
  const base = { id: arrow.id, type: arrow.type, from: arrow.from, to: arrow.to, dashed: arrow.type === 'free', label: null };

  if (directionBetween(a.cell, b.cell) >= 0) {
    const d = directionBetween(a.cell, b.cell);
    const edge = edgeOf(a.cell, d, ctx.layout.size);
    const chevrons = arrow.type === 'leads_to' ? 1 : arrow.type === 'pairs_with' ? 2 : 0;
    return {
      ...base, kind: 'knot', d: '', points: [edge.mid], heads: [],
      knot: { x: edge.mid.x, y: edge.mid.y, angle: angleOf(a, b), chevrons, edge: [edge.a, edge.b] }
    };
  }

  const lattice = shortestPath(ctx, a, b, extra, used);
  if (!lattice || lattice.length < 2) return null;
  const pts = pull(ctx, lattice, extra);
  const { d, samples } = round(pts);
  return { ...base, kind: 'path', d, points: samples, heads: headsFor(arrow.type, pts), knot: null };
}

// ── labels ───────────────────────────────────────────────────────────────────

const labelBox = (l: PlacedLabel): Box => ({ x: l.x, y: l.y, w: l.w, h: l.h });
const overlaps = (a: Box, b: Box, m = 0): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w + m && Math.abs(a.y - b.y) * 2 < a.h + b.h + m;

function chipFor(ctx: Context, r: RoutedArrow, text: string): Chip {
  const w = Math.ceil(textWidth(text, 12, 500) + 18);
  let at: (t: number) => Pt;
  if (r.knot) {
    const k = r.knot;
    const e = k.edge;
    const len = dist(e[0], e[1]) || 1;
    const ux = (e[1].x - e[0].x) / len;
    const uy = (e[1].y - e[0].y) / len;
    // Slide along the shared edge, out of the cluster on whichever side is emptier.
    const a = ctx.byId.get(r.from)!;
    const cluster = ctx.layout.clusters.find((c) => c.key === a.cluster);
    const away = cluster ? (k.x - cluster.x) * ux + (k.y - cluster.y) * uy : 1;
    const s = away >= 0 ? 1 : -1;
    at = (t) => ({ x: k.x + ux * s * (16 + 70 * t), y: k.y + uy * s * (16 + 70 * t) });
  } else {
    at = (t) => pointAlong(r.points, t);
  }
  return { id: r.id, label: text, w, h: CHIP_H, x: 0, y: 0, missing: false, at };
}

/** Last resort for chips that still overlap another label: step outwards until clear. */
function nudgeClear(chip: Chip, obstacles: Box[], placed: Box[]): void {
  const clear = (b: Box): boolean => !obstacles.some((o) => overlaps(b, o, 6)) && !placed.some((o) => overlaps(b, o, 4));
  const here: Box = { x: chip.x, y: chip.y, w: chip.w, h: chip.h };
  if (clear(here)) return;
  for (let step = 1; step <= 60; step++) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cand = { ...here, x: here.x + dx * step * 6, y: here.y + dy * step * 5 };
      if (clear(cand)) { chip.x = cand.x; chip.y = cand.y; return; }
    }
  }
}

function placeLabels(ctx: Context, routed: RoutedArrow[], texts: Map<string, string>): void {
  const obstacles: Box[] = [...ctx.layout.tiles.map((t) => t.box), ...ctx.layout.labels];
  const chips = routed.filter((r) => texts.has(r.id)).map((r) => chipFor(ctx, r, texts.get(r.id)!));
  placeChips(chips, obstacles);
  const placed: Box[] = [];
  for (const chip of chips) {
    nudgeClear(chip, obstacles, placed);
    placed.push({ x: chip.x, y: chip.y, w: chip.w, h: chip.h });
  }
  for (const r of routed) {
    const chip = chips.find((c) => c.id === r.id);
    r.label = chip ? { text: chip.label, x: chip.x, y: chip.y, w: chip.w, h: chip.h, anchor: chip.at(0.5) } : null;
  }
}

// ── all arrows ───────────────────────────────────────────────────────────────

/** Route every arrow. Output is sorted by id, so input order never changes the picture. */
export function routeArrows(layout: BoardLayout, arrows: BoardArrow[]): RoutedArrow[] {
  const ctx = makeContext(layout);
  const sorted = [...arrows].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const texts = new Map<string, string>();
  for (const a of sorted) {
    const text = a.label?.trim();
    if (text) texts.set(a.id, text);
  }
  const used = new Map<string, number>();
  const routed: RoutedArrow[] = [];
  const arrowOf = new Map<string, BoardArrow>();
  for (const a of sorted) {
    const r = routePath(ctx, a, [], used);
    if (r) { routed.push(r); arrowOf.set(a.id, a); }
  }

  for (let pass = 0; pass < PASSES; pass++) {
    placeLabels(ctx, routed, texts);
    let changed = false;
    routed.forEach((r, i) => {
      if (r.kind === 'knot') return;
      const others = routed.filter((o) => o.id !== r.id && o.label).map((o) => labelBox(o.label!));
      if (!others.some((box) => pathHitsBox(r.points, box))) return;
      const again = routePath(ctx, arrowOf.get(r.id)!, others, used);
      if (again) { routed[i] = again; changed = true; }
    });
    if (!changed) break;
  }
  placeLabels(ctx, routed, texts);
  return routed;
}

