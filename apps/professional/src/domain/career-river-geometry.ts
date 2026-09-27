/**
 * Pure Career river geometry. Time → position is piecewise-linear with a
 * knot at Now (past 40% / future 60% while Now is in view).
 */

export type RiverOrientation = 'horizontal' | 'vertical';

export type RiverZoom = {
  /** Inclusive start year as fractional year (e.g. 2015.0). */
  from: number;
  /** Inclusive end year as fractional year. */
  to: number;
};

export function yearFraction(isoDate: string): number {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return NaN;
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

export function clampZoom(zoom: RiverZoom, careerFrom: number, careerTo: number): RiverZoom {
  const minSpan = 1;
  const maxTo = careerTo + 1;
  const minFrom = careerFrom;
  let from = zoom.from;
  let to = zoom.to;
  if (to - from < minSpan) {
    const mid = (from + to) / 2;
    from = mid - minSpan / 2;
    to = mid + minSpan / 2;
  }
  if (to - from > maxTo - minFrom + 1) {
    from = minFrom;
    to = maxTo;
  }
  if (from < minFrom) {
    to += minFrom - from;
    from = minFrom;
  }
  if (to > maxTo) {
    from -= to - maxTo;
    to = maxTo;
    if (from < minFrom) from = minFrom;
  }
  return { from, to };
}

/**
 * Map a fractional year to 0…1 along the river length.
 * While Now is in [from, to], past gets 40% and future 60%.
 */
export function timeToUnit(
  year: number,
  zoom: RiverZoom,
  nowYear: number
): number {
  const { from, to } = zoom;
  if (to <= from) return 0;
  const nowInView = nowYear >= from && nowYear <= to;
  if (!nowInView) {
    return (year - from) / (to - from);
  }
  if (year <= nowYear) {
    if (nowYear === from) return 0;
    return 0.4 * ((year - from) / (nowYear - from));
  }
  if (to === nowYear) return 1;
  return 0.4 + 0.6 * ((year - nowYear) / (to - nowYear));
}

export function riverHeightPx(
  orientation: RiverOrientation,
  visibleFutures: number,
  yearsInView: number
): number {
  if (orientation === 'horizontal') {
    return Math.max(440, 120 + visibleFutures * 64);
  }
  return Math.min(2400, Math.max(900, yearsInView * 150));
}

export function laneOffset(
  laneOrder: number,
  laneCount: number,
  halfHeight: number
): number {
  if (laneCount <= 1) return 0;
  const t = laneOrder / Math.max(1, laneCount - 1);
  return (t * 2 - 1) * 0.86 * halfHeight;
}

/** Bundle offset before split (±2.2% of half-height per lane index). */
export function bundleOffset(laneIndex: number, halfHeight: number): number {
  return (laneIndex - 0) * 0.022 * halfHeight;
}

export type Point = { x: number; y: number };

/** S-curve peel from trunk to lane between split and arrival. */
export function branchPolyline(args: {
  orientation: RiverOrientation;
  lengthPx: number;
  midPx: number;
  nowUnit: number;
  splitUnit: number;
  arrivalUnit: number;
  laneY: number;
  bundleY: number;
}): Point[] {
  const { orientation, lengthPx, midPx, nowUnit, splitUnit, arrivalUnit, laneY, bundleY } = args;
  const pts: Point[] = [];
  const steps = 24;
  const startU = Math.min(nowUnit, splitUnit);
  const endU = Math.max(arrivalUnit, splitUnit + 0.01);
  for (let i = 0; i <= steps; i++) {
    const u = startU + ((endU - startU) * i) / steps;
    let y = bundleY;
    if (u >= splitUnit) {
      const t = Math.min(1, (u - splitUnit) / Math.max(0.001, endU - splitUnit));
      const s = t * t * (3 - 2 * t);
      y = bundleY + (laneY - bundleY) * s;
    }
    if (orientation === 'horizontal') {
      pts.push({ x: u * lengthPx, y: midPx + y });
    } else {
      // Vertical: time bottom → top (past at bottom)
      pts.push({ x: midPx + y, y: (1 - u) * lengthPx });
    }
  }
  return pts;
}

export function pathFromPoints(pts: Point[]): string {
  if (!pts.length) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export function clusterMarks(
  marks: Array<{ id: string; unit: number; title: string }>,
  lengthPx: number,
  thresholdPx = 10
): Array<{ unit: number; count: number; ids: string[]; titles: string[] }> {
  const sorted = [...marks].sort((a, b) => a.unit - b.unit);
  const clusters: Array<{ unit: number; count: number; ids: string[]; titles: string[] }> = [];
  for (const mark of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(mark.unit - last.unit) * lengthPx < thresholdPx) {
      last.count += 1;
      last.ids.push(mark.id);
      last.titles.push(mark.title);
      last.unit = (last.unit * (last.count - 1) + mark.unit) / last.count;
    } else {
      clusters.push({ unit: mark.unit, count: 1, ids: [mark.id], titles: [mark.title] });
    }
  }
  return clusters;
}

export const BRANCH_COLOUR_VARS = [
  'var(--career-branch-1)',
  'var(--career-branch-2)',
  'var(--career-branch-3)',
  'var(--career-branch-4)',
  'var(--career-branch-5)',
  'var(--career-branch-6)'
] as const;

export function branchColour(slot: number): string {
  const i = Math.max(1, Math.min(6, slot | 0)) - 1;
  return BRANCH_COLOUR_VARS[i]!;
}

export type EmploymentSpan = {
  valid_from: string;
  valid_to?: string | null;
};

/**
 * Greedy interval lanes so concurrent roles (same school, overlapping dates)
 * stack instead of painting on one overlapping line.
 * Returns one lane index per input item (stable order).
 */
export function assignEmploymentLanes(jobs: EmploymentSpan[]): number[] {
  const indexed = jobs.map((job, index) => {
    const start = yearFraction(job.valid_from);
    const end = job.valid_to ? yearFraction(job.valid_to) : Number.POSITIVE_INFINITY;
    return { index, start, end: Number.isFinite(end) ? end : Number.POSITIVE_INFINITY };
  });
  indexed.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(jobs.length).fill(0);
  for (const job of indexed) {
    if (!Number.isFinite(job.start)) {
      lanes[job.index] = 0;
      continue;
    }
    let lane = laneEnds.findIndex((end) => end <= job.start + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(job.end);
    } else {
      laneEnds[lane] = job.end;
    }
    lanes[job.index] = lane;
  }
  return lanes;
}

/** Extra SVG height for stacked role-band lanes under the trunk (desktop). */
export function roleBandExtraPx(laneCount: number): number {
  if (laneCount <= 0) return 0;
  return 22 + Math.max(0, laneCount - 1) * 16;
}
