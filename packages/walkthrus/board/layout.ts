// packages/walkthrus/board/layout.ts
// Where every tile, cluster and label sits. Pure and deterministic. The whole book: the same
// entries give the same board in any input order, and opening another set never moves a tile that
// is already there (each series has a fixed slot on the cluster grid, set after set). My board:
// Adam's own named clusters, each a title with its tiles hanging under it on axial cells.
import { axialToPixel, cellKey, hexCorners, spiralCells, SQRT3, type Cell, type Pt } from './hex';
import { textWidth } from '../../graph-blocks/graph';

/** Centre-based box, the shape `placeChips` takes as an obstacle. */
export type Box = { x: number; y: number; w: number; h: number };
/** Top-left frame, for bounds and viewports. */
export type Frame = { x: number; y: number; w: number; h: number };

export type BoardEntry = { id: string; set: number; kind: string; series: string | null; code: string; page: number | null; name: string };
export type BoardSet = { id: number; name: string; colour: string };
export type BoardSeries = { key: string; code: string; name: string };

export interface BoardTile {
  id: string;
  /** Unique per placement: a tile may sit in several clusters of My board. */
  key: string;
  /** A fusion Adam built, rather than a book technique. */
  fusion: boolean;
  name: string;
  set: number;
  series: string;
  code: string;
  page: number | null;
  cluster: string;
  /** Axial cell: on the shared grid for the whole book, from the cluster origin on My board. */
  cell: Cell;
  x: number;
  y: number;
  /** Corners of the drawn hexagon (a little inside the grid cell, so clusters keep their white gaps). */
  corners: Pt[];
  /** Dark tab with `series | page`, the line icon and the bold title, all inside the hexagon. */
  tab: Box;
  glyph: Box;
  title: Box;
  /** Top corners: progress (piece and rep dots) sits on the left one, the Proof mark on the right. */
  piece: Pt;
  mark: Pt;
  /** Bounding box of the drawn hexagon. */
  box: Box;
}

export interface BoardCluster {
  key: string;
  set: number;
  series: string;
  code: string;
  name: string;
  col: number;
  row: number;
  origin: Cell;
  x: number;
  y: number;
  /** The bold caps label above the cluster. */
  label: Box;
  frame: Frame;
  /** My board: a cluster with no tiles yet shows a dashed hexagon at its origin. */
  empty?: boolean;
}

export interface BoxSlot {
  set: number;
  name: string;
  colour: string;
  frame: Frame;
}

export interface BoardLayout {
  size: number;
  drawn: number;
  tiles: BoardTile[];
  clusters: BoardCluster[];
  labels: Box[];
  boxSlots: BoxSlot[];
  bounds: Frame;
  /** What Fit frames: the opened techniques and their labels, not the sets still in the box. */
  focus: Frame;
}

export const DEFAULT_SIZE = 64;
/** Grid size minus drawn size: with the thick outline this leaves a narrow white gap between touching tiles. */
export const GAP = 5;
const CLUSTER_COLS = 3;
/** Cluster labels are drawn big enough to read when the whole board is in view. */
export const LABEL_FONT = 28;
const LABEL_H = 40;
const LABEL_GAP = 20;
const BOUNDS_PAD = 48;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The cell a cluster's first tile sits on. Rows stay level because the column step is even. */
export function clusterOrigin(col: number, row: number): Cell {
  return { q: 6 * col, r: 6 * row - 3 * col };
}

export function frameOfBoxes(boxes: Box[], pad = 0): Frame {
  if (!boxes.length) return { x: -pad, y: -pad, w: pad * 2, h: pad * 2 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    y1 = Math.max(y1, b.y + b.h / 2);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

const boxOf = (f: Frame): Box => ({ x: f.x + f.w / 2, y: f.y + f.h / 2, w: f.w, h: f.h });

function buildTile(entry: BoardEntry, cell: Cell, cluster: string, size: number, at: Pt = axialToPixel(cell, size)): BoardTile {
  const drawn = size - GAP;
  const p = at;
  const half = (drawn * SQRT3) / 2;
  const corners = hexCorners(p, drawn);
  const inward = (c: Pt): Pt => ({ x: c.x + (p.x - c.x) * 0.12, y: c.y + (p.y - c.y) * 0.12 });
  return {
    id: entry.id,
    key: `${cluster}/${entry.id}`,
    fusion: entry.kind === 'fusion',
    name: entry.name,
    set: entry.set,
    series: entry.series!,
    code: entry.code,
    page: entry.page,
    cluster,
    cell,
    x: p.x,
    y: p.y,
    corners,
    // Everything sits clear of the hexagon's edges, so a knot on a shared edge never covers it.
    tab: { x: p.x, y: p.y - half + 0.33 * drawn, w: 0.9 * drawn, h: 0.26 * drawn },
    glyph: { x: p.x, y: p.y - 0.135 * drawn, w: 0.72 * drawn, h: 0.53 * drawn },
    title: { x: p.x, y: p.y + 0.27 * drawn, w: 1.1 * drawn, h: 0.3 * drawn },
    piece: inward(corners[4]!),
    mark: inward(corners[5]!),
    box: { x: p.x, y: p.y, w: drawn * 2, h: half * 2 }
  };
}

export interface LayoutInput {
  entries: BoardEntry[];
  sets: BoardSet[];
  series: BoardSeries[];
  /** Set ids that have been turned over. Defaults to every set that has entries. */
  opened?: number[];
  size?: number;
}

export function boardLayout(input: LayoutInput): BoardLayout {
  const size = input.size ?? DEFAULT_SIZE;
  const drawn = size - GAP;
  const sets = [...input.sets].sort((a, b) => a.id - b.id);
  const series = input.series;
  const withEntries = new Set(input.entries.map((e) => e.set));
  const opened = new Set(input.opened ?? [...withEntries]);

  const tiles: BoardTile[] = [];
  const clusters: BoardCluster[] = [];

  sets.forEach((set, setIndex) => {
    if (!opened.has(set.id)) return;
    series.forEach((s, seriesIndex) => {
      const members = input.entries
        .filter((e) => e.kind === 'technique' && e.set === set.id && e.series === s.key)
        .sort((a, b) => (a.page ?? 1e9) - (b.page ?? 1e9) || byText(a.id, b.id));
      if (!members.length) return;
      // The slot depends only on which set and series this is, never on what else is open.
      const slot = setIndex * series.length + seriesIndex;
      const col = slot % CLUSTER_COLS;
      const row = Math.floor(slot / CLUSTER_COLS);
      const origin = clusterOrigin(col, row);
      const key = `${set.id}:${s.key}`;
      const built = spiralCells(members.length, origin).map((cell, i) => buildTile(members[i]!, cell, key, size));
      tiles.push(...built);

      const frame = frameOfBoxes(built.map((t) => t.box));
      const o = axialToPixel(origin, size);
      const caps = s.name.toUpperCase();
      const w = Math.ceil(textWidth(caps, LABEL_FONT, 800) + 24);
      clusters.push({
        key, set: set.id, series: s.key, code: s.code, name: s.name, col, row, origin, x: o.x, y: o.y,
        label: { x: o.x, y: frame.y - LABEL_GAP - LABEL_H / 2, w, h: LABEL_H },
        frame
      });
    });
  });

  // Sets still in the box: a dashed banner each, stacked under the opened clusters. Opening a set
  // swaps its banner for its clusters; nothing already on the board moves.
  const boxSlots: BoxSlot[] = [];
  const pending = sets.filter((set) => !opened.has(set.id));
  if (pending.length) {
    const frames = clusters.map((c) => c.frame);
    const left = frames.length ? Math.min(...frames.map((f) => f.x)) : -size * 4;
    const right = frames.length ? Math.max(...frames.map((f) => f.x + f.w)) : size * 4 + 2 * 12 * size;
    const bottom = frames.length ? Math.max(...frames.map((f) => f.y + f.h)) : 0;
    let top = bottom + size * 2;
    for (const set of pending) {
      const h = size * 4;
      boxSlots.push({ set: set.id, name: set.name, colour: set.colour, frame: { x: left, y: top, w: right - left, h } });
      top += h + size * 1.5;
    }
  }

  const labels = clusters.map((c) => c.label);
  const bounds = frameOfBoxes(
    [...tiles.map((t) => t.box), ...labels, ...boxSlots.map((b) => boxOf(b.frame))],
    BOUNDS_PAD
  );
  const focus = tiles.length ? frameOfBoxes([...tiles.map((t) => t.box), ...labels], BOUNDS_PAD) : bounds;
  return { size, drawn, tiles, clusters, labels, boxSlots, bounds, focus };
}

/** A saved cluster on My board, as `packages/walkthrus/clusters.mjs` normalizes it. */
export interface ClusterData { id: string; name: string; x: number; y: number; tiles: Array<{ id: string; q: number; r: number }> }

/** Pixel of a cluster's origin cell: under its title anchor, with room for the title and its underline. */
export function clusterOriginPx(c: { x: number; y: number }, size = DEFAULT_SIZE): Pt {
  const half = ((size - GAP) * SQRT3) / 2;
  return { x: c.x, y: c.y + LABEL_H / 2 + LABEL_GAP + half };
}

/** Pixel centre of a cell in a cluster. */
export function clusterCellPx(c: { x: number; y: number }, cell: Cell, size = DEFAULT_SIZE): Pt {
  const o = clusterOriginPx(c, size);
  const p = axialToPixel(cell, size);
  return { x: o.x + p.x, y: o.y + p.y };
}

export function clusterLabelBox(c: { x: number; y: number; name: string }): Box {
  return { x: c.x, y: c.y, w: Math.ceil(textWidth(c.name.toUpperCase(), LABEL_FONT, 800) + 24), h: LABEL_H };
}

/**
 * Adam's own board: his named clusters where he put them. A tile whose entry is unknown drops out;
 * `entryOf` answers for fusions too.
 */
export function clustersLayout(input: { clusters: ClusterData[]; entryOf: (id: string) => BoardEntry | null; size?: number }): BoardLayout {
  const size = input.size ?? DEFAULT_SIZE;
  const drawn = size - GAP;
  const tiles: BoardTile[] = [];
  const clusters: BoardCluster[] = [];
  for (const c of input.clusters) {
    const o = clusterOriginPx(c, size);
    const built: BoardTile[] = [];
    for (const t of c.tiles) {
      const entry = input.entryOf(t.id);
      if (!entry) continue;
      const cell = { q: t.q, r: t.r };
      built.push(buildTile(entry, cell, c.id, size, clusterCellPx(c, cell, size)));
    }
    tiles.push(...built);
    const placeholder: Box = { x: o.x, y: o.y, w: drawn * 2, h: drawn * SQRT3 };
    clusters.push({
      key: c.id, set: 0, series: c.id, code: '', name: c.name, col: 0, row: 0, origin: { q: 0, r: 0 }, x: o.x, y: o.y,
      label: clusterLabelBox(c),
      frame: frameOfBoxes(built.length ? built.map((t) => t.box) : [placeholder]),
      empty: !built.length
    });
  }
  const labels = clusters.map((c) => c.label);
  // Never smaller than a few tiles' room, so one or two techniques don't fill the screen at Fit.
  const frame = frameOfBoxes([...clusters.map((c) => boxOf(c.frame)), ...labels], BOUNDS_PAD);
  const minW = size * 9;
  const minH = size * 7;
  const bounds = { x: frame.x + frame.w / 2 - Math.max(frame.w, minW) / 2, y: frame.y + frame.h / 2 - Math.max(frame.h, minH) / 2, w: Math.max(frame.w, minW), h: Math.max(frame.h, minH) };
  return { size, drawn, tiles, clusters, labels, boxSlots: [], bounds, focus: bounds };
}

export function tileByCell(layout: BoardLayout): Map<string, BoardTile> {
  return new Map(layout.tiles.map((t) => [cellKey(t.cell), t]));
}

export function tileById(layout: BoardLayout, id: string, cluster?: string | null): BoardTile | null {
  return (cluster ? layout.tiles.find((t) => t.id === id && t.cluster === cluster) : null) ?? layout.tiles.find((t) => t.id === id) ?? null;
}

/** Pan and scale that fit a frame inside a viewport with padding. */
export function fitFrame(frame: Frame, viewport: { w: number; h: number }, pad = 16): { scale: number; tx: number; ty: number } {
  const scale = Math.min((viewport.w - pad * 2) / frame.w, (viewport.h - pad * 2) / frame.h);
  return {
    scale,
    tx: (viewport.w - frame.w * scale) / 2 - frame.x * scale,
    ty: (viewport.h - frame.h * scale) / 2 - frame.y * scale
  };
}

/** A cluster's frame including its label, for opening the board on one cluster. */
export function clusterFrame(layout: BoardLayout, key: string): Frame | null {
  const c = layout.clusters.find((x) => x.key === key);
  if (!c) return null;
  return frameOfBoxes([boxOf(c.frame), c.label], 12);
}
