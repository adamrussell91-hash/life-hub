// packages/problem-solver/render/solution-tree.ts
// Solution tree (toolkit, Devise): a large blue triangle for the aim at the foot, its
// point upward, and a fan of "how" triangles opening out of that point. Each how is a
// wedge whose point touches the item it serves and whose base faces outward along its
// angle: red for the first ring, yellow for the next, blue beyond, as the book draws it.
// Angles are shared out across the upper half (-160° to -20°, -150° to -30° on a phone)
// in proportion to each branch's leaves, so a busy branch gets a wider slice.
// Words: the aim's title sits inside it near the base, or just under the base when it
// will not fit. Every how carries a code (A, A1, A2…, as in the radial tree) inside its
// triangle, or just outside when the triangle is too small to hold it. On a wide panel a
// how's title sits beside its triangle where it covers nothing and clearly reads as that
// triangle's; any other title is a tip on hover, focus or while open, and the key under
// the chart lists it. On a narrow panel every title moves to the key.
// A how exists only once accepted; a new one grows out of its parent's outer edge (the
// aim's point for the first ring), and triangles that move because of it glide.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { childrenOf, levels } from '../tools/hierarchy.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type SolutionTreeView = { el: HTMLDivElement; update(run: PsToolRun): void; layout(width: number): void };

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Tri = [Point, Point, Point];
/** A triangle in chart units: its point (x, y), the angle it opens along (deg), its length and base half-width. */
type Geo = { x: number; y: number; a: number; len: number; hw: number };

const SVG = 'http://www.w3.org/2000/svg';
/** Container width (px) from which titles may sit beside their triangles. Matches the @container query. */
const WIDE = 560;
const FAN_WIDE: [number, number] = [-160, -20];
const FAN_PHONE: [number, number] = [-150, -30];
/** The aim, in chart units: height and base half-width. */
const AIM_H = 76;
const AIM_HW = 30;
/** Base half-width caps per level (2, 3, 4+), and the gap kept between neighbours. */
const HW_CAP = [13, 15, 18];
const GAP = 1.4;
const MAX_U = 2.6;
const MAX_STAGE = 680;
/** Room kept either side of the fan for titles on a wide panel (px), and above it. */
const LABEL_ROOM = 100;
const LABEL_W = 116;
const GLIDE = 600;

const round = (n: number): string => String(Math.round(n * 100) / 100);
const f = (n: number): string => String(Math.round(n * 10) / 10);
const r3 = (n: number): string => String(Math.round(n * 1000) / 1000);
const rad = (deg: number): number => (deg * Math.PI) / 180;

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, name: K): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG, name) as SVGElementTagNameMap[K];
}

const nameOf = (node: PsNode): string | undefined => parseSlot(node.slot)?.name;
const colourOf = (level: number): Accent => (level === 2 ? 'red' : level === 3 ? 'yellow' : 'blue');

/** Branch letters: A…Z, then AA, AB… */
function letter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26);
}

/** Where a level's triangles start and end, out from the aim's point (chart units). */
function band(level: number): [number, number] {
  if (level <= 2) return [0, 34];
  const start = 38 + (level - 3) * 34;
  return [start, start + 28];
}

// Plane geometry, all in stage pixels.
const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const unitOf = (v: Point): Point => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;

/** Whether a point is inside a triangle, at least `inset` px in from every edge. */
function inTri(p: Point, t: Tri, inset = 0): boolean {
  const sign = Math.sign(cross(sub(t[1], t[0]), sub(t[2], t[0]))) || 1;
  for (let i = 0; i < 3; i += 1) {
    const a = t[i];
    const b = t[(i + 1) % 3];
    const edge = sub(b, a);
    if ((sign * cross(edge, sub(p, a))) / (Math.hypot(edge.x, edge.y) || 1) < inset) return false;
  }
  return true;
}

function segDistance(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
}

function boxDistance(b: Box, p: Point): number {
  const nx = Math.max(b.x, Math.min(p.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(p.y, b.y + b.h));
  return Math.hypot(p.x - nx, p.y - ny);
}

/** Whether a segment passes through a box (Liang-Barsky clip). */
function segHitsBox(p: Point, q: Point, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [pk, qk] of [[-dx, p.x - b.x], [dx, b.x + b.w - p.x], [-dy, p.y - b.y], [dy, b.y + b.h - p.y]]) {
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const t = qk / pk;
    if (pk < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

const corners = (b: Box): Point[] => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];

function boxHitsTri(b: Box, t: Tri): boolean {
  if (t.some((p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)) return true;
  if (corners(b).some((p) => inTri(p, t))) return true;
  return t.some((p, i) => segHitsBox(p, t[(i + 1) % 3], b));
}

function boxTriDistance(b: Box, t: Tri): number {
  if (boxHitsTri(b, t)) return 0;
  let d = Math.min(...t.map((p) => boxDistance(b, p)));
  for (const c of corners(b)) for (let i = 0; i < 3; i += 1) d = Math.min(d, segDistance(c, t[i], t[(i + 1) % 3]));
  return d;
}

function pointTriDistance(p: Point, t: Tri): number {
  return inTri(p, t) ? 0 : Math.min(...t.map((a, i) => segDistance(p, a, t[(i + 1) % 3])));
}

function overlap(a: Box, b: Box): boolean {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });

/**
 * A box hung off an anchor point on the side a direction points to: straight out, it
 * centres on the anchor; on a diagonal its nearest corner touches the anchor.
 * `align` is how its text should sit so it hugs the triangle.
 */
function boxAt(anchor: Point, dir: Point, w: number, h: number): { box: Box; align: 'start' | 'center' | 'end' } {
  const k = ((Math.round(Math.atan2(dir.y, dir.x) / (Math.PI / 4)) % 8) + 8) % 8;
  const x = [anchor.x, anchor.x, anchor.x - w / 2, anchor.x - w, anchor.x - w, anchor.x - w, anchor.x - w / 2, anchor.x][k];
  const y = [anchor.y - h / 2, anchor.y, anchor.y, anchor.y, anchor.y - h / 2, anchor.y - h, anchor.y - h, anchor.y - h][k];
  const align = k === 2 || k === 6 ? 'center' : k >= 3 && k <= 5 ? 'end' : 'start';
  return { box: { x, y, w, h }, align };
}

/** Greedy word wrap, for sizes where the page has no layout (tests). */
function estimate(text: string, font: number, maxW: number): { w: number; h: number; lines: number; tooWide: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const cw = font * 0.56;
  let lines = 1;
  let line = 0;
  let widest = 0;
  for (const word of words) {
    const ww = word.length * cw;
    const next = line ? line + cw + ww : ww;
    if (next > maxW && line) {
      lines += 1;
      line = ww;
    } else line = next;
    widest = Math.max(widest, line);
  }
  return { w: Math.min(widest, maxW), h: lines * font * 1.2, lines, tooWide: words.some((word) => word.length * cw > maxW) };
}

type Model = {
  root: string;
  parent: Map<string, string | null>;
  kids: Map<string, string[]>;
  level: Map<string, number>;
  /** Letter for each level-2 branch, code (A1…) for each deeper how, in tree order. */
  code: Map<string, string>;
  order: string[];
};

/**
 * Levels and families from the hierarchy helpers. A how keeps the parent childrenOf()
 * gives it only when levels() puts it one level below that parent; a link to a missing
 * node, or to one placed after it, leaves it hanging from the aim instead.
 */
function buildModel(run: PsToolRun, rootId: string): Model {
  const lv = levels(run, 'aim', 'how') as Map<string, number>;
  const families = childrenOf(run, 'aim', 'how') as Map<string | null, string[]>;
  const parentOf = new Map<string, string | null>();
  for (const [p, ids] of families) for (const id of ids) parentOf.set(id, p);
  const level = new Map<string, number>([[rootId, 1]]);
  const parent = new Map<string, string | null>([[rootId, null]]);
  const kids = new Map<string, string[]>();
  for (const node of run.nodes) {
    if (nameOf(node) !== 'how') continue;
    let p = parentOf.get(node.id) ?? rootId;
    if (!level.has(p) || lv.get(node.id) !== level.get(p)! + 1) p = rootId;
    level.set(node.id, level.get(p)! + 1);
    parent.set(node.id, p);
    kids.set(p, [...(kids.get(p) ?? []), node.id]);
  }
  const code = new Map<string, string>();
  const order: string[] = [];
  (kids.get(rootId) ?? []).forEach((branch, i) => {
    const mark = letter(i);
    code.set(branch, mark);
    order.push(branch);
    let n = 0;
    const walk = (id: string) => {
      for (const kid of kids.get(id) ?? []) {
        n += 1;
        code.set(kid, `${mark}${n}`);
        order.push(kid);
        walk(kid);
      }
    };
    walk(branch);
  });
  return { root: rootId, parent, kids, level, code, order };
}

/** Each subtree takes a slice of the fan in proportion to its leaves; each how sits mid-slice. */
function fanLayout(model: Model, [from, to]: [number, number]): Map<string, Geo> {
  const leaves = new Map<string, number>();
  const count = (id: string): number => {
    const kids = model.kids.get(id) ?? [];
    const n = kids.length ? kids.reduce((sum, k) => sum + count(k), 0) : 1;
    leaves.set(id, n);
    return n;
  };
  count(model.root);
  const out = new Map<string, Geo>();
  const place = (id: string, start: number, sweep: number, level: number) => {
    if (level > 1) {
      const a = start + sweep / 2;
      const [ra, rb] = band(level);
      const half = Math.tan(rad(Math.min(sweep, 170) / 2));
      // Level-2 wedges share the aim's point, so they keep a slim angle apart; deeper ones keep a gap.
      const room = level === 2 ? rb * half * 0.9 : rb * half - GAP;
      const hw = Math.max(2.5, Math.min(HW_CAP[Math.min(level, 4) - 2], room));
      out.set(id, { x: ra * Math.cos(rad(a)), y: ra * Math.sin(rad(a)), a, len: rb - ra, hw });
    }
    let s = start;
    for (const kid of model.kids.get(id) ?? []) {
      const share = (sweep * leaves.get(kid)!) / leaves.get(id)!;
      place(kid, s, share, level + 1);
      s += share;
    }
  };
  place(model.root, from, to - from, 1);
  return out;
}

type Entry = {
  id: string;
  item: HTMLDivElement;
  rot: HTMLSpanElement;
  button: HTMLButtonElement;
  /** The code (hows only) and the words: a how's label beside it, or the aim's words inside it. */
  code: HTMLSpanElement | null;
  label: HTMLSpanElement;
  card: HTMLElement;
  title: string;
  contested: boolean;
  level: number;
  parent: string | null;
  geo: Geo | null;
  /** Its code's centre and its label box, relative to its point, in px. */
  codeAt: Point | null;
  labelAt: Point | null;
  beside: boolean;
  anims: Animation[];
};

export function createSolutionTreeView(doc: Document = document): SolutionTreeView {
  const root = doc.createElement('div');
  root.className = 'ps-soltree';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Solution tree');

  const group = createDisclosureGroup();
  const entries = new Map<string, Entry>();
  const keyRows = new Map<string, HTMLButtonElement>();
  let stage: HTMLDivElement | null = null;
  let key: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let model: Model | null = null;
  let last: PsToolRun | null = null;
  let widthOverride: number | null = null;
  let width = 0;
  /** The scale and the aim's point (px) of the last layout. */
  let scale = 0;
  let origin: Point = { x: 0, y: 0 };

  function containerWidth(): number {
    if (widthOverride !== null) return widthOverride;
    const w = root.getBoundingClientRect().width;
    return w > 0 ? w : 720;
  }

  function ensureFrame(): void {
    if (stage) return;
    stage = doc.createElement('div');
    stage.className = 'ps-soltree__stage';
    stage.setAttribute('data-region', 'tree');
    stage.setAttribute('aria-label', 'Tree');
    panel = doc.createElement('div');
    panel.className = 'ps-soltree__panel';
    root.append(stage, panel);
  }

  function syncOpen(): void {
    let open = false;
    for (const entry of entries.values()) {
      const isOpen = entry.item.classList.contains('is-open');
      entry.card.classList.toggle('is-open', isOpen);
      keyRows.get(entry.id)?.setAttribute('aria-expanded', String(isOpen));
      open ||= isOpen;
    }
    root.classList.toggle('has-open', open);
  }

  /** The ring: an ink and a paper outline of the triangle, behind the fill, never clipped. */
  function ring(points: string): SVGSVGElement {
    const svg = svgEl(doc, 'svg');
    svg.setAttribute('class', 'ps-soltree__ring');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const layer of ['ink', 'paper']) {
      const poly = svgEl(doc, 'polygon');
      poly.setAttribute('class', `ps-soltree__ring-${layer}`);
      poly.setAttribute('points', points);
      svg.append(poly);
    }
    return svg;
  }

  function addNode(node: PsNode, isAim: boolean): Entry {
    const detailsId = nextId('ps-soltree-details');
    const item = doc.createElement('div');
    item.className = `ps-soltree__item${isAim ? ' is-aim' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);

    // The point of the triangle is the item's origin; the wrapper turns it to its angle.
    const rot = span(doc, 'ps-soltree__rot');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-soltree__shape';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const fill = span(doc, 'ps-soltree__fill');
    fill.setAttribute('aria-hidden', 'true');
    const hit = span(doc, 'ps-soltree__hit');
    hit.setAttribute('aria-hidden', 'true');
    button.append(ring(isAim ? '50,0 100,100 0,100' : '0,50 100,0 100,100'), fill, hit);
    rot.append(button);

    const label = span(doc, isAim ? 'ps-soltree__words' : 'ps-soltree__label');
    const title = span(doc, 'ps-soltree__title', nodeTitle(node));
    let code: HTMLSpanElement | null = null;
    if (isAim) label.append(span(doc, 'ps-soltree__meta', 'Aim'), title);
    else {
      code = span(doc, 'ps-soltree__code');
      code.setAttribute('aria-hidden', 'true');
      label.setAttribute('aria-hidden', 'true');
      label.append(span(doc, 'ps-soltree__label-code'), title);
      // The label is the triangle's words, so it opens the triangle too.
      label.addEventListener('click', () => button.click());
    }
    if (node.state === 'contested') label.append(contestedTag(doc, node));
    if (isAim) button.append(label);
    item.append(rot);
    if (code) item.append(code, label);

    const card = detailsCard(doc, node, isAim ? 'blue' : 'red', detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    stage!.append(item);
    const entry: Entry = {
      id: node.id, item, rot, button, code, label, card,
      title: nodeTitle(node), contested: node.state === 'contested',
      level: 0, parent: null, geo: null, codeAt: null, labelAt: null, beside: false, anims: []
    };
    entries.set(node.id, entry);
    return entry;
  }

  function syncEntry(entry: Entry, level: number, code: string): void {
    if (entry.level !== level) {
      entry.level = level;
      entry.item.setAttribute('data-level', String(level));
      const colour = level === 1 ? 'blue' : colourOf(level);
      entry.item.classList.remove('is-red', 'is-yellow', 'is-blue');
      entry.item.classList.add(`is-${colour}`);
      const card = entry.card.querySelector('.ps-details__card');
      card?.classList.remove('ps-details__card--red', 'ps-details__card--yellow', 'ps-details__card--blue');
      card?.classList.add(`ps-details__card--${colour}`);
    }
    if (entry.code && entry.code.textContent !== code) {
      entry.code.textContent = code;
      entry.label.querySelector('.ps-soltree__label-code')!.textContent = code;
    }
    const name = level === 1 ? 'Aim' : `Level ${level}, ${code}`;
    entry.button.setAttribute('aria-label', `${name}: ${entry.title}${entry.contested ? ', contested' : ''}. Show details`);
  }

  /** The triangle's corners in stage px: point first, then the base. */
  function triangle(entry: Entry, u: number): Tri {
    if (entry.level === 1) {
      return [origin, { x: origin.x + AIM_HW * u, y: origin.y + AIM_H * u }, { x: origin.x - AIM_HW * u, y: origin.y + AIM_H * u }];
    }
    const g = entry.geo!;
    const p = { x: origin.x + g.x * u, y: origin.y + g.y * u };
    const e = { x: Math.cos(rad(g.a)), y: Math.sin(rad(g.a)) };
    const n = { x: -e.y, y: e.x };
    const b = add(p, e, g.len * u);
    return [p, add(b, n, g.hw * u), add(b, n, -g.hw * u)];
  }

  /** A how's outer point: the middle of its base, where its children start. */
  function outerPoint(entry: Entry, u: number): Point {
    if (entry.level === 1 || !entry.geo) return origin;
    const g = entry.geo;
    return { x: origin.x + (g.x + Math.cos(rad(g.a)) * g.len) * u, y: origin.y + (g.y + Math.sin(rad(g.a)) * g.len) * u };
  }

  /**
   * Places the aim's words, every code and every title. Writes widths first, reads every
   * size in one pass, scores in plain arithmetic, then writes places; no layout is forced
   * between writes. Returns the extra height the aim's words need under the chart.
   */
  function placeWords(u: number, W: number, H: number, compact: boolean): number {
    const hows = model!.order.map((id) => entries.get(id)!).filter((e) => e.geo);
    const aim = entries.get(model!.root)!;
    const insideW = 2 * AIM_HW * u * 0.52;
    const insideH = AIM_H * u * 0.34;
    const belowW = Math.min(W - 16, 280);

    // 1. Writes.
    aim.label.setAttribute('data-side', 'inside');
    aim.label.style.setProperty('--ww', `${f(insideW)}px`);
    for (const e of hows) e.label.style.setProperty('--lw', `${LABEL_W}px`);

    // 2. Reads.
    const aimTitle = aim.label.querySelector<HTMLElement>('.ps-soltree__title')!;
    const aimSize = {
      h: aim.label.offsetHeight,
      clamped: aimTitle.scrollHeight > aimTitle.clientHeight + 1 || aimTitle.scrollWidth > aimTitle.clientWidth + 1
    };
    const sizes = new Map(hows.map((e) => [e.id, { w: e.label.offsetWidth, h: e.label.offsetHeight, cw: e.code!.offsetWidth, ch: e.code!.offsetHeight }]));

    // 3. Score. The aim first: inside if it fits, else under its base.
    const est = estimate(aim.title, 14, insideW);
    const fits = aimSize.h > 0
      ? !aimSize.clamped && aimSize.h <= insideH
      : est.lines <= 3 && !est.tooWide && est.h + 14 + (aim.contested ? 16 : 0) <= insideH;
    const below = estimate(aim.title, 15, belowW);
    const extra = fits ? 0 : below.h + 18 + (aim.contested ? 18 : 0) + 6;

    const tris = new Map<string, Tri>();
    for (const e of [aim, ...hows]) tris.set(e.id, triangle(e, u));
    const stageBox: Box = { x: 0, y: 0, w: W, h: H };
    const inStage = (b: Box): boolean => b.x >= 2 && b.y >= 0 && b.x + b.w <= W - 2 && b.y + b.h <= stageBox.h;
    const placed: Box[] = [];

    /** Faults for a box beside `own`: crossing any triangle, covering a placed box, leaving the stage, or reading as another's. */
    const faults = (b: Box, own: string, pad: number, margin: number): number => {
      let n = inStage(b) ? 0 : 1;
      const padded = grow(b, pad);
      for (const t of tris.values()) if (boxHitsTri(padded, t)) n += 1;
      for (const done of placed) if (overlap(padded, done)) n += 1;
      // Ownership: the box sits next to its own triangle, and either its nearest edge or its middle
      // is clearly nearer that triangle than any other (a wide title centred over a narrow base
      // passes on its middle; one tucked by a corner passes on its edge).
      const near = boxTriDistance(b, tris.get(own)!);
      if (near > 12) n += 1;
      const mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const centre = pointTriDistance(mid, tris.get(own)!);
      for (const [id, t] of tris) {
        if (id === own) continue;
        if (boxTriDistance(b, t) < near + margin && pointTriDistance(mid, t) < centre + margin) n += 1;
      }
      return n;
    };

    type Spot = { key: string; anchor: Point; dir: Point };
    const spots = (e: Entry): Spot[] => {
      const [p, c1, c2] = tris.get(e.id)!;
      const g = { x: (p.x + c1.x + c2.x) / 3, y: (p.y + c1.y + c2.y) / 3 };
      const base = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
      const out = unitOf(sub(base, p));
      const corner = (c: Point): Spot => ({ key: '', anchor: add(c, unitOf(sub(c, g)), 4), dir: unitOf(sub(c, g)) });
      const side = (a: Point, b: Point): Spot => {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let nrm = unitOf({ x: -(b.y - a.y), y: b.x - a.x });
        if ((g.x - mid.x) * nrm.x + (g.y - mid.y) * nrm.y > 0) nrm = { x: -nrm.x, y: -nrm.y };
        return { key: '', anchor: add(mid, nrm, 5), dir: nrm };
      };
      const all: Record<string, Spot> = {
        out: { key: '', anchor: add(base, out, 5), dir: out },
        c1: corner(c1),
        c2: corner(c2),
        s1: side(p, c1),
        s2: side(p, c2)
      };
      const leaf = !(model!.kids.get(e.id)?.length);
      return (leaf ? ['out', 'c1', 'c2', 's1', 's2'] : ['s1', 's2', 'c1', 'c2', 'out']).map((k) => ({ ...all[k], key: k }));
    };

    const result = new Map<string, { code: Point; codeOut: boolean; label: Box; align: string; beside: boolean }>();
    // Codes: inside, at the triangle's incentre, when the whole code fits; otherwise just outside.
    for (const e of hows) {
      const s = sizes.get(e.id)!;
      const text = model!.code.get(e.id) ?? '';
      const cw = (s.cw || text.length * 6.4 + 4 + (e.contested ? 9 : 0)) + 2;
      const ch = (s.ch || 12) + 2;
      const [p, c1, c2] = tris.get(e.id)!;
      const L = e.geo!.len * u;
      const h = e.geo!.hw * u;
      const r = (L * h) / (Math.hypot(L, h) + h);
      const at = add(p, unitOf(sub({ x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }, p)), L - r);
      const box = { x: at.x - cw / 2, y: at.y - ch / 2, w: cw, h: ch };
      if (corners(box).every((c) => inTri(c, tris.get(e.id)!, 1))) {
        result.set(e.id, { code: at, codeOut: false, label: box, align: 'start', beside: false });
        continue;
      }
      let best: { box: Box; n: number; i: number } | null = null;
      spots(e).forEach((spot, i) => {
        // A little further out than a title, so the chip clears the focus and open ring.
        const b = boxAt(add(spot.anchor, spot.dir, 3), spot.dir, cw - 2, ch - 2).box;
        const n = faults(b, e.id, 1, 3);
        if (!best || n < best.n || (n === best.n && i < best.i)) best = { box: b, n, i };
      });
      const b = (best as { box: Box } | null)!.box;
      placed.push(b);
      result.set(e.id, { code: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, codeOut: true, label: b, align: 'start', beside: false });
    }

    // Titles beside their triangles (wide only), inner rings first.
    const byLevel = [...hows].sort((a, b) => a.level - b.level);
    for (const e of byLevel) {
      const s = sizes.get(e.id)!;
      const est = estimate(e.title, 12, LABEL_W - 12);
      const w = s.w || Math.max(est.w, e.contested ? 70 : 0) + 30;
      const h = s.h || Math.min(est.lines, 2) * 14.4 + 4 + (e.contested ? 16 : 0);
      const r = result.get(e.id)!;
      let chosen: { box: Box; align: string } | null = null;
      if (!compact) {
        let bestCost = Infinity;
        spots(e).forEach((spot, i) => {
          const { box, align } = boxAt(spot.anchor, spot.dir, w, h);
          if (faults(box, e.id, 3, 8)) return;
          // A small bonus for the place it already has, so titles don't hop.
          const was = e.labelAt && e.geo ? Math.hypot(box.x - (tris.get(e.id)![0].x + e.labelAt.x), box.y - (tris.get(e.id)![0].y + e.labelAt.y)) < 2 : false;
          const cost = i * 10 - (was ? 15 : 0);
          if (cost < bestCost) {
            bestCost = cost;
            chosen = { box, align };
          }
        });
      }
      if (chosen) {
        const c = chosen as { box: Box; align: string };
        placed.push(c.box);
        result.set(e.id, { ...r, label: c.box, align: c.align, beside: true });
      } else {
        // A tip floats over the rest: it keeps to the stage and clear of every triangle where it can, its own at least.
        const own = tris.get(e.id)!;
        const options = spots(e).map((spot) => boxAt(spot.anchor, spot.dir, w, h));
        const clear = (o: { box: Box }, t: Tri) => !boxHitsTri(grow(o.box, 2), t);
        const tip = options.find((o) => inStage(o.box) && [...tris.values()].every((t) => clear(o, t)))
          ?? options.find((o) => inStage(o.box) && clear(o, own))
          ?? options[0];
        const box = { ...tip.box, x: Math.max(2, Math.min(W - 2 - tip.box.w, tip.box.x)), y: Math.max(0, Math.min(stageBox.h - tip.box.h, tip.box.y)) };
        result.set(e.id, { ...r, label: box, align: tip.align, beside: false });
      }
    }

    // 4. Writes.
    aim.label.setAttribute('data-side', fits ? 'inside' : 'below');
    if (!fits) aim.label.style.setProperty('--ww', `${f(belowW)}px`);
    for (const e of hows) {
      const r = result.get(e.id)!;
      const p = tris.get(e.id)![0];
      e.codeAt = { x: r.code.x - p.x, y: r.code.y - p.y };
      e.code!.style.setProperty('--cx', `${f(e.codeAt.x)}px`);
      e.code!.style.setProperty('--cy', `${f(e.codeAt.y)}px`);
      e.item.classList.toggle('is-code-out', r.codeOut);
      e.labelAt = { x: r.label.x - p.x, y: r.label.y - p.y };
      e.label.style.setProperty('--lx', `${f(e.labelAt.x)}px`);
      e.label.style.setProperty('--ly', `${f(e.labelAt.y)}px`);
      e.label.setAttribute('data-align', r.align);
      e.label.classList.toggle('is-beside', r.beside);
      e.label.classList.toggle('is-tip', !r.beside);
      e.beside = r.beside;
    }
    return extra;
  }

  /** The key: every how whose title is not beside its triangle, in tree order, indented by level. */
  function syncKey(): void {
    if (!model) return;
    const ids = model.order;
    if (!ids.length) {
      key?.remove();
      key = null;
      keyRows.clear();
      return;
    }
    if (!key) {
      key = doc.createElement('div');
      key.className = 'ps-soltree__key';
      key.setAttribute('role', 'group');
      key.setAttribute('aria-label', 'Key');
      stage!.after(key);
      if (canAnimate(key)) key.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 300, easing: EASE, fill: 'backwards' });
    }
    for (const [id, row] of keyRows) if (!ids.includes(id)) { row.remove(); keyRows.delete(id); }
    // A listed row keeps the rows above it in its branch, so its indent always has a parent to read from.
    const shown = new Set<string>();
    for (const id of ids) {
      if (entries.get(id)!.beside) continue;
      for (let at: string | null = id; at && at !== model.root; at = model.parent.get(at) ?? null) shown.add(at);
    }
    let all = true;
    ids.forEach((id, i) => {
      const entry = entries.get(id)!;
      let row = keyRows.get(id);
      if (!row) {
        row = doc.createElement('button');
        row.type = 'button';
        row.className = 'ps-soltree__key-row';
        row.setAttribute('data-key', id);
        row.setAttribute('aria-expanded', 'false');
        row.setAttribute('aria-controls', entry.button.getAttribute('aria-controls')!);
        row.append(span(doc, 'ps-soltree__key-code'), span(doc, 'ps-soltree__key-title'));
        row.addEventListener('click', () => entries.get(id)?.button.click());
        keyRows.set(id, row);
      }
      row.setAttribute('data-level', String(entry.level));
      row.querySelector('.ps-soltree__key-code')!.textContent = model!.code.get(id)!;
      row.querySelector('.ps-soltree__key-title')!.textContent = entry.title;
      row.classList.toggle('is-contested', entry.contested);
      row.classList.toggle('is-labelled', !shown.has(id));
      all &&= !shown.has(id);
      if (key!.children[i] !== row) key!.insertBefore(row, key!.children[i] ?? null);
    });
    key.classList.toggle('is-covered', all);
  }

  function stop(entry: Entry): void {
    for (const anim of entry.anims) anim.cancel();
    entry.anims = [];
  }

  function track(entry: Entry, anim: Animation): void {
    entry.anims.push(anim);
    anim.onfinish = () => {
      entry.anims = entry.anims.filter((a) => a !== anim);
    };
  }

  /** `quiet` re-lays out without motion (a resize, or a width set from outside). */
  function render(quiet: boolean): void {
    const run = last;
    if (!run) return;
    const aimNode = run.nodes.find((n) => nameOf(n) === 'aim');
    if (!aimNode) return;
    ensureFrame();
    const animate = canAnimate(root) && !quiet;

    // Reads: the width, and where every triangle is drawn now (mid-glide included).
    const cw = containerWidth();
    const stageRect = animate ? stage!.getBoundingClientRect() : null;
    const before = new Map<string, { p: Point; a: number }>();
    if (stageRect) {
      for (const entry of entries.values()) {
        const r = entry.item.getBoundingClientRect();
        const turning = entry.anims.length > 0 && entry.level > 1;
        const a = turning ? parseFloat(getComputedStyle(entry.rot).rotate) : NaN;
        before.set(entry.id, { p: { x: r.left - stageRect.left, y: r.top - stageRect.top }, a: Number.isFinite(a) ? a : entry.geo?.a ?? 0 });
      }
    }
    const was = new Map([...entries.values()].map((e) => [e.id, { geo: e.geo, codeAt: e.codeAt, labelAt: e.labelAt, beside: e.beside }]));
    const wasScale = scale;

    model = buildModel(run, aimNode.id);
    const added: Entry[] = [];
    for (const node of run.nodes) {
      if (!model.level.has(node.id)) continue;
      let entry = entries.get(node.id);
      if (!entry) {
        entry = addNode(node, node.id === model.root);
        added.push(entry);
      }
      entry.parent = model.parent.get(node.id) ?? null;
      entry.contested = node.state === 'contested';
      syncEntry(entry, model.level.get(node.id)!, model.code.get(node.id) ?? '');
      entry.item.classList.toggle('is-contested', entry.contested);
    }
    for (const [id, entry] of entries) {
      if (model.level.has(id)) continue;
      stop(entry);
      entry.item.remove();
      entry.card.remove();
      entries.delete(id);
    }

    // Geometry, then the scale: the fan (and room for titles on a wide panel) fills the stage.
    const compact = cw < WIDE;
    root.setAttribute('data-compact', String(compact));
    const geos = fanLayout(model, compact ? FAN_PHONE : FAN_WIDE);
    let reach = AIM_HW;
    let top = 0;
    for (const g of geos.values()) {
      const e = { x: Math.cos(rad(g.a)), y: Math.sin(rad(g.a)) };
      const bx = g.x + e.x * g.len;
      const by = g.y + e.y * g.len;
      for (const s of [1, -1]) {
        reach = Math.max(reach, Math.abs(bx - e.y * g.hw * s));
        top = Math.min(top, by + e.x * g.hw * s);
      }
    }
    const W = Math.min(cw, MAX_STAGE);
    const room = compact ? 6 : LABEL_ROOM;
    const u = Math.max(0.6, Math.min(MAX_U, (W - 2 * room) / (2 * reach)));
    const topPad = compact ? 8 : 52;
    origin = { x: W / 2, y: topPad - top * u };
    const H = origin.y + AIM_H * u + 4;
    scale = u;

    for (const [id, entry] of entries) {
      const g = geos.get(id) ?? null;
      entry.geo = g;
      if (!g) continue;
      entry.item.style.setProperty('--x', round(g.x));
      entry.item.style.setProperty('--y', round(g.y));
      entry.item.style.setProperty('--a', round(g.a));
      entry.item.style.setProperty('--len', round(g.len));
      entry.item.style.setProperty('--hw', round(g.hw));
    }
    stage!.style.setProperty('--u', `${round(u)}px`);
    stage!.style.setProperty('--oy', `${round(origin.y)}px`);
    stage!.style.setProperty('--w', `${round(W)}px`);
    const extra = placeWords(u, W, H, compact);
    stage!.style.setProperty('--h', `${round(H + extra)}px`);
    syncKey();
    syncOpen();

    if (!animate || !stageRect) return;
    const pointOf = (e: Entry): Point => (e.geo ? { x: origin.x + e.geo.x * u, y: origin.y + e.geo.y * u } : origin);
    const isNew = new Set(added.map((e) => e.id));
    const firstLevel = Math.min(...added.map((e) => e.level));
    for (const entry of entries.values()) {
      const to = pointOf(entry);
      if (isNew.has(entry.id)) {
        // A newcomer grows out of its parent's outer edge (the aim's point for the first ring).
        const delay = 130 * (entry.level - firstLevel);
        const parent = entry.parent ? entries.get(entry.parent) : undefined;
        if (entry.level === 1) {
          track(entry, entry.button.animate([{ opacity: 0, translate: '0 14px' }, { opacity: 1, translate: '0 0' }], { duration: 480, easing: EASE, fill: 'backwards' }));
          continue;
        }
        const from = parent ? outerPoint(parent, u) : origin;
        track(entry, entry.item.animate([{ translate: `${f(from.x - to.x)}px ${f(from.y - to.y)}px` }, { translate: '0px 0px' }], { duration: 480, delay, easing: EASE, fill: 'backwards' }));
        track(entry, entry.button.animate([{ scale: '0' }, { scale: '1' }], { duration: 480, delay, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' }));
        for (const el of [entry.label, entry.code!]) track(entry, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: delay + 360, easing: EASE, fill: 'backwards' }));
        continue;
      }
      // Existing triangles glide, only where something actually changed.
      const old = before.get(entry.id);
      const prev = was.get(entry.id);
      if (!old || !prev) continue;
      const moves: Array<[Element, Keyframe[]]> = [];
      const dx = old.p.x - to.x;
      const dy = old.p.y - to.y;
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) moves.push([entry.item, [{ translate: `${f(dx)}px ${f(dy)}px` }, { translate: '0px 0px' }]]);
      const g = entry.geo;
      if (entry.level === 1) {
        if (wasScale && Math.abs(wasScale / u - 1) > 0.005) moves.push([entry.button, [{ scale: r3(wasScale / u) }, { scale: '1' }]]);
      } else if (g && prev.geo) {
        if (Math.abs(old.a - g.a) >= 0.1) moves.push([entry.rot, [{ rotate: `${f(old.a)}deg` }, { rotate: `${f(g.a)}deg` }]]);
        const sx = (prev.geo.len * wasScale) / (g.len * u);
        const sy = (prev.geo.hw * wasScale) / (g.hw * u);
        if (Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005) moves.push([entry.button, [{ scale: `${r3(sx)} ${r3(sy)}` }, { scale: '1 1' }]]);
        if (prev.codeAt && entry.codeAt) {
          const cx = prev.codeAt.x - entry.codeAt.x;
          const cy = prev.codeAt.y - entry.codeAt.y;
          if (Math.abs(cx) >= 0.5 || Math.abs(cy) >= 0.5) moves.push([entry.code!, [{ transform: `translate(${f(cx)}px, ${f(cy)}px)` }, { transform: 'none' }]]);
        }
      }
      const labelMoved = entry.level > 1 && (prev.beside !== entry.beside || !prev.labelAt || !entry.labelAt
        || Math.abs(prev.labelAt.x - entry.labelAt.x) >= 1 || Math.abs(prev.labelAt.y - entry.labelAt.y) >= 1);
      if (!moves.length && !labelMoved) continue;
      stop(entry);
      for (const [el, frames] of moves) track(entry, el.animate(frames, { duration: GLIDE, easing: EASE }));
      // A title that changes place fades in at its new one once the glide lands.
      if (labelMoved && entry.beside) track(entry, entry.label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: GLIDE - 200, easing: EASE, fill: 'backwards' }));
    }
  }

  function update(run: PsToolRun): void {
    last = run;
    render(false);
  }

  /** Lay out for a container this many pixels wide (tests; normally the ResizeObserver decides). */
  function layoutFor(px: number): void {
    widthOverride = px;
    render(true);
  }

  // A width change rescales the fan, may switch the phone fan, and re-places every title.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (widthOverride !== null || !stage) return;
      const w = root.getBoundingClientRect().width;
      if (Math.abs(w - width) < 0.5) return;
      width = w;
      render(true);
    }).observe(root);
  }

  return { el: root, update, layout: layoutFor };
}
