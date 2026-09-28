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
  // Phone river: denser than 150px/yr so past roles sit near Now in the first viewport.
  return Math.min(2400, Math.max(640, yearsInView * 100));
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
    const rawEnd = job.valid_to ? yearFraction(job.valid_to) : Infinity;
    return { index, start, end: Number.isFinite(rawEnd) ? rawEnd : Infinity };
  });
  indexed.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(jobs.length).fill(0);
  for (const job of indexed) {
    if (!Number.isFinite(job.start)) continue;
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

/** Lane pitch for labeled role bars (bar + below-bar label air). */
export const ROLE_LANE_HEIGHT_PX = 40;

/** Extra SVG height for stacked role-band lanes under the trunk. */
export function roleBandExtraPx(laneCount: number): number {
  return laneCount <= 0 ? 0 : 16 + laneCount * ROLE_LANE_HEIGHT_PX + 10;
}

/**
 * Truncate a river / gantt-style label to fit a pixel budget (~6px per char).
 * Empty string when the span is too short to show any text.
 * Prefer {@link riverJobShortLabel} + below-bar placement over truncating role titles.
 */
export function truncateRiverLabel(text: string, availPx: number): string {
  const raw = text.trim();
  if (!raw || availPx < 18) return '';
  const maxChars = Math.max(0, Math.floor(availPx / 6));
  if (maxChars < 2) return '';
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * Compact role label for the Career river band.
 * One readable short form — never dangling "Leader of" / "Head of" / "HSIE and",
 * never width-truncated here (placement decides hide-on-collision, not ellipsis).
 */
export function riverJobShortLabel(title: string): string {
  const raw = (title || '').trim();
  if (!raw) return 'Role';
  const parts = raw.split(/\s+/);
  // "Leader of Learning Enrichment" → "Leader of Learning" (complete; never end on "of")
  if (/^(head|deputy|leader|director|principal)\s+of\b/i.test(raw)) {
    return parts.slice(0, Math.min(parts.length, 3)).join(' ');
  }
  if (/^(head|deputy|leader|director|principal)\b/i.test(raw)) {
    return parts.slice(0, Math.min(2, parts.length)).join(' ');
  }
  const stripped = raw
    .replace(/\s+(Teacher|Coordinator|Officer|Specialist|Educator)$/i, '')
    .trim();
  const sParts = stripped.split(/\s+/).filter(Boolean);
  if (sParts.length === 0) return raw;
  // "HSIE and Business Studies" → primary subject only (never end on "and")
  const andIdx = sParts.findIndex((p) => /^(and|&)$/i.test(p));
  if (andIdx === 1) return sParts[0]!;
  if (sParts.length <= 2) {
    if (sParts.length === 2 && /^(and|of|the|for|&)$/i.test(sParts[1]!)) return sParts[0]!;
    return stripped;
  }
  let n = 2;
  let out = sParts.slice(0, n).join(' ');
  while (/\b(and|of|the|for|&)$/i.test(out) && n < sParts.length) {
    n += 1;
    out = sParts.slice(0, n).join(' ');
  }
  if (/\b(and|of|the|for|&)$/i.test(out)) {
    out = sParts.slice(0, Math.max(1, n - 1)).join(' ');
  }
  return out;
}

/**
 * Integer year ticks for the river axis row (Tasks/medical-strip pattern:
 * density follows zoom span so labels stay readable).
 */
export function axisYearTicks(zoom: RiverZoom): number[] {
  const span = Math.max(0.1, zoom.to - zoom.from);
  let step = 1;
  if (span > 4) step = 2;
  if (span > 10) step = 3;
  if (span > 16) step = 5;
  if (span > 30) step = 10;
  const start = Math.ceil(zoom.from / step) * step;
  const end = Math.floor(zoom.to + 1e-9);
  const years: number[] = [];
  for (let y = start; y <= end; y += step) {
    if (y >= zoom.from - 1e-6 && y <= zoom.to + 1e-6) years.push(y);
  }
  if (!years.length) {
    years.push(Math.round((zoom.from + zoom.to) / 2));
  }
  return years;
}
