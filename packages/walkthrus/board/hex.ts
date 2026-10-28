// packages/walkthrus/board/hex.ts
// Flat-topped hexagons on one shared axial grid. Pure maths: no DOM.
// Pixel space: x grows right, y grows down. Corner k sits at angle 60·k degrees, so corner 0 is
// the right-hand point and the top edge runs from corner 4 to corner 5.

export type Pt = { x: number; y: number };
export type Cell = { q: number; r: number };

export const SQRT3 = Math.sqrt(3);

/** Neighbour offsets, ordered by the angle of the edge they cross: 30°, -30°, -90°, -150°, 150°, 90°. */
export const DIRS: ReadonlyArray<Readonly<Cell>> = Object.freeze([
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
]);

export const cellKey = (c: Cell): string => `${c.q},${c.r}`;
export const addCell = (a: Cell, b: Cell): Cell => ({ q: a.q + b.q, r: a.r + b.r });
export const neighbour = (c: Cell, dir: number): Cell => addCell(c, DIRS[((dir % 6) + 6) % 6]!);
export const neighbours = (c: Cell): Cell[] => DIRS.map((d) => addCell(c, d));

export function hexDistance(a: Cell, b: Cell): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Index of the direction from `a` to `b` when they touch, else -1. */
export function directionBetween(a: Cell, b: Cell): number {
  return DIRS.findIndex((d) => a.q + d.q === b.q && a.r + d.r === b.r);
}

export const isNeighbour = (a: Cell, b: Cell): boolean => directionBetween(a, b) >= 0;

export function axialToPixel(c: Cell, size: number): Pt {
  return { x: size * 1.5 * c.q, y: size * SQRT3 * (c.r + c.q / 2) };
}

/** The cell whose hexagon contains the point (cube rounding). */
export function pixelToAxial(p: Pt, size: number): Cell {
  const q = ((2 / 3) * p.x) / size;
  const r = ((-1 / 3) * p.x + (SQRT3 / 3) * p.y) / size;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

export function hexCorners(center: Pt, size: number): Pt[] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k;
    return { x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) };
  });
}

/** The edge of `c` that faces direction `dir`: its two corners and midpoint. */
export function edgeOf(c: Cell, dir: number, size: number): { a: Pt; b: Pt; mid: Pt } {
  const corners = hexCorners(axialToPixel(c, size), size);
  const a = corners[(((-dir) % 6) + 6) % 6]!;
  const b = corners[(((1 - dir) % 6) + 6) % 6]!;
  return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** The edge two touching cells share, or null when they don't touch. */
export function sharedEdge(a: Cell, b: Cell, size: number): { a: Pt; b: Pt; mid: Pt } | null {
  const d = directionBetween(a, b);
  return d < 0 ? null : edgeOf(a, d, size);
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Which of the given cells (if any) holds the pixel point, drawn at `drawn` size. */
export function hitTest(p: Pt, cells: Cell[], size: number, drawn = size): Cell | null {
  const cell = pixelToAxial(p, size);
  const found = cells.find((c) => c.q === cell.q && c.r === cell.r);
  if (!found) return null;
  return pointInPolygon(p, hexCorners(axialToPixel(found, size), drawn)) ? found : null;
}

/** Centre first, then ring after ring outwards: the order a cluster fills. */
export function spiralCells(count: number, centre: Cell = { q: 0, r: 0 }): Cell[] {
  const out: Cell[] = [{ ...centre }];
  for (let k = 1; out.length < count; k++) {
    let cell = centre;
    for (let i = 0; i < k; i++) cell = neighbour(cell, 4);
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        out.push(cell);
        cell = neighbour(cell, side);
      }
    }
  }
  return out.slice(0, count);
}
