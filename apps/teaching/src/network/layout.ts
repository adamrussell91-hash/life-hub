import type { NetworkLineMode } from '@/schemas/block';
import { connect, route, type Way } from './route';
import { bundleMinWidth, layoutBundle } from './bundle';
import type { FlowProblem, FlowSeq } from './flow';

/**
 * Curriculum network layout. One engine draws both zoom levels: a unit map
 * (rows are lessons) and the year network (rows are units). Everything is laid
 * out in two axes, "along" (row order) and "across" (the lines side by side),
 * then mapped to x/y at the end, so the phone map is the desktop map turned on
 * its side. Pure: no DOM, unit tested directly.
 *
 * The rules, from the design:
 * - Train and metro lines are columns in a central corridor, trains first.
 * - Metro runs straight under every station; a marker means it stops.
 * - A train bends out to a detour lane (left of the corridor) round a station
 *   it does not serve. Consecutive skips share the detour; trains nest.
 * - Light-rail lines take lanes outside the corridor, alternating right, left.
 *   They bend in and join a station at its edge, and carry every branch:
 *   stops in the gaps, dashed extension spurs and support loops.
 * - Lines cross freely. Light rail is drawn above metro and below trains.
 */

export type NetLevel = 'introduced' | 'reinforced' | 'mastered';
export type NetTarget = { text: string; href?: string };
export type NetLine = { id: string; mode: NetworkLineMode; name: string; short: string; colour: string };
export type NetRow = {
  id: string;
  target: NetTarget;
  /** Line id → depth (train and metro) or null (light rail). */
  stops: ReadonlyMap<string, NetLevel | null>;
  /** Week band label; rows with the same band sit in one band. */
  band?: string;
};
export type NetStopKind = 'stop' | 'extension' | 'support';
export type NetRailStop = { id: string; lineId: string; afterRow: number; kind: NetStopKind; target: NetTarget; skip?: string };
export type NetGate = { id: string; afterRow: number; target: NetTarget; lineIds: string[] };
export type NetNudge = { dx: number; dy: number };
export type NetInput = {
  lines: NetLine[];
  rows: NetRow[];
  railStops: NetRailStop[];
  gates: NetGate[];
  /** dx is across the lines, dy along them, so a nudge survives turning the map. */
  nudges: Readonly<Record<string, NetNudge>>;
  terminus: NetTarget & { detail?: string; when?: string };
  /** 'unit' rows (year network) are interchange complexes on a zigzag trunk. */
  rowKind?: 'lesson' | 'unit';
  /** Year network: where the class is now, between row `row` and the next. */
  now?: { row: number; frac: number; label: string };
  /** Unit map: how the lessons branch and rejoin. Rows are listed in this walk's order. */
  flow?: FlowSeq;
  flowProblems?: FlowProblem[];
};

export type Orientation = 'vertical' | 'horizontal';
export type Pt = { x: number; y: number };
export type Anchor = 'start' | 'middle' | 'end';
/** `down`: a wrapped label's second line goes below the first (inside a station) rather than above. */
export type LabelView = { x: number; y: number; anchor: Anchor; text: string; maxW: number; wrap: boolean; down?: boolean; bold?: boolean; note?: string };
export type PathView = { lineId: string; mode: NetworkLineMode; colour: string; points: Pt[]; style: 'main' | 'spur' | 'loop' };
export type MarkerView = { lineId: string; colour: string; x: number; y: number; level: NetLevel; mode: NetworkLineMode };
export type PillView = { rowId: string; x: number; y: number; w: number; h: number; target: NetTarget; label: LabelView; markers: MarkerView[] };
export type DotView = { id: string; lineId: string; colour: string; x: number; y: number; kind: NetStopKind; target: NetTarget; label: LabelView };
export type GateView = { id: string; x: number; y: number; w: number; h: number; target: NetTarget; label: LabelView };
export type HeaderView = { lineId: string; x: number; y: number; short: string; name: string; colour: string; mode: NetworkLineMode };
export type BandView = { x: number; y: number; w: number; h: number; label: string; labelX: number; labelY: number; shade: boolean };
export type TerminusView = { x: number; y: number; w: number; h: number; target: NetTarget; detail?: string; when?: string };
export type NetLayout = {
  orientation: Orientation;
  /** 'bundle': the unit map's tight bundle, names beside the stations. */
  style?: 'bundle';
  width: number;
  height: number;
  rowKind: 'lesson' | 'unit';
  paths: PathView[];
  pills: PillView[];
  dots: DotView[];
  gates: GateView[];
  header: HeaderView[];
  bands: BandView[];
  terminus: TerminusView;
  now?: { x: number; y: number; label: LabelView };
};

/* ── Geometry constants ─────────────────────────────────────────────── */

export const NET_G = {
  trunkStep: 40,
  trunkStepMax: 120,
  trunkPad: 18,
  /**
   * Vertical stations are capsules: stop markers either side of the name, all
   * on the centre line, and only as wide as the longest name needs.
   */
  colInset: 24,
  colStep: 22,
  nameGap: 14,
  namePad: 20,
  nameMax: 280,
  stationInset: 10,
  nameLine: 15,
  detourGap: 12,
  detourStep: 14,
  lrGap: 30,
  lrStep: 30,
  pillHalf: 14,
  unitPillHalf: 18,
  /** Horizontal: stations are this wide along, with the name band below the lines. */
  pillHalfH: 56,
  unitPillHalfH: 64,
  nameBandH: 38,
  termHalf: 24,
  zig: 46,
  gutterBands: 64,
  gutterRail: 150,
  gutterPlain: 16,
  sideLabel: 150,
  titleBand: 52,
  bottomLabel: 46,
  headV: 50,
  headH: 74,
  pitchV: 74,
  pitchH: 150,
  unitPitchV: 100,
  unitPitchH: 170,
  bandHead: 24
} as const;

const ENTRY_SIZE: Record<Orientation, Record<NetStopKind | 'gate', number>> = {
  vertical: { stop: 30, extension: 34, support: 54, gate: 36 },
  horizontal: { stop: 64, extension: 64, support: 84, gate: 96 }
};

export { connect } from './route';

/* ── Layout ────────────────────────────────────────────────────────── */

type Entry =
  | { type: 'stop'; stop: NetRailStop; size: number; a: number }
  | { type: 'gate'; gate: NetGate; size: number; a: number };

export type LayoutOptions = {
  /** The room the map has. A vertical map sits centred in it. */
  width?: number;
  /** Station name width in px; the drawing measures with its own font. */
  measure?: (text: string) => number;
};

/** The width a vertical map needs; narrower containers get the horizontal map. */
export function verticalWidth(input: NetInput, options: LayoutOptions = {}): number {
  // The unit map's bundle wraps its names, so it only needs its narrowest width.
  if (input.rowKind !== 'unit') return bundleMinWidth(input, options);
  return layoutNetwork(input, 'vertical', { measure: options.measure }).width;
}

export function chooseNetworkOrientation(width: number, input: NetInput, options: LayoutOptions = {}): Orientation {
  // The unit map is always upright: its bundle fits a phone, and a wide split scrolls instead.
  if (input.rowKind !== 'unit') return 'vertical';
  return width >= verticalWidth(input, options) ? 'vertical' : 'horizontal';
}

/** Zigzag offsets for the year network's trunk: 0, +1, +1, 0, -1, -1, … */
const ZIG = [0, 1, 1, 0, -1, -1];

export function layoutNetwork(input: NetInput, orientation: Orientation, options: LayoutOptions = {}): NetLayout {
  if (orientation === 'vertical' && input.rowKind !== 'unit') return layoutBundle(input, options);
  const vertical = orientation === 'vertical';
  const unit = input.rowKind === 'unit';
  const G = NET_G;
  const nudge = (key: string): NetNudge => input.nudges[key] ?? { dx: 0, dy: 0 };
  const P = (a: number, c: number): Pt => (vertical ? { x: c, y: a } : { x: a, y: c });

  const trains = input.lines.filter((l) => l.mode === 'train');
  const metros = input.lines.filter((l) => l.mode === 'metro');
  const rails = input.lines.filter((l) => l.mode === 'light_rail');
  const trunk = [...trains, ...metros];
  const lineById = new Map(input.lines.map((l) => [l.id, l]));

  /*
   * Across: [left light rail][left detours][corridor][right detours][right light rail].
   * Station names sit inside the stations, so there is no title gutter: only
   * room for week labels and the left light rail's stop labels. A vertical
   * station is a capsule just wide enough for its name, trunk stop markers
   * either side of it on the centre line; trains bend round the nearer side.
   */
  const zig = unit ? G.zig : 0;
  const railSide = new Map<string, { side: 1 | -1; k: number }>();
  let nl = 0, nr = 0;
  rails.forEach((line, i) => {
    if (i % 2 === 0) railSide.set(line.id, { side: 1, k: nr++ });
    else railSide.set(line.id, { side: -1, k: nl++ });
  });
  const leftTrains = vertical ? trains.slice(0, Math.ceil(trains.length / 2)) : trains;
  const rightTrains = vertical ? trains.slice(leftTrains.length) : [];
  const across = [...leftTrains, ...metros, ...rightTrains];
  const hasBands = input.rows.some((r) => r.band);
  const gutter = vertical ? (nl ? G.gutterRail : hasBands ? G.gutterBands : G.gutterPlain) : G.titleBand;
  const sideRoom = vertical ? G.sideLabel : G.bottomLabel;
  const nameBand = vertical ? 0 : G.nameBandH;
  const detourRoom = (n: number) => n * G.detourStep + (n ? G.detourGap - G.detourStep + 4 : 0);
  const outside = 2 * zig + 14 + nl * G.lrStep + (nl ? G.lrGap - G.lrStep + 10 : 0)
    + detourRoom(leftTrains.length) + detourRoom(rightTrains.length)
    + nameBand + (nr ? G.lrGap + (nr - 1) * G.lrStep : 0) + sideRoom;
  const minCorridor = 2 * G.trunkPad + Math.max(0, trunk.length - 1) * G.trunkStep;
  // A vertical station is as wide as its longest name; a longer name wraps to two lines.
  const measure = options.measure ?? ((t: string) => t.length * (unit ? 7.6 : 7));
  const longest = Math.max(0, ...input.rows.map((r) => measure(r.target.text)));
  const nameLines = vertical && longest > G.nameMax ? 2 : 1;
  const nameW = Math.ceil(Math.min(longest, G.nameMax));
  // Trunk columns flank the name: left trains then half the metros, the other half then right trains.
  const metroSplit = Math.ceil(metros.length / 2);
  const leftCols = [...leftTrains, ...metros.slice(0, metroSplit)];
  const rightCols = [...metros.slice(metroSplit), ...rightTrains];
  const block = (n: number) => (n ? G.colInset + (n - 1) * G.colStep + G.nameGap : G.namePad);
  const sideW = Math.max(block(leftCols.length), block(rightCols.length));
  const corridorW = vertical ? 2 * sideW + nameW : minCorridor;
  const trunkStep = across.length > 1 ? G.trunkStep : 0;
  const natural = gutter + outside + corridorW;
  // Spare room centres the map.
  const centre = vertical && options.width ? Math.max(0, Math.floor((options.width - natural) / 2)) : 0;
  const c0 = gutter + zig + centre;
  let cur = c0 + 14;
  const leftLane: number[] = [];
  for (let k = nl - 1; k >= 0; k--) { leftLane[k] = cur; cur += G.lrStep; }
  if (nl) cur += G.lrGap - G.lrStep + 10;
  // Detour lanes nest: the outermost train takes the outermost lane.
  const detour = new Map<string, number>();
  leftTrains.forEach((line) => { detour.set(line.id, cur); cur += G.detourStep; });
  if (leftTrains.length) cur += G.detourGap - G.detourStep + 4;
  const corridorL = cur;
  const corridorR = corridorL + corridorW;
  const colC = new Map<string, number>();
  const trunkMid = (corridorL + corridorR) / 2;
  if (vertical) {
    leftCols.forEach((line, j) => colC.set(line.id, corridorL + G.colInset + j * G.colStep));
    rightCols.forEach((line, j) => colC.set(line.id, corridorR - G.colInset - (rightCols.length - 1 - j) * G.colStep));
  } else {
    across.forEach((line, j) => colC.set(line.id, trunkMid + (j - (across.length - 1) / 2) * trunkStep));
  }
  // Horizontal stations carry their name in a band below the lines.
  const stationR = corridorR + nameBand;
  cur = stationR + (rightTrains.length ? G.detourGap : 0);
  [...rightTrains].reverse().forEach((line, k) => detour.set(line.id, cur + (rightTrains.length - 1 - k) * G.detourStep));
  const rightStart = stationR + detourRoom(rightTrains.length);
  const rightLane: number[] = [];
  for (let k = 0; k < nr; k++) rightLane[k] = rightStart + G.lrGap + k * G.lrStep;
  const laneC = (lineId: string): number => {
    const side = railSide.get(lineId);
    if (!side) return colC.get(lineId) ?? (corridorL + corridorR) / 2;
    return side.side > 0 ? rightLane[side.k]! : leftLane[side.k]!;
  };
  const outerC = Math.max(rightStart, ...rightLane);
  const acrossEnd = outerC + zig + sideRoom + centre;
  const maxRailDx = Math.max(0, ...rails.map((l) => Math.abs(laneC(l.id) - (railSide.get(l.id)!.side > 0 ? stationR : corridorL))));
  const maxTrainDx = Math.max(0, ...trains.map((l) => Math.abs(colC.get(l.id)! - detour.get(l.id)!)));

  /* Gaps: rail stops (in line order) then gates, after each row. */
  const lineOrder = new Map(input.lines.map((l, i) => [l.id, i]));
  const rowCount = input.rows.length;
  const clampRow = (r: number) => Math.max(-1, Math.min(rowCount - 1, r));
  const gaps = new Map<number, Entry[]>();
  const sizes = ENTRY_SIZE[orientation];
  for (const stop of input.railStops) {
    if (!lineById.has(stop.lineId)) continue;
    const g = clampRow(stop.afterRow);
    gaps.set(g, [...(gaps.get(g) ?? []), { type: 'stop', stop, size: sizes[stop.kind], a: 0 }]);
  }
  for (const list of gaps.values()) {
    list.sort((x, y) => x.type === 'stop' && y.type === 'stop' ? (lineOrder.get(x.stop.lineId)! - lineOrder.get(y.stop.lineId)!) : 0);
  }
  for (const gate of input.gates) {
    const g = clampRow(gate.afterRow);
    gaps.set(g, [...(gaps.get(g) ?? []), { type: 'gate', gate, size: sizes.gate, a: 0 }]);
  }

  /* Along. */
  // A station reaches `pre` before its row's line and `post` after it; vertical stations are centred on it.
  const half = vertical
    ? Math.max(unit ? G.unitPillHalf : G.pillHalf, (nameLines * G.nameLine) / 2 + G.stationInset + (unit ? 2 : 0))
    : (unit ? G.unitPillHalfH : G.pillHalfH);
  const pre = half;
  const post = half;
  const span = pre + post;
  const basePitch = unit ? (vertical ? G.unitPitchV : G.unitPitchH) : (vertical ? G.pitchV : G.pitchH);
  const minPitch = Math.max(basePitch, maxTrainDx + span / 2 + half + 10, span + 24, unit ? 2 * zig + span : 0);
  const entryPad = Math.max(vertical ? 16 : 24, maxRailDx - half + 14);
  const a0 = vertical ? G.headV : G.headH;
  const aStart = a0 + 18;
  const rowA: number[] = [];
  const shift: number[] = [];
  const bandsAlong: Array<{ start: number; end: number; label: string }> = [];
  let a = aStart;
  const placeGap = (g: number) => {
    const list = gaps.get(g);
    if (!list?.length) return false;
    a += g < 0 ? 6 : entryPad;
    for (const e of list) { e.a = a + e.size / 2; a += e.size; }
    a += entryPad;
    return true;
  };
  placeGap(-1);
  let band: string | undefined;
  input.rows.forEach((row, i) => {
    if (row.band && row.band !== band) {
      if (bandsAlong.length) bandsAlong[bandsAlong.length - 1]!.end = a;
      bandsAlong.push({ start: a, end: a, label: row.band });
      a += G.bandHead;
    }
    band = row.band ?? band;
    const prev = rowA[i - 1];
    let next = a + pre + (i === 0 ? 8 : 0);
    if (prev !== undefined) {
      // Units that share more lines sit closer together.
      const shared = unit ? sharedLines(input.rows[i - 1]!, row) : 0;
      next = Math.max(next, prev + Math.max(minPitch - shared * 8, span + 30, unit ? 2 * zig + half : 0));
    }
    // Stations (lessons and units) can be dragged; the lines bend to follow.
    const n = nudge(row.id);
    rowA[i] = next + n.dy;
    shift[i] = (unit ? ZIG[i % ZIG.length]! * zig : 0) + n.dx;
    a = next + post;
    if (!placeGap(i)) a += 8;
  });
  if (bandsAlong.length) bandsAlong[bandsAlong.length - 1]!.end = a + 8;
  const sh = (i: number) => shift[Math.max(0, Math.min(rowCount - 1, i))] ?? 0;
  const termA = a + 22 + G.termHalf;
  const alongEnd = termA + G.termHalf + 18;
  const termTop = termA - G.termHalf;

  /* Where each entry sits across, after its nudge. */
  const entryPos = (e: Entry, g: number): { a: number; c: number } => {
    const n = nudge(e.type === 'stop' ? e.stop.id : e.gate.id);
    const base = e.type === 'stop' ? laneC(e.stop.lineId) : 0;
    return { a: e.a + n.dy, c: base + sh(g) + n.dx };
  };

  /* Paths. */
  const paths: PathView[] = [];
  const markersByRow = new Map<number, MarkerView[]>();
  const dots: DotView[] = [];
  const pushMarker = (i: number, line: NetLine, level: NetLevel | null) => {
    const pt = P(rowA[i]!, colC.get(line.id)! + sh(i));
    const list = markersByRow.get(i) ?? [];
    list.push({ lineId: line.id, colour: line.colour, x: pt.x, y: pt.y, level: level ?? 'reinforced', mode: line.mode });
    markersByRow.set(i, list);
  };
  const toPts = (ways: Way[]): Pt[] => route(ways).map((w) => P(w.a, w.c));

  trains.forEach((line) => {
    const col = colC.get(line.id)!;
    const ways: Way[] = [{ a: aStart - 8, c: col + sh(0) }];
    input.rows.forEach((row, i) => {
      if (row.stops.has(line.id)) {
        ways.push({ a: rowA[i]!, c: col + sh(i) });
        pushMarker(i, line, row.stops.get(line.id) ?? null);
      } else {
        const dc = detour.get(line.id)! + sh(i);
        ways.push({ a: rowA[i]! - pre - 5, c: dc, near: true }, { a: rowA[i]! + post + 5, c: dc, near: true });
      }
    });
    ways.push({ a: termTop, c: col });
    paths.push({ lineId: line.id, mode: 'train', colour: line.colour, points: toPts(ways), style: 'main' });
  });

  metros.forEach((line) => {
    const col = colC.get(line.id)!;
    const ways: Way[] = [{ a: aStart - 8, c: col + sh(0) }];
    input.rows.forEach((row, i) => {
      ways.push({ a: rowA[i]!, c: col + sh(i) });
      if (row.stops.has(line.id)) pushMarker(i, line, row.stops.get(line.id) ?? null);
    });
    ways.push({ a: termTop, c: col });
    paths.push({ lineId: line.id, mode: 'metro', colour: line.colour, points: toPts(ways), style: 'main' });
  });

  // Rail stops on train or metro lines (from version 1 text stations) sit on the line in the gap.
  for (const [g, list] of gaps) {
    for (const e of list) {
      if (e.type !== 'stop' || railSide.has(e.stop.lineId)) continue;
      const line = lineById.get(e.stop.lineId)!;
      const pos = entryPos(e, g);
      const pt = P(pos.a, pos.c);
      dots.push({ id: e.stop.id, lineId: line.id, colour: line.colour, x: pt.x, y: pt.y, kind: 'stop', target: e.stop.target, label: dotLabel(pt, line.mode === 'train' ? -1 : 1) });
    }
  }

  rails.forEach((line) => {
    const { side, k } = railSide.get(line.id)!;
    const lane = laneC(line.id);
    const edge = side > 0 ? stationR : corridorL;
    const ways: Way[] = [];
    const branches: PathView[] = [];
    const startAt = (aa: number) => { if (!ways.length) ways.push({ a: aa, c: lane + sh(0) }); };
    const visitGap = (g: number) => {
      for (const e of gaps.get(g) ?? []) {
        if (e.type !== 'stop' || e.stop.lineId !== line.id) continue;
        const pos = entryPos(e, g);
        const pt = P(pos.a, pos.c);
        const o = side * 18;
        let dotPt = pt;
        if (e.stop.kind === 'stop' || !ways.length) {
          // A branch with nothing before it on its line starts the line instead.
          startAt(pos.a - 22);
          ways.push({ a: pos.a, c: pos.c });
        } else if (e.stop.kind === 'extension') {
          dotPt = P(pos.a, pos.c + o);
          branches.push({ lineId: line.id, mode: 'light_rail', colour: line.colour, style: 'spur',
            points: toPts([{ a: pos.a - 24, c: lane + sh(g) }, { a: pos.a - 6, c: pos.c + o }, { a: pos.a, c: pos.c + o }]) });
        } else {
          dotPt = P(pos.a, pos.c + o);
          branches.push({ lineId: line.id, mode: 'light_rail', colour: line.colour, style: 'loop',
            points: toPts([{ a: pos.a - 26, c: lane + sh(g) }, { a: pos.a - 8, c: pos.c + o }, { a: pos.a + 8, c: pos.c + o }, { a: pos.a + 26, c: lane + sh(g) }]) });
        }
        dots.push({ id: e.stop.id, lineId: line.id, colour: line.colour, x: dotPt.x, y: dotPt.y, kind: e.stop.kind, target: e.stop.target, label: dotLabel(dotPt, side) });
      }
    };
    visitGap(-1);
    const out = Math.abs(lane - edge);
    input.rows.forEach((row, i) => {
      if (row.stops.has(line.id)) {
        startAt(rowA[i]! - pre - out - 10);
        // A stop marker where it joins the station, like the trunk lines.
        const at = P(rowA[i]!, edge + sh(i));
        const list = markersByRow.get(i) ?? [];
        list.push({ lineId: line.id, colour: line.colour, x: at.x, y: at.y, level: row.stops.get(line.id) ?? 'reinforced', mode: line.mode });
        markersByRow.set(i, list);
        ways.push({ a: rowA[i]! - 9 + k * 6, c: edge + sh(i), near: true }, { a: rowA[i]! + 9 - k * 6, c: edge + sh(i), near: true });
        // Back out to its lane before a station it does not serve, so it never looks like a stop.
        const nextRow = input.rows[i + 1];
        // With little room it steps out as far as it can, still clear of the station.
        const leaveA = rowA[i]! + 9 - k * 6;
        const room = rowA[i + 1] !== undefined ? rowA[i + 1]! - pre - 4 - leaveA : Infinity;
        const d = Math.min(out, room);
        if (nextRow && !nextRow.stops.has(line.id) && !(gaps.get(i) ?? []).some((e) => e.type === 'stop' && e.stop.lineId === line.id) && d > 16) {
          ways.push({ a: leaveA + d, c: edge + side * d + sh(i) });
        }
      }
      visitGap(i);
    });
    if (ways.length) {
      ways.push({ a: termTop, c: lane });
      paths.push({ lineId: line.id, mode: 'light_rail', colour: line.colour, points: toPts(ways), style: 'main' });
    }
    paths.push(...branches);
  });

  function dotLabel(pt: Pt, side: number): LabelView {
    if (vertical) return { x: pt.x + side * 12, y: pt.y + 4.5, anchor: side > 0 ? 'start' : 'end', text: '', maxW: side > 0 ? G.sideLabel - 20 : 140, wrap: false };
    return side > 0
      ? { x: pt.x, y: pt.y + 22, anchor: 'middle', text: '', maxW: sizes.stop - 6, wrap: false }
      : { x: pt.x, y: pt.y - 13, anchor: 'middle', text: '', maxW: sizes.stop - 6, wrap: false };
  }
  for (const dot of dots) dot.label.text = dot.target.text;

  /* Stations, with their names inside: centred between the markers (vertical) or in a band below the lines (horizontal). */
  const nameLabel = (along: number, lo: number, hi: number, alongLo: number, alongHi: number, text: string): LabelView => {
    if (!vertical) return { x: along, y: hi - nameBand + 15, anchor: 'middle', text, maxW: alongHi - alongLo - 14, wrap: true, down: true };
    const lines = measure(text) > nameW + 1 ? 2 : 1;
    return { x: (lo + hi) / 2, y: along + 4.5 - ((lines - 1) * G.nameLine) / 2, anchor: 'middle', text, maxW: nameW + 2, wrap: lines > 1, down: true };
  };
  const pills: PillView[] = input.rows.map((row, i) => {
    const s = sh(i);
    const tl = P(rowA[i]! - pre, corridorL + s);
    const br = P(rowA[i]! + post, stationR + s);
    return {
      rowId: row.id,
      x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y),
      w: Math.abs(br.x - tl.x), h: Math.abs(br.y - tl.y),
      target: row.target,
      label: nameLabel(rowA[i]!, corridorL + s, stationR + s, rowA[i]! - pre, rowA[i]! + post, row.target.text),
      markers: markersByRow.get(i) ?? []
    };
  });

  /* Gates: a heavy capsule across the lines they check, at least a station wide, name inside. */
  const gates: GateView[] = [];
  for (const [g, list] of gaps) {
    for (const e of list) {
      if (e.type !== 'gate') continue;
      const cs = e.gate.lineIds.filter((id) => lineById.has(id)).map((id) => laneC(id));
      const pos = entryPos(e, g);
      const lo = Math.min(corridorL, ...cs.map((c) => c - 15)) + pos.c;
      const hi = Math.max(stationR, ...cs.map((c) => c + 15)) + pos.c;
      const gh = vertical ? 12 : e.size / 2 - 6;
      const tl = P(pos.a - gh, lo);
      const br = P(pos.a + gh, hi);
      gates.push({
        id: e.gate.id,
        x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y), w: Math.abs(br.x - tl.x), h: Math.abs(br.y - tl.y),
        target: e.gate.target,
        label: vertical
          ? { x: (lo + hi) / 2, y: pos.a + 4.5, anchor: 'middle', text: e.gate.target.text, maxW: hi - lo - 32, wrap: false }
          : nameLabel(pos.a, lo, hi, pos.a - gh, pos.a + gh, e.gate.target.text)
      });
    }
  }

  /* Header badges. */
  const header: HeaderView[] = input.lines.map((line) => {
    const c = laneC(line.id) + (railSide.has(line.id) ? sh(0) : sh(0));
    const pt = vertical ? { x: c, y: a0 - 20 } : { x: a0 - 12, y: c };
    return { lineId: line.id, x: pt.x, y: pt.y, short: line.short, name: line.name, colour: line.colour, mode: line.mode };
  });
  // Neighbouring trunk columns are closer than a badge: lift every other one.
  if (vertical) {
    let prev: HeaderView | undefined;
    for (const h of [...header].sort((x, y) => x.x - y.x)) {
      if (prev && h.x - prev.x < 36 && prev.y === a0 - 20) h.y -= 20;
      prev = h;
    }
  }

  /* Week bands. */
  const bands: BandView[] = bandsAlong.map((b, i) => {
    const tl = P(b.start, 0);
    const br = P(b.end, acrossEnd);
    return {
      x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y), w: Math.abs(br.x - tl.x), h: Math.abs(br.y - tl.y),
      label: b.label,
      labelX: vertical ? 8 : b.start + 8,
      labelY: vertical ? b.start + 16 : acrossEnd - 10,
      shade: i % 2 === 0
    };
  });

  /* Terminus: every line ends here. */
  const allC = input.lines.map((l) => laneC(l.id));
  const tLo = Math.min(corridorL, ...allC) - 16;
  const tHi = Math.max(stationR, ...allC) + 16;
  const ttl = P(termA - G.termHalf, tLo);
  const tbr = P(termA + G.termHalf, tHi);
  const terminus: TerminusView = {
    x: Math.min(ttl.x, tbr.x), y: Math.min(ttl.y, tbr.y), w: Math.abs(tbr.x - ttl.x), h: Math.abs(tbr.y - ttl.y),
    target: input.terminus, detail: input.terminus.detail, when: input.terminus.when
  };

  /* Class-now dot on the trunk. */
  let now: NetLayout['now'];
  if (input.now && rowCount) {
    const r = Math.max(0, Math.min(rowCount - 1, input.now.row));
    const from = rowA[r]!;
    const to = rowA[r + 1] !== undefined ? rowA[r + 1]! - pre + half : termTop;
    // Just past the unit's station, moving toward the next as the unit goes on.
    const clear = post + 12;
    const along = from + clear + Math.max(0, Math.min(1, input.now.frac)) * Math.max(0, to - from - 2 * clear);
    const mid = (corridorL + corridorR) / 2 + sh(r);
    const pt = P(along, mid);
    now = {
      x: pt.x, y: pt.y,
      label: vertical
        ? { x: stationR + sh(r) + 10, y: pt.y + 4.5, anchor: 'start', text: input.now.label, maxW: 140, wrap: false }
        : { x: pt.x + 12, y: pt.y - 12, anchor: 'start', text: input.now.label, maxW: 120, wrap: false }
    };
  }

  // Draw order: metro under light rail under trains.
  const rank: Record<NetworkLineMode, number> = { metro: 0, light_rail: 1, train: 2 };
  paths.sort((x, y) => rank[x.mode] - rank[y.mode]);

  return {
    orientation,
    width: vertical ? acrossEnd : alongEnd,
    height: vertical ? alongEnd : acrossEnd,
    rowKind: unit ? 'unit' : 'lesson',
    paths, pills, dots, gates, header, bands, terminus, now
  };
}

function sharedLines(x: NetRow, y: NetRow): number {
  let n = 0;
  for (const id of x.stops.keys()) if (y.stops.has(id)) n++;
  return n;
}

/** Nudges whose stop, gate or unit is gone are dropped on the next save. */
export function liveNudges(nudges: Readonly<Record<string, NetNudge>>, ids: Iterable<string>): Record<string, NetNudge> {
  const keep = new Set(ids);
  const out: Record<string, NetNudge> = {};
  for (const [key, value] of Object.entries(nudges)) {
    if (keep.has(key) && (value.dx || value.dy)) out[key] = { dx: Math.round(value.dx), dy: Math.round(value.dy) };
  }
  return out;
}
