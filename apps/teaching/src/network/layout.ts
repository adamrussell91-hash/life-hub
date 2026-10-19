import type { NetworkLineMode } from '@/schemas/block';

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
export type NetRailStop = { id: string; lineId: string; afterRow: number; kind: NetStopKind; target: NetTarget };
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
};

export type Orientation = 'vertical' | 'horizontal';
export type Pt = { x: number; y: number };
export type Anchor = 'start' | 'middle' | 'end';
export type LabelView = { x: number; y: number; anchor: Anchor; text: string; maxW: number; wrap: boolean };
export type PathView = { lineId: string; mode: NetworkLineMode; colour: string; points: Pt[]; style: 'main' | 'spur' | 'loop' };
export type MarkerView = { lineId: string; colour: string; x: number; y: number; level: NetLevel; mode: NetworkLineMode };
export type PillView = { rowId: string; x: number; y: number; w: number; h: number; target: NetTarget; label: LabelView; markers: MarkerView[]; rule: { x1: number; y1: number; x2: number; y2: number } };
export type DotView = { id: string; lineId: string; colour: string; x: number; y: number; kind: NetStopKind; target: NetTarget; label: LabelView };
export type GateView = { id: string; x: number; y: number; w: number; h: number; target: NetTarget; label: LabelView };
export type HeaderView = { lineId: string; x: number; y: number; short: string; name: string; colour: string; mode: NetworkLineMode };
export type BandView = { x: number; y: number; w: number; h: number; label: string; labelX: number; labelY: number; shade: boolean };
export type TerminusView = { x: number; y: number; w: number; h: number; target: NetTarget; detail?: string; when?: string };
export type NetLayout = {
  orientation: Orientation;
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
  trunkStep: 34,
  trunkPad: 17,
  detourGap: 12,
  detourStep: 14,
  lrGap: 24,
  lrStep: 26,
  pillHalf: 14,
  unitPillHalf: 18,
  termHalf: 24,
  zig: 46,
  gutter: 176,
  sideLabel: 150,
  titleBand: 52,
  bottomLabel: 46,
  headV: 50,
  headH: 74,
  pitchV: 66,
  pitchH: 132,
  unitPitchV: 92,
  unitPitchH: 156,
  bandHead: 24
} as const;

const ENTRY_SIZE: Record<Orientation, Record<NetStopKind | 'gate', number>> = {
  vertical: { stop: 30, extension: 34, support: 54, gate: 36 },
  horizontal: { stop: 64, extension: 64, support: 84, gate: 72 }
};

/* ── Octilinear connection ─────────────────────────────────────────── */

/** A waypoint in along/across space. `near` points want the 45° bend next to them. */
type Way = { a: number; c: number; near?: boolean };

/**
 * Joins two waypoints with straight runs and one 45° diagonal. The diagonal
 * sits next to a `near` point (a station edge or a detour), otherwise in the
 * middle of the run. Returns the points after `p`, ending with `q`.
 */
export function connect(p: Way, q: Way): Way[] {
  const da = q.a - p.a;
  const dc = q.c - p.c;
  if (dc === 0 || da <= 0) return [q];
  const d = Math.abs(dc);
  const sign = Math.sign(dc);
  if (da >= d) {
    if (q.near && !p.near) return [{ a: q.a - d, c: p.c }, q];
    if (p.near && !q.near) return [{ a: p.a + d, c: q.c }, q];
    const m = (da - d) / 2;
    return m > 0 ? [{ a: p.a + m, c: p.c }, { a: p.a + m + d, c: q.c }, q] : [q];
  }
  // Not enough room along: the diagonal takes what there is, the rest runs across.
  if (q.near) return [{ a: p.a, c: q.c - sign * da }, q];
  return [{ a: q.a, c: p.c + sign * da }, q];
}

function route(ways: Way[]): Way[] {
  if (!ways.length) return [];
  const out: Way[] = [ways[0]!];
  for (let i = 1; i < ways.length; i++) out.push(...connect(out[out.length - 1]!, ways[i]!));
  return out;
}

/* ── Layout ────────────────────────────────────────────────────────── */

type Entry =
  | { type: 'stop'; stop: NetRailStop; size: number; a: number }
  | { type: 'gate'; gate: NetGate; size: number; a: number };

/** The width a vertical map needs; narrower containers get the horizontal map. */
export function verticalWidth(input: NetInput): number {
  return layoutNetwork(input, 'vertical').width;
}

export function chooseNetworkOrientation(width: number, input: NetInput): Orientation {
  return width >= verticalWidth(input) ? 'vertical' : 'horizontal';
}

/** Zigzag offsets for the year network's trunk: 0, +1, +1, 0, -1, -1, … */
const ZIG = [0, 1, 1, 0, -1, -1];

export function layoutNetwork(input: NetInput, orientation: Orientation): NetLayout {
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

  /* Across: [titles][left light rail][train detours][corridor][right light rail][labels] */
  const zig = unit ? G.zig : 0;
  const c0 = (vertical ? G.gutter : G.titleBand) + zig;
  const railSide = new Map<string, { side: 1 | -1; k: number }>();
  let nl = 0, nr = 0;
  rails.forEach((line, i) => {
    if (i % 2 === 0) railSide.set(line.id, { side: 1, k: nr++ });
    else railSide.set(line.id, { side: -1, k: nl++ });
  });
  let cur = c0 + 14;
  const leftLane: number[] = [];
  for (let k = nl - 1; k >= 0; k--) { leftLane[k] = cur; cur += G.lrStep; }
  if (nl) cur += G.lrGap - G.lrStep + 10;
  const detour: number[] = [];
  trains.forEach((_, ti) => { detour[ti] = cur; cur += G.detourStep; });
  if (trains.length) cur += G.detourGap - G.detourStep + 4;
  const corridorL = cur;
  const colC = new Map<string, number>();
  trunk.forEach((line, j) => colC.set(line.id, corridorL + G.trunkPad + j * G.trunkStep));
  const corridorR = corridorL + 2 * G.trunkPad + Math.max(0, trunk.length - 1) * G.trunkStep;
  const rightLane: number[] = [];
  for (let k = 0; k < nr; k++) rightLane[k] = corridorR + G.lrGap + k * G.lrStep;
  const laneC = (lineId: string): number => {
    const side = railSide.get(lineId);
    if (!side) return colC.get(lineId) ?? (corridorL + corridorR) / 2;
    return side.side > 0 ? rightLane[side.k]! : leftLane[side.k]!;
  };
  const outerC = Math.max(corridorR, ...rightLane);
  const acrossEnd = outerC + zig + (vertical ? G.sideLabel : G.bottomLabel);
  const maxRailDx = Math.max(0, ...rails.map((l) => Math.abs(laneC(l.id) - (railSide.get(l.id)!.side > 0 ? corridorR : corridorL))));
  const maxTrainDx = Math.max(0, ...trains.map((l, ti) => colC.get(l.id)! - detour[ti]!));

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
  const half = unit ? G.unitPillHalf : G.pillHalf;
  const basePitch = unit ? (vertical ? G.unitPitchV : G.unitPitchH) : (vertical ? G.pitchV : G.pitchH);
  const minPitch = Math.max(basePitch, maxTrainDx + half + 10, 2 * half + 24, unit ? 2 * zig + 2 * half : 0);
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
    let next = a + half + (i === 0 ? 8 : 0);
    if (prev !== undefined) {
      // Units that share more lines sit closer together.
      const shared = unit ? sharedLines(input.rows[i - 1]!, row) : 0;
      next = Math.max(next, prev + Math.max(minPitch - shared * 8, 2 * half + 30, unit ? 2 * zig + half : 0));
    }
    const n = nudge(row.id);
    rowA[i] = next + (unit ? n.dy : 0);
    shift[i] = (unit ? ZIG[i % ZIG.length]! * zig + n.dx : 0);
    a = next + half;
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

  trains.forEach((line, ti) => {
    const col = colC.get(line.id)!;
    const ways: Way[] = [{ a: aStart - 8, c: col + sh(0) }];
    input.rows.forEach((row, i) => {
      if (row.stops.has(line.id)) {
        ways.push({ a: rowA[i]!, c: col + sh(i) });
        pushMarker(i, line, row.stops.get(line.id) ?? null);
      } else {
        const dc = detour[ti]! + sh(i);
        ways.push({ a: rowA[i]! - half - 5, c: dc, near: true }, { a: rowA[i]! + half + 5, c: dc, near: true });
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
    const edge = side > 0 ? corridorR - 4 : corridorL + 4;
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
    input.rows.forEach((row, i) => {
      if (row.stops.has(line.id)) {
        startAt(rowA[i]! - half - Math.abs(lane - edge) - 10);
        ways.push({ a: rowA[i]! - 9 + k * 6, c: edge + sh(i), near: true }, { a: rowA[i]! + 9 - k * 6, c: edge + sh(i), near: true });
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

  /* Pills and their labels. */
  const titleLabel = (along: number, text: string): LabelView => vertical
    ? { x: c0 - zig - 10, y: along + 4.5, anchor: 'end', text, maxW: G.gutter - 18, wrap: false }
    : { x: along, y: G.titleBand - 10, anchor: 'middle', text, maxW: basePitch - 12, wrap: true };
  const pills: PillView[] = input.rows.map((row, i) => {
    const s = sh(i);
    const tl = P(rowA[i]! - half, corridorL + s);
    const br = P(rowA[i]! + half, corridorR + s);
    const ruleFrom = P(rowA[i]!, vertical ? c0 - zig - 4 : G.titleBand - 4);
    const ruleTo = P(rowA[i]!, corridorL + s);
    return {
      rowId: row.id,
      x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y),
      w: Math.abs(br.x - tl.x), h: Math.abs(br.y - tl.y),
      target: row.target,
      label: titleLabel(rowA[i]!, row.target.text),
      markers: markersByRow.get(i) ?? [],
      rule: { x1: ruleFrom.x, y1: ruleFrom.y, x2: ruleTo.x, y2: ruleTo.y }
    };
  });

  /* Gates: a heavy capsule across the lines they check. */
  const gates: GateView[] = [];
  for (const [g, list] of gaps) {
    for (const e of list) {
      if (e.type !== 'gate') continue;
      const cs = e.gate.lineIds.filter((id) => lineById.has(id)).map((id) => laneC(id));
      const pos = entryPos(e, g);
      const lo = (cs.length ? Math.min(...cs) : corridorL + G.trunkPad) - 15 + pos.c;
      const hi = (cs.length ? Math.max(...cs) : corridorR - G.trunkPad) + 15 + pos.c;
      const tl = P(pos.a - 12, lo);
      const br = P(pos.a + 12, hi);
      gates.push({
        id: e.gate.id,
        x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y), w: Math.abs(br.x - tl.x), h: Math.abs(br.y - tl.y),
        target: e.gate.target,
        label: titleLabel(pos.a, e.gate.target.text)
      });
    }
  }

  /* Header badges. */
  const header: HeaderView[] = input.lines.map((line) => {
    const c = laneC(line.id) + (railSide.has(line.id) ? sh(0) : sh(0));
    const pt = vertical ? { x: c, y: a0 - 20 } : { x: a0 - 12, y: c };
    return { lineId: line.id, x: pt.x, y: pt.y, short: line.short, name: line.name, colour: line.colour, mode: line.mode };
  });

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
  const tHi = Math.max(corridorR, ...allC) + 16;
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
    const to = rowA[r + 1] ?? termTop;
    const along = from + Math.max(0, Math.min(1, input.now.frac)) * (to - from);
    const mid = (corridorL + corridorR) / 2 + sh(r);
    const pt = P(along, mid);
    now = {
      x: pt.x, y: pt.y,
      label: vertical
        ? { x: corridorR + sh(r) + 10, y: pt.y + 4.5, anchor: 'start', text: input.now.label, maxW: 140, wrap: false }
        : { x: pt.x, y: pt.y - 26, anchor: 'middle', text: input.now.label, maxW: 120, wrap: false }
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
