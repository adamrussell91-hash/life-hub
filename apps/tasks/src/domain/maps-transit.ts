/**
 * Transit-map layout and drawing for Tasks → Maps (Sydney rail style).
 *
 * Each strand (Justice, Innovation, …) is a tight bundle of year lines. Space is only
 * made where something needs it: a competition name on a middle year line bends the
 * next line out and back ("push"), programs run on a rail beside their line (joined to it top
 * and bottom, the line itself running straight past), and round chains run on a branch off
 * their program. Strands are
 * packed by their real shapes, so the gap between them is only as wide as the labels
 * that actually face each other.
 */
import type { MapColorToken, MapTick, Point, TransitMap } from '@/schemas/map';
import type { SchoolYearTerms } from '@/domain/hub-prefs';
import {
  applyDateSpanToStation,
  attachTracksOf,
  dateToY,
  eventPorts,
  fitPillLabel,
  lineTrackDefs,
  mapTerms,
  termSpans,
  MAP_YEAR_BOTTOM,
  MAP_YEAR_TOP,
  matchConnectTarget,
  resolveLineAttachTracks,
  spanWeeks,
  stationPorts,
  stationTracks,
  wrapEventLines,
  type ConnectorPort,
  type LabelBox,
  type LaidLine,
  type LaidStation,
  type LaidTick,
  type MapCanvasLayout,
  type TermBand
} from '@/domain/maps-layout';
import { swatch } from '@/domain/maps-colors';

/** Base distance between neighbouring year lines in a strand. */
export const TM_TRACK_GAP = 44;
/** Distance between parallel tracks when concurrent programs split a year line. */
export const TM_LANE_GAP = 44;
/** Distance from a year line to the centre of the nearest program rail beside it. */
export const TM_RAIL_OUT = 34;
export const TM_PILL_W = 30;
export const TM_LINE_W = 9;
export const TM_BRANCH_W = 7;
/** Stops are clearly wider than the line (9), so they read as circles, not beads on the line. */
export const TM_STOP_R = 8.5;
export const TM_FINAL_R = 11;
const STOP_RING_W = 2.2;
const CAPSULE_R = TM_STOP_R + 4.5;
/** A competition on several strands: its interchange sits this far beside the host year line. */
const CROSS_OUT = 40;
const BADGE_W = 24;
const BADGE_H = 16;
const BADGE_GAP = 4;
/** Same-day stops on one line share an upright platform capsule with a small dot per event. */
const PLATFORM_R = 11;
const PLATFORM_DOT_R = 5;
const PLATFORM_STEP = 26;
export const TM_LABEL_FONT = 17;
export const TM_SUB_FONT = 13;
const LABEL_LINE_H = 20;
const LABEL_DX = 16;
const LABEL_WRAP = 16;
const BRANCH_OUT = 34;
const SIDE_PAD = 18;
const RAIL_PAD = 6;
const MAX_RAMP = 64;
const MIN_RAMP = 18;
const CORNER_R = 16;
/** Corner radius where an open-all-year spur leaves and rejoins its year line. */
const ALL_YEAR_RAMP = 28;
/** Strands never sit closer than this (track to track), so each still reads as its own bundle. */
const STRAND_MIN_GAP = 96;
const STRAND_PAD = 28;
/** Left gutter for the term labels. */
export const TM_LEFT = 168;
export const TM_HEADER_Y = 40;
export const TM_CAP_R = 13;
const CAP_LIFT = 38;

const GLYPH = 0.56;

export function tmTextWidth(text: string, font: number): number {
  return text.length * font * GLYPH;
}

export type TransitStopDraw = {
  tickId: string;
  lineId: string;
  color: MapColorToken;
  /** One dot per year line the competition serves (a capsule joins them when more than one). */
  dots: Point[];
  y: number;
  final: boolean;
  lines: string[];
  sub: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
  w: number;
  h: number;
  /**
   * A competition on several strands: `dots[0]` is its interchange; a stop on each strand's
   * year line joins it along a dotted rule, and a badge per strand sits under its name.
   */
  cross?: {
    lineIds: string[];
    trackId: string;
    badges: Array<{ letter: string; color: MapColorToken }>;
    rule: Point[];
    railDots: Array<Point & { color: MapColorToken }>;
  };
  /** Same-day stops on one line: the platform capsule they share (same on every stop in it). */
  platform?: { x: number; y0: number; y1: number };
};

/** Name of a program too short to hold it, set beside the pill. */
export type TransitFlagDraw = {
  stationId: string;
  lineId: string;
  color: MapColorToken;
  lines: string[];
  sub: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
};

export type TransitBranchDraw = {
  id: string;
  lineId: string;
  color: MapColorToken;
  points: Point[];
  /** Open-all-year spur: drawn dotted, with a small caption at its top. */
  dotted?: boolean;
  caption?: { x: number; y: number; text: string; anchor: 'start' | 'end' };
};

export type TransitTrackDraw = {
  lineId: string;
  trackId: string;
  label: string;
  color: MapColorToken;
  /** Main line pieces (rounded polylines); `lanes` are the program rails beside the line. */
  pieces: Point[][];
  lanes: Point[][];
  top: Point;
  bottom: Point;
};

export type TransitLinkDraw = { id: string; points: Point[]; ends: Point[] };

export type TransitHeaderDraw = {
  lineId: string;
  x: number;
  letter: string;
  name: string;
  color: MapColorToken;
};

export type TransitDraw = {
  headers: TransitHeaderDraw[];
  tracks: TransitTrackDraw[];
  branches: TransitBranchDraw[];
  stops: TransitStopDraw[];
  flags: TransitFlagDraw[];
  links: TransitLinkDraw[];
  capY: { top: number; bottom: number };
  /** Horizontal extent of each strand (header, lines, pills and names), for framing one strand. */
  strands: Array<{ lineId: string; x0: number; x1: number }>;
};

export type TransitLayout = MapCanvasLayout & { draw: TransitDraw };

/* ------------------------------------------------------------------ geometry */

type Push = { gap: number; dir: 1 | -1; y0: number; y1: number; amount: number };

function rampOf(amount: number): number {
  return Math.max(MIN_RAMP, Math.min(MAX_RAMP, amount));
}

function trapezoid(push: Push, y: number): number {
  const r = rampOf(push.amount);
  if (y <= push.y0 - r || y >= push.y1 + r) return 0;
  if (y < push.y0) return push.amount * ((y - (push.y0 - r)) / r);
  if (y > push.y1) return push.amount * (1 - (y - push.y1) / r);
  return push.amount;
}

type Interval = { y0: number; y1: number };

/** Move each push's ramps off anything drawn on the lines it moves, then merge neighbours. */
function settlePushes(pushes: Push[], occupancy: Interval[][], trackCount: number): Push[] {
  let list = pushes.filter((push) => push.amount > 0.5).map((push) => ({ ...push }));
  for (let round = 0; round < 8; round += 1) {
    for (const push of list) {
      const tracks =
        push.dir === 1
          ? Array.from({ length: trackCount - push.gap - 1 }, (_, i) => push.gap + 1 + i)
          : Array.from({ length: push.gap + 1 }, (_, i) => i);
      const busy = tracks.flatMap((track) => occupancy[track] ?? []);
      for (let guard = 0; guard < 40; guard += 1) {
        const r = rampOf(push.amount);
        const hitIn = busy.find((item) => item.y1 > push.y0 - r && item.y0 < push.y0);
        const hitOut = busy.find((item) => item.y0 < push.y1 + r && item.y1 > push.y1);
        if (!hitIn && !hitOut) break;
        if (hitIn) push.y0 = Math.min(push.y0, hitIn.y0 - 2);
        if (hitOut) push.y1 = Math.max(push.y1, hitOut.y1 + 2);
      }
    }
    const merged: Push[] = [];
    let changed = false;
    const keyed = [...list].sort((a, b) => a.gap - b.gap || a.dir - b.dir || a.y0 - b.y0);
    for (const push of keyed) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.gap === push.gap &&
        last.dir === push.dir &&
        push.y0 - rampOf(push.amount) <= last.y1 + rampOf(last.amount) + 140
      ) {
        last.y1 = Math.max(last.y1, push.y1);
        last.y0 = Math.min(last.y0, push.y0);
        last.amount = Math.max(last.amount, push.amount);
        changed = true;
        continue;
      }
      merged.push({ ...push });
    }
    list = merged;
    if (!changed) break;
  }
  return list;
}

function trackOffset(pushes: Push[], track: number, y: number): number {
  const right = new Map<number, number>();
  const left = new Map<number, number>();
  for (const push of pushes) {
    const v = trapezoid(push, y);
    if (!v) continue;
    if (push.dir === 1 && push.gap < track) right.set(push.gap, Math.max(right.get(push.gap) ?? 0, v));
    if (push.dir === -1 && push.gap >= track) left.set(push.gap, Math.max(left.get(push.gap) ?? 0, v));
  }
  let off = 0;
  for (const v of right.values()) off += v;
  for (const v of left.values()) off -= v;
  return off;
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - point.x) < 0.01 && Math.abs(prev.y - point.y) < 0.01) continue;
    out.push(point);
    while (out.length >= 3) {
      const a = out[out.length - 3]!;
      const b = out[out.length - 2]!;
      const c = out[out.length - 1]!;
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) > 0.01) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

function trackPolyline(pushes: Push[], track: number, baseX: number, y0: number, y1: number): Point[] {
  const ys = new Set<number>([y0, y1]);
  for (const push of pushes) {
    const r = rampOf(push.amount);
    for (const y of [push.y0 - r, push.y0, push.y1, push.y1 + r]) {
      if (y > y0 && y < y1) ys.add(y);
    }
  }
  const sorted = [...ys].sort((a, b) => a - b);
  return simplify(sorted.map((y) => ({ x: baseX + trackOffset(pushes, track, y), y })));
}

function xAt(points: Point[], y: number): number {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (y >= a.y && y <= b.y) {
      if (b.y === a.y) return b.x;
      return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
    }
  }
  return points[points.length - 1]?.x ?? 0;
}

function slicePolyline(points: Point[], y0: number, y1: number): Point[] {
  if (y1 <= y0) return [];
  const out: Point[] = [{ x: xAt(points, y0), y: y0 }];
  for (const point of points) if (point.y > y0 && point.y < y1) out.push(point);
  out.push({ x: xAt(points, y1), y: y1 });
  return simplify(out);
}

/** SVG path for a polyline with rounded corners. */
export function roundedPath(points: Point[], radius = CORNER_R): string {
  if (!points.length) return '';
  const fmt = (n: number) => Math.round(n * 10) / 10;
  let d = `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (!l1 || !l2) continue;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const p = { x: b.x - ((b.x - a.x) / l1) * r, y: b.y - ((b.y - a.y) / l1) * r };
    const q = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r };
    d += ` L ${fmt(p.x)} ${fmt(p.y)} Q ${fmt(b.x)} ${fmt(b.y)} ${fmt(q.x)} ${fmt(q.y)}`;
  }
  const last = points[points.length - 1]!;
  if (points.length > 1) d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/* ------------------------------------------------------------------ labels */

function stopLabel(label: string, sub: string): { lines: string[]; w: number; h: number } {
  const lines = wrapEventLines(label, LABEL_WRAP).slice(0, 3);
  const w = Math.max(
    ...lines.map((line) => tmTextWidth(line, TM_LABEL_FONT)),
    sub ? tmTextWidth(sub, TM_SUB_FONT) : 0
  );
  const h = lines.length * LABEL_LINE_H + (sub ? TM_SUB_FONT + 4 : 0);
  return { lines, w, h };
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const month = new Date(y, m - 1, d).toLocaleString('en-AU', { month: 'short' });
  return `${d} ${month}`;
}

/* ------------------------------------------------------------------ layout */

type LocalStation = LaidStation & { trackIndex: Map<string, number> };

type LocalStop = {
  /** Null for a program-name flag (a program too short to hold its own name). */
  tick: MapTick | null;
  flagOf?: string;
  /** Sits on a program's edge rather than on the line (dot offsets fixed). */
  onEdge?: boolean;
  tracks: number[];
  y: number;
  side: 'left' | 'right';
  /** Branch id when the competition sits on a round branch off a program. */
  branch: string | null;
  final: boolean;
  label: { lines: string[]; w: number; h: number };
  sub: string;
  labelY: number;
  /** x relative to the stop dot (set once tracks are placed). */
  dotX: number[];
  /** Strands (map order) a competition on several strands runs on; this strand hosts it. */
  cross?: string[];
  /** Shared platform capsule for same-day stops on one line (y range). */
  platform?: { y0: number; y1: number };
};

type LocalBranch = {
  id: string;
  /** Host program; null for an open-all-year spur off the year line itself. */
  stationId: string | null;
  track: number;
  side: 'left' | 'right';
  stops: LocalStop[];
  originY: number;
  /** The y whose track x the branch x is measured from. */
  refY: number;
  /** Offsets from the track line. */
  edgeDX: number;
  branchDX: number;
  /** Open all year: leaves the year line near the year start and rejoins after its last stop. */
  allYear?: { rejoinY: number };
};

/**
 * Programs overlapping in time on one year line. Each runs on its own rail on the `dir` side of
 * the line; `half` is how far the farthest rail centre sits from the line.
 */
type Cluster = {
  track: number;
  y0: number;
  y1: number;
  offsets: Map<string, number>;
  ys: number;
  ye: number;
  half: number;
  dir: 1 | -1;
};

/** Height of the bend where a rail leaves or rejoins its year line (kept short so it fits by year end). */
function railRamp(off: number): number {
  return Math.max(MIN_RAMP, Math.round(Math.abs(off) * 0.6));
}

/** Side programs take on a year line: the outside on a strand's first line, else the right. */
function railDir(track: number, trackCount: number): 1 | -1 {
  return trackCount > 1 && track === 0 ? -1 : 1;
}

type StrandPiece = {
  line: TransitMap['lines'][number];
  defs: Array<{ id: string; label: string }>;
  baseXs: number[];
  stations: LocalStation[];
  stops: LocalStop[];
  branches: LocalBranch[];
  clusters: Cluster[];
  pushes: Push[];
};

function overlap(a: Interval, b: Interval, pad = 0): boolean {
  return a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

function rootOf(map: TransitMap, tick: MapTick, guard = 0): MapTick {
  if (tick.attach.kind !== 'event' || guard > 20) return tick;
  const eventId = tick.attach.event_id;
  const host = map.ticks.find((item) => item.id === eventId);
  return host ? rootOf(map, host, guard + 1) : tick;
}

function tickY(map: TransitMap, tick: MapTick, year: number, stations: LocalStation[]): number {
  if (tick.starts_on) return dateToY(tick.starts_on, year);
  if (tick.attach.kind === 'line') return tick.attach.y;
  if (tick.attach.kind === 'station') {
    const stationId = tick.attach.station_id;
    const station = stations.find((item) => item.id === stationId);
    if (station) return station.y + station.h * tick.attach.offset;
  }
  const root = rootOf(map, tick);
  return root === tick ? MAP_YEAR_TOP + 40 : tickY(map, root, year, stations) + 40;
}

/** True when "also connect to" names another competition or another strand (a link is drawn). */
function linksAway(map: TransitMap, tick: MapTick, lineId: string): boolean {
  const text = tick.connects_to?.trim().toLowerCase();
  if (!text) return false;
  const toTick = map.ticks.some(
    (other) =>
      other.id !== tick.id &&
      (other.id.toLowerCase() === text ||
        other.label.toLowerCase() === text ||
        (other.label.length >= 6 && text.includes(other.label.toLowerCase())))
  );
  if (toTick) return true;
  return map.lines.some((line) => line.id !== lineId && text.includes(line.name.toLowerCase()));
}

/** Strands a year-line competition runs on, in map order, when it is on more than one. */
function crossLineIds(map: TransitMap, tick: MapTick): string[] {
  if (tick.attach.kind !== 'line' || tick.all_year || !tick.also_lines?.length) return [];
  const wanted = new Set([tick.attach.line_id, ...tick.also_lines]);
  const ids = map.lines.filter((line) => wanted.has(line.id)).map((line) => line.id);
  return ids.length > 1 ? ids : [];
}

function homeLineId(map: TransitMap, tick: MapTick, stations: LocalStation[]): string | undefined {
  const root = rootOf(map, tick);
  const fallback = map.lines[0]?.id;
  // A competition on several strands is hosted by the last of them, so its name sits at the end of its rule.
  const cross = crossLineIds(map, root);
  if (cross.length) return cross[cross.length - 1];
  if (root.attach.kind === 'line') {
    const lineId = root.attach.line_id;
    return map.lines.some((line) => line.id === lineId) ? lineId : fallback;
  }
  if (root.attach.kind === 'station') {
    const stationId = root.attach.station_id;
    return stations.find((station) => station.id === stationId)?.line_id ?? fallback;
  }
  return fallback;
}

function buildStations(map: TransitMap, line: TransitMap['lines'][number], year: number, defs: Array<{ id: string }>): LocalStation[] {
  const ids = defs.map((def) => def.id);
  const drafted = map.stations
    .filter((raw) => raw.line_id === line.id)
    .map((raw) => {
      const dated = applyDateSpanToStation(raw, year);
      const y = dated.starts_on ? dated.y : dated.y;
      const h = Math.max(24, dated.height);
      const tracks = stationTracks(dated, line);
      const station: LocalStation = {
        id: dated.id,
        line_id: dated.line_id,
        label: dated.label,
        color: line.color,
        lineX: 0,
        x: 0,
        y,
        w: TM_PILL_W,
        h,
        lane: 0,
        weeks: spanWeeks(dated.starts_on, dated.ends_on, year),
        tracks,
        bodies: [],
        ports: [],
        in_stroke: dated.in_stroke,
        out_stroke: dated.out_stroke,
        trackIndex: new Map(tracks.map((track) => [track, ids.indexOf(track)]))
      };
      return station;
    })
    .sort((a, b) => a.y - b.y || b.h - a.h || a.id.localeCompare(b.id));
  const placed: LocalStation[] = [];
  for (const station of drafted) {
    let lane = 0;
    while (
      placed.some(
        (other) =>
          other.lane === lane &&
          other.tracks.some((track) => station.tracks.includes(track)) &&
          overlap({ y0: station.y, y1: station.y + station.h }, { y0: other.y, y1: other.y + other.h }, 12)
      )
    ) {
      lane += 1;
    }
    station.lane = lane;
    placed.push(station);
  }
  return placed;
}

function buildClusters(stations: LocalStation[], trackCount: number): Cluster[] {
  const clusters: Cluster[] = [];
  for (let track = 0; track < trackCount; track += 1) {
    const bodies = stations
      .filter((station) => [...station.trackIndex.values()].includes(track))
      .map((station) => ({ id: station.id, lane: station.lane, y0: station.y, y1: station.y + station.h }))
      .sort((a, b) => a.y0 - b.y0);
    let open: { y0: number; y1: number; items: typeof bodies } | null = null;
    const groups: Array<{ y0: number; y1: number; items: typeof bodies }> = [];
    for (const body of bodies) {
      if (open && body.y0 <= open.y1 + 12) {
        open.y1 = Math.max(open.y1, body.y1);
        open.items.push(body);
      } else {
        open = { y0: body.y0, y1: body.y1, items: [body] };
        groups.push(open);
      }
    }
    const dir = railDir(track, trackCount);
    for (const group of groups) {
      const lanes = [...new Set(group.items.map((item) => item.lane))].sort((a, b) => a - b);
      const offsets = new Map<string, number>();
      for (const item of group.items) {
        offsets.set(item.id, dir * (TM_RAIL_OUT + lanes.indexOf(item.lane) * TM_LANE_GAP));
      }
      const half = TM_RAIL_OUT + (lanes.length - 1) * TM_LANE_GAP;
      clusters.push({
        track,
        y0: group.y0,
        y1: group.y1,
        offsets,
        half,
        dir,
        ys: group.y0 - RAIL_PAD - railRamp(half),
        ye: group.y1 + RAIL_PAD + railRamp(half)
      });
    }
  }
  return clusters;
}

function laneOffset(clusters: Cluster[], stationId: string, track: number): number {
  return clusters.find((cluster) => cluster.track === track && cluster.offsets.has(stationId))?.offsets.get(stationId) ?? 0;
}

function sideOf(dir: 1 | -1): 'left' | 'right' {
  return dir > 0 ? 'right' : 'left';
}

/** How far program rails reach to one side of a year line at `y`. */
function laneReach(clusters: Cluster[], track: number, y: number, side: 'left' | 'right'): number {
  const hit = clusters.find((cluster) => cluster.track === track && y >= cluster.ys && y <= cluster.ye && sideOf(cluster.dir) === side);
  return hit ? hit.half : 0;
}

/** True when a program rail runs beside `track` on `side` anywhere between y0 and y1. */
function railBeside(clusters: Cluster[], track: number, side: 'left' | 'right', y0: number, y1: number): boolean {
  return clusters.some(
    (cluster) => cluster.track === track && sideOf(cluster.dir) === side && overlap({ y0: cluster.ys, y1: cluster.ye }, { y0, y1 })
  );
}

/**
 * Distance from a year line to where a label beside it starts. `pills` is how far any program
 * pill on that line reaches toward the label's side over the label's full height (see pillReach).
 */
function labelReach(clusters: Cluster[], track: number, y: number, side: 'left' | 'right', dot: number, pills = 0): number {
  const reach = laneReach(clusters, track, y, side);
  return Math.max(dot + LABEL_DX, reach ? reach + TM_PILL_W / 2 + 10 : LABEL_DX, pills ? pills + 10 : 0);
}

/**
 * How far program pills on `track` reach to one side between y0 and y1. A label is several lines
 * tall, so a pill that starts just below its stop can still sit under the label's lower lines.
 */
function pillReach(
  stations: LocalStation[],
  clusters: Cluster[],
  track: number,
  side: 'left' | 'right',
  y0: number,
  y1: number
): number {
  let reach = 0;
  for (const station of stations) {
    if (![...station.trackIndex.values()].includes(track)) continue;
    if (!overlap({ y0, y1 }, { y0: station.y, y1: station.y + station.h })) continue;
    const off = laneOffset(clusters, station.id, track);
    reach = Math.max(reach, (side === 'right' ? off : -off) + TM_PILL_W / 2);
  }
  return reach;
}

/** Vertical span a stop's label covers (name lines plus date). */
function labelSpan(stop: { labelY: number; label: { h: number } }): { y0: number; y1: number } {
  const y0 = stop.labelY - LABEL_LINE_H / 2 - 2;
  return { y0, y1: y0 + stop.label.h + 4 };
}

function strandPiece(map: TransitMap, line: TransitMap['lines'][number], year: number, allStations: LocalStation[]): StrandPiece {
  const defs = lineTrackDefs(line);
  const count = defs.length;
  const ids = defs.map((def) => def.id);
  const baseXs = defs.map((_, index) => index * TM_TRACK_GAP);
  const stations = allStations.filter((station) => station.line_id === line.id);
  const clusters = buildClusters(stations, count);
  const yTop = MAP_YEAR_TOP - CAP_LIFT;
  const yBottom = MAP_YEAR_BOTTOM + CAP_LIFT;

  // Competitions that belong to this strand (by their root host); orphans go to the first strand.
  const mine = map.ticks.filter((tick) => homeLineId(map, tick, allStations) === line.id);

  const stops: LocalStop[] = [];
  const branchMap = new Map<string, LocalBranch>();
  for (const tick of mine) {
    const root = rootOf(map, tick);
    const y = tickY(map, tick, year, allStations);
    const sub = shortDate(tick.starts_on);
    const label = stopLabel(tick.label, sub);
    const rootStation =
      root.attach.kind === 'station' ? stations.find((item) => item.id === (root.attach as { station_id: string }).station_id) : undefined;
    if (root.attach.kind === 'station' && rootStation) {
      const attach = root.attach;
      const station = rootStation;
      const wanted = resolveLineAttachTracks(attachTracksOf(attach), station.tracks);
      const pick = attach.side === 'left' ? wanted[0] : wanted[wanted.length - 1];
      const trackId = pick ?? station.tracks[0]!;
      const track = Math.max(0, ids.indexOf(trackId));
      // On a split line, a program's competitions leave from its outer side. On the strand's
      // first or last year line they take the outside too, so their names never push a neighbour.
      const laneOff = laneOffset(clusters, station.id, track);
      const outer: 'left' | 'right' | null = count > 1 && track === 0 ? 'left' : track === count - 1 ? 'right' : null;
      const side: 'left' | 'right' = laneOff > 0 ? 'right' : laneOff < 0 ? 'left' : (outer ?? attach.side);
      const key = `${station.id}:${side}:${trackId}`;
      let branch = branchMap.get(key);
      if (!branch) {
        const off = laneOff;
        const dir = side === 'left' ? -1 : 1;
        const edgeDX = off + dir * (TM_PILL_W / 2);
        branch = {
          id: `branch-${key}`,
          stationId: station.id,
          track,
          side,
          stops: [],
          originY: 0,
          refY: station.y + station.h / 2,
          edgeDX,
          branchDX: edgeDX + dir * BRANCH_OUT
        };
        branchMap.set(key, branch);
      }
      const stop: LocalStop = {
        tick,
        tracks: [track],
        y,
        side,
        branch: branch.id,
        final: false,
        label,
        sub,
        labelY: y,
        dotX: []
      };
      branch.stops.push(stop);
      stops.push(stop);
      continue;
    }
    // Line stop (a competition on one or more year lines, or a round chained off one).
    const rootAttach =
      root.attach.kind === 'line' && (root.attach.line_id === line.id || crossLineIds(map, root).includes(line.id))
        ? root.attach
        : null;
    const picked = resolveLineAttachTracks(attachTracksOf(rootAttach ?? undefined), ids);
    const tracks = picked.map((id) => ids.indexOf(id)).filter((index) => index >= 0).sort((a, b) => a - b);
    const side: 'left' | 'right' = count > 1 && tracks.length === 1 && tracks[0] === 0 ? 'left' : 'right';
    if (rootAttach && root.all_year) {
      // Open all year: the competition and its rounds run on a dotted spur beside the year line.
      const track = side === 'left' ? (tracks[0] ?? 0) : (tracks[tracks.length - 1] ?? 0);
      const key = `allyear:${root.id}`;
      let branch = branchMap.get(key);
      if (!branch) {
        branch = {
          id: `branch-${key}`,
          stationId: null,
          track,
          side,
          stops: [],
          originY: 0,
          refY: 0,
          edgeDX: 0,
          branchDX: 0,
          allYear: { rejoinY: 0 }
        };
        branchMap.set(key, branch);
      }
      const stop: LocalStop = { tick, tracks: [track], y, side, branch: branch.id, final: false, label, sub, labelY: y, dotX: [] };
      branch.stops.push(stop);
      stops.push(stop);
      continue;
    }
    const cross = tick === root ? crossLineIds(map, root) : [];
    if (cross.length) {
      // One interchange beside the host's outermost year line, its name to the right with a badge per strand.
      const track = tracks.length ? tracks[tracks.length - 1]! : 0;
      const badges = cross.length * (BADGE_W + BADGE_GAP) - BADGE_GAP;
      const crossLabel = { ...label, w: Math.max(label.w, badges), h: label.h + BADGE_H + 6 };
      stops.push({ tick, tracks: [track], y, side: 'right', branch: null, final: false, label: crossLabel, sub, labelY: y, dotX: [], cross });
      continue;
    }
    stops.push({ tick, tracks: tracks.length ? tracks : [0], y, side, branch: null, final: false, label, sub, labelY: y, dotX: [] });
  }

  // A program with one competition inside its dates needs no branch: the stop sits on the
  // program's edge. One dated before or after the program keeps a short branch back to it.
  for (const [key, branch] of [...branchMap.entries()]) {
    if (branch.stops.length > 1 || branch.allYear) continue;
    const stop = branch.stops[0]!;
    const host = stations.find((item) => item.id === branch.stationId);
    if (host && (stop.y < host.y || stop.y > host.y + host.h)) continue;
    stop.branch = null;
    stop.onEdge = true;
    stop.dotX = [branch.edgeDX];
    branchMap.delete(key);
  }

  // Programs too short for their name show it beside the pill, like a competition label.
  for (const station of stations) {
    if (!fitPillLabel(station.label, station.h).truncated) continue;
    const indices = [...station.trackIndex.values()].filter((index) => index >= 0).sort((a, b) => a - b);
    if (!indices.length) continue;
    const onlyFirst = count > 1 && indices.length === 1 && indices[0] === 0;
    const track = onlyFirst ? 0 : indices[indices.length - 1]!;
    const off = laneOffset(clusters, station.id, track);
    const side: 'left' | 'right' = onlyFirst || off < 0 ? 'left' : 'right';
    const raw = map.stations.find((item) => item.id === station.id);
    const sub = [shortDate(raw?.starts_on ?? null), shortDate(raw?.ends_on ?? null)].filter(Boolean).join(' – ');
    stops.push({
      tick: null,
      flagOf: station.id,
      onEdge: true,
      tracks: [track],
      y: station.y + station.h / 2,
      side,
      branch: null,
      final: false,
      label: stopLabel(station.label, sub),
      sub,
      labelY: station.y + station.h / 2,
      dotX: [off + (side === 'left' ? -1 : 1) * (TM_PILL_W / 2)]
    });
  }

  // Finals: the last stop of a round branch, or of a chain on a year line.
  for (const branch of branchMap.values()) {
    branch.stops.sort((a, b) => a.y - b.y);
    if (branch.stops.length > 1) branch.stops[branch.stops.length - 1]!.final = true;
    const first = branch.stops[0]!.y;
    if (branch.allYear) {
      const last = branch.stops[branch.stops.length - 1]!;
      branch.originY = Math.max(yTop + TM_CAP_R + ALL_YEAR_RAMP, Math.min(MAP_YEAR_TOP, first - ALL_YEAR_RAMP - 24));
      branch.refY = branch.originY;
      branch.allYear.rejoinY = Math.min(
        MAP_YEAR_BOTTOM,
        Math.max(last.labelY - LABEL_LINE_H / 2 + last.label.h + 16, last.y + ALL_YEAR_RAMP + 16)
      );
      continue;
    }
    const station = stations.find((item) => item.id === branch.stationId)!;
    branch.originY = Math.min(station.y + station.h - 14, Math.max(station.y + 14, first - 24));
  }
  const chains = new Map<string, LocalStop[]>();
  for (const stop of stops) {
    if (stop.branch || !stop.tick || stop.onEdge) continue;
    const root = rootOf(map, stop.tick);
    const list = chains.get(root.id) ?? [];
    list.push(stop);
    chains.set(root.id, list);
  }
  for (const list of chains.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.y - b.y);
    list[list.length - 1]!.final = true;
  }

  // Stops on a year line stay on the line, even beside a program: the program runs on its own rail.
  for (const stop of stops) {
    if (stop.onEdge) continue;
    if (stop.branch) {
      const branch = [...branchMap.values()].find((item) => item.id === stop.branch)!;
      stop.dotX = [branch.branchDX];
      continue;
    }
    if (stop.cross) {
      const rail = laneReach(clusters, stop.tracks[0]!, stop.y, 'right');
      stop.dotX = [rail ? rail + TM_PILL_W / 2 + 16 : CROSS_OUT];
      continue;
    }
    stop.dotX = stop.tracks.map(() => 0);
  }

  // An open-all-year spur runs outside every name, pill and round branch on its side of the line.
  for (const branch of branchMap.values()) {
    if (!branch.allYear) continue;
    const span = { y0: branch.originY, y1: branch.allYear.rejoinY };
    const dir = branch.side === 'left' ? -1 : 1;
    let reach = BRANCH_OUT + TM_PILL_W / 2;
    for (const stop of stops) {
      if (stop.branch || stop.side !== branch.side || stop.y < span.y0 || stop.y > span.y1) continue;
      const edge = branch.side === 'left' ? Math.min(...stop.tracks) : Math.max(...stop.tracks);
      if (edge !== branch.track) continue;
      const dot = Math.abs(stop.dotX[stop.tracks.indexOf(edge)] ?? 0);
      const labelBand = labelSpan(stop);
      const pills = pillReach(stations, clusters, edge, stop.side, labelBand.y0, labelBand.y1);
      reach = Math.max(reach, labelReach(clusters, edge, stop.y, stop.side, dot, pills) + stop.label.w + 28);
    }
    for (const other of branchMap.values()) {
      if (other === branch || other.allYear || other.side !== branch.side || other.track !== branch.track) continue;
      reach = Math.max(reach, Math.abs(other.branchDX) + LABEL_DX + Math.max(...other.stops.map((stop) => stop.label.w)) + 28);
    }
    for (const cluster of clusters) {
      if (cluster.track === branch.track && sideOf(cluster.dir) === branch.side && overlap({ y0: cluster.ys, y1: cluster.ye }, span)) {
        reach = Math.max(reach, cluster.half + TM_PILL_W / 2 + BRANCH_OUT);
      }
    }
    branch.branchDX = dir * reach;
    for (const stop of branch.stops) stop.dotX = [branch.branchDX];
  }

  // A year-line stop whose name would land on a program rail or round branch beside the same line
  // flips to the free side, so its name stays next to its dot.
  for (const stop of stops) {
    if (stop.branch || stop.onEdge || stop.cross || !stop.tick) continue;
    const blocked = (side: 'left' | 'right') => {
      const track = side === 'right' ? Math.max(...stop.tracks) : Math.min(...stop.tracks);
      if (railBeside(clusters, track, side, stop.y - LABEL_LINE_H, stop.y + stop.label.h)) return true;
      return [...branchMap.values()].some((branch) => {
        if (branch.allYear || branch.side !== side || branch.track !== track) return false;
        const last = branch.stops[branch.stops.length - 1]!;
        return stop.y + stop.label.h >= branch.originY - 20 && stop.y - 20 <= last.y + last.label.h;
      });
    };
    const other = stop.side === 'right' ? 'left' : 'right';
    if (blocked(stop.side) && !blocked(other)) stop.side = other;
  }

  // A stop with a link to another strand keeps its label above the link.
  for (const stop of stops) {
    if (stop.tick && linksAway(map, stop.tick, line.id)) stop.labelY = stop.y - 8 - stop.label.h + LABEL_LINE_H / 2;
  }

  // Two or more events on one line on the same day share an upright platform capsule: a dot each,
  // stacked so every name sits beside its own dot, with the date once under the last.
  const platformKey = (stop: LocalStop) => stop.branch ?? `track:${stop.tracks[0]}`;
  const candidates = stops
    .filter((stop) => stop.tick && !stop.onEdge && !stop.cross && stop.tracks.length === 1)
    .sort((a, b) => platformKey(a).localeCompare(platformKey(b)) || a.y - b.y);
  const groups: LocalStop[][] = [];
  for (const stop of candidates) {
    const open = groups[groups.length - 1];
    if (open && platformKey(open[0]!) === platformKey(stop) && stop.y - open[0]!.y < 4) open.push(stop);
    else groups.push([stop]);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    const order = (stop: LocalStop) => map.ticks.findIndex((item) => item.id === stop.tick!.id);
    group.sort((a, b) => a.y - b.y || order(a) - order(b));
    const last = group[group.length - 1]!;
    for (const stop of group) {
      if (stop === last) continue;
      stop.sub = '';
      stop.label = stopLabel(stop.tick!.label, '');
    }
    const steps = group.slice(0, -1).map((stop) => Math.max(PLATFORM_STEP, stop.label.h + 6));
    const span = steps.reduce((sum, step) => sum + step, 0);
    let y = group[0]!.y - span / 2;
    const side = group[0]!.side;
    const platform = { y0: y - PLATFORM_R, y1: y + span + PLATFORM_R };
    group.forEach((stop, index) => {
      stop.y = y;
      stop.labelY = y;
      stop.side = side;
      stop.platform = platform;
      y += steps[index] ?? 0;
    });
  }

  // Keep labels in one column from overprinting each other: later ones slide down.
  const columns = new Map<string, LocalStop[]>();
  for (const stop of stops) {
    const key = stop.branch ?? `${stop.side}:${stop.side === 'left' ? Math.min(...stop.tracks) : Math.max(...stop.tracks)}`;
    const list = columns.get(key) ?? [];
    list.push(stop);
    columns.set(key, list);
  }
  for (const list of columns.values()) {
    list.sort((a, b) => a.labelY - b.labelY);
    let floor = -Infinity;
    for (const stop of list) {
      const top = Math.max(stop.labelY - LABEL_LINE_H / 2, floor);
      stop.labelY = top + LABEL_LINE_H / 2;
      floor = top + stop.label.h + 6;
    }
  }

  // Pushes: room for labels and branches beside middle year lines, and even splits.
  const pushes: Push[] = [];
  const occupancy: Interval[][] = defs.map(() => []);
  for (const station of stations) {
    for (const track of station.trackIndex.values()) {
      if (track >= 0) occupancy[track]!.push({ y0: station.y - 6, y1: station.y + station.h + 6 });
    }
  }
  for (const cluster of clusters) {
    occupancy[cluster.track]!.push({ y0: cluster.ys, y1: cluster.ye });
    const amount = Math.max(0, cluster.half + TM_PILL_W + 12 - TM_TRACK_GAP);
    if (cluster.dir > 0 && cluster.track < count - 1) pushes.push({ gap: cluster.track, dir: 1, y0: cluster.ys, y1: cluster.ye, amount });
    if (cluster.dir < 0 && cluster.track > 0) pushes.push({ gap: cluster.track - 1, dir: -1, y0: cluster.ys, y1: cluster.ye, amount });
  }
  for (const stop of stops) {
    for (const track of stop.tracks) occupancy[track]!.push({ y0: stop.y - 14, y1: stop.y + 14 });
  }
  for (const branch of branchMap.values()) {
    const last = branch.stops[branch.stops.length - 1]!;
    const y0 = Math.min(branch.originY, branch.stops[0]!.y) - 10;
    const y1 = Math.max(last.y, last.labelY + last.label.h, branch.allYear?.rejoinY ?? 0) + 10;
    occupancy[branch.track]!.push({ y0, y1 });
    const reach = Math.max(...branch.stops.map((stop) => stop.label.w)) + Math.abs(branch.branchDX) + LABEL_DX;
    const amount = reach + SIDE_PAD + TM_PILL_W / 2 - TM_TRACK_GAP;
    if (branch.side === 'right' && branch.track < count - 1) pushes.push({ gap: branch.track, dir: 1, y0, y1, amount });
    if (branch.side === 'left' && branch.track > 0) pushes.push({ gap: branch.track - 1, dir: -1, y0, y1, amount });
  }
  for (const stop of stops) {
    if (stop.branch) continue;
    const right = stop.side === 'right';
    const track = right ? Math.max(...stop.tracks) : Math.min(...stop.tracks);
    if (right ? track >= count - 1 : track <= 0) continue;
    const dot = Math.abs(stop.dotX[stop.tracks.indexOf(track)] ?? 0);
    const span = labelSpan(stop);
    const pills = pillReach(stations, clusters, track, stop.side, span.y0, span.y1);
    const reach = labelReach(clusters, track, stop.y, stop.side, dot, pills) + stop.label.w;
    const amount = reach + SIDE_PAD + TM_PILL_W / 2 - TM_TRACK_GAP;
    const top = Math.min(stop.y - 12, stop.labelY - LABEL_LINE_H / 2) - 4;
    const bottom = Math.max(stop.y + 12, stop.labelY - LABEL_LINE_H / 2 + stop.label.h) + 4;
    pushes.push(right ? { gap: track, dir: 1, y0: top, y1: bottom, amount } : { gap: track - 1, dir: -1, y0: top, y1: bottom, amount });
  }
  const settled = settlePushes(pushes, occupancy, count).map((push) => ({
    ...push,
    y0: Math.max(yTop, push.y0),
    y1: Math.min(yBottom, push.y1)
  }));

  return {
    line,
    defs,
    baseXs,
    stations,
    stops,
    branches: [...branchMap.values()],
    clusters,
    pushes: settled
  };
}

type Box = { x0: number; x1: number; y0: number; y1: number };

type PlacedStrand = {
  piece: StrandPiece;
  tracks: TransitTrackDraw[];
  trackLines: Point[][];
  branches: TransitBranchDraw[];
  stops: TransitStopDraw[];
  flags: TransitFlagDraw[];
  header: TransitHeaderDraw;
  boxes: Box[];
};

function placeStrand(piece: StrandPiece): PlacedStrand {
  const { line, defs, baseXs, pushes, clusters } = piece;
  const yTop = MAP_YEAR_TOP - CAP_LIFT;
  const yBottom = MAP_YEAR_BOTTOM + CAP_LIFT;
  const trackLines = defs.map((_, index) => trackPolyline(pushes, index, baseXs[index]!, yTop, yBottom));
  const tx = (track: number, y: number) => xAt(trackLines[track]!, y);
  const boxes: Box[] = [];
  const boxPoints = (points: Point[], pad: number) => {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      boxes.push({ x0: Math.min(a.x, b.x) - pad, x1: Math.max(a.x, b.x) + pad, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
    }
  };

  const tracks: TransitTrackDraw[] = defs.map((def, index) => {
    const full = trackLines[index]!;
    const own = clusters.filter((cluster) => cluster.track === index).sort((a, b) => a.ys - b.ys);
    // The year line runs straight past its programs; each program's rail leaves it above the
    // program and rejoins it below.
    const pieces: Point[][] = [slicePolyline(full, yTop, yBottom)];
    const lanes: Point[][] = [];
    for (const cluster of own) {
      const x = tx(index, cluster.ys);
      const offsets = [...new Set(cluster.offsets.values())].sort((a, b) => a - b);
      for (const off of offsets) {
        const r = railRamp(off);
        lanes.push([
          { x, y: cluster.ys },
          { x: x + off, y: cluster.ys + r },
          { x: x + off, y: cluster.ye - r },
          { x, y: cluster.ye }
        ]);
      }
    }
    for (const part of [...pieces, ...lanes]) boxPoints(part, TM_LINE_W / 2 + 4);
    const top = { x: full[0]!.x, y: yTop };
    const bottom = { x: full[full.length - 1]!.x, y: yBottom };
    // Rotated year name above the cap.
    boxes.push({ x0: top.x - 10, x1: top.x + tmTextWidth(def.label, 13) * 0.75 + 14, y0: yTop - TM_CAP_R - 70, y1: yTop + TM_CAP_R });
    boxes.push({ x0: bottom.x - TM_CAP_R, x1: bottom.x + TM_CAP_R, y0: yBottom - TM_CAP_R, y1: yBottom + TM_CAP_R });
    return { lineId: line.id, trackId: def.id, label: def.label, color: line.color, pieces: pieces.filter((p) => p.length > 1), lanes, top, bottom };
  });

  for (const station of piece.stations) {
    station.bodies = station.tracks
      .map((trackId) => {
        const index = station.trackIndex.get(trackId) ?? -1;
        if (index < 0) return null;
        const x = tx(index, station.y + station.h / 2) + laneOffset(clusters, station.id, index);
        return { track: trackId, x, y: station.y, w: TM_PILL_W, h: station.h };
      })
      .filter((body): body is NonNullable<typeof body> => Boolean(body));
    const last = station.bodies[station.bodies.length - 1];
    station.x = last?.x ?? 0;
    station.lineX = tx(0, station.y);
    station.ports = stationPorts(station);
    for (const body of station.bodies) {
      boxes.push({ x0: body.x - body.w / 2 - 4, x1: body.x + body.w / 2 + 4, y0: body.y, y1: body.y + body.h });
    }
  }

  const branches: TransitBranchDraw[] = [];
  for (const branch of piece.branches) {
    if (branch.allYear) {
      const dir = branch.side === 'left' ? -1 : 1;
      const y0 = branch.originY;
      const y1 = branch.allYear.rejoinY;
      const bx = tx(branch.track, branch.refY) + branch.branchDX;
      // Leave the year line sideways, run down beside it, and come back the same way.
      const x0 = tx(branch.track, y0);
      const x1 = tx(branch.track, y1);
      const points: Point[] = [
        { x: x0, y: y0 - ALL_YEAR_RAMP },
        { x: x0, y: y0 },
        { x: bx, y: y0 },
        { x: bx, y: y1 },
        { x: x1, y: y1 },
        { x: x1, y: y1 + ALL_YEAR_RAMP }
      ];
      const text = `${defs[branch.track]?.label ?? ''} · open all year`;
      const captionX = bx + dir * 14;
      const anchor: 'start' | 'end' = dir > 0 ? 'start' : 'end';
      const captionW = tmTextWidth(text, TM_SUB_FONT);
      branches.push({
        id: branch.id,
        lineId: line.id,
        color: line.color,
        points,
        dotted: true,
        caption: { x: captionX, y: y0 + 4, text, anchor }
      });
      boxPoints(points, TM_BRANCH_W / 2 + 4);
      boxes.push({
        x0: anchor === 'start' ? captionX : captionX - captionW,
        x1: anchor === 'start' ? captionX + captionW : captionX,
        y0: y0 - 10,
        y1: y0 + 10
      });
      continue;
    }
    const station = piece.stations.find((item) => item.id === branch.stationId)!;
    const trackX = tx(branch.track, branch.refY);
    const edgeX = trackX + branch.edgeDX;
    const bx = trackX + branch.branchDX;
    const dir = branch.side === 'left' ? -1 : 1;
    const ys = branch.stops.map((stop) => stop.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys, branch.originY + 20);
    const turn = Math.min(16, Math.abs(bx - edgeX) / 2);
    const points: Point[] = [
      { x: edgeX, y: branch.originY },
      { x: bx - dir * turn, y: branch.originY },
      { x: bx, y: branch.originY + turn },
      { x: bx, y: maxY }
    ];
    branches.push({ id: branch.id, lineId: line.id, color: line.color, points });
    if (minY < branch.originY) {
      branches.push({ id: `${branch.id}-up`, lineId: line.id, color: line.color, points: [{ x: bx, y: minY }, { x: bx, y: branch.originY + turn }] });
    }
    boxPoints(points, TM_BRANCH_W / 2 + 4);
  }

  const flags: TransitFlagDraw[] = [];
  const stops: TransitStopDraw[] = [];
  for (const stop of piece.stops) {
    let dots: Point[];
    let labelX: number;
    if (stop.branch) {
      const branch = piece.branches.find((item) => item.id === stop.branch)!;
      const x = tx(branch.track, branch.refY) + branch.branchDX;
      dots = [{ x, y: stop.y }];
      labelX = x + (branch.side === 'left' ? -LABEL_DX : LABEL_DX);
    } else {
      dots = stop.tracks.map((track, i) => ({ x: tx(track, stop.y) + (stop.dotX[i] ?? 0), y: stop.y }));
      // The rule from the host year line to a cross-strand interchange.
      if (stop.cross) boxes.push({ x0: tx(stop.tracks[0]!, stop.y), x1: dots[0]!.x, y0: stop.y - 4, y1: stop.y + 4 });
      const track = stop.side === 'left' ? Math.min(...stop.tracks) : Math.max(...stop.tracks);
      const dot = Math.abs(stop.dotX[stop.tracks.indexOf(track)] ?? 0);
      const span = labelSpan(stop);
      const pills = pillReach(piece.stations, clusters, track, stop.side, span.y0, span.y1);
      const reach = labelReach(clusters, track, stop.y, stop.side, dot, pills);
      labelX = tx(track, stop.y) + (stop.side === 'left' ? -reach : reach);
    }
    const anchor: 'start' | 'end' = stop.side === 'left' ? 'end' : 'start';
    const x0 = anchor === 'start' ? labelX : labelX - stop.label.w;
    const top = stop.labelY - LABEL_LINE_H / 2 - 2;
    boxes.push({ x0: x0 - 4, x1: x0 + stop.label.w + 4, y0: top, y1: top + stop.label.h + 4 });
    for (const dot of dots) boxes.push({ x0: dot.x - TM_FINAL_R, x1: dot.x + TM_FINAL_R, y0: dot.y - TM_FINAL_R, y1: dot.y + TM_FINAL_R });
    if (!stop.tick) {
      flags.push({
        stationId: stop.flagOf!,
        lineId: line.id,
        color: line.color,
        lines: stop.label.lines,
        sub: stop.sub,
        labelX,
        labelY: stop.labelY,
        anchor
      });
      continue;
    }
    stops.push({
      tickId: stop.tick.id,
      lineId: line.id,
      color: line.color,
      dots,
      y: stop.y,
      final: stop.final,
      lines: stop.label.lines,
      sub: stop.sub,
      labelX,
      labelY: stop.labelY,
      anchor,
      w: stop.label.w,
      h: stop.label.h,
      ...(stop.cross ? { cross: { lineIds: stop.cross, trackId: defs[stop.tracks[0]!]?.id ?? '', badges: [], rule: [], railDots: [] } } : {}),
      ...(stop.platform ? { platform: { x: dots[0]!.x, y0: stop.platform.y0, y1: stop.platform.y1 } } : {})
    });
  }

  const center = (baseXs[0]! + baseXs[baseXs.length - 1]!) / 2;
  const header: TransitHeaderDraw = { lineId: line.id, x: center, letter: line.letter, name: line.name, color: line.color };
  const headerW = 52 + tmTextWidth(line.name, 24);
  boxes.push({ x0: center - headerW / 2, x1: center + headerW / 2, y0: TM_HEADER_Y - 26, y1: TM_HEADER_Y + 26 });
  return { piece, tracks, trackLines, branches, stops, flags, header, boxes };
}

function shiftPlaced(placed: PlacedStrand, dx: number): void {
  if (!dx) return;
  const moved = new Set<Point>();
  const move = (point: Point) => {
    if (moved.has(point)) return;
    moved.add(point);
    point.x += dx;
  };
  for (const track of placed.tracks) {
    track.pieces.forEach((part) => part.forEach(move));
    track.lanes.forEach((part) => part.forEach(move));
    move(track.top);
    move(track.bottom);
  }
  placed.trackLines.forEach((part) => part.forEach(move));
  placed.branches.forEach((branch) => {
    branch.points.forEach(move);
    if (branch.caption) branch.caption.x += dx;
  });
  for (const stop of placed.stops) {
    stop.dots.forEach(move);
    stop.labelX += dx;
    if (stop.platform) stop.platform.x += dx;
  }
  for (const flag of placed.flags) flag.labelX += dx;
  placed.header.x += dx;
  for (const station of placed.piece.stations) {
    station.x += dx;
    station.lineX += dx;
    for (const body of station.bodies) body.x += dx;
    for (const port of station.ports) port.x += dx;
  }
  for (const box of placed.boxes) {
    box.x0 += dx;
    box.x1 += dx;
  }
}

/** Smallest shift right so `next` clears every box already placed (by real shape, per height band). */
function clearance(placed: Box[], next: Box[], minTrackX: number, nextTrackX: number): number {
  let dx = minTrackX - nextTrackX;
  for (const a of placed) {
    for (const b of next) {
      if (a.y1 + 8 <= b.y0 || b.y1 + 8 <= a.y0) continue;
      dx = Math.max(dx, a.x1 + STRAND_PAD - b.x0);
    }
  }
  return dx;
}

export function layoutMap(map: TransitMap, years?: readonly SchoolYearTerms[] | null): TransitLayout {
  const year = map.year ?? new Date().getFullYear();
  const termsRaw = mapTerms({ year, terms: map.terms }, years);
  const terms: TermBand[] = [
    ...termSpans(termsRaw).map((span) => ({
      id: span.id,
      label: span.id,
      date: span.start,
      y: dateToY(span.start, year),
      end: span.end,
      endY: dateToY(span.end, year),
      hasEnd: span.hasEnd
    })),
    { id: 'E', label: 'E', date: termsRaw.e, y: dateToY(termsRaw.e, year) }
  ];

  const allStations: LocalStation[] = map.lines.flatMap((line) => buildStations(map, line, year, lineTrackDefs(line)));
  // Orphan programs (line deleted) are dropped from the drawing.
  const pieces = map.lines.map((line) => strandPiece(map, line, year, allStations));
  const placedStrands = pieces.map(placeStrand);

  const placedBoxes: Box[] = [];
  let lastTrackX = -Infinity;
  for (const placed of placedStrands) {
    const firstTrack = Math.min(...placed.trackLines.map((pts) => Math.min(...pts.map((p) => p.x))));
    const minLeft = Math.min(...placed.boxes.map((box) => box.x0));
    const startDx = TM_LEFT - minLeft;
    let dx: number;
    if (!placedBoxes.length) dx = startDx;
    else dx = Math.max(startDx, clearance(placedBoxes, placed.boxes, lastTrackX + STRAND_MIN_GAP, firstTrack));
    shiftPlaced(placed, dx);
    placedBoxes.push(...placed.boxes);
    lastTrackX = Math.max(...placed.trackLines.map((pts) => Math.max(...pts.map((p) => p.x))));
  }

  const capTop = MAP_YEAR_TOP - CAP_LIFT;
  const capBottom = MAP_YEAR_BOTTOM + CAP_LIFT;

  // Competitions on several strands: a stop on each strand's year line, joined to the interchange.
  for (const stop of placedStrands.flatMap((placed) => placed.stops)) {
    if (!stop.cross) continue;
    const ring = stop.dots[0]!;
    for (const lineId of stop.cross.lineIds) {
      const placed = placedStrands.find((item) => item.piece.line.id === lineId);
      const index = placed ? placed.piece.defs.findIndex((def) => def.id === stop.cross!.trackId) : -1;
      if (!placed || index < 0) continue;
      const line = placed.piece.line;
      stop.cross.badges.push({ letter: line.letter, color: line.color });
      stop.cross.railDots.push({ x: xAt(placed.trackLines[index]!, stop.y), y: stop.y, color: line.color });
    }
    const left = Math.min(ring.x, ...stop.cross.railDots.map((dot) => dot.x));
    stop.cross.rule = [
      { x: left, y: stop.y },
      { x: ring.x, y: stop.y }
    ];
  }

  // Compatibility shapes for hit-testing, joining and the index.
  const lines: LaidLine[] = placedStrands.map((placed) => {
    const line = placed.piece.line;
    const tracks = placed.tracks.map((track) => ({
      id: track.trackId,
      label: track.label,
      x: track.top.x,
      disc: { cx: track.top.x, cy: capTop, r: TM_CAP_R },
      end: { cx: track.bottom.x, cy: capBottom, r: TM_CAP_R },
      cuts: [],
      forks: []
    }));
    const center = tracks[Math.floor((tracks.length - 1) / 2)] ?? tracks[0];
    return {
      id: line.id,
      name: line.name,
      letter: line.letter,
      color: line.color,
      x: center?.x ?? placed.header.x,
      y0: capTop,
      y1: capBottom,
      disc: { cx: placed.header.x, cy: TM_HEADER_Y, r: 22 },
      tracks
    };
  });

  const stations: LaidStation[] = placedStrands.flatMap((placed) =>
    placed.piece.stations.map(({ trackIndex: _ignored, ...station }) => station)
  );
  const stops = placedStrands.flatMap((placed) => placed.stops);
  const ticks: LaidTick[] = stops.map((stop) => {
    const tick = map.ticks.find((item) => item.id === stop.tickId)!;
    const dot = stop.dots[stop.dots.length - 1]!;
    const x0 = stop.anchor === 'start' ? stop.labelX : stop.labelX - stop.w;
    const labelBox: LabelBox = { id: `tk-${tick.id}`, x: x0, y: stop.labelY - LABEL_LINE_H / 2 - 2, w: stop.w, h: stop.h + 4 };
    return {
      id: tick.id,
      label: tick.label,
      color: stop.color,
      lineId: stop.lineId,
      x0: dot.x,
      y0: dot.y,
      cx: dot.x,
      cy: dot.y,
      dash: tick.stroke === 'dotted',
      connects_to: tick.connects_to,
      tracks: [],
      labelBox,
      labelSide: stop.anchor === 'start' ? 'right' : 'left',
      ports: eventPorts({ id: tick.id, cx: dot.x, cy: dot.y, r: TM_STOP_R }),
      parkTrack: null
    };
  });

  // Links to another competition or strand ("also connect to").
  const links: TransitLinkDraw[] = [];
  for (const laid of ticks) {
    const target = matchConnectTarget(laid.connects_to, lines, ticks.filter((item) => item.id !== laid.id));
    if (!target) continue;
    const from = { x: laid.cx, y: laid.cy };
    if (target.kind === 'event') {
      const to = { x: target.tick.cx, y: target.tick.cy };
      const points = Math.abs(from.y - to.y) < 1 ? [from, to] : [from, { x: to.x, y: from.y }, to];
      links.push({ id: `link-${laid.id}`, points, ends: [from, to] });
    } else {
      if (target.line.id === laid.lineId) continue;
      const placed = placedStrands.find((item) => item.piece.line.id === target.line.id);
      if (!placed) continue;
      const nearest = placed.trackLines
        .map((pts) => ({ x: xAt(pts, from.y), y: from.y }))
        .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))[0];
      if (!nearest) continue;
      links.push({ id: `link-${laid.id}`, points: [from, nearest], ends: [from, nearest] });
    }
  }

  const allBoxes = placedStrands.flatMap((placed) => placed.boxes);
  const width = Math.max(1200, Math.max(...allBoxes.map((box) => box.x1), TM_LEFT) + 80);
  const height = capBottom + 70;
  const ports: ConnectorPort[] = [
    ...stations.flatMap((station) => station.ports),
    ...ticks.flatMap((tick) => tick.ports)
  ];

  return {
    width,
    height,
    year,
    yearTop: MAP_YEAR_TOP,
    yearBottom: MAP_YEAR_BOTTOM,
    terms,
    lines,
    stations,
    ticks,
    ports,
    connectors: [],
    boxes: [],
    draw: {
      headers: placedStrands.map((placed) => placed.header),
      tracks: placedStrands.flatMap((placed) => placed.tracks),
      branches: placedStrands.flatMap((placed) => placed.branches),
      stops,
      flags: placedStrands.flatMap((placed) => placed.flags),
      links,
      capY: { top: capTop, bottom: capBottom },
      strands: placedStrands.map((placed) => ({
        lineId: placed.piece.line.id,
        x0: Math.min(...placed.boxes.map((box) => box.x0)),
        x1: Math.max(...placed.boxes.map((box) => box.x1))
      }))
    }
  };
}

/* ------------------------------------------------------------------ drawing */

function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** Readable ink for text in the line colour (yellow is too light on paper). */
export function labelInk(color: MapColorToken): string {
  if (color === 'yellow') return '#8a6a00';
  return swatch(color).stroke;
}

const PAPER = 'var(--paper, #fbf8f2)';
const INK = 'var(--ink, #13233a)';
const MUTED = 'var(--muted, #6b7788)';
const STOP_RING = '#8f8f8f';

function roundel(cx: number, cy: number, r: number, color: MapColorToken, letter: string, font: number): string {
  const tone = swatch(color);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${tone.disc}"/><text x="${cx}" y="${cy + font * 0.36}" text-anchor="middle" font-size="${font}" font-weight="800" fill="${tone.letter}">${esc(letter)}</text>`;
}

export type TransitRenderOptions = {
  selectedId?: string | null;
  editMode?: boolean;
  showPorts?: boolean;
  termsSelected?: boolean;
};

function formatTermDate(iso: string): string {
  return shortDate(iso);
}

export function renderTransitSvg(layout: TransitLayout, options: TransitRenderOptions = {}): string {
  const { selectedId = null, editMode = false, showPorts = false, termsSelected = false } = options;
  const parts: string[] = [];
  const { draw } = layout;

  // Terms: shaded bands from each term start to its end; the paper gaps between are holidays.
  // A term with no saved end runs to the next term start, alternating shade so terms still read.
  parts.push('<g class="tm-terms">');
  layout.terms.forEach((term, i) => {
    if (term.endY === undefined) return;
    const shade = term.hasEnd || i % 2 === 0 ? 'tm-term-band' : 'tm-term-band tm-term-band--alt';
    parts.push(`<rect class="${shade}" x="0" y="${term.y}" width="${layout.width}" height="${Math.max(0, term.endY - term.y)}"/>`);
  });
  for (const term of layout.terms) {
    parts.push(`<line class="tm-term-rule" x1="0" y1="${term.y}" x2="${layout.width}" y2="${term.y}"/>`);
    if (term.hasEnd && term.endY !== undefined) {
      parts.push(`<line class="tm-term-rule" x1="0" y1="${term.endY}" x2="${layout.width}" y2="${term.endY}"/>`);
    }
    const range = term.hasEnd && term.end ? `${formatTermDate(term.date)} – ${formatTermDate(term.end)}` : formatTermDate(term.date);
    const title = term.id === 'E' ? 'Year ends' : term.hasEnd ? `Term ${term.id.slice(1)}` : `Term ${term.id.slice(1)} starts`;
    parts.push(
      `<g class="map-term${editMode ? ' is-editable' : ''}${termsSelected ? ' is-selected' : ''}" data-term="${term.id}"><title>${title} ${esc(range)}</title>` +
        `<text class="tm-term-label" x="24" y="${term.y + 30}" font-size="28" font-weight="700">${term.id === 'E' ? 'End' : term.id}</text>` +
        `<text class="tm-term-date" x="25" y="${term.y + 50}" font-size="13">${esc(range)}</text></g>`
    );
  }
  parts.push('</g>');

  // Links ("also connect to") run thin and dashed underneath everything, like an underpass.
  for (const link of draw.links) {
    const d = roundedPath(link.points, 12);
    parts.push(
      `<g class="tm-link" data-link="${esc(link.id)}"><path d="${d}" fill="none" stroke="${STOP_RING}" stroke-width="2.2" stroke-dasharray="5 6" stroke-linecap="round"/>` +
        link.ends
          .map((end) => `<circle cx="${end.x}" cy="${end.y}" r="${TM_STOP_R + 2.5}" fill="none" stroke="${STOP_RING}" stroke-width="1.8"/>`)
          .join('') +
        '</g>'
    );
  }

  // Competitions on several strands: a grey dotted rule under everything, like an underpass.
  for (const stop of draw.stops) {
    if (!stop.cross) continue;
    parts.push(
      `<path class="tm-cross-rule" d="${roundedPath(stop.cross.rule)}" fill="none" stroke="${STOP_RING}" stroke-width="3" stroke-dasharray="0.1 7" stroke-linecap="round"/>`
    );
  }

  for (const header of draw.headers) {
    const tone = swatch(header.color);
    const strokeColor = tone.stroke;
    const tracks = draw.tracks.filter((track) => track.lineId === header.lineId);
    const branches = draw.branches.filter((branch) => branch.lineId === header.lineId);
    const selected = selectedId === header.lineId;
    parts.push(`<g class="map-line-group${selected ? ' is-selected' : ''}" data-line="${esc(header.lineId)}">`);
    const nameW = tmTextWidth(header.name, 24);
    const left = header.x - (44 + nameW) / 2;
    parts.push(
      `<g class="tm-header map-line-group--track" data-line-head="${esc(header.lineId)}">${roundel(left + 20, TM_HEADER_Y, 20, header.color, header.letter, 22)}` +
        `<text class="tm-header-name" x="${left + 48}" y="${TM_HEADER_Y + 8}" font-size="24" font-weight="600">${esc(header.name)}</text></g>`
    );
    for (const track of tracks) {
      for (const piece of [...track.pieces, ...track.lanes]) {
        parts.push(
          `<path class="tm-line" d="${roundedPath(piece)}" fill="none" stroke="${strokeColor}" stroke-width="${TM_LINE_W}" stroke-linecap="round" stroke-linejoin="round"/>`
        );
      }
    }
    for (const branch of branches) {
      const dots = branch.dotted ? ` stroke-dasharray="0.1 ${TM_BRANCH_W * 1.9}"` : '';
      parts.push(
        `<path class="tm-branch${branch.dotted ? ' tm-branch--all-year' : ''}" data-branch="${esc(branch.id)}" d="${roundedPath(branch.points, branch.dotted ? ALL_YEAR_RAMP : 14)}" fill="none" stroke="${strokeColor}" stroke-width="${TM_BRANCH_W}"${dots} stroke-linecap="round" stroke-linejoin="round"/>`
      );
      if (branch.caption) {
        parts.push(
          `<text class="tm-stop-sub tm-branch-caption" x="${branch.caption.x}" y="${branch.caption.y}" text-anchor="${branch.caption.anchor}" font-size="${TM_SUB_FONT - 1}" font-style="italic">${esc(branch.caption.text)}</text>`
        );
      }
    }
    for (const track of tracks) {
      const nameY = track.top.y - TM_CAP_R - 8;
      parts.push(
        `<g class="tm-cap map-line-disc">${roundel(track.top.x, track.top.y, TM_CAP_R, header.color, header.letter, 15)}${roundel(track.bottom.x, track.bottom.y, TM_CAP_R, header.color, header.letter, 15)}</g>` +
          `<text class="tm-year-name" x="${track.top.x + 4}" y="${nameY}" font-size="13" font-weight="700" transform="rotate(-45 ${track.top.x + 4} ${nameY})">${esc(track.label)}</text>`
      );
    }
    for (const station of layout.stations.filter((item) => item.line_id === header.lineId)) {
      const isSel = selectedId === station.id;
      parts.push(`<g class="map-station${isSel ? ' is-selected' : ''}" data-id="${esc(station.id)}"><title>${esc(station.label)}</title>`);
      for (const body of station.bodies) {
        parts.push(
          `<rect class="map-station__body tm-pill" x="${body.x - body.w / 2}" y="${body.y}" width="${body.w}" height="${body.h}" rx="${body.w / 2}" fill="${tone.fill}" stroke="${strokeColor}" stroke-width="3"/>`
        );
        const fit = fitPillLabel(station.label, body.h);
        const font = Math.min(fit.font, 17);
        const step = font + 2;
        const cy = body.y + body.h / 2;
        (fit.truncated ? [] : fit.lines).forEach((line, index) => {
          const x = body.x + (index - (fit.lines.length - 1) / 2) * step;
          parts.push(
            `<text class="map-station__label tm-pill-label" x="${x}" y="${cy}" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 ${x} ${cy})" style="font-size:${font}px" font-weight="700" fill="${labelInk(header.color)}"${fit.truncated ? ' data-truncated=""' : ''}>${esc(line)}</text>`
          );
        });
        if (editMode) {
          parts.push(
            `<rect class="map-station__resize map-station__resize--top" data-resize="top" x="${body.x - body.w / 2}" y="${body.y}" width="${body.w}" height="10"/>` +
              `<rect class="map-station__resize map-station__resize--bottom" data-resize="bottom" x="${body.x - body.w / 2}" y="${body.y + body.h - 10}" width="${body.w}" height="10"/>`
          );
        }
      }
      for (const flag of draw.flags.filter((item) => item.stationId === station.id)) {
        flag.lines.forEach((line, index) => {
          parts.push(
            `<text class="tm-flag-label" x="${flag.labelX}" y="${flag.labelY + index * LABEL_LINE_H}" text-anchor="${flag.anchor}" dominant-baseline="central" font-size="${TM_LABEL_FONT}" font-weight="700" fill="${labelInk(header.color)}">${esc(line)}</text>`
          );
        });
        if (flag.sub) {
          parts.push(
            `<text class="tm-stop-sub" x="${flag.labelX}" y="${flag.labelY + flag.lines.length * LABEL_LINE_H - 2}" text-anchor="${flag.anchor}" dominant-baseline="central" font-size="${TM_SUB_FONT}">${esc(flag.sub)}</text>`
          );
        }
      }
      if (showPorts) {
        for (const port of station.ports) {
          parts.push(`<circle class="map-port" data-port="${esc(port.id)}" cx="${port.x}" cy="${port.y}" r="4" fill="${PAPER}" stroke="${strokeColor}"/>`);
        }
      }
      parts.push('</g>');
    }
    const platforms = new Set<string>();
    for (const stop of draw.stops.filter((item) => item.lineId === header.lineId && item.platform)) {
      const { x, y0, y1 } = stop.platform!;
      const key = `${x}:${y0}`;
      if (platforms.has(key)) continue;
      platforms.add(key);
      parts.push(
        `<rect class="tm-platform" x="${x - PLATFORM_R}" y="${y0}" width="${PLATFORM_R * 2}" height="${y1 - y0}" rx="${PLATFORM_R}" fill="#fff" stroke="${STOP_RING}" stroke-width="${STOP_RING_W}"/>`
      );
    }
    for (const stop of draw.stops.filter((item) => item.lineId === header.lineId)) {
      const isSel = selectedId === stop.tickId;
      const tick = layout.ticks.find((item) => item.id === stop.tickId);
      parts.push(`<g class="map-tick${isSel ? ' is-selected' : ''}" data-id="${esc(stop.tickId)}"><title>${esc(tick?.label ?? '')}${stop.sub ? ` · ${esc(stop.sub)}` : ''}</title>`);
      if (stop.dots.length > 1) {
        const xs = stop.dots.map((dot) => dot.x);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        parts.push(
          `<rect class="tm-capsule map-tick__mark" x="${x0 - CAPSULE_R}" y="${stop.y - CAPSULE_R}" width="${x1 - x0 + CAPSULE_R * 2}" height="${CAPSULE_R * 2}" rx="${CAPSULE_R}" fill="#dcdcd8" stroke="${STOP_RING}" stroke-width="${STOP_RING_W}"/>`
        );
        for (const dot of stop.dots) {
          parts.push(`<circle class="tm-stop" cx="${dot.x}" cy="${dot.y}" r="${TM_STOP_R}" fill="#fff" stroke="${STOP_RING}" stroke-width="${STOP_RING_W}"/>`);
        }
      } else if (stop.cross) {
        const dot = stop.dots[0]!;
        parts.push(`<circle class="tm-interchange map-tick__mark" cx="${dot.x}" cy="${dot.y}" r="${TM_FINAL_R}" fill="#fff" stroke="${INK}" stroke-width="4.5"/>`);
      } else if (stop.platform) {
        const dot = stop.dots[0]!;
        parts.push(`<circle class="tm-platform-stop map-tick__mark" cx="${dot.x}" cy="${dot.y}" r="${PLATFORM_DOT_R}" fill="${stop.final ? INK : STOP_RING}"/>`);
      } else {
        const dot = stop.dots[0]!;
        parts.push(
          stop.final
            ? `<circle class="tm-final map-tick__mark" cx="${dot.x}" cy="${dot.y}" r="${TM_FINAL_R}" fill="#fff" stroke="${INK}" stroke-width="3.5"/>`
            : `<circle class="tm-stop map-tick__mark" cx="${dot.x}" cy="${dot.y}" r="${TM_STOP_R}" fill="#fff" stroke="${STOP_RING}" stroke-width="${STOP_RING_W}"/>`
        );
      }
      const weight = stop.final ? 700 : 500;
      stop.lines.forEach((line, index) => {
        parts.push(
          `<text class="tm-stop-label" x="${stop.labelX}" y="${stop.labelY + index * LABEL_LINE_H}" text-anchor="${stop.anchor}" dominant-baseline="central" font-size="${TM_LABEL_FONT}" font-weight="${weight}">${esc(line)}</text>`
        );
      });
      if (stop.sub) {
        parts.push(
          `<text class="tm-stop-sub" x="${stop.labelX}" y="${stop.labelY + stop.lines.length * LABEL_LINE_H - 2}" text-anchor="${stop.anchor}" dominant-baseline="central" font-size="${TM_SUB_FONT}">${esc(stop.sub)}</text>`
        );
      }
      if (stop.cross) {
        // A route badge per strand, like the line signs at a real interchange.
        const top = stop.labelY - LABEL_LINE_H / 2 + stop.lines.length * LABEL_LINE_H + (stop.sub ? TM_SUB_FONT + 4 : 0) + 4;
        const count = stop.cross.badges.length;
        const width = count * (BADGE_W + BADGE_GAP) - BADGE_GAP;
        const x0 = stop.anchor === 'start' ? stop.labelX : stop.labelX - width;
        stop.cross.badges.forEach((badge, index) => {
          const x = x0 + index * (BADGE_W + BADGE_GAP);
          parts.push(
            `<rect class="tm-badge" x="${x}" y="${top}" width="${BADGE_W}" height="${BADGE_H}" rx="4" fill="${swatch(badge.color).disc}"/>` +
              `<text class="tm-badge-letter" x="${x + BADGE_W / 2}" y="${top + BADGE_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="${swatch(badge.color).letter}">${esc(badge.letter)}</text>`
          );
        });
      }
      if (showPorts && tick) {
        for (const port of tick.ports) {
          parts.push(`<circle class="map-port" data-port="${esc(port.id)}" cx="${port.x}" cy="${port.y}" r="4" fill="${PAPER}" stroke="${strokeColor}"/>`);
        }
      }
      parts.push('</g>');
    }
    parts.push('</g>');
  }
  // A stop on each strand a cross-strand competition runs on, over the year lines.
  for (const stop of draw.stops) {
    for (const dot of stop.cross?.railDots ?? []) {
      parts.push(
        `<circle class="tm-cross-stop" data-id="${esc(stop.tickId)}" cx="${dot.x}" cy="${dot.y}" r="${TM_STOP_R}" fill="#fff" stroke="${swatch(dot.color).stroke}" stroke-width="3"/>`
      );
    }
  }
  void MUTED;
  return `<g class="map-root tm-root" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${parts.join('')}</g>`;
}

/** Standalone SVG document (export). */
export function transitSvgDocument(layout: TransitLayout): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="100%"><style>${TRANSIT_EXPORT_CSS}</style>${renderTransitSvg(layout)}</svg>`;
}

export const TRANSIT_EXPORT_CSS = [
  '.tm-term-band{fill:#efece6}',
  '.tm-term-band--alt{fill:#f6f3ee}',
  '.tm-term-rule{stroke:#d8d2c8;stroke-width:1}',
  '.tm-term-label{fill:#c4bdb1}',
  '.tm-term-date,.tm-stop-sub{fill:#6b7788}',
  '.tm-year-name{fill:#6b7788}',
  '.tm-header-name,.tm-stop-label{fill:#13233a}',
  '.tm-stop-label,.tm-stop-sub,.tm-flag-label{paint-order:stroke;stroke:#f5f1e9;stroke-width:4px;stroke-linejoin:round}'
].join('');
