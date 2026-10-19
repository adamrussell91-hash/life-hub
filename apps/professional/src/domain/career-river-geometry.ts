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

/** Past share of the river length while Now is in view and futures exist. */
export const PAST_SHARE_WITH_FUTURES = 0.4;
/** With no futures the past earns the room; Now keeps a short starter stub. */
export const PAST_SHARE_NO_FUTURES = 0.84;

export function pastShareFor(visibleFutures: number): number {
  return visibleFutures > 0 ? PAST_SHARE_WITH_FUTURES : PAST_SHARE_NO_FUTURES;
}

/**
 * Map a fractional year to 0…1 along the river length.
 * While Now is in [from, to], the past gets `pastShare` (40% by default) and
 * the future the rest.
 */
export function timeToUnit(
  year: number,
  zoom: RiverZoom,
  nowYear: number,
  pastShare = PAST_SHARE_WITH_FUTURES
): number {
  const { from, to } = zoom;
  if (to <= from) return 0;
  const nowInView = nowYear >= from && nowYear <= to;
  if (!nowInView) {
    return (year - from) / (to - from);
  }
  if (year <= nowYear) {
    if (nowYear === from) return 0;
    return pastShare * ((year - from) / (nowYear - from));
  }
  if (to === nowYear) return 1;
  return pastShare + (1 - pastShare) * ((year - nowYear) / (to - nowYear));
}

/** Phone river height: denser than 150px/yr so past roles sit near Now in the first viewport. */
export function riverHeightPx(_orientation: RiverOrientation, _visibleFutures: number, yearsInView: number): number {
  return Math.min(1600, Math.max(560, yearsInView * 60));
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
 * Greedy interval lanes: each interval takes the first lane that is free by
 * its start. Returns one lane index per input (stable order).
 */
export function assignIntervalLanes(intervals: Array<{ start: number; end: number }>): number[] {
  const indexed = intervals.map((iv, index) => ({ index, start: iv.start, end: iv.end }));
  indexed.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(intervals.length).fill(0);
  for (const iv of indexed) {
    if (!Number.isFinite(iv.start)) continue;
    let lane = laneEnds.findIndex((end) => end <= iv.start + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(iv.end);
    } else {
      laneEnds[lane] = iv.end;
    }
    lanes[iv.index] = lane;
  }
  return lanes;
}

/**
 * Greedy interval lanes so concurrent roles (same school, overlapping dates)
 * stack instead of painting on one overlapping line.
 * Returns one lane index per input item (stable order).
 */
export function assignEmploymentLanes(jobs: EmploymentSpan[]): number[] {
  return assignIntervalLanes(
    jobs.map((job) => {
      const start = yearFraction(job.valid_from);
      const rawEnd = job.valid_to ? yearFraction(job.valid_to) : Infinity;
      return { start, end: Number.isFinite(rawEnd) ? rawEnd : Infinity };
    })
  );
}

/** Height of one swimlane row (bar plus air). */
export const SWIMLANE_ROW_PX = 26;
/** Extra air between two workplaces' rows. */
export const SWIMLANE_GROUP_GAP_PX = 6;
/** Role bar height inside a swimlane row. */
export const SWIMLANE_BAR_PX = 20;

export type SwimlaneInput = {
  /** Workplace key — roles with the same key share a swimlane group. */
  group: string;
  /** Interval along the time axis, in any one unit (the river passes pixels). */
  start: number;
  /** End including any room reserved for a label beside the bar. */
  end: number;
};

export type SwimlaneLayout = {
  /** Row index for each input job (stable order). */
  jobRow: number[];
  /** Group index for each row. */
  rowGroup: number[];
  /** True for the first row of each workplace group. */
  rowStartsGroup: boolean[];
  rowCount: number;
  groupCount: number;
};

/**
 * Past roles as swimlanes: one group per workplace (ordered by first start),
 * and inside a group one row per concurrent role (greedy interval lanes).
 * Callers pass `end` with label room added, so a row is only shared when
 * every role in it keeps a readable label.
 */
export function layoutRoleSwimlanes(jobs: SwimlaneInput[]): SwimlaneLayout {
  const groups = new Map<string, number[]>();
  jobs.forEach((job, index) => {
    const key = job.group || `job:${index}`;
    const list = groups.get(key) ?? [];
    list.push(index);
    groups.set(key, list);
  });
  const ordered = [...groups.values()].sort((a, b) => {
    const start = (ids: number[]) => Math.min(...ids.map((i) => jobs[i]!.start));
    return start(a) - start(b);
  });
  const jobRow = new Array<number>(jobs.length).fill(0);
  const rowGroup: number[] = [];
  const rowStartsGroup: boolean[] = [];
  let row = 0;
  ordered.forEach((ids, groupIndex) => {
    const lanes = assignIntervalLanes(ids.map((i) => jobs[i]!));
    const laneCount = lanes.length ? Math.max(...lanes) + 1 : 1;
    ids.forEach((jobIndex, k) => {
      jobRow[jobIndex] = row + (lanes[k] ?? 0);
    });
    for (let lane = 0; lane < laneCount; lane++) {
      rowGroup.push(groupIndex);
      rowStartsGroup.push(lane === 0);
    }
    row += laneCount;
  });
  return { jobRow, rowGroup, rowStartsGroup, rowCount: row, groupCount: ordered.length };
}

/** Pixel height of a swimlane block (0 when there are no roles). */
export function swimlaneBlockPx(layout: Pick<SwimlaneLayout, 'rowCount' | 'groupCount'>): number {
  if (!layout.rowCount) return 0;
  return layout.rowCount * SWIMLANE_ROW_PX + Math.max(0, layout.groupCount - 1) * SWIMLANE_GROUP_GAP_PX;
}

export type LabelPlacement = { x: number; anchor: 'start' | 'end'; inside: boolean };

/**
 * Place a bar's label: inside when it fits, else in free space to the right,
 * else to the left, else null (the tooltip carries it). `blocked` holds the
 * x-ranges already taken in the same row (other bars and placed labels).
 */
export function placeBarLabel(args: {
  x0: number;
  x1: number;
  textW: number;
  maxX: number;
  minX?: number;
  pad?: number;
  blocked?: Array<[number, number]>;
  /** Try the left side before the right (a workplace's first bar). */
  preferLeft?: boolean;
}): LabelPlacement | null {
  const { x0, x1, textW, maxX } = args;
  const minX = args.minX ?? 0;
  const pad = args.pad ?? 6;
  const blocked = args.blocked ?? [];
  if (x1 - x0 >= textW + pad * 2) return { x: x0 + pad, anchor: 'start', inside: true };
  const free = (a: number, b: number) =>
    a >= minX && b <= maxX && blocked.every(([c, d]) => b <= c || a >= d);
  const right = (): LabelPlacement | null =>
    free(x1 + pad, x1 + pad + textW) ? { x: x1 + pad, anchor: 'start', inside: false } : null;
  const left = (): LabelPlacement | null =>
    free(x0 - pad - textW, x0 - pad) ? { x: x0 - pad, anchor: 'end', inside: false } : null;
  return args.preferLeft ? left() ?? right() : right() ?? left();
}

/** Approximate rendered width of an 11px label. */
export function approxLabelWidth(text: string): number {
  return text.length * 6.2;
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

const LEAD_OF = /^(head|deputy|leader|director|principal)\s+of\b/i;
const LEAD = /^(head|deputy|leader|director|principal)\b/i;
const TRAILING_ROLE = /\s+(Teacher|Coordinator|Officer|Specialist|Educator)$/i;
const GLUE = /^(and|of|the|for|&)$/i;
const AND = /^(and|&)$/i;

/**
 * Compact role label for the Career river band.
 * Complete short phrases only — never dangling "of" / "and"; never width-truncated
 * (placement hides on collision instead of ellipsis).
 */
export function riverJobShortLabel(title: string): string {
  const raw = (title || '').trim();
  if (!raw) return 'Role';
  const parts = raw.split(/\s+/);
  // "Leader of Learning Enrichment" → "Leader of Learning"
  if (LEAD_OF.test(raw)) return parts.slice(0, 3).join(' ');
  if (LEAD.test(raw)) return parts.slice(0, 2).join(' ');

  const stripped = raw.replace(TRAILING_ROLE, '').trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  if (!words.length) return raw;
  // "HSIE and Business Studies" → primary subject
  if (words.length >= 2 && AND.test(words[1]!)) return words[0]!;
  if (words.length <= 2) {
    if (words.length === 2 && GLUE.test(words[1]!)) return words[0]!;
    return stripped;
  }

  let n = 2;
  while (n < words.length && GLUE.test(words[n - 1]!)) n += 1;
  if (GLUE.test(words[n - 1]!)) n = Math.max(1, n - 1);
  return words.slice(0, n).join(' ');
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
