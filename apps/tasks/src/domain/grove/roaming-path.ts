import type { PathPoint } from './wildlife';

function almostSame(a: PathPoint, b: PathPoint): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) < 1e-6;
}

function clonePoints(points: readonly PathPoint[]): PathPoint[] {
  return points.map(p => ({ x: p.x, z: p.z }));
}

/** Soften one vertex: quadratic for mild bends, circular for U-turns. */
function chamferCorner(
  a: PathPoint,
  b: PathPoint,
  c: PathPoint,
  maxCut: number,
  samples: number,
  allowReverse: boolean,
): PathPoint[] | null {
  const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
  const ab = Math.hypot(abx, abz), bc = Math.hypot(bcx, bcz);
  if (ab < 1e-6 || bc < 1e-6) return null;
  const ux = abx / ab, uz = abz / ab, vx = bcx / bc, vz = bcz / bc;
  const dot = ux * vx + uz * vz;
  if (dot > 0.97) return null;
  if (!allowReverse && dot < -0.2) return null;
  const cut = Math.min(maxCut, ab * 0.4, bc * 0.4);
  if (cut < 0.12) return null;
  const side = Math.sign(ux * vz - uz * vx) || 1;
  const nx = -uz * side, nz = ux * side;
  const p0 = { x: b.x - ux * cut, z: b.z - uz * cut };
  const p2 = { x: b.x + vx * cut, z: b.z + vz * cut };
  const out: PathPoint[] = [p0];
  if (dot < -0.2) {
    const cx = p0.x + nx * cut, cz = p0.z + nz * cut;
    const start = Math.atan2(p0.z - cz, p0.x - cx);
    const sweep = Math.PI * side;
    for (let s = 1; s <= samples + 1; s++) {
      const ang = start + sweep * (s / (samples + 1));
      out.push({ x: cx + Math.cos(ang) * cut, z: cz + Math.sin(ang) * cut });
    }
  } else {
    for (let s = 1; s <= samples; s++) {
      const t = s / (samples + 1), o = 1 - t;
      out.push({
        x: o * o * p0.x + 2 * o * t * b.x + t * t * p2.x,
        z: o * o * p0.z + 2 * o * t * b.z + t * t * p2.z,
      });
    }
    out.push(p2);
  }
  return out;
}

/** Round sharp corners / U-turns so roaming no longer reads as grid pivots.
 * Near-collinear vertices stay as-is. When `accept` is provided, each corner is
 * kept only if the replacement segment stays safe — unsafe corners remain sharp. */
export function roundRouteCorners(points: readonly PathPoint[], options: {
  maxCut?: number;
  samples?: number;
  accept?: (segment: readonly PathPoint[]) => boolean;
  /** When false, leave 180° reversals alone (yaw smoothing handles the look). */
  allowReverse?: boolean;
} = {}): PathPoint[] {
  if (points.length < 3) return clonePoints(points);
  const maxCut = options.maxCut ?? 1.4;
  const samples = Math.max(1, options.samples ?? 3);
  const allowReverse = options.allowReverse !== false;
  const closed = almostSame(points[0]!, points.at(-1)!);
  // Out-and-back circuits (A→B→A) need the closing duplicate kept so the U-turn vertex exists.
  const ring = closed && points.length > 3;
  const core = ring ? points.slice(0, -1) : points.slice();
  if (core.length < 3) return clonePoints(points);
  const out: PathPoint[] = [];
  const n = core.length;
  for (let i = 0; i < n; i++) {
    const a = core[(i - 1 + n) % n]!, b = core[i]!, c = core[(i + 1) % n]!;
    // Keep open endpoints exact. Closed rings round every corner, including the root.
    if (!ring && (i === 0 || i === n - 1)) {
      out.push({ x: b.x, z: b.z });
      continue;
    }
    const rounded = chamferCorner(a, b, c, maxCut, samples, allowReverse);
    if (!rounded || (options.accept && !options.accept(rounded))) {
      out.push({ x: b.x, z: b.z });
      continue;
    }
    out.push(...rounded);
  }
  const deduped: PathPoint[] = [out[0]!];
  for (let i = 1; i < out.length; i++) {
    const p = out[i]!, last = deduped.at(-1)!;
    if (Math.hypot(p.x - last.x, p.z - last.z) > 0.05) deduped.push(p);
  }
  if (closed) {
    const first = deduped[0]!;
    if (!almostSame(first, deduped.at(-1)!)) deduped.push({ x: first.x, z: first.z });
    else deduped[deduped.length - 1] = { x: first.x, z: first.z };
  }
  return deduped.length >= 2 ? deduped : clonePoints(points);
}

/** Largest absolute heading change between successive segments (radians). */
export function maxTurningAngle(points: readonly PathPoint[]): number {
  if (points.length < 3) return 0;
  let max = 0;
  const closed = almostSame(points[0]!, points.at(-1)!);
  const core = closed ? points.slice(0, -1) : points;
  const n = core.length;
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = core[(i - 1 + n) % n]!, b = core[i]!, c = core[(i + 1) % n]!;
    const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
    const ab = Math.hypot(abx, abz), bc = Math.hypot(bcx, bcz);
    if (ab < 1e-6 || bc < 1e-6) continue;
    const ux = abx / ab, uz = abz / ab, vx = bcx / bc, vz = bcz / bc;
    max = Math.max(max, Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz)));
  }
  return max;
}
