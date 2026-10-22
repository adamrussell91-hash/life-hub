import type { NetworkLineMode } from '@/schemas/block';
import type {
  BandView,
  DotView,
  GateView,
  HeaderView,
  LabelView,
  LayoutOptions,
  MarkerView,
  NetGate,
  NetInput,
  NetLayout,
  NetRailStop,
  PathView,
  PillView,
  Pt,
  TerminusView
} from './layout';
import type { FlowSeq } from './flow';
import { route, type Way } from './route';

/**
 * The unit map, drawn like the Sydney and London maps: every line runs in one
 * tight bundle and lesson names sit beside their stations. Vertical only; the
 * year network keeps the corridor layout.
 *
 * - A station is one capsule across the lines that stop there, with depth
 *   dots inside. Before a station the lines swap lanes so the ones that stop
 *   sit together; a line that skips it moves to the nearer edge.
 * - Light rail waits in an outside lane, joins the bundle at a stop and
 *   leaves when it has no more stops ahead.
 * - Where a lesson offers a choice the bundle splits, Camden Town style: each
 *   branch carries the lines that stop on it, a line that serves two branches
 *   runs down both, an empty branch is the straight track past, and the
 *   branches rejoin where the flow does.
 * - A support stop is a fork off its skill line: one track through the stop,
 *   the straight one past it for students who may skip it.
 * - Names sit right of the bundle; the left branch of a split, and stops on
 *   left-hand light rail, are named on the left; a middle branch is named in
 *   the gap beside it.
 */

export const BUNDLE = {
  pitch: 18,
  half: 11,
  capPad: 10,
  /** Room between the branches of a split. */
  split: 46,
  gutter: 16,
  gutterBands: 64,
  labelGap: 18,
  nameMax: 300,
  nameMin: 130,
  sideMax: 170,
  nameLine: 15,
  rowMin: 50,
  chipH: 18,
  chipGap: 6,
  bandHead: 24,
  termHalf: 18,
  termHalfDetail: 24,
  entry: { stop: 30, extension: 34, support: 52, gate: 34 }
} as const;

/** Before a station: the stopping lines close up, the others move to the nearer edge (ties go right). */
export function gatherStops(order: readonly string[], stops: (id: string) => boolean): string[] {
  const first = order.findIndex(stops);
  if (first < 0) return [...order];
  let last = order.length - 1;
  while (!stops(order[last]!)) last--;
  const inner = order.slice(first, last + 1);
  const total = inner.filter(stops).length;
  const left: string[] = [];
  const keep: string[] = [];
  const right: string[] = [];
  let seen = 0;
  for (const id of inner) {
    if (stops(id)) { keep.push(id); seen++; }
    else (seen < total - seen ? left : right).push(id);
  }
  return [...order.slice(0, first), ...left, ...keep, ...right, ...order.slice(last + 1)];
}

/* ── The flow as row indices ───────────────────────────────────────── */

type Item = { r: number } | { split: Seq[] };
type Seq = Item[];

function toSeq(input: NetInput): Seq {
  const index = new Map(input.rows.map((row, i) => [row.id, i]));
  const conv = (seq: FlowSeq): Seq => seq.flatMap((item): Item[] => {
    if ('row' in item) return index.has(item.row) ? [{ r: index.get(item.row)! }] : [];
    return [{ split: item.split.map(conv) }];
  });
  const placed = input.flow ? conv(input.flow) : [];
  const seen = new Set<number>();
  const mark = (seq: Seq) => seq.forEach((item) => ('r' in item ? seen.add(item.r) : item.split.forEach(mark)));
  mark(placed);
  // Rows the flow does not know (or no flow at all) follow in order.
  input.rows.forEach((_, i) => { if (!seen.has(i)) placed.push({ r: i }); });
  return placed;
}

function rowsIn(seq: Seq): number[] {
  return seq.flatMap((item) => ('r' in item ? [item.r] : item.split.flatMap(rowsIn)));
}

/* ── Across ────────────────────────────────────────────────────────── */

type LabelSide = 'right' | 'left' | 'gap';
type RowRec = { order: string[]; xs: Map<string, number>; side: LabelSide; /** Light rail that heads back to its lane after this row. */ leaving: string[] };
type SplitRec = {
  /** Positions of the lines as they enter. */
  enter: Map<string, number>;
  /** Per branch: the lines it carries, and where they run on an empty branch. */
  lines: string[][];
  bypass: Array<Map<string, number> | null>;
  /** Positions as the lines leave, back in one bundle. */
  exit: Map<string, number>;
};
type Across = {
  rows: Map<number, RowRec>;
  splits: Map<Item, SplitRec>;
  lo: number;
  hi: number;
};

type Ctx = {
  input: NetInput;
  side: Map<string, 1 | -1>;
  /** Light rail with a row stop anywhere in a sequence. */
  stopsIn: (seq: Seq) => Set<string>;
  gapLabelW: number;
};

/** Slot positions for an order: left-hand light rail sits left of slot 0. */
function slots(order: readonly string[], base: number, side: Map<string, 1 | -1>): Map<string, number> {
  const leftIn = order.filter((id) => side.get(id) === -1).length;
  return new Map(order.map((id, k) => [id, base + (k - leftIn) * BUNDLE.pitch]));
}

function shiftRec(rec: Across, dx: number): void {
  for (const r of rec.rows.values()) for (const [id, x] of r.xs) r.xs.set(id, x + dx);
  for (const s of rec.splits.values()) {
    for (const m of [s.enter, s.exit, ...s.bypass]) if (m) for (const [id, x] of m) m.set(id, x + dx);
  }
  rec.lo += dx;
  rec.hi += dx;
}

/**
 * Lays a sequence out across, starting from `order` (the lines in the bundle
 * as it enters) at `base`. Returns the records and the order it leaves with.
 */
function layAcross(ctx: Ctx, seq: Seq, entering: string[], base: number, ahead: Set<string>, edge: { left: boolean; right: boolean }): { rec: Across; exit: string[] } {
  const { input, side } = ctx;
  const P = BUNDLE.pitch;
  const rec: Across = { rows: new Map(), splits: new Map(), lo: Infinity, hi: -Infinity };
  const extend = (xs: Iterable<number>) => { for (const x of xs) { rec.lo = Math.min(rec.lo, x); rec.hi = Math.max(rec.hi, x); } };
  let order = [...entering];
  extend(slots(order, base, side).values());
  seq.forEach((item, i) => {
    const later = new Set([...ctx.stopsIn(seq.slice(i + 1)), ...ahead]);
    if ('r' in item) {
      const row = input.rows[item.r]!;
      for (const [id] of row.stops) {
        if (!side.has(id) || order.includes(id)) continue;
        order = side.get(id)! < 0 ? [id, ...order] : [...order, id];
      }
      order = gatherStops(order, (id) => row.stops.has(id));
      const xs = slots(order, base, side);
      extend(xs.values());
      // Light rail with nothing more ahead leaves for its lane.
      const leaving = order.filter((id) => side.has(id) && !later.has(id));
      rec.rows.set(item.r, { order, xs, side: edge.right ? 'right' : edge.left ? 'left' : 'gap', leaving });
      order = order.filter((id) => !leaving.includes(id));
      return;
    }
    const k = item.split.length;
    const enter = slots(order, base, side);
    const branchLines: string[][] = item.split.map(() => []);
    const stopIn = item.split.map((b) => ctx.stopsIn(b));
    const empty = item.split.findIndex((b) => !b.length);
    order.forEach((id, j) => {
      const on = item.split.map((_, b) => b).filter((b) => stopIn[b]!.has(id) || rowsIn(item.split[b]!).some((r) => input.rows[r]!.stops.has(id)));
      const take = on.length ? on : [empty >= 0 ? empty : j < order.length / 2 ? 0 : k - 1];
      for (const b of take) branchLines[b]!.push(id);
    });
    // Branches sit in the order their lines come in, so lines cross as little as possible.
    const mean = (b: number) => {
      const at = branchLines[b]!.map((id) => order.indexOf(id)).filter((j) => j >= 0);
      return at.length ? at.reduce((s, j) => s + j, 0) / at.length : order.length / 2;
    };
    const place = item.split.map((_, b) => b).sort((x, y) => mean(x) - mean(y) || x - y);
    const pos = new Map(place.map((b, p) => [b, p]));
    // Lay each branch out on its own, then side by side, centred on the bundle.
    const laid = item.split.map((branch, b) => {
      const p = pos.get(b)!;
      const sub = layAcross(ctx, branch, branchLines[b]!, 0, later, { left: edge.left && p === 0, right: edge.right && p === k - 1 });
      if (!branch.length) {
        const xs = slots(branchLines[b]!, 0, side);
        sub.rec.lo = Math.min(0, ...xs.values());
        sub.rec.hi = Math.max(0, ...xs.values());
      }
      if (!Number.isFinite(sub.rec.lo)) { sub.rec.lo = 0; sub.rec.hi = 0; }
      return sub;
    });
    // The gap right of a branch is wider when that branch's names sit in it.
    const gapAfter = (b: number) => {
      const labelled = rowsIn(item.split[b]!).some((r) => laid[b]!.rec.rows.get(r)?.side === 'gap');
      return BUNDLE.split + (labelled ? ctx.gapLabelW + 12 : 0);
    };
    const widths = laid.map((l) => l.rec.hi - l.rec.lo);
    const total = place.reduce((s, b, p) => s + widths[b]! + (p < k - 1 ? gapAfter(b) : 0), 0);
    const enterXs = [...enter.values()];
    const mid = enterXs.length ? (Math.min(...enterXs) + Math.max(...enterXs)) / 2 : base;
    let cursor = mid - total / 2;
    const bypass: Array<Map<string, number> | null> = item.split.map(() => null);
    place.forEach((b, p) => {
      const l = laid[b]!;
      const dx = cursor - l.rec.lo;
      shiftRec(l.rec, dx);
      for (const [r, v] of l.rec.rows) rec.rows.set(r, v);
      for (const [s, v] of l.rec.splits) rec.splits.set(s, v);
      if (!item.split[b]!.length) bypass[b] = slots(branchLines[b]!, dx, side);
      extend([l.rec.lo, l.rec.hi]);
      cursor += widths[b]! + (p < k - 1 ? gapAfter(b) : 0);
    });
    // Back to one bundle: the lines that came in, plus light rail that joined on a branch and has more ahead.
    const joined = laid.flatMap((l) => l.exit).filter((id) => !order.includes(id));
    order = [...order, ...new Set(joined)].filter((id) => !side.has(id) || later.has(id));
    const exit = slots(order, base, side);
    extend(exit.values());
    rec.splits.set(item, { enter, lines: branchLines, bypass, exit });
  });
  return { rec, exit: order };
}

/* ── Layout ────────────────────────────────────────────────────────── */

type Entry =
  | { type: 'stop'; stop: NetRailStop; size: number; a: number }
  | { type: 'gate'; gate: NetGate; size: number; a: number };

function chipWidth(short: string): number {
  return Math.max(22, short.length * 7 + 8);
}

function gutterOf(input: NetInput): number {
  return input.rows.some((r) => r.band) ? BUNDLE.gutterBands : BUNDLE.gutter;
}

function prepare(input: NetInput, measure: (t: string) => number) {
  const P = BUNDLE.pitch;
  const seq = toSeq(input);
  const trunk = input.lines.filter((l) => l.mode !== 'light_rail');
  const rails = input.lines.filter((l) => l.mode === 'light_rail');
  const side = new Map<string, 1 | -1>();
  const laneK = new Map<string, number>();
  let nl = 0;
  let nr = 0;
  rails.forEach((line, i) => {
    if (i % 2 === 0) { side.set(line.id, 1); laneK.set(line.id, nr++); }
    else { side.set(line.id, -1); laneK.set(line.id, nl++); }
  });
  const railIds = new Set(rails.map((l) => l.id));
  const stopsIn = (s: Seq) => {
    const out = new Set<string>();
    for (const r of rowsIn(s)) for (const id of input.rows[r]!.stops.keys()) if (railIds.has(id)) out.add(id);
    return out;
  };
  // Middle branches are named in the gap beside them: a first pass finds which rows those are.
  const ctx: Ctx = { input, side, stopsIn, gapLabelW: 0 };
  const dry = layAcross(ctx, seq, trunk.map((l) => l.id), 0, new Set(), { left: true, right: true }).rec;
  const gapTexts = [...dry.rows.entries()].filter(([, v]) => v.side === 'gap').map(([r]) => input.rows[r]!.target.text);
  const gapLabelW = gapTexts.length ? Math.min(BUNDLE.sideMax, Math.max(...gapTexts.map(measure))) : 0;
  ctx.gapLabelW = gapLabelW;
  const { rec } = layAcross(ctx, seq, trunk.map((l) => l.id), 0, new Set(), { left: true, right: true });
  if (!Number.isFinite(rec.lo)) { rec.lo = 0; rec.hi = 0; }
  const lane = (id: string) => {
    const k = laneK.get(id)!;
    return side.get(id)! < 0 ? rec.lo - (k + 1) * P - 6 : rec.hi + (k + 1) * P + 6;
  };
  const railStops = input.railStops.filter((s) => input.lines.some((l) => l.id === s.lineId));
  const branchOut = (sd: 1 | -1) => (railStops.some((s) => side.get(s.lineId) === sd && s.kind !== 'stop') ? P + 6 : 0);
  const minX = Math.min(rec.lo, ...rails.filter((l) => side.get(l.id) === -1).map((l) => lane(l.id))) - branchOut(-1) - BUNDLE.capPad;
  const maxX = Math.max(rec.hi, ...rails.filter((l) => side.get(l.id) === 1).map((l) => lane(l.id))) + branchOut(1) + BUNDLE.capPad;
  const leftTexts = [
    ...[...rec.rows.entries()].filter(([, v]) => v.side === 'left').map(([r]) => input.rows[r]!.target.text),
    ...railStops.filter((s) => side.get(s.lineId) === -1).map((s) => s.target.text)
  ];
  const leftW = leftTexts.length ? Math.min(BUNDLE.sideMax, Math.max(...leftTexts.map(measure))) + BUNDLE.labelGap : 0;
  return { seq, trunk, rails, side, rec, lane, railStops, minX, maxX, leftW, gapLabelW };
}

/** The narrowest a vertical unit map can be: names wrap to two lines from here. */
export function bundleMinWidth(input: NetInput, options: LayoutOptions = {}): number {
  const measure = options.measure ?? ((t: string) => t.length * 7);
  const A = prepare(input, measure);
  const right = Math.max(0, ...input.rows.map((r) => measure(r.target.text)));
  return gutterOf(input) + A.leftW + (A.maxX - A.minX) + BUNDLE.labelGap + Math.min(right, BUNDLE.nameMin) + 12;
}

export function layoutBundle(input: NetInput, options: LayoutOptions = {}): NetLayout {
  const G = BUNDLE;
  const P = G.pitch;
  const measure = options.measure ?? ((t: string) => t.length * 7);
  const A = prepare(input, measure);
  const { seq, side, rec, lane } = A;
  const nudge = (key: string) => input.nudges[key] ?? { dx: 0, dy: 0 };
  const lineById = new Map(input.lines.map((l) => [l.id, l]));
  const rowCount = input.rows.length;

  /* Across: [gutter][left names][bundle][right names]. Spare room centres the map. */
  const gutter = gutterOf(input);
  const rightTexts = [...rec.rows.entries()].filter(([, v]) => v.side === 'right').map(([r]) => input.rows[r]!.target.text);
  const rightLongest = Math.max(0, ...rightTexts.map(measure), ...A.railStops.map((s) => measure(s.target.text) * 0.92), ...input.gates.map((g) => measure(g.target.text)));
  const bundleW = A.maxX - A.minX;
  const before = gutter + A.leftW;
  const natural = before + bundleW + G.labelGap + Math.min(rightLongest, G.nameMax) + 12;
  const room = options.width ?? natural;
  const nameW = Math.max(Math.min(rightLongest, G.nameMin), Math.min(rightLongest, G.nameMax, room - before - bundleW - G.labelGap - 12));
  const used = before + bundleW + G.labelGap + nameW + 12;
  const centre = room > used ? Math.floor((room - used) / 2) : 0;
  const x0 = centre + before - A.minX;
  const leftX = centre + before - G.labelGap + 4;
  const rightX = x0 + A.maxX + G.labelGap;
  const width = Math.max(room, used);
  const sideW = Math.max(60, A.leftW - G.labelGap);
  const gapW = Math.max(60, A.gapLabelW);
  const linesOf = (text: string, maxW: number) => (measure(text) > maxW + 1 ? 2 : 1);

  /* Header: the line chips, wrapped to the width. */
  const header: HeaderView[] = [];
  let hx = centre + gutter;
  let hy = 22;
  for (const line of input.lines) {
    const w = chipWidth(line.short);
    if (hx + w > width - 8 && hx > centre + gutter) { hx = centre + gutter; hy += G.chipH + 8; }
    header.push({ lineId: line.id, x: hx + w / 2, y: hy, short: line.short, name: line.name, colour: line.colour, mode: line.mode });
    hx += w + G.chipGap;
  }
  const aStart = hy + 34;

  /* Positions, in page x, with a station's drag applied. */
  const rowX = (r: number, id: string): number | undefined => {
    const x = rec.rows.get(r)?.xs.get(id);
    return x === undefined ? undefined : x0 + x + nudge(input.rows[r]!.id).dx;
  };
  const laneX = (id: string) => x0 + lane(id);
  const mapX = (m: Map<string, number> | null | undefined, id: string) => {
    const x = m?.get(id);
    return x === undefined ? undefined : x0 + x;
  };
  const labelLines = (r: number) => {
    const s = rec.rows.get(r)?.side ?? 'right';
    return linesOf(input.rows[r]!.target.text, s === 'left' ? sideW : s === 'gap' ? gapW : nameW);
  };

  /* Gaps: stops in line order, then gates, after each row. */
  const gaps = new Map<number, Entry[]>();
  const lineOrder = new Map(input.lines.map((l, i) => [l.id, i]));
  const clampRow = (r: number) => Math.max(-1, Math.min(rowCount - 1, r));
  for (const stop of A.railStops) {
    const g = clampRow(stop.afterRow);
    gaps.set(g, [...(gaps.get(g) ?? []), { type: 'stop', stop, size: G.entry[stop.kind], a: 0 }]);
  }
  for (const list of gaps.values()) {
    list.sort((x, y) => (x.type === 'stop' && y.type === 'stop' ? lineOrder.get(x.stop.lineId)! - lineOrder.get(y.stop.lineId)! : 0));
  }
  for (const gate of input.gates) {
    const g = clampRow(gate.afterRow);
    gaps.set(g, [...(gaps.get(g) ?? []), { type: 'gate', gate, size: G.entry.gate, a: 0 }]);
  }
  /** Where a stop in the gap after row `g` sits across: on its line if it is in the bundle there, else its lane. */
  const entryC = (e: Entry, g: number): number => {
    if (e.type === 'gate') return x0;
    const id = e.stop.lineId;
    const at = g >= 0 ? rowX(g, id) : undefined;
    if (at !== undefined && (!side.has(id) || rec.rows.get(g)!.order.includes(id))) return at;
    if (!side.has(id)) return g >= 0 ? (rowX(g, id) ?? x0) : (rowX(rowsIn(seq)[0] ?? 0, id) ?? x0);
    return laneX(id);
  };

  /* Along. */
  const rowA = new Map<number, number>();
  const halfOf = (r: number) => Math.max(G.half, (labelLines(r) * G.nameLine) / 2 + 4);
  const gapEnd = new Map<number, number>();
  const splitA = new Map<Item, { start: number; end: number; inA: number; outA: number }>();
  const bandsAlong: Array<{ start: number; end: number; label: string }> = [];
  let band: string | undefined;
  const shiftBetween = (from: Map<string, number> | undefined, to: Map<string, number> | undefined) => {
    let d = 0;
    if (!from || !to) return d;
    for (const [id, x] of to) {
      const y = from.get(id) ?? (side.has(id) ? lane(id) : undefined);
      if (y !== undefined) d = Math.max(d, Math.abs(x - y));
    }
    for (const [id, y] of from) if (!to.has(id) && side.has(id)) d = Math.max(d, Math.abs(y - lane(id)));
    return d;
  };
  const placeGap = (g: number, a: number): number => {
    const list = gaps.get(g);
    if (!list?.length) return a;
    const out = Math.max(0, ...list.map((e) => {
      if (e.type !== 'stop' || g < 0) return 0;
      const here = rowX(g, e.stop.lineId);
      return here === undefined ? 0 : Math.abs(entryC(e, g) - here);
    }));
    a += Math.max(14, out + 10);
    for (const e of list) { e.a = a + e.size / 2; a += e.size; }
    gapEnd.set(g, a);
    return a + 12;
  };
  /** Places a sequence from `a`; `prev` is the last positions before it. Returns where it ends. */
  const placeSeq = (s: Seq, a: number, prevXs: Map<string, number> | undefined, prevHalf: number, prevA: number | undefined): { end: number; lastXs: Map<string, number> | undefined; lastHalf: number; lastA: number | undefined } => {
    let xsBefore = prevXs;
    let halfBefore = prevHalf;
    let aBefore = prevA;
    for (const item of s) {
      if ('r' in item) {
        const row = input.rows[item.r]!;
        if (row.band && row.band !== band) {
          if (bandsAlong.length) bandsAlong[bandsAlong.length - 1]!.end = a;
          bandsAlong.push({ start: a, end: a, label: row.band });
          a += G.bandHead;
        }
        band = row.band ?? band;
        const half = halfOf(item.r);
        const xs = rec.rows.get(item.r)!.xs;
        const d = shiftBetween(xsBefore, xs);
        let next = a + half + 6 + d;
        if (aBefore !== undefined) next = Math.max(next, aBefore + Math.max(G.rowMin, halfBefore + half + 14, 2 * G.half + d + 18));
        const n = nudge(row.id);
        rowA.set(item.r, next + n.dy);
        a = placeGap(item.r, next + half);
        xsBefore = xs;
        halfBefore = half;
        aBefore = gapEnd.has(item.r) ? undefined : next;
        continue;
      }
      const sp = rec.splits.get(item)!;
      const firstXs = (b: number): Map<string, number> => {
        const rows = rowsIn(item.split[b]!);
        return rows.length ? rec.rows.get(rows[0]!)!.xs : (sp.bypass[b] ?? new Map());
      };
      const lastXs = (b: number): Map<string, number> => {
        const rows = rowsIn(item.split[b]!);
        return rows.length ? rec.rows.get(rows.at(-1)!)!.xs : (sp.bypass[b] ?? new Map());
      };
      const dIn = Math.max(0, ...item.split.map((_, b) => shiftBetween(xsBefore ?? sp.enter, firstXs(b))));
      const dOut = Math.max(0, ...item.split.map((_, b) => shiftBetween(lastXs(b), sp.exit)));
      const start = (aBefore !== undefined ? Math.max(a, aBefore + halfBefore + 4) : a) + 4;
      const inA = start + dIn + 10;
      let end = inA + 24;
      for (const branch of item.split) {
        if (!branch.length) continue;
        const placed = placeSeq(branch, inA - 6, undefined, G.half, undefined);
        end = Math.max(end, placed.end);
      }
      const outA = end + 4;
      splitA.set(item, { start, end: outA + dOut + 10, inA, outA });
      a = outA + dOut + 14;
      xsBefore = sp.exit;
      halfBefore = G.half;
      aBefore = undefined;
    }
    return { end: a, lastXs: xsBefore, lastHalf: halfBefore, lastA: aBefore };
  };
  let a = placeGap(-1, aStart);
  const placed = placeSeq(seq, a, undefined, G.half, undefined);
  a = placed.end;
  if (bandsAlong.length) bandsAlong[bandsAlong.length - 1]!.end = a + 8;
  const t = input.terminus;
  const termHalf = t.detail ? G.termHalfDetail : G.termHalf;
  const finalXs = placed.lastXs ?? new Map();
  const termA = a + 26 + Math.max(0, ...[...finalXs.keys()].filter((id) => side.has(id)).map((id) => Math.abs(finalXs.get(id)! - lane(id)))) + termHalf;
  const termTop = termA - termHalf;
  const height = termA + termHalf + 18;
  const inA = (r: number) => rowA.get(r)! - G.half - 3;
  const outA = (r: number) => rowA.get(r)! + G.half + 3;

  /* Labels. */
  const labelAt = (x: number, anchor: 'start' | 'end', maxW: number, y: number, text: string, extra: Partial<LabelView> = {}): LabelView => {
    const lines = linesOf(text, maxW);
    return { x, y: y + 4.5 - ((lines - 1) * G.nameLine) / 2, anchor, text, maxW, wrap: lines > 1, down: true, ...extra };
  };
  const rowLabel = (r: number, extra: Partial<LabelView> = {}): LabelView => {
    const v = rec.rows.get(r)!;
    const y = rowA.get(r)!;
    const dx = nudge(input.rows[r]!.id).dx;
    if (v.side === 'left') return labelAt(leftX + dx, 'end', sideW, y, input.rows[r]!.target.text, extra);
    if (v.side === 'gap') {
      const edgeX = Math.max(...[...v.xs.values()].map((x) => x0 + x)) + G.capPad + 8 + dx;
      return labelAt(edgeX, 'start', gapW, y, input.rows[r]!.target.text, extra);
    }
    return labelAt(rightX + dx, 'start', nameW, y, input.rows[r]!.target.text, extra);
  };

  /* Paths: each line walks the flow; a split it serves twice gives it a second track. */
  type Track = { ways: Way[]; pending: Way[][] };
  const paths: PathView[] = [];
  const dots: DotView[] = [];
  const allTracks = new Map<string, Way[][]>();
  const newTrack = (id: string, ways: Way[]): Track => {
    const list = allTracks.get(id) ?? [];
    list.push(ways);
    allTracks.set(id, list);
    return { ways, pending: [] };
  };
  const push = (tr: Track, w: Way) => {
    const last = tr.ways.at(-1);
    if (last && w.a <= last.a) w = { ...w, a: last.a + 0.5 };
    tr.ways.push(w);
    for (const p of tr.pending) p.push(w);
    tr.pending = [];
  };
  const parked = new Map<string, Track>();
  const branches: PathView[] = [];

  const visitGap = (g: number, active: Map<string, Track>) => {
    for (const e of gaps.get(g) ?? []) {
      if (e.type !== 'stop') continue;
      const line = lineById.get(e.stop.lineId)!;
      const rail = side.has(line.id);
      let tr = active.get(line.id) ?? parked.get(line.id);
      const n = nudge(e.stop.id);
      const c = entryC(e, g) + n.dx;
      const at = e.a + n.dy;
      if (!tr) {
        tr = newTrack(line.id, [{ a: at - 34, c }]);
        if (rail) parked.set(line.id, tr);
      }
      const o = (side.get(line.id) ?? 1) * (P + 6);
      let dot: Pt = { x: c, y: at };
      if (e.stop.kind === 'stop' || !rail) {
        push(tr, { a: at - 12, c });
        push(tr, { a: at + 12, c });
      } else if (e.stop.kind === 'extension') {
        push(tr, { a: at - 26, c });
        push(tr, { a: at + 12, c });
        dot = { x: c + o, y: at };
        branches.push({ lineId: line.id, mode: line.mode, colour: line.colour, style: 'spur',
          points: route([{ a: at - 24, c }, { a: at - 6, c: c + o }, { a: at, c: c + o }]).map((w) => ({ x: w.c, y: w.a })) });
      } else {
        // A fork: one track through the stop, the straight one past it.
        push(tr, { a: at - 26, c });
        push(tr, { a: at + 26, c });
        dot = { x: c + o, y: at };
        branches.push({ lineId: line.id, mode: line.mode, colour: line.colour, style: 'loop',
          points: route([{ a: at - 26, c }, { a: at - 8, c: c + o }, { a: at + 8, c: c + o }, { a: at + 26, c }]).map((w) => ({ x: w.c, y: w.a })) });
      }
      const note = e.stop.skip ? `Skip: ${e.stop.skip}` : undefined;
      const extra = note ? { note } : {};
      const left = side.get(line.id) === -1;
      dots.push({ id: e.stop.id, lineId: line.id, colour: line.colour, x: dot.x, y: dot.y, kind: e.stop.kind, target: e.stop.target,
        label: left ? labelAt(leftX, 'end', sideW, dot.y, e.stop.target.text, extra) : labelAt(rightX, 'start', nameW, dot.y, e.stop.target.text, extra) });
    }
  };

  const walkLines = (s: Seq, active: Map<string, Track>) => {
    for (const item of s) {
      if ('r' in item) {
        const v = rec.rows.get(item.r)!;
        for (const id of v.order) {
          const x = rowX(item.r, id)!;
          let tr = active.get(id);
          if (!tr) {
            // Light rail joins from its lane (or wherever it was parked).
            const from = parked.get(id);
            parked.delete(id);
            // A short straight run on the lane, then the 45° bend in.
            const lead = inA(item.r) - Math.abs(x - laneX(id)) - 14;
            tr = from ?? newTrack(id, [{ a: Math.max(aStart - 14, lead - 26), c: laneX(id) }]);
            push(tr, { a: Math.max(aStart - 12, lead), c: laneX(id) });
            active.set(id, tr);
          }
          push(tr, { a: inA(item.r), c: x });
          push(tr, { a: outA(item.r), c: x });
        }
        // Lines in the bundle that the row's order does not hold (none in practice) are left alone.
        visitGap(item.r, active);
        const hold = gapEnd.get(item.r);
        for (const id of v.order) {
          const tr = active.get(id);
          if (!tr) continue;
          if (hold !== undefined && hold > tr.ways.at(-1)!.a) push(tr, { a: hold, c: tr.ways.at(-1)!.c });
          if (v.leaving.includes(id)) {
            const last = tr.ways.at(-1)!;
            push(tr, { a: last.a + Math.abs(last.c - laneX(id)) + 12, c: laneX(id) });
            parked.set(id, tr);
            active.delete(id);
          }
        }
        continue;
      }
      const sp = rec.splits.get(item)!;
      const at = splitA.get(item)!;
      const exits: Array<Map<string, Track>> = [];
      // Every branch leaves from where the line was before the split.
      const from = new Map([...active].map(([id, tr]) => [id, { ...tr.ways.at(-1)! }]));
      item.split.forEach((branch, b) => {
        const sub = new Map<string, Track>();
        for (const id of sp.lines[b]!) {
          const tr = active.get(id);
          if (!tr) continue;
          const first = sp.lines.findIndex((l) => l.includes(id)) === b;
          sub.set(id, first ? tr : newTrack(id, [from.get(id)!]));
        }
        if (!branch.length) {
          for (const [id, tr] of sub) {
            const x = mapX(sp.bypass[b], id) ?? tr.ways.at(-1)!.c;
            push(tr, { a: at.inA, c: x });
            push(tr, { a: at.outA, c: x });
          }
        } else walkLines(branch, sub);
        exits.push(sub);
      });
      // Rejoin: each line's first track carries on; the others meet it at its next point.
      const merged = new Map<string, Track>();
      for (const sub of exits) {
        for (const [id, tr] of sub) {
          const main = merged.get(id);
          if (!main) { merged.set(id, tr); continue; }
          main.pending.push(tr.ways, ...tr.pending);
        }
      }
      active.clear();
      for (const [id, tr] of merged) {
        const x = mapX(sp.exit, id);
        if (x === undefined) {
          // Light rail with nothing more ahead goes back to its lane.
          if (side.has(id)) {
            push(tr, { a: at.end, c: laneX(id) });
            parked.set(id, tr);
          }
          continue;
        }
        push(tr, { a: at.end, c: x });
        active.set(id, tr);
      }
    }
  };

  const active = new Map<string, Track>();
  const firstRow = rowsIn(seq)[0];
  for (const line of A.trunk) {
    const x = (firstRow !== undefined ? rowX(firstRow, line.id) : undefined) ?? x0;
    active.set(line.id, newTrack(line.id, [{ a: aStart - 14, c: x }]));
  }
  visitGap(-1, active);
  walkLines(seq, active);
  const endX = (id: string) => (side.has(id) ? laneX(id) : finalXs.has(id) ? x0 + finalXs.get(id)! : x0);
  for (const [id, tr] of active) push(tr, { a: termTop, c: endX(id) });
  for (const [id, tr] of parked) push(tr, { a: termTop, c: laneX(id) });

  for (const [id, list] of allTracks) {
    const line = lineById.get(id)!;
    for (const ways of list) {
      if (ways.length < 2) continue;
      paths.push({ lineId: id, mode: line.mode, colour: line.colour, style: 'main', points: route(ways).map((w) => ({ x: w.c, y: w.a })) });
    }
  }
  paths.push(...branches);

  /* Stations: one capsule over the lines that stop, names beside. */
  const pills: PillView[] = input.rows.map((row, i) => {
    const v = rec.rows.get(i)!;
    const y = rowA.get(i)!;
    const markers: MarkerView[] = v.order
      .filter((id) => row.stops.has(id))
      .map((id) => {
        const line = lineById.get(id)!;
        return { lineId: id, colour: line.colour, x: rowX(i, id)!, y, level: row.stops.get(id) ?? 'reinforced', mode: line.mode };
      });
    const span = markers.length ? markers.map((m) => m.x) : v.order.filter((id) => !side.has(id)).map((id) => rowX(i, id)!);
    const lo = (span.length ? Math.min(...span) : x0) - G.capPad;
    const hi = (span.length ? Math.max(...span) : x0) + G.capPad;
    return { rowId: row.id, x: lo, y: y - G.half, w: hi - lo, h: 2 * G.half, target: row.target, label: rowLabel(i, { bold: markers.length >= 3 }), markers };
  });

  /* Gates: a heavy bar across the lines they check, name beside. */
  const gates: GateView[] = [];
  for (const [g, list] of gaps) {
    for (const e of list) {
      if (e.type !== 'gate') continue;
      const n = nudge(e.gate.id);
      const ids = e.gate.lineIds.filter((id) => lineById.has(id));
      const from = g >= 0 ? rec.rows.get(g)?.order ?? [] : A.trunk.map((l) => l.id);
      const cs = (ids.length ? ids : from).map((id) => (g >= 0 ? rowX(g, id) : undefined) ?? (side.has(id) ? laneX(id) : x0));
      const lo = Math.min(...cs) - 12 + n.dx;
      const hi = Math.max(...cs) + 12 + n.dx;
      const y = e.a + n.dy;
      gates.push({ id: e.gate.id, x: lo, y: y - 7, w: hi - lo, h: 14, target: e.gate.target, label: labelAt(rightX, 'start', nameW, y, e.gate.target.text, { bold: true }) });
    }
  }

  /* Week bands. */
  const bands: BandView[] = bandsAlong.map((b, i) => ({
    x: 0, y: b.start, w: width, h: b.end - b.start, label: b.label, labelX: 8, labelY: b.start + 16, shade: i % 2 === 0
  }));

  /* Terminus: every line ends here. */
  const ends = [...allTracks.keys()].map(endX);
  const tLo = Math.min(x0, ...ends) - 16;
  const titleW = measure(t.text.toUpperCase()) * 1.2 + 44;
  const tHi = Math.max(Math.max(x0, ...ends) + 16, tLo + titleW, t.detail ? tLo + measure(t.detail) + 40 : 0);
  const terminus: TerminusView = { x: tLo, y: termA - termHalf, w: tHi - tLo, h: 2 * termHalf, target: t, detail: t.detail, when: t.when };

  // Draw order: metro under light rail under trains.
  const rank: Record<NetworkLineMode, number> = { metro: 0, light_rail: 1, train: 2 };
  // A line's own tracks sit together, so its casing never cuts its other branch.
  const lineRank = new Map(input.lines.map((l, i) => [l.id, i]));
  paths.sort((x, y) => rank[x.mode] - rank[y.mode] || lineRank.get(x.lineId)! - lineRank.get(y.lineId)!);

  return {
    orientation: 'vertical',
    style: 'bundle',
    width: Math.max(width, tHi + 12),
    height,
    rowKind: 'lesson',
    paths, pills, dots, gates, header, bands, terminus
  };
}
