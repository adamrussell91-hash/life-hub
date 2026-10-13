/**
 * One continuous year map. Weeks are jigsaw pieces laid in a spiral from the
 * centre, so week n always touches week n + 1 and the forest grows outward.
 */
import { clamp, fbm, lerp, rng, smoothstep } from './noise';

export const CELL = 19;
export const COLS = 8;
export const ROWS = 7;
export const WEEKS = 52;
const HALF_W = (COLS * CELL) / 2 + 4;
const HALF_D = (ROWS * CELL) / 2 + 4;

export type Cell = { index: number; col: number; row: number; x: number; z: number; week: number | null };

function spiralOrder(): [number, number][] {
  const order: [number, number][] = [];
  const seen = new Set<string>();
  let col = 3, row = 3, len = 1, dir = 0;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  const visit = () => {
    const key = `${col},${row}`;
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS && !seen.has(key)) { seen.add(key); order.push([col, row]); }
  };
  visit();
  while (order.length < COLS * ROWS) {
    for (let rep = 0; rep < 2; rep += 1) {
      const [dc, dr] = dirs[dir % 4]!;
      for (let i = 0; i < len; i += 1) { col += dc; row += dr; visit(); }
      dir += 1;
    }
    len += 1;
  }
  return order;
}

export function buildCells(): Cell[] {
  const random = rng(42);
  return spiralOrder().map(([col, row], i) => ({
    index: i,
    col,
    row,
    x: (col - (COLS - 1) / 2) * CELL + (random() - 0.5) * CELL * 0.5,
    z: (row - (ROWS - 1) / 2) * CELL + (random() - 0.5) * CELL * 0.5,
    week: i < WEEKS ? i + 1 : null
  }));
}

export type Ownership = { cell: number; border: number };

/** Warped Voronoi: wobbly borders that read as natural edges, not a grid. */
export function owner(cells: Cell[], x: number, z: number): Ownership {
  const wx = x + (fbm(x * 0.045, z * 0.045, 7) - 0.5) * 16;
  const wz = z + (fbm(x * 0.045 + 40, z * 0.045 - 20, 9) - 0.5) * 16;
  let best = 0, d1 = Infinity, d2 = Infinity;
  for (const c of cells) {
    const d = Math.hypot(wx - c.x, wz - c.z);
    if (d < d1) { d2 = d1; d1 = d; best = c.index; } else if (d < d2) d2 = d;
  }
  return { cell: best, border: (d2 - d1) / 2 };
}

/** Signed land mask: positive inside the landmass. */
export function land(x: number, z: number): number {
  const qx = Math.abs(x) - (HALF_W - 14), qz = Math.abs(z) - (HALF_D - 14);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 14;
  return -outside + (fbm(x * 0.06, z * 0.06, 3) - 0.5) * 10;
}

export const BOUNDS = { halfW: HALF_W + 8, halfD: HALF_D + 8 };

type RiverPoint = { x: number; z: number; level: number };

export type Terrain = {
  height(x: number, z: number): number;
  river: RiverPoint[];
  riverDistance(x: number, z: number): { d: number; level: number };
  lake: { x: number; z: number; r: number; level: number };
  lakeDistance(x: number, z: number): number;
  /** Cells whose clearing would sit under the lake get an island there, so the week has ground to grow on. */
  islands: { cell: number; x: number; z: number; r: number }[];
  path: { x: number; z: number }[];
  pathDistance(x: number, z: number): number;
  RIVER_WIDTH: number;
};

const TIER = 4.2;
function terrace(h: number): number {
  const t = h / TIER, f = Math.floor(t);
  return (f + smoothstep(0.3, 0.7, t - f)) * TIER;
}

function natural(x: number, z: number): number {
  const broad = (fbm(x * 0.01 + 3, z * 0.01 - 5, 21, 3) - 0.5) * 18;
  const rise = smoothstep(-40, 90, -z + x * 0.4) * 5; // gentle climb to the north-east
  const detail = (fbm(x * 0.08, z * 0.08, 5, 2) - 0.5) * 1.4;
  return terrace(broad + rise + 6) + detail;
}

function distanceToPolyline(points: { x: number; z: number }[], x: number, z: number): { d: number; i: number; t: number } {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!, b = points[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best.d) best = { d, i, t };
  }
  return best;
}

function catmull(points: { x: number; z: number }[], steps: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function buildTerrain(cells: Cell[], builtWeeks: number): Terrain {
  const RIVER_WIDTH = 2.8;
  // A river enters from the north-east highlands and winds south-west, stepping down the tiers.
  const control: { x: number; z: number }[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const z = lerp(-HALF_D - 12, HALF_D + 12, t);
    const x = lerp(46, -38, t) + Math.sin(t * 7.5) * 16 + (fbm(t * 4, 2, 31) - 0.5) * 18;
    control.push({ x, z });
  }
  const line = catmull(control, 10);
  let level = Infinity;
  const river: RiverPoint[] = line.map((p) => {
    level = Math.min(level, natural(p.x, p.z) - 0.6);
    return { ...p, level };
  });
  // Snap the water to its tiers so drops become little falls.
  for (const p of river) p.level = Math.floor(p.level / TIER) * TIER + TIER * 0.62;
  for (let i = 1; i < river.length; i += 1) river[i]!.level = Math.min(river[i]!.level, river[i - 1]!.level);

  const riverDistance = (x: number, z: number) => {
    const { d, i, t } = distanceToPolyline(river, x, z);
    const a = river[i]!, b = river[Math.min(i + 1, river.length - 1)]!;
    return { d, level: t < 0.5 ? a.level : b.level };
  };

  const lakeCentre = { x: -48, z: -38 };
  const lakeBase = natural(lakeCentre.x, lakeCentre.z);
  const lake = { ...lakeCentre, r: 13, level: lakeBase - 0.9 };
  const openWater = (x: number, z: number) => {
    const a = Math.atan2(z - lake.z, x - lake.x);
    const r = lake.r * (0.82 + fbm(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5, 13) * 0.4);
    return Math.hypot(x - lake.x, z - lake.z) - r;
  };
  // A week whose piece is almost all lake would have nowhere to plant: give its clearing an island.
  const islands = cells.filter((c) => openWater(c.x, c.z) < -4).map((c) => ({ cell: c.index, x: c.x, z: c.z, r: 5 }));
  const lakeDistance = (x: number, z: number) => {
    let d = openWater(x, z);
    for (const isle of islands) {
      const a = Math.atan2(z - isle.z, x - isle.x);
      const r = isle.r * (0.85 + fbm(Math.cos(a) + 9, Math.sin(a), 21) * 0.3);
      d = Math.max(d, r - Math.hypot(x - isle.x, z - isle.z));
    }
    return d;
  };

  // A walking path through each finished week's clearing, in order.
  const stops = cells.filter((c) => c.week != null && c.week <= builtWeeks).sort((a, b) => a.week! - b.week!).map((c) => ({ x: c.x, z: c.z }));
  const path = stops.length > 1 ? catmull(stops, 8) : stops;
  const pathDistance = (x: number, z: number) => (path.length > 1 ? distanceToPolyline(path, x, z).d : Infinity);

  const height = (x: number, z: number) => {
    let h = natural(x, z);
    const r = riverDistance(x, z);
    if (r.d < RIVER_WIDTH + 8) {
      const bank = r.level + 0.35 + Math.max(0, r.d - RIVER_WIDTH) * 0.18;
      const bed = r.level - 1.1;
      const target = r.d < RIVER_WIDTH ? bed : Math.min(h, bank);
      h = lerp(target, h, smoothstep(RIVER_WIDTH, RIVER_WIDTH + 8, r.d));
    }
    const l = lakeDistance(x, z);
    if (l < 7) h = lerp(l < 0 ? lake.level - 1.6 : Math.min(h, lake.level + 0.35 + l * 0.15), h, smoothstep(0, 7, l));
    const m = land(x, z);
    if (m < 0) return -9;
    return h * smoothstep(-1, 3, m) + -9 * (1 - smoothstep(-1, 3, m));
  };

  return { height, river, riverDistance, lake, lakeDistance, islands, path, pathDistance, RIVER_WIDTH };
}
