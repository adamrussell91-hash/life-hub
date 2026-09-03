import type { MapColorToken, MapLine, MapStation, MapTick, Point, TransitMap, YearTrack } from '@/schemas/map';
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
export const MAP_LINE_STROKE = 8;
export const MAP_TRACK_GAP = 160;
export const MAP_DISC_LIFT = 48;

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

export type LaidTrack = {
  id: string;
  label: string;
  x: number;
  disc: { cx: number; cy: number; r: number };
  cuts: Array<{ y0: number; y1: number }>;
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
  labelBox: LabelBox;
  labelSide: PortSide;
  ports: ConnectorPort[];
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

const KNOWN_TERMS: Record<number, { t1: string; t2: string; t3: string; t4: string; e: string }> = {
  2026: {
    t1: '2026-01-27',
    t2: '2026-04-27',
    t3: '2026-07-20',
    t4: '2026-10-12',
    e: '2026-12-31'
  }
};

export function schoolTerms(year: number): { t1: string; t2: string; t3: string; t4: string; e: string } {
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

function remapLegacyY(y: number, yearTop = MAP_YEAR_TOP, yearBottom = MAP_YEAR_BOTTOM): number {
  const oldTop = 40;
  const oldBottom = 1040;
  const t = Math.min(1, Math.max(0, (y - oldTop) / (oldBottom - oldTop)));
  return yearTop + t * (yearBottom - yearTop);
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

export function estimateHorizontalLabel(text: string, fontSize = 12): { w: number; h: number } {
  const lines = wrapEventLines(text);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
  return { w: Math.max(fontSize, longest * fontSize * 0.8), h: lines.length * (fontSize + 6) + 2 };
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
  const minH = estimateVerticalLabel(station.label).h + 28;
  return {
    ...station,
    starts_on: station.starts_on || start,
    ends_on: station.ends_on || end,
    y,
    height: Math.max(minH, Math.max(24, endY - y))
  };
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

export function trackLabelBox(line: LaidLine, track: LaidTrack): LabelBox {
  const w = 62;
  const h = 16;
  return {
    id: `track-${line.id}-${track.id}`,
    x: track.disc.cx - w / 2,
    y: track.disc.cy - track.disc.r - 38,
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

function oppositeSide(side: PortSide): PortSide {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  if (side === 'top') return 'bottom';
  return 'top';
}

function labelForSide(
  tick: { id: string; cx: number; cy: number; label: string },
  side: PortSide
): LabelBox {
  const size = estimateHorizontalLabel(tick.label, 12);
  const w = size.w + MAP_CHIP_PAD * 2;
  const h = size.h + MAP_CHIP_PAD * 2;
  const gap = 22;
  if (side === 'right') {
    return { id: `tk-${tick.id}`, x: tick.cx + MAP_TICK_R + gap, y: tick.cy - h / 2, w, h };
  }
  if (side === 'left') {
    return { id: `tk-${tick.id}`, x: tick.cx - MAP_TICK_R - gap - w, y: tick.cy - h / 2, w, h };
  }
  if (side === 'top') {
    return { id: `tk-${tick.id}`, x: tick.cx - w / 2, y: tick.cy - MAP_TICK_R - gap - h, w, h };
  }
  return { id: `tk-${tick.id}`, x: tick.cx - w / 2, y: tick.cy + MAP_TICK_R + gap, w, h };
}

function shiftX(
  line: LaidLine,
  stations: LaidStation[],
  ticks: LaidTick[],
  dx: number
): void {
  if (!dx) return;
  line.x += dx;
  line.disc.cx += dx;
  for (const track of line.tracks) {
    track.x += dx;
    track.disc.cx += dx;
  }
  for (const station of stations) {
    if (station.line_id !== line.id) continue;
    station.lineX += dx;
    station.x += dx;
    for (const body of station.bodies) body.x += dx;
    for (const port of station.ports) port.x += dx;
  }
  for (const tick of ticks) {
    if (tick.lineId !== line.id) continue;
    tick.x0 += dx;
    tick.cx += dx;
    tick.labelBox.x += dx;
    for (const port of tick.ports) port.x += dx;
  }
}

function exclusiveBoxes(
  terms: TermBand[],
  lines: LaidLine[],
  stations: LaidStation[],
  ticks: LaidTick[]
): LabelBox[] {
  const boxes: LabelBox[] = [];
  for (const term of terms) {
    boxes.push({ id: `term-${term.id}`, x: 18, y: term.y - 16, w: 36, h: 32 });
  }
  for (const line of lines) {
    for (const track of line.tracks) {
      boxes.push({
        id: `disc-${line.id}-${track.id}`,
        x: track.disc.cx - track.disc.r,
        y: track.disc.cy - track.disc.r,
        w: track.disc.r * 2,
        h: track.disc.r * 2
      });
      boxes.push(trackLabelBox(line, track));
    }
  }
  for (const station of stations) {
    for (const body of station.bodies) {
      boxes.push({
        id: `st-${station.id}-${body.track}`,
        x: body.x - body.w / 2,
        y: body.y,
        w: body.w,
        h: body.h
      });
    }
  }
  for (const tick of ticks) {
    boxes.push(eventMarkBox(tick), tick.labelBox);
  }
  return boxes;
}

function strandHalfWidth(line: LaidLine): number {
  if (!line.tracks.length) return MAP_DISC_R + MAP_STATION_W / 2;
  const xs = line.tracks.map((track) => track.x);
  return (Math.max(...xs) - Math.min(...xs)) / 2 + MAP_DISC_R + 8;
}

export function lineContentBox(
  line: LaidLine,
  stations: LaidStation[],
  ticks: LaidTick[]
): LabelBox {
  const parts: LabelBox[] = [lineStrokeBox(line)];
  for (const track of line.tracks) {
    parts.push({
      id: `disc-${line.id}-${track.id}`,
      x: track.disc.cx - track.disc.r,
      y: track.disc.cy - track.disc.r - 24,
      w: track.disc.r * 2 + 8,
      h: track.disc.r * 2 + 32
    });
    parts.push(trackLabelBox(line, track));
  }
  for (const station of stations.filter((item) => item.line_id === line.id)) {
    for (const body of station.bodies) {
      parts.push({
        id: `${station.id}-${body.track}`,
        x: body.x - body.w / 2,
        y: body.y,
        w: body.w,
        h: body.h
      });
    }
  }
  for (const tick of ticks.filter((item) => item.lineId === line.id)) {
    parts.push(tick.labelBox, eventMarkBox(tick));
  }
  const x0 = Math.min(...parts.map((p) => p.x));
  const y0 = Math.min(...parts.map((p) => p.y));
  const x1 = Math.max(...parts.map((p) => p.x + p.w));
  const y1 = Math.max(...parts.map((p) => p.y + p.h));
  return { id: `group-${line.id}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function lineExtents(
  line: LaidLine,
  stations: LaidStation[],
  ticks: LaidTick[]
): { left: number; right: number } {
  const box = lineContentBox(line, stations, ticks);
  const half = strandHalfWidth(line);
  return {
    left: Math.max(half, line.x - box.x),
    right: Math.max(half, box.x + box.w - line.x)
  };
}

export function adjacentStrandBoxesOverlap(
  lines: LaidLine[],
  stations: LaidStation[],
  ticks: LaidTick[],
  pad = MAP_LABEL_PAD
): boolean {
  const boxes = [...lines]
    .sort((a, b) => a.x - b.x)
    .map((line) => lineContentBox(line, stations, ticks));
  for (let i = 1; i < boxes.length; i += 1) {
    if (boxesOverlap(boxes[i - 1]!, boxes[i]!, pad)) return true;
  }
  return false;
}

function separateEventMarks(ticks: LaidTick[]): void {
  const ordered = [...ticks].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  for (let i = 0; i < ordered.length; i += 1) {
    const tick = ordered[i]!;
    const side: PortSide = tick.cx >= tick.x0 ? 'right' : 'left';
    let steps = 0;
    while (
      ordered.slice(0, i).some((other) =>
        boxesOverlap(eventMarkBox(tick), eventMarkBox(other)) ||
        boxesOverlap(tick.labelBox, other.labelBox) ||
        boxesOverlap(tick.labelBox, eventMarkBox(other)) ||
        boxesOverlap(eventMarkBox(tick), other.labelBox)
      )
    ) {
      steps += 1;
      tick.cy += 22;
      tick.labelBox = labelForSide(tick, side);
      if (steps > 16) break;
    }
    tick.ports = eventPorts(tick);
  }
}

function laneNeed(line: LaidLine, stations: LaidStation[], ticks: LaidTick[]): number {
  const { left, right } = lineExtents(line, stations, ticks);
  return Math.max(MAP_LANE_MIN, left + right + MAP_LANE_GUTTER);
}

function packLines(
  lines: LaidLine[],
  stations: LaidStation[],
  ticks: LaidTick[],
  extraGutter = 0
): void {
  if (!lines.length) return;
  const ordered = [...lines].sort((a, b) => a.x - b.x);
  const extents = ordered.map((line) => ({
    line,
    ...lineExtents(line, stations, ticks)
  }));
  let laneW = Math.max(MAP_LINE_GAP, MAP_LANE_MIN);
  for (const extent of extents) {
    laneW = Math.max(laneW, extent.left + extent.right + MAP_LANE_GUTTER + extraGutter);
  }
  for (let i = 1; i < extents.length; i += 1) {
    laneW = Math.max(
      laneW,
      extents[i - 1]!.right + MAP_LANE_GUTTER + extraGutter + extents[i]!.left
    );
  }
  const firstLeft = extents[0]?.left ?? strandHalfWidth(ordered[0]!);
  let cursor = Math.max(MAP_FIRST_LINE_X, MAP_LEFT + firstLeft + MAP_LABEL_PAD);
  for (const { line } of extents) {
    shiftX(line, stations, ticks, cursor - line.x);
    cursor += laneW;
  }
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

function resolveTickLabel(
  tick: LaidTick,
  occupied: LabelBox[],
  canvas: { width: number; height: number },
  obstacles: LabelBox[]
): void {
  const side: PortSide = tick.cx >= tick.x0 ? 'right' : 'left';
  let box = labelForSide(tick, side);
  const others = [...occupied, ...obstacles].filter((item) => item.id !== box.id && item.id !== `mark-${tick.id}`);
  let steps = 0;
  while (others.some((item) => boxesOverlap(box, item)) && steps < 28) {
    box = { ...box, y: Math.min(canvas.height - box.h - 8, box.y + 18) };
    steps += 1;
  }
  tick.labelBox = box;
  tick.labelSide = side;
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

function finishTick(
  tick: MapTick,
  lineId: string,
  color: MapColorToken,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  labelSide: PortSide
): LaidTick {
  const laid: LaidTick = {
    id: tick.id,
    label: tick.label,
    color,
    lineId,
    x0,
    y0,
    cx,
    cy,
    dash: tick.stroke === 'dotted',
    connects_to: tick.connects_to,
    labelBox: { id: `tk-${tick.id}`, x: 0, y: 0, w: 10, h: 10 },
    labelSide,
    ports: []
  };
  laid.labelBox = labelForSide(laid, labelSide);
  laid.ports = eventPorts(laid);
  return laid;
}

function strandParkX(line: LaidLine, fromX: number, side: 'left' | 'right'): number {
  const xs = line.tracks.map((track) => track.x);
  if (side === 'right') {
    const outer = Math.max(fromX, ...xs) + MAP_STATION_W / 2;
    return outer + MAP_EVENT_STEM;
  }
  const outer = Math.min(fromX, ...xs) - MAP_STATION_W / 2;
  return outer - MAP_EVENT_STEM;
}

function placeTick(
  raw: MapTick,
  year: number,
  yearTop: number,
  lines: LaidLine[],
  stations: LaidStation[],
  placed: LaidTick[]
): LaidTick | null {
  const tick = applyDateToTickAttach(raw, year);
  const attach = tick.attach;
  if (attach.kind === 'event') {
    const host = placed.find((item) => item.id === attach.event_id);
    if (!host) return null;
    const port = host.ports.find((item) => item.side === attach.side) ?? host.ports[0]!;
    const side = attach.side;
    if (side === 'top' || side === 'bottom') {
      const dir = side === 'bottom' ? 1 : -1;
      return finishTick(
        tick,
        host.lineId,
        host.color,
        port.x,
        port.y,
        port.x,
        port.y + dir * MAP_EVENT_STEM,
        host.labelSide
      );
    }
    const dir = side === 'left' ? -1 : 1;
    return finishTick(
      tick,
      host.lineId,
      host.color,
      port.x,
      port.y,
      port.x + dir * MAP_EVENT_STEM,
      port.y,
      side
    );
  }
  if (attach.kind === 'line') {
    const line = lines.find((item) => item.id === attach.line_id);
    if (!line) return null;
    const track = line.tracks.find((item) => item.id === attach.track) ?? line.tracks[1] ?? line.tracks[0];
    const x = track?.x ?? line.x;
    const y0 = tick.starts_on ? dateToY(tick.starts_on, year) : remapLegacyY(attach.y);
    return finishTick(tick, line.id, line.color, x, y0, strandParkX(line, x, 'right'), y0, 'right');
  }
  const station = stations.find((item) => item.id === attach.station_id);
  const line = lines.find((item) => item.id === station?.line_id);
  if (!station || !line) return null;
  const dateY = tick.starts_on ? dateToY(tick.starts_on, year) : station.y + station.h * attach.offset;
  const body =
    attach.side === 'left'
      ? station.bodies[0]
      : station.bodies[station.bodies.length - 1];
  const bodyPorts = body
    ? station.ports.filter((port) => Math.abs(port.x - (attach.side === 'left' ? body.x - body.w / 2 : body.x + body.w / 2)) < 2)
    : station.ports;
  const port = nearestPort(bodyPorts.length ? bodyPorts : station.ports, attach.side, dateY);
  const dir = attach.side === 'left' ? -1 : 1;
  const x0 = port?.x ?? (body ? body.x + dir * (body.w / 2) : station.x + dir * (station.w / 2));
  const y0 = port?.y ?? Math.min(station.y + station.h, Math.max(station.y, dateY));
  return finishTick(
    tick,
    line.id,
    line.color,
    x0,
    y0,
    attach.side === 'left' ? strandParkX(line, x0, 'left') : strandParkX(line, x0, 'right'),
    dateY,
    attach.side
  );
}

function sharesTrack(a: LaidStation, b: LaidStation): boolean {
  return a.tracks.some((track) => b.tracks.includes(track));
}

function placeStationBodies(station: LaidStation, line: LaidLine | undefined): LaidStation {
  const laneShift = station.lane * 52;
  const bodies = station.tracks.map((track) => {
    const laid = line?.tracks.find((item) => item.id === track);
    return {
      track,
      x: (laid?.x ?? station.lineX) + laneShift,
      y: station.y,
      w: MAP_STATION_W,
      h: station.h
    };
  });
  const first = bodies[0];
  const last = bodies[bodies.length - 1] ?? first;
  const next: LaidStation = {
    ...station,
    bodies,
    x: last?.x ?? station.lineX + laneShift,
    w: MAP_STATION_W,
    ports: []
  };
  next.ports = stationPorts(next);
  return next;
}

function assignStationLanes(stations: LaidStation[], lines: LaidLine[]): LaidStation[] {
  const byLine = new Map<string, LaidStation[]>();
  for (const station of stations) {
    const list = byLine.get(station.line_id) ?? [];
    list.push(station);
    byLine.set(station.line_id, list);
  }
  const out: LaidStation[] = [];
  for (const [lineId, group] of byLine) {
    const line = lines.find((item) => item.id === lineId);
    const sorted = [...group].sort((a, b) => a.y - b.y);
    const lanes: LaidStation[] = [];
    for (const station of sorted) {
      let lane = 0;
      while (
        lanes.some(
          (other) =>
            other.lane === lane &&
            sharesTrack(station, other) &&
            boxesOverlap(
              { id: station.id, x: 0, y: station.y, w: 10, h: station.h },
              { id: other.id, x: 0, y: other.y, w: 10, h: other.h },
              12
            )
        )
      ) {
        lane += 1;
      }
      const shifted = placeStationBodies({ ...station, lane }, line);
      lanes.push(shifted);
      out.push(shifted);
    }
  }
  return out;
}

function applyTrackCuts(lines: LaidLine[], stations: LaidStation[]): void {
  for (const line of lines) {
    for (const track of line.tracks) {
      const blocks = stations
        .filter((station) => station.line_id === line.id && station.tracks.includes(track.id))
        .map((station) => {
          const body = station.bodies.find((item) => item.track === track.id);
          const y = body?.y ?? station.y;
          const h = body?.h ?? station.h;
          return { y0: y, y1: y + h };
        });
      track.cuts = cutVertical(line.y0, line.y1, blocks);
    }
  }
}

export function layoutMap(map: TransitMap): MapCanvasLayout {
  const year = map.year ?? new Date().getFullYear();
  const yearTop = MAP_YEAR_TOP;
  const yearBottom = MAP_YEAR_BOTTOM;
  const termsRaw = schoolTerms(year);
  const terms: TermBand[] = [
    { id: 'T1', label: 'T1', date: termsRaw.t1, y: dateToY(termsRaw.t1, year) },
    { id: 'T2', label: 'T2', date: termsRaw.t2, y: dateToY(termsRaw.t2, year) },
    { id: 'T3', label: 'T3', date: termsRaw.t3, y: dateToY(termsRaw.t3, year) },
    { id: 'T4', label: 'T4', date: termsRaw.t4, y: dateToY(termsRaw.t4, year) },
    { id: 'E', label: 'E', date: termsRaw.e, y: dateToY(termsRaw.e, year) }
  ];

  const lines: LaidLine[] = map.lines.map((line, index) => {
    const baseX = MAP_FIRST_LINE_X + index * MAP_LINE_GAP;
    const discY = yearTop - MAP_DISC_LIFT;
    const trackDefs = lineTrackDefs(line);
    const count = trackDefs.length;
    const tracks: LaidTrack[] = trackDefs.map((def, trackIndex) => {
      const tx = evenTrackX(baseX, trackIndex, count);
      return {
        id: def.id,
        label: def.label,
        x: tx,
        disc: { cx: tx, cy: discY, r: MAP_DISC_R },
        cuts: [{ y0: discY, y1: yearBottom }]
      };
    });
    const center = tracks[Math.floor((count - 1) / 2)] ?? tracks[0]!;
    return {
      id: line.id,
      name: line.name,
      letter: line.letter,
      color: line.color,
      x: center.x,
      y0: discY,
      y1: yearBottom,
      disc: { ...center.disc },
      tracks
    };
  });

  const drafted: LaidStation[] = map.stations.map((raw) => {
    const dated = applyDateSpanToStation(raw, year);
    const line = lines.find((item) => item.id === dated.line_id);
    const x = line?.x ?? MAP_FIRST_LINE_X;
    const y = dated.starts_on ? dated.y : remapLegacyY(dated.y);
    const minH = estimateVerticalLabel(dated.label).h + 28;
    const h = dated.starts_on
      ? Math.max(minH, dated.height)
      : Math.max(minH, remapLegacyY(dated.y + dated.height) - y);
    const weeks = spanWeeks(dated.starts_on, dated.ends_on, year);
    const sourceLine = map.lines.find((item) => item.id === dated.line_id);
    const tracks = stationTracks(dated, sourceLine);
    const station: LaidStation = {
      id: dated.id,
      line_id: dated.line_id,
      label: dated.label,
      color: line?.color ?? 'blue',
      lineX: x,
      x,
      y,
      w: MAP_STATION_W,
      h,
      lane: 0,
      weeks,
      tracks,
      bodies: [],
      ports: [],
      in_stroke: dated.in_stroke,
      out_stroke: dated.out_stroke
    };
    return placeStationBodies(station, line);
  });
  const stations = assignStationLanes(drafted, lines);

  const ticks: LaidTick[] = [];
  const pending = [...map.ticks];
  let spins = 0;
  while (pending.length && spins < map.ticks.length + 3) {
    spins += 1;
    const leftover: MapTick[] = [];
    for (const raw of pending) {
      const laid = placeTick(raw, year, yearTop, lines, stations, ticks);
      if (laid) ticks.push(laid);
      else leftover.push(raw);
    }
    if (leftover.length === pending.length) {
      for (const raw of leftover) {
        const fallback = placeTick(
          { ...raw, attach: { kind: 'line', line_id: lines[0]?.id ?? '', y: 200 } },
          year,
          yearTop,
          lines,
          stations,
          ticks
        );
        if (fallback) ticks.push(fallback);
      }
      break;
    }
    pending.splice(0, pending.length, ...leftover);
  }
  separateEventMarks(ticks);

  packLines(lines, stations, ticks);

  let width = Math.max(1600, ...lines.map((line) => line.x + 360));
  const height = yearBottom + 80;
  const canvas = { width, height };
  let extraGutter = 0;

  for (let pass = 0; pass < 8; pass += 1) {
    const occupied = exclusiveBoxes(terms, lines, stations, ticks);
    const obstacles = lines.flatMap((line) => lineStrokeBoxes(line));
    for (const tick of ticks) {
      resolveTickLabel(tick, occupied, canvas, obstacles);
      const idx = occupied.findIndex((box) => box.id === tick.labelBox.id);
      if (idx >= 0) occupied[idx] = tick.labelBox;
      else occupied.push(tick.labelBox);
    }
    packLines(lines, stations, ticks, extraGutter);
    if (
      adjacentStrandBoxesOverlap(lines, stations, ticks) ||
      ticks.some((tick) =>
        lines.some(
          (line) =>
            line.id !== tick.lineId && lineStrokeBoxes(line).some((box) => boxesOverlap(tick.labelBox, box))
        )
      )
    ) {
      extraGutter += 48;
      packLines(lines, stations, ticks, extraGutter);
    }
    width = Math.max(
      width,
      ...lines.map((line) => line.x + 360),
      ...ticks.map((tick) => tick.labelBox.x + tick.labelBox.w + 80)
    );
    canvas.width = width;
  }

  for (const station of stations) {
    const line = lines.find((item) => item.id === station.line_id);
    const placed = placeStationBodies(station, line);
    station.bodies = placed.bodies;
    station.x = placed.x;
    station.ports = placed.ports;
  }
  for (const tick of ticks) tick.ports = eventPorts(tick);
  applyTrackCuts(lines, stations);

  const connectors: LaidConnector[] = [];
  const pathObstacles = exclusiveBoxes(terms, lines, stations, ticks);
  for (const tick of ticks) {
    const raw = map.ticks.find((item) => item.id === tick.id);
    const attach = raw?.attach;
    if (!attach) continue;
    let from: ConnectorPort | null = null;
    if (attach.kind === 'station') {
      const station = stations.find((item) => item.id === attach.station_id);
      from = station ? nearestPort(station.ports, attach.side, tick.cy) : null;
    } else if (attach.kind === 'event') {
      const host = ticks.find((item) => item.id === attach.event_id);
      from = host?.ports.find((port) => port.side === attach.side) ?? host?.ports[0] ?? null;
    } else {
      const line = lines.find((item) => item.id === attach.line_id);
      if (line) {
        const track =
          line.tracks.find((item) => item.id === attach.track) ??
          line.tracks.find((item) => Math.abs(item.x - tick.x0) < 1) ??
          line.tracks[1] ??
          line.tracks[0]!;
        from = {
          id: `${line.id}:${track.id}:week:${Math.round(tick.y0)}`,
          ownerId: line.id,
          owner: 'line',
          side: tick.cx >= track.x ? 'right' : 'left',
          index: 0,
          x: track.x,
          y: tick.y0
        };
      }
    }
    const toSide = from?.side ? oppositeSide(from.side) : 'left';
    const to = tick.ports.find((port) => port.side === toSide) ?? tick.ports[2] ?? null;
    const ownIds = new Set([
      tick.labelBox.id,
      `mark-${tick.id}`,
      attach.kind === 'station' ? `st-${attach.station_id}` : '',
      ...(attach.kind === 'station'
        ? (stations
            .find((item) => item.id === attach.station_id)
            ?.bodies.map((body) => `st-${attach.station_id}-${body.track}`) ?? [])
        : []),
      attach.kind === 'event' ? `mark-${attach.event_id}` : '',
      attach.kind === 'event' ? `tk-${attach.event_id}` : ''
    ]);
    const blocked = pathObstacles.filter((box) => !ownIds.has(box.id));
    if (from && to) {
      const crosses = Math.abs(from.x - to.x) > MAP_EVENT_STEM + 8;
      connectors.push({
        id: `link-${tick.id}`,
        from,
        to,
        path: crosses ? underpassPath(from, to, blocked) : routedOrthogonalPath(from, to, blocked),
        color: tick.color,
        dash: tick.dash,
        under: crosses
      });
    }
    const target = matchConnectTarget(tick.connects_to, lines, ticks.filter((item) => item.id !== tick.id));
    if (target?.kind === 'line') {
      const other = target.line;
      const out = nearestPort(tick.ports, other.x >= tick.cx ? 'right' : 'left', tick.cy) ?? tick.ports[3]!;
      const dest: ConnectorPort = {
        id: `${other.id}:in:${tick.id}`,
        ownerId: other.id,
        owner: 'line',
        side: other.x >= tick.cx ? 'left' : 'right',
        index: 0,
        x: other.x,
        y: tick.cy
      };
      connectors.push({
        id: `cross-${tick.id}`,
        from: out,
        to: dest,
        path: underpassPath(
          out,
          dest,
          blocked.filter(
            (box) =>
              !box.id.startsWith(`disc-${other.id}`) &&
              !box.id.startsWith(`line-${other.id}`) &&
              !box.id.startsWith(`track-${other.id}`)
          )
        ),
        color: other.color,
        dash: true,
        under: true
      });
    } else if (target?.kind === 'event') {
      const other = target.tick;
      const toward: PortSide = other.cx >= tick.cx ? 'right' : 'left';
      const out = nearestPort(tick.ports, toward, tick.cy) ?? tick.ports[3]!;
      const dest = nearestPort(other.ports, oppositeSide(toward), tick.cy) ?? other.ports[2]!;
      connectors.push({
        id: `event-${tick.id}-${other.id}`,
        from: out,
        to: dest,
        path: underpassPath(
          out,
          dest,
          blocked.filter((box) => box.id !== other.labelBox.id && box.id !== `mark-${other.id}`)
        ),
        color: other.color,
        dash: true,
        under: true
      });
    }
  }

  const ports = [
    ...stations.flatMap((station) => station.ports),
    ...ticks.flatMap((tick) => tick.ports)
  ];
  const boxes = exclusiveBoxes(terms, lines, stations, ticks);
  return {
    width,
    height,
    year,
    yearTop,
    yearBottom,
    terms,
    lines,
    stations,
    ticks,
    ports,
    connectors,
    boxes
  };
}

export function labelHitsForeignLine(layout: MapCanvasLayout): boolean {
  return layout.ticks.some((tick) =>
    layout.lines.some(
      (line) =>
        line.id !== tick.lineId && lineStrokeBoxes(line).some((box) => boxesOverlap(tick.labelBox, box))
    )
  );
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
