import type { MapColorToken, MapLine, MapStation, MapTerms, MapTick, Point, TransitMap, YearTrack } from '@/schemas/map';
import type { SchoolYearTerms } from '@/domain/hub-prefs';
import { parseDue, toDateKey } from '@/domain/queries';

export function lineX(line: { points: Point[] }): number {
  return line.points[0]?.x ?? 0;
}

export const MAP_YEAR_TOP = 168;
export const MAP_YEAR_BOTTOM = 1680;
export const MAP_LEFT = 88;
export const MAP_LINE_GAP = 640;
export const MAP_FIRST_LINE_X = 240;
export const MAP_DISC_R = 26;
export const MAP_STATION_W = 48;
export const MAP_TICK_R = 14;
export const MAP_LABEL_PAD = 16;
export const MAP_PORT_GAP = 36;
export const MAP_LANE_MIN = 640;
export const MAP_LANE_GUTTER = 140;
export const MAP_EVENT_STEM = 64;
export const MAP_CHIP_PAD = 6;
/** SVG label sizes in map units; keep in step with `.map-station__label` / `.map-tick__label`. */
export const MAP_STATION_FONT = 18;
export const MAP_TICK_FONT = 16;
export const MAP_LINE_STROKE = 8;
export const MAP_TRACK_GAP = 160;
/** Horizontal gap between parallel program rails when a year line splits. */
export const MAP_STATION_LANE_GAP = 88;
export const MAP_DISC_LIFT = 48;
/** Pill centre sits this far outside the disc edge, at both caps. */
export const MAP_CAP_LABEL_GAP = 36;
export const MAP_CAP_PILL_H = 24;
/** Split and join bars sit this far outside a fork cluster so they never sit on a capsule cap. */
export const MAP_FORK_BAR_GAP = 28;

export const YEAR_TRACKS: YearTrack[] = ['junior', 'rozelle', 'senior'];
export const YEAR_TRACK_LABELS: Record<YearTrack, string> = {
  junior: 'Junior',
  rozelle: 'Rozelle',
  senior: 'Senior'
};

export type TermId = 'T1' | 'T2' | 'T3' | 'T4' | 'E';
export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type PortOwner = 'station' | 'event' | 'line';

export type TermBand = {
  id: TermId;
  label: string;
  date: string;
  y: number;
  /** When the term ends (saved, or the next term start when no end is saved). Year end has none. */
  end?: string;
  endY?: number;
  /** True when the end date was saved, so the gap after it is a holiday. */
  hasEnd?: boolean;
};

export type LabelBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ConnectorPort = {
  id: string;
  ownerId: string;
  owner: PortOwner;
  side: PortSide;
  index: number;
  x: number;
  y: number;
};

export type LaidConnector = {
  id: string;
  from: ConnectorPort;
  to: ConnectorPort;
  path: string;
  color: MapColorToken;
  dash: boolean;
  under: boolean;
};

/** Orthogonal stroke for a year-line fork (split bar, side rail, or join bar). */
export type LaidTrackFork = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type LaidTrack = {
  id: string;
  label: string;
  x: number;
  /** Cap at the top of the year line. */
  disc: { cx: number; cy: number; r: number };
  /** Cap at the bottom of the year line. */
  end: { cx: number; cy: number; r: number };
  cuts: Array<{ y0: number; y1: number }>;
  /** Circuit-style split/join rails when concurrent programs share this year line. */
  forks: LaidTrackFork[];
};

export type LaidStationBody = {
  track: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LaidLine = {
  id: string;
  name: string;
  letter: string;
  color: MapColorToken;
  x: number;
  y0: number;
  y1: number;
  disc: { cx: number; cy: number; r: number };
  tracks: LaidTrack[];
};

export type LaidStation = {
  id: string;
  line_id: string;
  label: string;
  color: MapColorToken;
  lineX: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lane: number;
  weeks: number;
  tracks: string[];
  bodies: LaidStationBody[];
  ports: ConnectorPort[];
  in_stroke: MapStation['in_stroke'];
  out_stroke: MapStation['out_stroke'];
};

export type LaidTick = {
  id: string;
  label: string;
  color: MapColorToken;
  lineId: string;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  dash: boolean;
  connects_to: string | null;
  /** Resolved year lines this competition sits on (for multi-stem connectors). */
  tracks: string[];
  labelBox: LabelBox;
  labelSide: PortSide;
  ports: ConnectorPort[];
  /** Year line this competition parks beside; its gap to the next year line widens to fit. */
  parkTrack: string | null;
};

export type MapCanvasLayout = {
  width: number;
  height: number;
  year: number;
  yearTop: number;
  yearBottom: number;
  terms: TermBand[];
  lines: LaidLine[];
  stations: LaidStation[];
  ticks: LaidTick[];
  ports: ConnectorPort[];
  connectors: LaidConnector[];
  boxes: LabelBox[];
};

export type TermMarks = {
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  e: string;
  t1_end?: string;
  t2_end?: string;
  t3_end?: string;
  t4_end?: string;
};

export const TERM_END_KEYS = ['t1_end', 't2_end', 't3_end', 't4_end'] as const;

const KNOWN_TERMS: Record<number, TermMarks> = {
  2026: {
    t1: '2026-01-27',
    t2: '2026-04-27',
    t3: '2026-07-20',
    t4: '2026-10-12',
    e: '2026-12-31',
    t1_end: '2026-04-10',
    t2_end: '2026-07-03',
    t3_end: '2026-09-25',
    t4_end: '2026-12-17'
  }
};

function termMarksFrom(terms: SchoolYearTerms['terms']): TermMarks | null {
  const by = new Map(terms.map((term) => [term.term, term]));
  const t1 = by.get(1)?.starts_on;
  const t2 = by.get(2)?.starts_on;
  const t3 = by.get(3)?.starts_on;
  const t4 = by.get(4)?.starts_on;
  const end = by.get(4)?.ends_on;
  if (!t1 || !t2 || !t3 || !t4 || !end) return null;
  const marks: TermMarks = { t1, t2, t3, t4, e: end };
  TERM_END_KEYS.forEach((key, index) => {
    const ends = by.get((index + 1) as 1 | 2 | 3 | 4)?.ends_on;
    if (ends) marks[key] = ends;
  });
  return marks;
}

/** Term marks for one map: its own saved terms win, then Settings, then the fallback. */
export function mapTerms(
  map: { year: number | null; terms?: MapTerms | null },
  years?: readonly SchoolYearTerms[] | null
): TermMarks {
  if (map.terms) return { ...map.terms };
  return schoolTerms(map.year ?? new Date().getFullYear(), years);
}

/**
 * Term marks must run in calendar order: each term starts before it ends, ends before the
 * next term starts, and T4 ends no later than the year end. Missing term ends are skipped.
 */
export function termMarksInOrder(terms: TermMarks): boolean {
  const order = [
    terms.t1,
    terms.t1_end,
    terms.t2,
    terms.t2_end,
    terms.t3,
    terms.t3_end,
    terms.t4,
    terms.t4_end
  ].filter((date): date is string => Boolean(date));
  const ordered = order.every((date, index) => index === 0 || order[index - 1]! < date);
  return ordered && order[order.length - 1]! <= terms.e && terms.t4 < terms.e;
}

/** Each term's shaded span: start to its end, or to the next term start when no end is saved. */
export function termSpans(terms: TermMarks): Array<{ id: 'T1' | 'T2' | 'T3' | 'T4'; start: string; end: string; hasEnd: boolean }> {
  const starts = [terms.t1, terms.t2, terms.t3, terms.t4];
  return starts.map((start, index) => {
    const saved = terms[TERM_END_KEYS[index]!];
    const next = starts[index + 1] ?? terms.e;
    const end = saved && saved > start && saved <= next ? saved : next;
    return { id: `T${index + 1}` as 'T1' | 'T2' | 'T3' | 'T4', start, end, hasEnd: end === saved };
  });
}

/**
 * Term boundary dates for a map year. Prefs win when that year has all four terms.
 * KNOWN_TERMS is only the empty-prefs fallback.
 */
export function schoolTerms(year: number, years?: readonly SchoolYearTerms[] | null): TermMarks {
  const fromPrefs = years ? termMarksFrom(years.find((row) => row.year === year)?.terms ?? []) : null;
  if (fromPrefs) return fromPrefs;
  return (
    KNOWN_TERMS[year] ?? {
      t1: `${year}-01-27`,
      t2: `${year}-04-27`,
      t3: `${year}-07-20`,
      t4: `${year}-10-12`,
      e: `${year}-12-31`
    }
  );
}

export function dateToY(iso: string, year: number, yearTop = MAP_YEAR_TOP, yearBottom = MAP_YEAR_BOTTOM): number {
  const parsed = parseDue(iso) ?? new Date(year, 0, 1);
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31).getTime();
  const t = Math.min(1, Math.max(0, (parsed.getTime() - start) / (end - start)));
  return yearTop + t * (yearBottom - yearTop);
}

export function yToDate(y: number, year: number, yearTop = MAP_YEAR_TOP, yearBottom = MAP_YEAR_BOTTOM): string {
  const t = Math.min(1, Math.max(0, (y - yearTop) / (yearBottom - yearTop)));
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31).getTime();
  return toDateKey(new Date(start + t * (end - start)));
}

export function spanWeeks(startsOn: string | null, endsOn: string | null, year: number): number {
  const start = parseDue(startsOn) ?? new Date(year, 0, 1);
  const end = parseDue(endsOn) ?? start;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  return Math.max(1, Math.round(days / 7));
}

export function estimateVerticalLabel(text: string, fontSize = 12): { w: number; h: number } {
  return { w: fontSize + 6, h: Math.max(fontSize, text.length * fontSize * 0.72) };
}

export type PillLabelFit = {
  lines: string[];
  font: number;
  /** True when the full name did not fit and the drawn text ends with an ellipsis. */
  truncated: boolean;
};

/** Average glyph advance for the semibold map face, as a share of the font size. */
const PILL_GLYPH = 0.62;
const PILL_FONTS = [MAP_STATION_FONT, 16, 14];
const PILL_TWO_LINE_FONT = 14;
const PILL_MIN_FONT = 13;

function pillTextLength(text: string, font: number): number {
  return text.length * font * PILL_GLYPH;
}

function splitInTwo(text: string): [string, string] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestLongest = Infinity;
  for (let cut = 1; cut < words.length; cut += 1) {
    const a = words.slice(0, cut).join(' ');
    const b = words.slice(cut).join(' ');
    const longest = Math.max(a.length, b.length);
    if (longest < bestLongest) {
      best = [a, b];
      bestLongest = longest;
    }
  }
  return best;
}

function clipToLength(text: string, font: number, room: number): string {
  if (pillTextLength(text, font) <= room) return text;
  const chars = Math.max(1, Math.floor(room / (font * PILL_GLYPH)) - 1);
  return `${text.slice(0, chars).trimEnd()}…`;
}

/**
 * Fit a program name inside its capsule (vertical text along `length` map units):
 * full size, then smaller, then two columns, then an ellipsis (the full name lives in a tooltip).
 */
export function fitPillLabel(text: string, length: number): PillLabelFit {
  const label = text.trim() || text;
  const room = Math.max(0, length - 20);
  for (const font of PILL_FONTS) {
    if (pillTextLength(label, font) <= room) return { lines: [label], font, truncated: false };
  }
  const halves = splitInTwo(label);
  if (halves && halves.every((half) => pillTextLength(half, PILL_TWO_LINE_FONT) <= room)) {
    return { lines: halves, font: PILL_TWO_LINE_FONT, truncated: false };
  }
  if (halves && room >= PILL_MIN_FONT * 4) {
    const first = clipToLength(halves[0], PILL_TWO_LINE_FONT, room);
    if (first === halves[0]) {
      return {
        lines: [first, clipToLength(halves[1], PILL_TWO_LINE_FONT, room)],
        font: PILL_TWO_LINE_FONT,
        truncated: true
      };
    }
  }
  return { lines: [clipToLength(label, PILL_MIN_FONT, room)], font: PILL_MIN_FONT, truncated: true };
}

export function estimateHorizontalLabel(text: string, fontSize = 12): { w: number; h: number } {
  const lines = wrapEventLines(text);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  return { w: Math.max(fontSize, longest * fontSize * 0.64), h: lines.length * (fontSize + 6) + 2 };
}

export function wrapEventLines(text: string, maxChars = 22): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      if (word.length <= maxChars) return [word];
      const chunks: string[] = [];
      for (let i = 0; i < word.length; i += maxChars) chunks.push(word.slice(i, i + maxChars));
      return chunks;
    });
  if (!words.length) return [text];
  const lines: string[] = [];
  let current = words[0]!;
  for (const word of words.slice(1)) {
    if (`${current} ${word}`.length <= maxChars) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function boxesOverlap(a: LabelBox, b: LabelBox, pad = MAP_LABEL_PAD): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export function placeBox(
  preferred: LabelBox,
  occupied: LabelBox[],
  canvas: { width: number; height: number }
): LabelBox {
  const ys = [0, 18, -18, 36, -36, 54, -54, 72, -72, 96, -96, 120, -120, 150, -150];
  const xs = [0, 24, -24, 48, -48, 72, -72, 104, -104, 140, -140];
  for (const dy of ys) {
    for (const dx of xs) {
      const box: LabelBox = {
        ...preferred,
        x: Math.min(Math.max(canvas.width, preferred.x + preferred.w + 160) - preferred.w - 8, Math.max(8, preferred.x + dx)),
        y: Math.min(canvas.height - preferred.h - 8, Math.max(8, preferred.y + dy))
      };
      if (!occupied.some((other) => other.id !== box.id && boxesOverlap(box, other))) {
        return box;
      }
    }
  }
  const right = occupied.reduce((max, box) => Math.max(max, box.x + box.w), MAP_FIRST_LINE_X);
  return {
    ...preferred,
    x: right + MAP_LABEL_PAD,
    y: Math.min(canvas.height - preferred.h - 8, Math.max(8, preferred.y))
  };
}

export function nextLineX(lines: MapLine[]): number {
  if (!lines.length) return MAP_FIRST_LINE_X;
  return Math.max(...lines.map((line) => lineX(line))) + MAP_LINE_GAP;
}

export function yearLinePoints(x: number): Array<{ x: number; y: number }> {
  return [
    { x, y: MAP_YEAR_TOP },
    { x, y: MAP_YEAR_BOTTOM }
  ];
}

export function applyDateSpanToStation(station: MapStation, year: number): MapStation {
  if (!station.starts_on && !station.ends_on) return station;
  const start = station.starts_on || station.ends_on || `${year}-01-01`;
  const end = station.ends_on || station.starts_on || `${year}-12-31`;
  const y = dateToY(start, year);
  const endY = dateToY(end, year);
  // Height follows the calendar span only — label length must not stretch short programs.
  return {
    ...station,
    starts_on: station.starts_on || start,
    ends_on: station.ends_on || end,
    y,
    height: Math.max(24, endY - y)
  };
}

export function stationLaneX(trackX: number, lane: number, gap = MAP_STATION_LANE_GAP): number {
  return trackX + lane * gap;
}

export function applyDateToTickAttach(tick: MapTick, year: number): MapTick {
  if (!tick.starts_on || tick.attach.kind !== 'line') return tick;
  return {
    ...tick,
    attach: { ...tick.attach, y: dateToY(tick.starts_on, year) }
  };
}

export type TrackDef = { id: string; label: string };

export function lineTrackDefs(line: MapLine): TrackDef[] {
  const standardIds = line.year_tracks?.length ? line.year_tracks : [...YEAR_TRACKS];
  const standard = standardIds.map((id) => ({
    id,
    label: YEAR_TRACK_LABELS[id as YearTrack] ?? id
  }));
  const extra = (line.extra_tracks ?? []).map((track) => ({ id: track.id, label: track.label }));
  return [...standard, ...extra];
}

/** Legacy single-track field, or the first of `tracks`. */
export function attachTrackOf(attach: { track?: string; tracks?: string[] } | undefined): string | undefined {
  if (!attach) return undefined;
  return attach.tracks?.[0] ?? attach.track;
}

/** Year lines on a competition attach (`tracks`, else legacy `track`). */
export function attachTracksOf(attach: { track?: string; tracks?: string[] } | undefined): string[] {
  if (!attach) return [];
  if (attach.tracks?.length) return [...attach.tracks];
  return attach.track ? [attach.track] : [];
}

/** Resolve which year line a competition uses on a strand (valid track, else middle, else first). */
export function resolveLineAttachTrack(
  attachTrack: string | undefined,
  trackIds: readonly string[]
): string | undefined {
  if (attachTrack && trackIds.includes(attachTrack)) return attachTrack;
  return trackIds[1] ?? trackIds[0];
}

/** Resolve one or more year lines; keeps every valid pick, else the single default. */
export function resolveLineAttachTracks(
  requested: readonly string[] | undefined,
  trackIds: readonly string[]
): string[] {
  const kept = (requested ?? []).filter((id) => trackIds.includes(id));
  if (kept.length) return kept;
  const fallback = resolveLineAttachTrack(undefined, trackIds);
  return fallback ? [fallback] : [];
}

/** Nearest year-line track across all strands (for drag-snap). */
export function nearestLaidTrack(
  lines: LaidLine[],
  x: number
): { lineId: string; trackId: string } | null {
  let best: { lineId: string; trackId: string; dist: number } | null = null;
  for (const line of lines) {
    for (const track of line.tracks) {
      const dist = Math.abs(track.x - x);
      if (!best || dist < best.dist) best = { lineId: line.id, trackId: track.id, dist };
    }
  }
  return best ? { lineId: best.lineId, trackId: best.trackId } : null;
}

export function evenTrackX(centerX: number, index: number, count: number, gap = MAP_TRACK_GAP): number {
  return centerX + (index - (count - 1) / 2) * gap;
}

export function missingStandardYearTracks(line: MapLine): YearTrack[] {
  const present = new Set(lineTrackDefs(line).map((track) => track.id));
  return YEAR_TRACKS.filter((id) => !present.has(id));
}

export function addStandardYearTrack(line: MapLine): MapLine {
  const missing = missingStandardYearTracks(line);
  if (!missing.length) return line;
  const current = line.year_tracks ?? [...YEAR_TRACKS];
  return { ...line, year_tracks: [...current, missing[0]!] };
}

export function addExtraYearTrack(line: MapLine, label: string): MapLine {
  const trimmed = label.trim();
  if (!trimmed) return line;
  const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'track';
  let id = `extra_${base}`;
  const existing = new Set(lineTrackDefs(line).map((track) => track.id));
  let suffix = 2;
  while (existing.has(id)) {
    id = `extra_${base}_${suffix}`;
    suffix += 1;
  }
  return { ...line, extra_tracks: [...(line.extra_tracks ?? []), { id, label: trimmed }] };
}

export function stationTracks(station: { tracks?: string[] | null }, line?: MapLine): string[] {
  const defs = line ? lineTrackDefs(line) : YEAR_TRACKS.map((id) => ({ id, label: YEAR_TRACK_LABELS[id] }));
  const allowed = new Set(defs.map((track) => track.id));
  const tracks = station.tracks?.filter((track) => allowed.has(track));
  return tracks?.length ? tracks : [defs[0]?.id ?? 'junior'];
}

export function cutVertical(
  y0: number,
  y1: number,
  blocks: Array<{ y0: number; y1: number }>
): Array<{ y0: number; y1: number }> {
  const blocked = [...blocks].sort((a, b) => a.y0 - b.y0);
  const cuts: Array<{ y0: number; y1: number }> = [];
  let cursor = y0;
  for (const block of blocked) {
    if (block.y0 > cursor) cuts.push({ y0: cursor, y1: block.y0 });
    cursor = Math.max(cursor, block.y1);
  }
  if (cursor < y1) cuts.push({ y0: cursor, y1 });
  return cuts;
}

function portsOnBody(
  station: { id: string; weeks: number },
  body: { x: number; y: number; w: number; h: number },
  prefix: string
): ConnectorPort[] {
  const weeks = Math.max(1, station.weeks);
  const inset = Math.min(18, body.h / 6);
  const top = body.y + inset;
  const bottom = body.y + body.h - inset;
  const span = Math.max(1, bottom - top);
  const ports: ConnectorPort[] = [];
  for (const side of ['left', 'right'] as const) {
    for (let index = 0; index < weeks; index += 1) {
      const t = weeks === 1 ? 0.5 : index / (weeks - 1);
      ports.push({
        id: `${station.id}:${prefix}:${side}:${index}`,
        ownerId: station.id,
        owner: 'station',
        side,
        index,
        x: side === 'left' ? body.x - body.w / 2 : body.x + body.w / 2,
        y: top + t * span
      });
    }
  }
  return ports;
}

export function stationPorts(station: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  weeks: number;
  bodies?: LaidStationBody[];
}): ConnectorPort[] {
  if (station.bodies?.length) {
    return station.bodies.flatMap((body) => portsOnBody(station, body, body.track));
  }
  return portsOnBody(station, station, 'main');
}

export function eventPorts(tick: { id: string; cx: number; cy: number; r?: number }): ConnectorPort[] {
  const r = tick.r ?? MAP_TICK_R;
  return [
    { id: `${tick.id}:top`, ownerId: tick.id, owner: 'event', side: 'top', index: 0, x: tick.cx, y: tick.cy - r },
    { id: `${tick.id}:bottom`, ownerId: tick.id, owner: 'event', side: 'bottom', index: 0, x: tick.cx, y: tick.cy + r },
    { id: `${tick.id}:left`, ownerId: tick.id, owner: 'event', side: 'left', index: 0, x: tick.cx - r, y: tick.cy },
    { id: `${tick.id}:right`, ownerId: tick.id, owner: 'event', side: 'right', index: 0, x: tick.cx + r, y: tick.cy }
  ];
}

export function eventMarkBox(tick: { id: string; cx: number; cy: number }): LabelBox {
  return {
    id: `mark-${tick.id}`,
    x: tick.cx - MAP_TICK_R,
    y: tick.cy - MAP_TICK_R,
    w: MAP_TICK_R * 2,
    h: MAP_TICK_R * 2
  };
}

export function lineStrokeBoxes(line: LaidLine): LabelBox[] {
  const half = MAP_LINE_STROKE / 2 + 4;
  return line.tracks.map((track) => ({
    id: `line-${line.id}-${track.id}`,
    x: track.x - half,
    y: line.y0,
    w: half * 2,
    h: line.y1 - line.y0
  }));
}

export function lineStrokeBox(line: LaidLine): LabelBox {
  const boxes = lineStrokeBoxes(line);
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.w));
  const y1 = Math.max(...boxes.map((box) => box.y + box.h));
  return { id: `line-${line.id}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function trackLabelBox(line: LaidLine, track: LaidTrack, at: 'head' | 'foot' = 'head'): LabelBox {
  const anchor = at === 'foot' ? track.end : track.disc;
  const w = 62;
  const h = 16;
  return {
    id: `track-${line.id}-${track.id}${at === 'foot' ? '-end' : ''}`,
    x: anchor.cx - w / 2,
    y: at === 'foot' ? anchor.cy + anchor.r + 22 : anchor.cy - anchor.r - 38,
    w,
    h
  };
}

export function nearestPort(ports: ConnectorPort[], side: PortSide, y: number): ConnectorPort | null {
  const onSide = ports.filter((port) => port.side === side);
  if (!onSide.length) return null;
  return onSide.reduce((best, port) => (Math.abs(port.y - y) < Math.abs(best.y - y) ? port : best));
}

export function orthogonalPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  if (Math.abs(from.y - to.y) < 1) return `M ${from.x} ${from.y} H ${to.x}`;
  if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} V ${to.y}`;
  const mid = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} H ${mid} V ${to.y} H ${to.x}`;
}

function stripHits(
  y: number,
  x0: number,
  x1: number,
  obstacles: LabelBox[],
  pad: number
): boolean {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  return obstacles.some(
    (box) =>
      y >= box.y - pad &&
      y <= box.y + box.h + pad &&
      !(box.x + box.w + pad <= left || right + pad <= box.x)
  );
}

export function routedOrthogonalPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: LabelBox[],
  pad = 8
): string {
  if (Math.abs(from.y - to.y) < 1 && !stripHits(from.y, from.x, to.x, obstacles, pad)) {
    return `M ${from.x} ${from.y} H ${to.x}`;
  }
  if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} V ${to.y}`;
  if (!stripHits(from.y, from.x, to.x, obstacles, pad)) {
    return `M ${from.x} ${from.y} H ${to.x} V ${to.y}`;
  }
  if (!stripHits(to.y, from.x, to.x, obstacles, pad)) {
    return `M ${from.x} ${from.y} V ${to.y} H ${to.x}`;
  }
  return underpassPath(from, to, obstacles, pad);
}

export function underpassLaneY(
  from: { x: number; y: number },
  to: { x: number; y: number },
  _obstacles: LabelBox[] = [],
  _pad = 10
): number {
  void _obstacles;
  void _pad;
  return Math.max(from.y, to.y);
}

export function underpassPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: LabelBox[],
  pad = 10
): string {
  if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} V ${to.y}`;
  const y = underpassLaneY(from, to, obstacles, pad);
  if (Math.abs(from.y - y) < 1 && Math.abs(to.y - y) < 1) return `M ${from.x} ${from.y} H ${to.x}`;
  return `M ${from.x} ${from.y} V ${y} H ${to.x} V ${to.y}`;
}

export function moveLine(lines: MapLine[], id: string, delta: -1 | 1): MapLine[] {
  const index = lines.findIndex((line) => line.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= lines.length) return lines;
  const copy = [...lines];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item!);
  return copy;
}

export const CANONICAL_LINE_COLORS: Record<string, MapColorToken> = {
  J: 'blue',
  I: 'yellow',
  E: 'green',
  R: 'purple',
  justice: 'blue',
  innovation: 'yellow',
  expression: 'green',
  reasoning: 'purple'
};

export function canonicalLineColor(line: { letter: string; name: string }): MapColorToken | null {
  const letter = line.letter.trim().toUpperCase();
  if (CANONICAL_LINE_COLORS[letter]) return CANONICAL_LINE_COLORS[letter]!;
  const name = line.name.trim().toLowerCase().replace(/\s+line$/, '');
  return CANONICAL_LINE_COLORS[name] ?? null;
}

export function normalizeLineColors(map: TransitMap): TransitMap {
  const lines = map.lines.map((line) => {
    const color = canonicalLineColor(line);
    return color && color !== line.color ? { ...line, color } : line;
  });
  return { ...map, lines };
}

export function lineColorsNeedWriteback(raw: TransitMap, normalized: TransitMap): boolean {
  if (raw.lines.length !== normalized.lines.length) return true;
  return raw.lines.some((line, index) => line.color !== normalized.lines[index]?.color);
}

export function matchLine(connectsTo: string | null, lines: LaidLine[]): LaidLine | null {
  if (!connectsTo) return null;
  const text = connectsTo.toLowerCase();
  return (
    lines.find((line) => text.includes(line.name.toLowerCase()) || text.includes(` ${line.letter.toLowerCase()}`)) ??
    null
  );
}

export type ConnectTarget =
  | { kind: 'event'; tick: LaidTick }
  | { kind: 'line'; line: LaidLine };

export function matchConnectTarget(
  connectsTo: string | null,
  lines: LaidLine[],
  ticks: LaidTick[]
): ConnectTarget | null {
  if (!connectsTo) return null;
  const text = connectsTo.trim().toLowerCase();
  const byId = ticks.find((tick) => tick.id.toLowerCase() === text);
  if (byId) return { kind: 'event', tick: byId };
  const exact = ticks.find((tick) => tick.label.toLowerCase() === text);
  if (exact) return { kind: 'event', tick: exact };
  const partial = ticks.find((tick) => tick.label.length >= 6 && text.includes(tick.label.toLowerCase()));
  if (partial) return { kind: 'event', tick: partial };
  const line = matchLine(connectsTo, lines);
  return line ? { kind: 'line', line } : null;
}

export const LINE_COLORS: MapColorToken[] = [
  'blue',
  'yellow',
  'green',
  'purple',
  'navy',
  'high-sea',
  'success',
  'lilac',
  'wave',
  'high-sea-ink',
  'marine',
  'depth'
];

export function nextLineLetter(lines: MapLine[]): string {
  const used = new Set(lines.map((line) => line.letter.toUpperCase()));
  for (const letter of ['J', 'I', 'E', 'R', 'A', 'B', 'C', 'D', 'F', 'G', 'H', 'K', 'L', 'M', 'N']) {
    if (!used.has(letter)) return letter;
  }
  return 'N';
}
