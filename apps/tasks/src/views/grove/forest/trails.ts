/**
 * Where animals can walk, and the routes between places. A one-unit grid over the map marks the
 * walkable ground (dry, gentle, clear of trunks, plus bridge decks); A* finds a way between two
 * spots, gently preferring the path, and the result is pulled straight and rounded so animals
 * walk smooth curves rather than grid steps. Pure: no three.js, so it is unit-testable.
 */
export type Point = { x: number; z: number };

export type WalkGrid = {
  step: number;
  minX: number; minZ: number; nx: number; nz: number;
  /** 1 walkable, 0 not. */
  open: Uint8Array;
  /** Cost multiplier per node (below 1 on the path, so animals often take it). */
  cost: Float32Array;
  walkable(x: number, z: number): boolean;
  /** Nearest walkable node centre to (x, z), within `reach` units, optionally limited by `inside`. */
  nearest(x: number, z: number, reach: number, inside?: (x: number, z: number) => boolean): Point | null;
};

export function buildWalkGrid(input: {
  halfW: number; halfD: number; step?: number;
  ok: (x: number, z: number) => boolean;
  /** Cost multiplier for walking here (default 1). */
  cost?: (x: number, z: number) => number;
}): WalkGrid {
  const step = input.step ?? 1;
  const minX = -input.halfW, minZ = -input.halfD;
  const nx = Math.ceil((input.halfW * 2) / step) + 1, nz = Math.ceil((input.halfD * 2) / step) + 1;
  const open = new Uint8Array(nx * nz), cost = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    const x = minX + i * step, z = minZ + j * step, k = j * nx + i;
    open[k] = input.ok(x, z) ? 1 : 0;
    cost[k] = open[k] ? input.cost?.(x, z) ?? 1 : 0;
  }
  const index = (x: number, z: number) => {
    const i = Math.round((x - minX) / step), j = Math.round((z - minZ) / step);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  return {
    step, minX, minZ, nx, nz, open, cost,
    walkable(x, z) {
      const k = index(x, z);
      return k >= 0 && open[k] === 1;
    },
    nearest(x, z, reach, inside) {
      const ci = Math.round((x - minX) / step), cj = Math.round((z - minZ) / step), r = Math.ceil(reach / step);
      let best: Point | null = null, bestD = Infinity;
      for (let j = cj - r; j <= cj + r; j += 1) for (let i = ci - r; i <= ci + r; i += 1) {
        if (i < 0 || j < 0 || i >= nx || j >= nz || !open[j * nx + i]) continue;
        const px = minX + i * step, pz = minZ + j * step, d = Math.hypot(px - x, pz - z);
        if (d < bestD && d <= reach && (!inside || inside(px, pz))) { bestD = d; best = { x: px, z: pz }; }
      }
      return best;
    }
  };
}

/** A* over the grid, 8-connected, no corner cutting. `inside` optionally fences the search. */
export function findRoute(grid: WalkGrid, from: Point, to: Point, inside?: (x: number, z: number) => boolean): Point[] | null {
  const { nx, nz, step, minX, minZ, open, cost } = grid;
  const toIndex = (p: Point) => {
    const i = Math.round((p.x - minX) / step), j = Math.round((p.z - minZ) / step);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const start = toIndex(from), goal = toIndex(to);
  if (start < 0 || goal < 0 || !open[start] || !open[goal]) return null;
  const allowed = (k: number) => {
    if (!open[k]) return false;
    if (!inside) return true;
    return inside(minX + (k % nx) * step, minZ + Math.floor(k / nx) * step);
  };
  const gi = goal % nx, gj = Math.floor(goal / nx);
  const g = new Float32Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1);
  const closed = new Uint8Array(nx * nz);
  const heap: number[] = [], f: number[] = [];
  const push = (k: number, score: number) => {
    heap.push(k); f.push(score);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[p]! <= f[c]!) break;
      [heap[p], heap[c]] = [heap[c]!, heap[p]!]; [f[p], f[c]] = [f[c]!, f[p]!];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const lastK = heap.pop()!, lastF = f.pop()!;
    if (heap.length) {
      heap[0] = lastK; f[0] = lastF;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < heap.length && f[l]! < f[m]!) m = l;
        if (r < heap.length && f[r]! < f[m]!) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c]!, heap[m]!]; [f[m], f[c]] = [f[c]!, f[m]!];
        c = m;
      }
    }
    return top;
  };
  // The cheapest cost on the grid keeps the heuristic admissible.
  const h = (k: number) => Math.hypot((k % nx) - gi, Math.floor(k / nx) - gj) * 0.7;
  g[start] = 0;
  push(start, h(start));
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]] as const;
  while (heap.length) {
    const k = pop();
    if (k === goal) break;
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj, len] of DIRS) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const n = jj * nx + ii;
      if (closed[n] || !allowed(n)) continue;
      if (di && dj && (!open[j * nx + ii] || !open[jj * nx + i])) continue;
      const score = g[k]! + len * (cost[k]! + cost[n]!) / 2;
      if (score < g[n]!) { g[n] = score; came[n] = k; push(n, score + h(n)); }
    }
  }
  if (!Number.isFinite(g[goal]!)) return null;
  const out: Point[] = [];
  for (let k = goal; k !== -1; k = came[k]!) out.push({ x: minX + (k % nx) * step, z: minZ + Math.floor(k / nx) * step });
  return out.reverse();
}

/** True when the straight line a→b stays on walkable ground. */
export function clearLine(grid: WalkGrid, a: Point, b: Point): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (grid.step * 0.5)));
  for (let i = 0; i <= n; i += 1) if (!grid.walkable(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
  return true;
}

/**
 * Grid steps to a natural line: drop points the animal can see past (up to `maxLeg` apart, so it
 * still follows gentle bends), then round the corners twice. A rounded point that would leave
 * walkable ground keeps the corner it came from.
 */
export function smoothRoute(grid: WalkGrid, route: Point[], maxLeg = 9): Point[] {
  if (route.length < 3) return route.slice();
  const pulled: Point[] = [route[0]!];
  let anchor = 0;
  while (anchor < route.length - 1) {
    // Look ahead no more than maxLeg along the route itself (a closed tour ends where it starts).
    let reach = anchor + 1;
    for (let walked = 0; reach < route.length - 1; reach += 1) {
      walked += Math.hypot(route[reach + 1]!.x - route[reach]!.x, route[reach + 1]!.z - route[reach]!.z);
      if (walked > maxLeg) break;
    }
    let next = anchor + 1;
    for (let k = reach; k > anchor + 1; k -= 1) {
      if (clearLine(grid, route[anchor]!, route[k]!)) { next = k; break; }
    }
    pulled.push(route[next]!);
    anchor = next;
  }
  let line = pulled;
  for (let pass = 0; pass < 2; pass += 1) {
    const out: Point[] = [line[0]!];
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i]!, b = line[i + 1]!;
      const q = { x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, r = { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 };
      if (i > 0) out.push(grid.walkable(q.x, q.z) ? q : a);
      if (i < line.length - 2) out.push(grid.walkable(r.x, r.z) ? r : b);
    }
    out.push(line[line.length - 1]!);
    line = out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1]!.x, p.z - out[i - 1]!.z) > 1e-6);
  }
  return line;
}

/**
 * Removes zigzags: a point where the line turns back on itself by more than 100° is dropped when
 * its neighbours can see each other. Genuine dead ends (no clear line) stay; animals turn round there.
 */
export function despike(grid: WalkGrid, line: Point[]): Point[] {
  let out = line.slice();
  for (let changed = true, guard = 0; changed && guard < 50; guard += 1) {
    changed = false;
    for (let i = 1; i < out.length - 1; i += 1) {
      const a = out[i - 1]!, p = out[i]!, b = out[i + 1]!;
      const t1 = Math.atan2(p.x - a.x, p.z - a.z), t2 = Math.atan2(b.x - p.x, b.z - p.z);
      const turn = Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
      if (turn > (100 * Math.PI) / 180 && clearLine(grid, a, b)) { out.splice(i, 1); changed = true; i -= 1; }
    }
  }
  out = out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1]!.x, p.z - out[i - 1]!.z) > 0.05);
  return out;
}

/** Joins legs into one closed route (the last point equals the first). Null if any leg fails. */
export function closedTour(grid: WalkGrid, stops: Point[], inside?: (x: number, z: number) => boolean): Point[] | null {
  if (stops.length < 2) return null;
  const route: Point[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    const leg = findRoute(grid, stops[i]!, stops[(i + 1) % stops.length]!, inside);
    if (!leg) return null;
    route.push(...(route.length ? leg.slice(1) : leg));
  }
  const smooth = despike(grid, smoothRoute(grid, route));
  return smooth.length >= 3 ? smooth : null;
}

/** Rounds a closed loop of points (Chaikin), for open ground such as the lake where no grid is needed. */
export function roundLoop(points: Point[], passes = 3): Point[] {
  let line = points.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const out: Point[] = [];
    for (let i = 0; i < line.length; i += 1) {
      const a = line[i]!, b = line[(i + 1) % line.length]!;
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    line = out;
  }
  return line;
}
