/**
 * Where everything grows. Trees lean towards their week's edges and corners, so
 * neighbouring weeks' stands meet across the seam and the forest reads as one.
 * Clearing centres stay open for the path.
 */
import { CELL, type Cell, land, owner, type Terrain } from './map';
import type { Done, Species } from './history';
import { TODAY } from './history';
import { fbm, rng } from './noise';

export type Placed = { file: string; x: number; y: number; z: number; scale: number; rotation: number; id?: string; week?: number };
export type Planting = { trees: Placed[]; ground: Placed[]; density: (x: number, z: number) => number };

const VARIANTS: Record<Species, number[]> = { life: [1, 2, 3, 4, 5], teaching: [1, 2, 3], health: [1, 2, 3, 1, 2, 3, 4], wedding: [1, 2, 3, 4, 5], other: [1, 2] };
const STAGED: Record<Species, number> = { life: 3, teaching: 3, health: 3, wedding: 2, other: 2 }; // variants with sapling/young models

function treeFile(species: Species, completed: Date, pick: number): { file: string; height: number } {
  const days = (TODAY.getTime() - completed.getTime()) / 86400000;
  const stage = days < 4 ? 'sapling' : days < 12 ? 'young' : 'mature';
  const variants = stage === 'mature' ? VARIANTS[species] : VARIANTS[species].slice(0, STAGED[species]);
  const v = variants[pick % variants.length]!;
  const mature = species === 'life' ? 8.5 : species === 'wedding' ? 6.2 : 7.2;
  const height = stage === 'mature' ? mature : stage === 'young' ? mature * 0.72 : mature * 0.48;
  return { file: `models/trees/tree-${species}-${v}-${stage}.glb`, height };
}

class Spacing {
  private grid = new Map<string, { x: number; z: number; r: number }[]>();
  ok(x: number, z: number, r: number): boolean {
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
      for (const p of this.grid.get(`${gx + i},${gz + j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < Math.max(r, p.r)) return false;
    }
    return true;
  }
  add(x: number, z: number, r: number): void {
    const key = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    const list = this.grid.get(key) ?? [];
    list.push({ x, z, r });
    this.grid.set(key, list);
  }
}

export function plant(cells: Cell[], terrain: Terrain, history: Done[], builtWeeks: number): Planting {
  const random = rng(99);
  const spacing = new Spacing();
  const trees: Placed[] = [];
  const ground: Placed[] = [];
  const dryAndFlat = (x: number, z: number, margin = 1.4) => {
    if (land(x, z) < 4) return false;
    const r = terrain.riverDistance(x, z);
    if (r.d < terrain.RIVER_WIDTH + margin) return false;
    if (terrain.lakeDistance(x, z) < margin) return false;
    const h = terrain.height(x, z);
    const slope = Math.max(Math.abs(terrain.height(x + 0.7, z) - h), Math.abs(terrain.height(x, z + 0.7) - h));
    return slope < 0.55;
  };

  const byWeek = new Map<number, Done[]>();
  for (const done of history) {
    if (done.week < 1 || done.week > 52) continue;
    const list = byWeek.get(done.week) ?? [];
    list.push(done);
    byWeek.set(done.week, list);
  }

  for (const cell of cells) {
    const tasks = cell.week ? byWeek.get(cell.week) ?? [] : [];
    if (!tasks.length) continue;
    // Candidate spots inside this piece, weighted strongly toward its seams and corners.
    const candidates: { x: number; z: number; w: number }[] = [];
    for (let i = 0; i < 900; i += 1) {
      const x = cell.x + (random() - 0.5) * CELL * 2.2;
      const z = cell.z + (random() - 0.5) * CELL * 2.2;
      const own = owner(cells, x, z);
      if (own.cell !== cell.index) continue;
      if (Math.hypot(x - cell.x, z - cell.z) < 5.5) continue; // the clearing
      if (terrain.pathDistance(x, z) < 2.2) continue;
      if (!dryAndFlat(x, z)) continue;
      const clump = fbm(x * 0.09, z * 0.09, 77); // natural thickets
      candidates.push({ x, z, w: Math.exp(-own.border / 3.2) * 1.4 + clump * 0.5 + 0.05 });
    }
    // Weighted pick, without repeats, keeping crowns from colliding.
    const chosen: { x: number; z: number }[] = [];
    const want = tasks.length;
    for (let gap = 2.6; chosen.length < want && gap > 1.2; gap -= 0.4) {
      const pool = candidates.map((c) => ({ ...c, key: Math.pow(random(), 1 / c.w) })).sort((a, b) => b.key - a.key);
      for (const c of pool) {
        if (chosen.length >= want) break;
        if (!spacing.ok(c.x, c.z, gap)) continue;
        spacing.add(c.x, c.z, gap);
        chosen.push(c);
      }
    }
    // Species grow in their own patches: sort spots around the piece, tasks by species.
    chosen.sort((a, b) => Math.atan2(a.z - cell.z, a.x - cell.x) - Math.atan2(b.z - cell.z, b.x - cell.x));
    const sorted = [...tasks].sort((a, b) => a.species.localeCompare(b.species) || a.completed.getTime() - b.completed.getTime());
    chosen.forEach((spot, i) => {
      const task = sorted[i]!;
      const { file, height } = treeFile(task.species, task.completed, Math.floor(random() * 10));
      trees.push({ file, x: spot.x, z: spot.z, y: terrain.height(spot.x, spot.z), scale: height * (0.86 + random() * 0.28), rotation: random() * Math.PI * 2, id: task.id, week: cell.week! });
      // Undergrowth hugs the trees.
      const bushes = random() < 0.65 ? 1 + Math.floor(random() * 2) : 0;
      for (let b = 0; b < bushes; b += 1) {
        const a = random() * Math.PI * 2, r = 1.3 + random() * 1.6;
        const bx = spot.x + Math.cos(a) * r, bz = spot.z + Math.sin(a) * r;
        if (!dryAndFlat(bx, bz, 0.8) || terrain.pathDistance(bx, bz) < 1.4) continue;
        ground.push({ file: `models/ground/bush-${random() < 0.08 ? 1 : 2 + Math.floor(random() * 3)}.glb`, x: bx, z: bz, y: terrain.height(bx, bz), scale: 1.0 + random() * 0.8, rotation: random() * 6.28 });
      }
      if (random() < 0.12) {
        const mx = spot.x + (random() - 0.5) * 2, mz = spot.z + (random() - 0.5) * 2;
        ground.push({ file: `models/ground/mushroom-${1 + Math.floor(random() * 3)}.glb`, x: mx, z: mz, y: terrain.height(mx, mz), scale: 0.35 + random() * 0.25, rotation: random() * 6.28 });
      }
    });
  }

  // Grass, flowers and rocks over the whole map. Grown weeks are lusher than weeks still to come.
  for (let gx = -100; gx < 100; gx += 2.1) for (let gz = -90; gz < 90; gz += 2.1) {
    const x = gx + (random() - 0.5) * 1.8, z = gz + (random() - 0.5) * 1.8;
    if (!dryAndFlat(x, z, 0.4)) continue;
    if (terrain.pathDistance(x, z) < 1.2) continue;
    const own = owner(cells, x, z);
    const week = cells[own.cell]!.week;
    const grown = week != null && week <= builtWeeks;
    const y = terrain.height(x, z);
    const roll = random();
    const clearing = own.border > 5;
    if (grown && clearing && roll < 0.1) ground.push({ file: `models/ground/flower-${[3, 4, 5, 6, 2][Math.floor(random() * 5)]}.glb`, x, z, y, scale: 0.45 + random() * 0.3, rotation: random() * 6.28 });
    else if (roll < (grown ? 0.42 : 0.2)) ground.push({ file: `models/ground/grass-${1 + Math.floor(random() * 4)}.glb`, x, z, y, scale: 0.45 + random() * 0.35, rotation: random() * 6.28 });
    else if (!grown && roll < 0.24) ground.push({ file: `models/ground/flower-${[3, 4, 5][Math.floor(random() * 3)]}.glb`, x, z, y, scale: 0.4 + random() * 0.25, rotation: random() * 6.28 });
  }
  // Rocks along the banks and tier edges.
  for (let i = 0; i < 260; i += 1) {
    const x = (random() - 0.5) * 200, z = (random() - 0.5) * 180;
    if (land(x, z) < 3) continue;
    const r = terrain.riverDistance(x, z);
    const h = terrain.height(x, z);
    const steep = Math.abs(terrain.height(x + 1.2, z) - h) + Math.abs(terrain.height(x, z + 1.2) - h) > 1.2;
    if (!(steep || (r.d > terrain.RIVER_WIDTH && r.d < terrain.RIVER_WIDTH + 2.5)) || random() < 0.4) continue;
    ground.push({ file: `models/ground/rock-${1 + Math.floor(random() * 5)}.glb`, x, z, y: h - 0.2, scale: 0.6 + random() * 1.4, rotation: random() * 6.28 });
  }
  // Reeds and lily pads on still water.
  for (let i = 0; i < 70; i += 1) {
    const a = random() * Math.PI * 2, rr = terrain.lake.r * (0.4 + random() * 0.75);
    const x = terrain.lake.x + Math.cos(a) * rr, z = terrain.lake.z + Math.sin(a) * rr;
    const d = terrain.lakeDistance(x, z);
    if (d < -3.5 && random() < 0.5) ground.push({ file: `models/ground/lily-${1 + Math.floor(random() * 2)}.glb`, x, z, y: terrain.lake.level + 0.02, scale: 0.12 + random() * 0.08, rotation: random() * 6.28 });
    else if (d > -1.6 && d < 0.6) ground.push({ file: `models/ground/reed-${1 + Math.floor(random() * 2)}.glb`, x, z, y: terrain.height(x, z), scale: 0.9 + random() * 0.6, rotation: random() * 6.28 });
  }

  // Tree density drives the darker forest floor.
  const buckets = new Map<string, number>();
  for (const t of trees) {
    const key = `${Math.floor(t.x / 3)},${Math.floor(t.z / 3)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const density = (x: number, z: number) => {
    let n = 0;
    const bx = Math.floor(x / 3), bz = Math.floor(z / 3);
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) n += buckets.get(`${bx + i},${bz + j}`) ?? 0;
    return Math.min(1, n / 4);
  };
  return { trees, ground, density };
}
