// packages/problem-solver/render/radial-tree.ts
// The Radial tree from the toolkit (Analyse): a yellow disc with a guide ring per level,
// a large red node for the subject at the centre, red nodes on the first ring, then
// smaller blue nodes on each ring out to the rim, joined to their parents by thin
// spokes. Each subtree takes a wedge of the disc in proportion to its leaves.
// A toggle switches to the book's vertical variation: a blue node at the top, a red
// row below it and yellow stacks under each red node, joined by elbow lines. The same
// node elements serve both layouts; they glide between their places.
// Words: the centre's title sits inside it (or in a caption above the disc when it
// will not fit); level-2 titles sit beside their nodes. Each level-2 branch has a
// letter and every deeper node a code (A1, A2…), always shown, and a key under the
// chart lists the codes with their titles. On a wide container, level-3 titles that
// fit beside their node are shown there and leave the key. Every title is also a tip
// on hover, focus or while open.
// A node exists only once its answer is accepted; only new nodes grow (out from their
// parent), and nodes that move because of a newcomer glide.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { parentEdge } from '../tools/hierarchy.mjs';
import { MAX_LEVEL } from '../tools/radial-tree.mjs';
import { EASE, canAnimate, cancelAnimations, contestedTag, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type RadialTreeView = { el: HTMLDivElement; update(run: PsToolRun): void; layout(width: number): void; destroy(): void };

type Layout = 'radial' | 'vertical';
type Pos = { x: number; y: number; r: number };
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Seg = [Point, Point];
type Side = 'inside' | 'right' | 'left' | 'below' | 'above' | 'below-right' | 'below-left' | 'above-right' | 'above-left';
type Placement = { side: Side | 'caption'; dx: number; dy: number };

const SVG = 'http://www.w3.org/2000/svg';
/** The chart is 220 units across; the stage is at most this many pixels wide. */
const SIZE = 220;
const HALF = SIZE / 2;
const MAX_STAGE = 580;
const GLIDE = 600;
/** Container width (px) from which level-3 titles may sit beside their nodes. Matches the @container query. */
const WIDE = 600;

/** Radial: ring radius and node radius per level (1 at the centre, 5 at the rim). */
const RING = [0, 38, 66, 88, 102];
const NODE_R = [17, 9, 7, 5, 4];
/** Vertical: row centre and node radius per level; leaf width for levels 3+ (stacks overlap a little). */
const ROW_Y = [20, 62, 116, 150, 180];
const V_R = [12, 10, 8, 6, 5];
const V_LEAF = [0, 0, 13, 10, 9];
const V_GAP = 6;

const at = (list: number[], level: number): number => list[Math.min(level, list.length) - 1];
const round = (n: number): string => String(Math.round(n * 100) / 100);
const f = (n: number): string => String(Math.round(n * 10) / 10);
const DIAGONAL = new Set<Side>(['below-right', 'below-left', 'above-right', 'above-left']);

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
const accentOf = (level: number): Accent => (level <= 2 ? 'red' : 'blue');

/** Branch letters: A…Z, then AA, AB… */
function letter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26);
}

type Entry = {
  id: string;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  label: HTMLSpanElement;
  meta: HTMLSpanElement;
  code: HTMLSpanElement;
  leader: HTMLSpanElement;
  card: HTMLElement;
  title: string;
  contested: boolean;
  level: number;
  parent: string | null;
  /** Widest a label may be, in px (vertical level 2 labels keep to their column). */
  maxW: number;
  placed: Placement | null;
  codePlaced: Side | null;
  /** Vertical layout: how far below its centre (px) the line to its children starts, under its title. */
  drop: number;
  /** Whether its title currently sits beside it on the chart (levels 2–3). */
  beside: boolean;
};

type Model = {
  root: string;
  parent: Map<string, string | null>;
  kids: Map<string, string[]>;
  level: Map<string, number>;
  /** Letter for each level-2 branch, code (A1…) for each deeper node, in tree order. */
  code: Map<string, string>;
  branchOf: Map<string, string>;
  order: string[];
};

/** Leaf counts per subtree, so each subtree gets a share of space in proportion. */
function leafCounts(model: Model): Map<string, number> {
  const out = new Map<string, number>();
  const count = (id: string): number => {
    const kids = model.kids.get(id) ?? [];
    const n = kids.length ? kids.reduce((sum, k) => sum + count(k), 0) : 1;
    out.set(id, n);
    return n;
  };
  count(model.root);
  return out;
}

/**
 * Recursive leaf-count partition of the full turn; the first branch points straight up.
 * A crowded ring shrinks its nodes so neighbours never touch.
 */
function radialLayout(model: Model): Map<string, Pos> {
  const leaves = leafCounts(model);
  const out = new Map<string, Pos>();
  const angle = new Map<string, number>();
  const place = (id: string, start: number, sweep: number, level: number) => {
    const mid = start + sweep / 2;
    const r = level === 1 ? 0 : at(RING, level);
    angle.set(id, mid);
    out.set(id, { x: r * Math.cos(mid), y: HALF + r * Math.sin(mid), r: at(NODE_R, level) });
    let a = start;
    for (const kid of model.kids.get(id) ?? []) {
      const share = (sweep * leaves.get(kid)!) / leaves.get(id)!;
      place(kid, a, share, level + 1);
      a += share;
    }
  };
  const first = model.kids.get(model.root)?.[0];
  const firstSweep = first ? (2 * Math.PI * leaves.get(first)!) / leaves.get(model.root)! : 0;
  place(model.root, -Math.PI / 2 - firstSweep / 2, 2 * Math.PI, 1);

  const byLevel = new Map<number, string[]>();
  for (const [id, level] of model.level) if (level > 1) byLevel.set(level, [...(byLevel.get(level) ?? []), id]);
  for (const [level, ids] of byLevel) {
    if (ids.length < 2) continue;
    const sorted = ids.map((id) => angle.get(id)!).sort((a, b) => a - b);
    let gap = 2 * Math.PI - (sorted.at(-1)! - sorted[0]);
    for (let i = 1; i < sorted.length; i += 1) gap = Math.min(gap, sorted[i] - sorted[i - 1]);
    const chord = 2 * at(RING, level) * Math.sin(Math.min(gap, Math.PI) / 2);
    const r = Math.min(at(NODE_R, level), Math.max(1.5, chord / 2 - 0.4));
    for (const id of ids) out.get(id)!.r = r;
  }
  return out;
}

const rowY = (level: number): number => ROW_Y[Math.min(level, ROW_Y.length) - 1];

/**
 * Top-down tree: every leaf takes a column, a parent sits over the middle of its
 * children, and each level-2 branch keeps room for its label underneath. A tree too
 * wide for the stage is scaled down, its nodes with it, so stacks overlap at most halfway.
 */
function verticalLayout(model: Model, unit: number): { pos: Map<string, Pos>; height: number; column: Map<string, number> } {
  const branchMin = Math.max(24, 84 / unit);
  const width = new Map<string, number>();
  const measure = (id: string, level: number): number => {
    const kids = model.kids.get(id) ?? [];
    const own = level === 1 ? 0 : level === 2 ? branchMin : at(V_LEAF, level);
    const sum = kids.reduce((s, k) => s + measure(k, level + 1), 0) + (level === 1 ? V_GAP * Math.max(0, kids.length - 1) : 0);
    const w = Math.max(own, sum);
    width.set(id, w);
    return w;
  };
  const total = measure(model.root, 1);
  const scale = Math.min(1, (SIZE - 8) / Math.max(total, 1));
  // Spare width spreads the level-2 branches apart, as the book's row spans the page.
  const branches = model.kids.get(model.root)?.length ?? 0;
  const spare = branches > 1 && scale === 1 ? Math.min((SIZE - 8 - total) / (branches - 1), 34) : 0;
  const radius = (level: number): number =>
    level === 1 ? V_R[0] : level === 2 ? Math.min(V_R[1], branchMin * scale * 0.45) : Math.min(at(V_R, level), at(V_LEAF, level) * scale * 0.62);
  const pos = new Map<string, Pos>();
  const column = new Map<string, number>();
  let deepest = 1;
  const place = (id: string, left: number, level: number) => {
    const w = width.get(id)! * scale;
    const x = left + w / 2;
    deepest = Math.max(deepest, level);
    pos.set(id, { x, y: rowY(level), r: radius(level) });
    column.set(id, w + (level === 2 ? spare : 0));
    const kids = model.kids.get(id) ?? [];
    const gap = level === 1 ? V_GAP * scale + spare : 0;
    const used = kids.reduce((s, k) => s + width.get(k)! * scale, 0) + gap * Math.max(0, kids.length - 1);
    let a = x - used / 2;
    for (const kid of kids) {
      place(kid, a, level + 1);
      a += width.get(kid)! * scale + gap;
    }
  };
  place(model.root, -(total * scale) / 2, 1);
  // Room under the lowest row; a level-2 row with nothing below keeps space for its labels.
  const height = rowY(deepest) + at(V_R, deepest) + (deepest === 2 ? 40 / unit : deepest === 1 ? 12 : 22 / unit + 4);
  return { pos, height, column };
}

/** Where a label box sits relative to its node's centre, in px. */
function sideBox(side: Side, R: number, w: number, h: number): Box {
  const d = R * 0.72 + 2;
  switch (side) {
    case 'inside': return { x: -w / 2, y: -h / 2, w, h };
    case 'right': return { x: R + 4, y: -h / 2, w, h };
    case 'left': return { x: -R - 4 - w, y: -h / 2, w, h };
    case 'below': return { x: -w / 2, y: R + 3, w, h };
    case 'above': return { x: -w / 2, y: -R - 3 - h, w, h };
    case 'below-right': return { x: d, y: d, w, h };
    case 'below-left': return { x: -d - w, y: d, w, h };
    case 'above-right': return { x: d, y: -d - h, w, h };
    case 'above-left': return { x: -d - w, y: -d - h, w, h };
  }
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Distance from a box to a point (0 when the point is inside). */
function boxDistance(b: Box, p: Point): number {
  const nx = Math.max(b.x, Math.min(p.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(p.y, b.y + b.h));
  return Math.hypot(p.x - nx, p.y - ny);
}

/** Whether a line segment passes through a box (shrunk by a pixel, so touching doesn't count). */
function crosses(seg: Seg, box: Box): boolean {
  const b = { x: box.x + 1, y: box.y + 1, w: box.w - 2, h: box.h - 2 };
  if (b.w <= 0 || b.h <= 0) return false;
  const [p, q] = seg;
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

const RING_SIDES: Side[] = ['right', 'below-right', 'below', 'below-left', 'left', 'above-left', 'above', 'above-right'];

/** Sides to try, best first. */
function preference(layout: Layout, level: number, p: Pos, kind: 'label' | 'code' | 'tip'): Side[] {
  if (kind === 'tip') return ['above', 'below', 'right', 'left', 'above-right', 'above-left', 'below-right', 'below-left'];
  if (layout === 'vertical') {
    if (level === 1) return ['inside', 'right', 'left'];
    // Under the node, as in an org chart: the line to its children starts below the title.
    return ['below', 'right', 'left', 'below-right', 'below-left', 'above'];
  }
  if (level === 1) return ['inside', 'below', 'above', 'right', 'left'];
  const k = ((Math.round(Math.atan2(p.y - HALF, p.x) / (Math.PI / 4)) % 8) + 8) % 8;
  const turn = (i: number) => RING_SIDES[(k + i + 8) % 8];
  // Level 2: across the spoke first, then outward, then the diagonals; never back towards the centre first.
  if (level === 2) return [turn(2), turn(-2), turn(0), turn(1), turn(-1), turn(3), turn(-3), turn(4)];
  // Deeper titles and codes: outward first, then working round either side.
  return [turn(0), turn(1), turn(-1), turn(2), turn(-2), turn(3), turn(-3), turn(4)];
}

export function createRadialTreeView(doc: Document = document): RadialTreeView {
  const root = doc.createElement('div');
  root.className = 'ps-radial';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Radial tree');
  root.setAttribute('data-layout', 'radial');

  const group = createDisclosureGroup();
  const entries = new Map<string, Entry>();
  const links = new Map<string, SVGPathElement>();
  const rings = new Map<number, SVGCircleElement>();
  const glides = new Map<string, Animation>();
  const keyRows = new Map<string, HTMLButtonElement>();
  const keyGroups = new Map<string, { el: HTMLDivElement; head: HTMLButtonElement; list: HTMLDivElement }>();
  let positions = new Map<string, Pos>();
  let height = SIZE;
  let layout: Layout = 'radial';
  let last: PsToolRun | null = null;
  let model: Model | null = null;
  let widthOverride: number | null = null;

  let bar: HTMLDivElement | null = null;
  let caption: HTMLButtonElement | null = null;
  let captionLeaving: Animation | null = null;
  let stage: HTMLDivElement | null = null;
  let disc: SVGSVGElement | null = null;
  let ringLayer: SVGGElement | null = null;
  let lines: SVGSVGElement | null = null;
  let key: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let review: HTMLElement | null = null;
  const toggles = new Map<Layout, HTMLButtonElement>();
  let settleUntil = 0;
  let frame = 0;
  let width = 0;

  function containerWidth(): number {
    if (widthOverride !== null) return widthOverride;
    const w = root.getBoundingClientRect().width;
    return w > 0 ? w : 720;
  }

  function unit(): number {
    if (widthOverride !== null) return Math.min(widthOverride, MAX_STAGE) / SIZE;
    const w = stage?.getBoundingClientRect().width ?? 0;
    return (w > 0 ? w : MAX_STAGE) / SIZE;
  }

  function ensureFrame(): void {
    if (stage) return;
    bar = doc.createElement('div');
    bar.className = 'ps-radial__bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Layout');
    for (const [value, text] of [['radial', 'Radial tree'], ['vertical', 'Vertical tree']] as const) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'ps-radial__toggle';
      button.textContent = text;
      button.setAttribute('data-layout-option', value);
      button.setAttribute('aria-pressed', String(value === layout));
      button.addEventListener('click', () => setLayout(value));
      toggles.set(value, button);
      bar.append(button);
    }

    stage = doc.createElement('div');
    stage.className = 'ps-radial__stage';
    stage.setAttribute('data-region', 'tree');
    stage.setAttribute('aria-label', 'Tree');

    disc = svgEl(doc, 'svg');
    disc.setAttribute('class', 'ps-radial__disc');
    disc.setAttribute('viewBox', '-110 -110 220 220');
    disc.setAttribute('aria-hidden', 'true');
    disc.setAttribute('focusable', 'false');
    const fill = svgEl(doc, 'circle');
    fill.setAttribute('class', 'ps-radial__disc-fill');
    fill.setAttribute('r', String(HALF));
    ringLayer = svgEl(doc, 'g');
    disc.append(fill, ringLayer);

    lines = svgEl(doc, 'svg');
    lines.setAttribute('class', 'ps-radial__links');
    lines.setAttribute('aria-hidden', 'true');
    lines.setAttribute('focusable', 'false');

    stage.append(disc, lines);
    panel = doc.createElement('div');
    panel.className = 'ps-radial__panel';
    root.append(bar, stage, panel);

    if (canAnimate(disc)) {
      disc.animate([{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EASE, fill: 'backwards' });
      bar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 400, easing: EASE, fill: 'backwards' });
    }
  }

  function syncOpen(): void {
    let open: Entry | null = null;
    for (const entry of entries.values()) {
      const isOpen = entry.item.classList.contains('is-open');
      entry.card.classList.toggle('is-open', isOpen);
      keyRows.get(entry.id)?.setAttribute('aria-expanded', String(isOpen));
      keyGroups.get(entry.id)?.head.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) open = entry;
    }
    root.classList.toggle('has-open', !!open);
    // The open node's line back to the centre stands out; the rest step back.
    const path = new Set<string>();
    for (let id: string | null = open?.id ?? null; id; id = entries.get(id)?.parent ?? null) path.add(id);
    for (const [child, link] of links) link.classList.toggle('is-path', path.has(child));
  }

  function addNode(node: PsNode): Entry {
    const detailsId = nextId('ps-radial-details');
    const item = doc.createElement('div');
    item.className = 'ps-radial__item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-radial__shape';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const code = span(doc, 'ps-radial__code');
    code.setAttribute('aria-hidden', 'true');
    const leader = span(doc, 'ps-radial__leader');
    const label = span(doc, 'ps-radial__label');
    const meta = span(doc, 'ps-radial__meta');
    label.append(meta, span(doc, 'ps-radial__title', nodeTitle(node)));
    if (node.state === 'contested') label.append(contestedTag(doc, node));
    button.append(leader, code, label);
    item.append(button);

    const card = detailsCard(doc, node, 'red', detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);

    stage!.append(item);
    const entry: Entry = {
      id: node.id, item, button, label, meta, code, leader, card,
      title: nodeTitle(node), contested: node.state === 'contested',
      level: 0, parent: null, maxW: 112, placed: null, codePlaced: null, drop: 0, beside: false
    };
    entries.set(node.id, entry);
    return entry;
  }

  function syncEntry(entry: Entry, level: number, code: string): void {
    if (entry.level !== level) {
      entry.level = level;
      entry.item.setAttribute('data-level', String(level));
      entry.item.classList.toggle('is-deep', level >= 3);
      const card = entry.card.querySelector('.ps-details__card');
      card?.classList.remove('ps-details__card--red', 'ps-details__card--blue');
      card?.classList.add(`ps-details__card--${accentOf(level)}`);
    }
    if (level === 1) entry.code.remove();
    else if (entry.code.textContent !== code) entry.code.textContent = code;
    entry.meta.textContent = level >= 2 ? `${code} · Level ${level}` : '';
    const name = level === 1 ? 'Level 1' : `Level ${level}, ${code}`;
    entry.button.setAttribute('aria-label', `${name}: ${entry.title}${entry.contested ? ', contested' : ''}. Show details`);
  }

  function addReview(node: PsNode): HTMLElement {
    const detailsId = nextId('ps-radial-details');
    const item = doc.createElement('div');
    item.className = 'ps-radial__review';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-region', 'review');
    item.setAttribute('aria-label', 'Review');
    const head = doc.createElement('div');
    head.className = 'ps-radial__review-head';
    head.append(span(doc, 'ps-radial__review-meta', 'Review'));
    if (node.state === 'contested') head.append(contestedTag(doc, node));
    const text = doc.createElement('p');
    text.className = 'ps-radial__review-text';
    text.textContent = node.text;
    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'ps-radial__more';
    more.textContent = 'Details';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    more.setAttribute('aria-label', `Review${node.state === 'contested' ? ', contested' : ''}. Show details`);
    const card = detailsCard(doc, node, 'blue', detailsId);
    // The card would repeat the answer, so here it carries only skills and any objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    group.register(item, more);
    more.addEventListener('click', syncOpen);
    root.append(item);
    if (canAnimate(item)) item.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 200, easing: EASE, fill: 'backwards' });
    return item;
  }

  /**
   * Parents, children, levels and codes for the drawing. Children are derived here
   * rather than taken from childrenOf(): a node whose parent link points at a node
   * not drawn (missing, or placed after it) must still hang from the root, and data
   * saved before the tool's depth guard may go below level 5, which the chart has no
   * ring for, so such a node is drawn on the rim beside its parent instead of on top of it.
   */
  function buildModel(run: PsToolRun, rootId: string): Model {
    const level = new Map<string, number>([[rootId, 1]]);
    const parent = new Map<string, string | null>([[rootId, null]]);
    const kids = new Map<string, string[]>();
    for (const node of run.nodes) {
      if (nameOf(node) !== 'node') continue;
      const to = parentEdge(run, node.id)?.to as string | undefined;
      let p = to && level.has(to) ? to : rootId;
      while (level.get(p)! + 1 > MAX_LEVEL) p = parent.get(p)!;
      level.set(node.id, level.get(p)! + 1);
      parent.set(node.id, p);
      kids.set(p, [...(kids.get(p) ?? []), node.id]);
    }
    const code = new Map<string, string>();
    const branchOf = new Map<string, string>();
    const order: string[] = [];
    (kids.get(rootId) ?? []).forEach((branch, i) => {
      const mark = letter(i);
      code.set(branch, mark);
      branchOf.set(branch, branch);
      order.push(branch);
      let n = 0;
      const walk = (id: string) => {
        for (const kid of kids.get(id) ?? []) {
          n += 1;
          code.set(kid, `${mark}${n}`);
          branchOf.set(kid, branch);
          order.push(kid);
          walk(kid);
        }
      };
      walk(branch);
    });
    return { root: rootId, parent, kids, level, code, branchOf, order };
  }

  /** A node's centre in stage pixels where it is drawn now (mid-glide included). */
  function live(entry: Entry, origin: DOMRect): Point | null {
    const r = entry.button.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2 };
  }

  function modelPoint(id: string, u: number): Point | null {
    const p = positions.get(id);
    return p ? { x: (p.x + HALF) * u, y: p.y * u } : null;
  }

  /** The line from a parent to a child: a straight spoke, or down-across-down in the vertical tree. */
  function route(child: string, from: Point, b: Point, u: number): { d: string; segs: Seg[] } {
    let a = from;
    if (layout === 'radial') return { d: `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`, segs: [[a, b]] };
    const entry = entries.get(child);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1 || dy <= 1) {
      const drop = entries.get(entry?.parent ?? '')?.drop ?? 0;
      if (drop) a = { x: a.x, y: Math.min(a.y + drop, b.y) };
      return { d: `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`, segs: [[a, b]] };
    }
    const childR = (positions.get(child)?.r ?? 8) * u;
    const parentR = (positions.get(entry?.parent ?? '')?.r ?? 10) * u;
    const top = b.y - childR;
    // Under the centre the bus runs midway; under a branch it runs just over the child's row.
    const bus = entry?.level === 2 ? (a.y + parentR + top) / 2 : top - Math.min(9, (top - a.y) / 3);
    // A titled parent's line starts under its title, so the two never cross.
    const drop = entries.get(entry?.parent ?? '')?.drop ?? 0;
    if (drop) a = { x: a.x, y: Math.min(a.y + drop, bus - 2) };
    const bend = Math.max(0, Math.min(7, Math.abs(dx) / 2, (bus - a.y) / 2, (b.y - bus) / 2));
    const dir = Math.sign(dx);
    return {
      d: `M${f(a.x)} ${f(a.y)}V${f(bus - bend)}Q${f(a.x)} ${f(bus)} ${f(a.x + dir * bend)} ${f(bus)}H${f(b.x - dir * bend)}Q${f(b.x)} ${f(bus)} ${f(b.x)} ${f(bus + bend)}V${f(b.y)}`,
      segs: [[a, { x: a.x, y: bus }], [{ x: a.x, y: bus }, { x: b.x, y: bus }], [{ x: b.x, y: bus }, b]]
    };
  }

  type Job = {
    entry: Entry;
    kind: 'label' | 'code' | 'tip';
    w: number;
    h: number;
    sides: Side[];
    current: Placement | Side | null;
    margin: number;
  };

  /**
   * Places every title and outside code. Writes widths first, reads every size in one
   * pass, scores in plain arithmetic, then writes sides and offsets; no layout is forced
   * between writes. A side is scored on: leaving the disc or stage, covering a node or
   * an earlier label, sitting nearer another node than its own (so it reads as theirs),
   * and crossing a spoke. The current side gets a small bonus so labels don't hop.
   */
  function placeLabels(u: number, fade = false): void {
    const W = SIZE * u;
    const H = height * u;
    const wide = containerWidth() >= WIDE;
    root.setAttribute('data-compact', String(!wide));
    const order = [...entries.values()].filter((e) => positions.has(e.id)).sort((a, b) => a.level - b.level);
    const rootEntry = model ? entries.get(model.root) : undefined;
    const centre = (id: string): Point => {
      const p = positions.get(id)!;
      return { x: (p.x + HALF) * u, y: p.y * u };
    };
    const circles = order.map((e) => ({ id: e.id, c: centre(e.id), r: positions.get(e.id)!.r * u }));
    // Lines as they would run with no titles in the way; each piece remembers its parent.
    for (const e of entries.values()) e.drop = 0;
    const segs: Array<{ seg: Seg; parent: string; first: boolean }> = [];
    for (const child of links.keys()) {
      const parent = entries.get(child)?.parent;
      if (!parent || !positions.has(parent) || !positions.has(child)) continue;
      route(child, centre(parent), centre(child), u).segs.forEach((seg, i) => segs.push({ seg, parent, first: i === 0 }));
    }

    // 1. Writes: widths, and the centre's inside width.
    const rootR = rootEntry ? positions.get(rootEntry.id)!.r * u : 0;
    const insideW = rootR * 2 * 0.78;
    const rootFont = W < 420 ? 12 : 14;
    for (const entry of order) {
      const maxW = entry.level === 1 ? insideW : layout === 'vertical' && entry.level === 2 ? Math.max(48, Math.min(120, entry.maxW)) : 112;
      entry.maxW = layout === 'vertical' && entry.level === 2 ? entry.maxW : maxW;
      entry.label.style.setProperty('--lw', `${f(maxW)}px`);
      if (entry.level === 1) entry.label.style.setProperty('--lf', `${rootFont}px`);
    }

    // 2. Reads: every size at once (estimates where the page has no layout, as in tests).
    const sizes = new Map<string, { w: number; h: number; clamped: boolean; cw: number; ch: number }>();
    for (const entry of order) {
      const title = entry.label.querySelector<HTMLElement>('.ps-radial__title')!;
      sizes.set(entry.id, {
        w: entry.label.offsetWidth,
        h: entry.label.offsetHeight,
        // More than two lines, or a word wider than the space: either way it doesn't fit.
        clamped: title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1,
        cw: entry.code.offsetWidth,
        ch: entry.code.offsetHeight
      });
    }
    const estimate = (entry: Entry, font: number, maxW: number, tip: boolean) => {
      // Greedy word wrap, so a long title is known to need more lines.
      const words = entry.title.split(/\s+/);
      const cw = font * 0.56;
      let lines = 1;
      let line = 0;
      let widest = 0;
      for (const word of words) {
        const ww = word.length * cw;
        const next = line ? line + cw + ww : ww;
        if (next > maxW && line) {
          lines += 1;
          widest = Math.max(widest, line);
          line = ww;
        } else line = next;
        widest = Math.max(widest, line);
      }
      const w = Math.max(Math.min(widest, maxW), entry.contested ? 74 : 0, tip ? 64 : 0) + (tip ? 16 : 12);
      const h = Math.min(lines, 2) * font * 1.2 + 4 + (entry.contested ? 16 : 0) + (tip ? 14 : 0);
      return { w, h, lines, tooWide: words.some((word) => word.length * cw > maxW) };
    };

    // 3. Score.
    const placed: Box[] = [];
    const result = new Map<string, { label: Placement; beside: boolean; code: Side | null; leader: Point | null }>();
    /** Labels set narrower than usual to fit (px). */
    const narrowed = new Map<string, number>();
    /** `hard` counts faults a shown label may not have; `soft` only steers the choice. */
    const score = (job: Job, box: Box, c: Point, R: number, cost: number): { total: number; penalty: number; hard: number } => {
      let penalty = 0;
      let soft = 0;
      const tip = job.kind === 'tip';
      if (layout === 'radial' && !tip) {
        const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]];
        const out = corners.filter(([x, y]) => Math.hypot(x - W / 2, y - W / 2) > W / 2 - 3).length;
        penalty += out * box.w * box.h * 0.6;
      }
      const inStage = overlap(box, { x: 0, y: 0, w: W, h: Math.max(H, layout === 'radial' ? W : 0) });
      penalty += (box.w * box.h - inStage) * 8;
      const own = Math.max(0, boxDistance(box, c) - R);
      // The middle of the box too: a wide label touching its node at one corner can still read as a neighbour's.
      const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const ownMid = Math.hypot(mid.x - c.x, mid.y - c.y) - R;
      for (const other of circles) {
        if (other.id === job.entry.id) continue;
        const pad = other.r + 3;
        penalty += overlap(box, { x: other.c.x - pad, y: other.c.y - pad, w: pad * 2, h: pad * 2 }) * (tip ? 2 : 4);
        // Ownership: another node must be clearly farther from the box than this one.
        if (!tip && boxDistance(box, other.c) - other.r < own + job.margin) penalty += 3000;
        if (!tip && job.kind === 'label' && Math.hypot(mid.x - other.c.x, mid.y - other.c.y) - other.r < ownMid + job.margin) soft += 1500;
      }
      if (!tip) {
        for (const done of placed) penalty += overlap(box, done) * 3;
        // In the vertical tree a title straight under its node moves the line to its children below it.
        const under = layout === 'vertical' && job.kind === 'label' && box.x < c.x && box.x + box.w > c.x && box.y > c.y;
        for (const s of segs) if (!(under && s.parent === job.entry.id && s.first) && crosses(s.seg, box)) penalty += 600;
      }
      return { total: cost + penalty + soft, penalty: penalty + soft, hard: penalty };
    };

    const run = (job: Job): { place: Placement; penalty: number; hard: number; box: Box; total: number } => {
      const p = positions.get(job.entry.id)!;
      const c = centre(job.entry.id);
      const R = p.r * u;
      const { w, h } = job;
      let best: { place: Placement; penalty: number; hard: number; box: Box; total: number } | null = null;
      job.sides.forEach((side, i) => {
        const slides: Array<[number, number]> = [[0, 0]];
        if (job.kind === 'label') {
          if (side === 'left' || side === 'right') slides.push([0, Math.min(h / 2, R)], [0, -Math.min(h / 2, R)]);
          if (side === 'above' || side === 'below') slides.push([Math.min(w / 3, R + 8), 0], [-Math.min(w / 3, R + 8), 0]);
        }
        slides.forEach(([dx, dy], j) => {
          const rel = sideBox(side, R, w, h);
          const box = { x: c.x + rel.x + dx, y: c.y + rel.y + dy, w, h };
          const current = job.current;
          const same = typeof current === 'string' ? current === side : !!current && current.side === side && current.dx === dx && current.dy === dy;
          const s = score(job, box, c, R, i * 40 + j * 120 - (same ? 80 : 0));
          if (!best || s.total < best.total) best = { place: { side, dx, dy }, penalty: s.penalty, hard: s.hard, box, total: s.total };
        });
      });
      return best!;
    };

    for (const entry of order) {
      const p = positions.get(entry.id)!;
      const R = p.r * u;
      const size = sizes.get(entry.id)!;
      const c = centre(entry.id);
      let label: Placement;
      let beside = false;
      let leader: Point | null = null;

      if (entry.level === 1) {
        const est = estimate(entry, rootFont, insideW, false);
        const measured = size.w > 0 && size.h > 0;
        const fits = measured
          ? !size.clamped && size.w <= insideW + 1 && size.h <= R * 2 * 0.74
          : est.lines <= 2 && !est.tooWide && est.h <= R * 2 * 0.74;
        label = { side: fits ? 'inside' : 'caption', dx: 0, dy: 0 };
        if (fits) placed.push({ x: c.x - R, y: c.y - R, w: 2 * R, h: 2 * R });
      } else {
        const tryBeside = entry.level === 2 || (entry.level === 3 && wide);
        const est = estimate(entry, 12, entry.level === 2 ? entry.maxW : 112, !tryBeside);
        const w = size.w || est.w;
        const h = size.h || est.h;
        let chosen: { place: Placement; penalty: number; hard: number; box: Box } | null = null;
        if (tryBeside) {
          const sides = preference(layout, entry.level, p, 'label');
          let best = run({ entry, kind: 'label', w, h, sides, current: entry.placed, margin: 8 });
          // Crowded: try the title narrower, on two lines, so it fits between spokes and neighbours.
          if (best.penalty >= 1 && entry.level === 2) {
            const longest = Math.max(...entry.title.split(/\s+/).map((word) => word.length * 12 * 0.56));
            const narrowW = Math.max(44, Math.ceil(longest) + 2);
            const narrow = estimate(entry, 12, narrowW, false);
            if (narrow.lines <= 2 && narrow.w < w - 8) {
              const alt = run({ entry, kind: 'label', w: narrow.w, h: Math.max(narrow.h, h), sides, current: entry.placed, margin: 8 });
              if (alt.total + 30 < best.total) {
                best = alt;
                narrowed.set(entry.id, narrowW);
              }
            }
          }
          chosen = best;
          // A title only stays beside its node where it covers nothing, crosses no line and reads
          // as that node's; otherwise it becomes a tip and the key carries it. Level 3 must also
          // sit squarely by its node (no soft cost either).
          beside = entry.level === 2 ? chosen.hard < 1 : chosen.penalty < 1;
        }
        if (beside && chosen) {
          placed.push(chosen.box);
          if (layout === 'vertical' && chosen.box.x < c.x && chosen.box.x + chosen.box.w > c.x && chosen.box.y > c.y) entry.drop = chosen.box.y + chosen.box.h - c.y + 2;
          label = chosen.place;
          const gap = Math.max(0, boxDistance(chosen.box, c) - R);
          if (DIAGONAL.has(label.side as Side) || label.dx || label.dy || gap > 6) {
            const nx = Math.max(chosen.box.x, Math.min(c.x, chosen.box.x + chosen.box.w));
            const ny = Math.max(chosen.box.y, Math.min(c.y, chosen.box.y + chosen.box.h));
            leader = { x: nx - c.x, y: ny - c.y };
          }
        } else {
          // Not beside: the title is a tip; place it after everything permanent.
          label = { side: 'above', dx: 0, dy: 0 };
        }
      }
      result.set(entry.id, { label, beside, code: null, leader });
    }

    // Codes outside small dots (and inside any node too small to hold one).
    for (const entry of order) {
      if (entry.level < 2) continue;
      const R = positions.get(entry.id)!.r * u;
      if (entry.level <= 3 && R >= 7) continue;
      const size = sizes.get(entry.id)!;
      const text = model?.code.get(entry.id) ?? '';
      const w = size.cw || text.length * 6.4 + 6;
      const h = size.ch || 13;
      const best = run({ entry, kind: 'code', w, h, sides: preference(layout, entry.level, positions.get(entry.id)!, 'code'), current: entry.codePlaced, margin: 4 });
      placed.push(best.box);
      result.get(entry.id)!.code = best.place.side as Side;
    }

    // Tips last: they float over everything and only keep to the stage and off other nodes.
    for (const entry of order) {
      const r = result.get(entry.id)!;
      if (entry.level < 2 || r.beside) continue;
      const size = sizes.get(entry.id)!;
      const est = estimate(entry, 12, 112, true);
      const best = run({ entry, kind: 'tip', w: size.w || est.w, h: size.h || est.h, sides: preference(layout, entry.level, positions.get(entry.id)!, 'tip'), current: null, margin: 0 });
      r.label = best.place;
    }

    // 4. Writes.
    for (const entry of order) {
      const r = result.get(entry.id)!;
      const was = entry.placed;
      const moved = !!was && (was.side !== r.label.side || was.dx !== r.label.dx || was.dy !== r.label.dy);
      entry.label.setAttribute('data-side', r.label.side);
      if (narrowed.has(entry.id)) entry.label.style.setProperty('--lw', `${f(narrowed.get(entry.id)! + 12)}px`);
      entry.label.style.setProperty('--ldx', `${f(r.label.dx)}px`);
      entry.label.style.setProperty('--ldy', `${f(r.label.dy)}px`);
      entry.label.classList.toggle('is-tip', entry.level >= 2 && !r.beside);
      entry.label.classList.toggle('is-beside', entry.level >= 3 && r.beside);
      entry.beside = r.beside;
      entry.placed = r.label;
      entry.item.classList.toggle('is-code-out', !!r.code);
      if (r.code) entry.code.setAttribute('data-side', r.code);
      else entry.code.removeAttribute('data-side');
      entry.codePlaced = r.code;
      entry.leader.classList.toggle('is-on', !!r.leader);
      entry.leader.classList.toggle('is-beside', entry.level >= 3);
      if (r.leader) {
        const R = positions.get(entry.id)!.r * u;
        const len = Math.hypot(r.leader.x, r.leader.y);
        entry.leader.style.setProperty('--from', `${f(R)}px`);
        entry.leader.style.setProperty('--len', `${f(Math.max(0, len - R))}px`);
        entry.leader.style.setProperty('--angle', `${f((Math.atan2(r.leader.y, r.leader.x) * 180) / Math.PI)}deg`);
      }
      // A label that changes side on a normal update fades in at its new place.
      if (fade && moved && entry.level <= 2 && canAnimate(entry.label)) {
        entry.label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: GLIDE - 200, easing: EASE, fill: 'backwards' });
      }
    }
    syncCaption(rootEntry && result.get(rootEntry.id)?.label.side === 'caption' ? rootEntry : null);
    syncKey();
  }

  /** The caption opens and closes over the glide, so the chart below it moves smoothly instead of jumping. */
  function syncCaption(entry: Entry | null): void {
    const fold = (el: HTMLElement, open: boolean): Animation | null => {
      if (!canAnimate(el)) return null;
      const h = el.scrollHeight;
      const shut = { height: '0px', opacity: 0, marginBottom: '0px' };
      const full = { height: `${h}px`, opacity: 1, marginBottom: '6px' };
      return el.animate(open ? [shut, full] : [full, shut], { duration: GLIDE, easing: EASE });
    };
    if (!entry) {
      if (caption && !captionLeaving) {
        const leaving = caption;
        const anim = fold(leaving, false);
        if (anim) {
          captionLeaving = anim;
          anim.onfinish = () => {
            leaving.remove();
            if (caption === leaving) caption = null;
            captionLeaving = null;
          };
        } else {
          leaving.remove();
          caption = null;
        }
      }
      return;
    }
    if (caption && captionLeaving) {
      // Wanted again before it finished closing: open it back up from where it is.
      captionLeaving.onfinish = null;
      captionLeaving.cancel();
      captionLeaving = null;
      fold(caption, true);
    }
    if (!caption) {
      caption = doc.createElement('button');
      caption.type = 'button';
      caption.className = 'ps-radial__caption';
      caption.setAttribute('aria-hidden', 'true');
      caption.tabIndex = -1;
      caption.addEventListener('click', () => entries.get(model?.root ?? '')?.button.click());
      caption.textContent = entry.title;
      stage!.before(caption);
      fold(caption, true);
    }
    if (caption.textContent !== entry.title) caption.textContent = entry.title;
  }

  /**
   * The key: one group per level-2 branch that has deeper nodes or whose own title is
   * not on the chart, one row per deeper node, in code order. Rows and heads whose titles
   * sit on the chart are marked, so a wide container can leave them out.
   */
  function syncKey(): void {
    if (!model) return;
    const deep = model.order.filter((id) => (model!.level.get(id) ?? 0) >= 3);
    const tipped = (model.kids.get(model.root) ?? []).filter((b) => !entries.get(b)?.beside);
    if (!deep.length && !tipped.length) {
      key?.remove();
      key = null;
      keyRows.clear();
      keyGroups.clear();
      return;
    }
    if (!key) {
      key = doc.createElement('div');
      key.className = 'ps-radial__key';
      key.setAttribute('role', 'group');
      key.setAttribute('aria-label', 'Key');
      stage!.after(key);
      if (canAnimate(key)) key.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 300, easing: EASE, fill: 'backwards' });
    }
    const forward = (id: string) => () => entries.get(id)?.button.click();
    const branches = (model.kids.get(model.root) ?? []).filter((b) => tipped.includes(b) || deep.some((id) => model!.branchOf.get(id) === b));
    for (const [id, g] of keyGroups) if (!branches.includes(id)) { g.el.remove(); keyGroups.delete(id); }
    for (const [id, row] of keyRows) if (!deep.includes(id)) { row.remove(); keyRows.delete(id); }
    branches.forEach((branch, i) => {
      let g = keyGroups.get(branch);
      if (!g) {
        const el = doc.createElement('div');
        el.className = 'ps-radial__key-group';
        el.setAttribute('data-branch', branch);
        const head = doc.createElement('button');
        head.type = 'button';
        head.className = 'ps-radial__key-head';
        head.setAttribute('data-key-branch', branch);
        head.setAttribute('aria-expanded', 'false');
        head.setAttribute('aria-controls', entries.get(branch)!.button.getAttribute('aria-controls')!);
        head.append(span(doc, 'ps-radial__key-code'), span(doc, 'ps-radial__key-title'));
        head.addEventListener('click', forward(branch));
        const list = doc.createElement('div');
        list.className = 'ps-radial__key-rows';
        el.append(head, list);
        g = { el, head, list };
        keyGroups.set(branch, g);
      }
      g.head.querySelector('.ps-radial__key-code')!.textContent = model!.code.get(branch)!;
      g.head.querySelector('.ps-radial__key-title')!.textContent = entries.get(branch)!.title;
      g.head.classList.toggle('is-labelled', !!entries.get(branch)?.beside);
      if (key!.children[i] !== g.el) key!.insertBefore(g.el, key!.children[i] ?? null);
      deep.filter((id) => model!.branchOf.get(id) === branch).forEach((id, j) => {
        let row = keyRows.get(id);
        if (!row) {
          row = doc.createElement('button');
          row.type = 'button';
          row.className = 'ps-radial__key-row';
          row.setAttribute('data-key', id);
          row.setAttribute('aria-expanded', 'false');
          row.setAttribute('aria-controls', entries.get(id)!.button.getAttribute('aria-controls')!);
          row.append(span(doc, 'ps-radial__key-code'), span(doc, 'ps-radial__key-title'));
          row.addEventListener('click', forward(id));
          keyRows.set(id, row);
        }
        row.querySelector('.ps-radial__key-code')!.textContent = model!.code.get(id)!;
        row.querySelector('.ps-radial__key-title')!.textContent = entries.get(id)!.title;
        row.classList.toggle('is-contested', !!entries.get(id)?.contested);
        row.classList.toggle('is-labelled', !!entries.get(id)?.beside);
        if (g!.list.children[j] !== row) g!.list.insertBefore(row, g!.list.children[j] ?? null);
      });
    });
    syncKeyCover();
  }

  /** On a wide container, groups (and the whole key) whose titles all sit on the chart step aside. */
  function syncKeyCover(): void {
    if (!key) return;
    let all = true;
    for (const g of keyGroups.values()) {
      const covered = g.head.classList.contains('is-labelled') && [...g.list.children].every((row) => row.classList.contains('is-labelled'));
      g.el.classList.toggle('is-covered', covered);
      all &&= covered;
    }
    key.classList.toggle('is-covered', all);
  }

  /** Spokes in the radial layout; down-across-down lines in the vertical one. Reads every point, then writes every path. */
  function drawLinks(useLive: boolean): void {
    if (!stage || !lines) return;
    const u = unit();
    const origin = stage.getBoundingClientRect();
    const W = SIZE * u;
    const H = useLive && origin.height ? origin.height : height * u;
    const points = new Map<string, Point>();
    for (const [id, entry] of entries) {
      const p = (useLive && live(entry, origin)) || modelPoint(id, u);
      if (p) points.set(id, p);
    }
    lines.setAttribute('viewBox', `0 0 ${f(W)} ${f(H)}`);
    for (const [child, path] of links) {
      const parent = entries.get(child)?.parent;
      const a = parent ? points.get(parent) : undefined;
      const b = points.get(child);
      if (a && b) path.setAttribute('d', route(child, a, b, u).d);
    }
  }

  /** Keep the lines on the nodes while anything glides; then snap them to the model. */
  function settle(ms: number): void {
    if (typeof requestAnimationFrame !== 'function' || !canAnimate(root)) return;
    settleUntil = Math.max(settleUntil, performance.now() + ms);
    if (frame) return;
    const tick = () => {
      if (performance.now() < settleUntil) {
        drawLinks(true);
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        drawLinks(false);
      }
    };
    frame = requestAnimationFrame(tick);
  }

  function syncRings(deepest: number, first: boolean): void {
    if (!ringLayer) return;
    for (let level = 2; level <= deepest; level += 1) {
      if (rings.has(level)) continue;
      const ring = svgEl(doc, 'circle');
      ring.setAttribute('class', 'ps-radial__ring');
      ring.setAttribute('data-level', String(level));
      const r = at(RING, level);
      ring.setAttribute('r', String(r));
      ringLayer.insertBefore(ring, [...rings].filter(([l]) => l > level).sort((a, b) => a[0] - b[0])[0]?.[1] ?? null);
      rings.set(level, ring);
      if (canAnimate(ring)) {
        // A new ring widens out from the one inside it.
        const inner = level === 2 ? 0.3 : at(RING, level - 1) / r;
        ring.animate([{ opacity: 0, transform: `scale(${f(inner)})` }, { opacity: 1, transform: 'none' }], { duration: 560, delay: first ? 120 * (level - 1) : 0, easing: EASE, fill: 'backwards' });
      }
    }
    for (const [level, ring] of rings) {
      if (level > deepest) {
        ring.remove();
        rings.delete(level);
      }
    }
  }

  function glide(entry: Entry, from: Point, to: Point, delay: number): boolean {
    glides.get(entry.id)?.cancel();
    glides.delete(entry.id);
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return false;
    const anim = entry.item.animate([{ translate: `${f(dx)}px ${f(dy)}px` }, { translate: '0px 0px' }], { duration: GLIDE, delay, easing: EASE, fill: 'backwards' });
    glides.set(entry.id, anim);
    anim.onfinish = () => {
      if (glides.get(entry.id) === anim) glides.delete(entry.id);
    };
    return true;
  }

  /** `quiet` re-lays out without motion (a resize, or a width set from outside). */
  function render(switched: boolean, quiet = false): void {
    const run = last;
    if (!run) return;
    const rootNode = run.nodes.find((n) => nameOf(n) === 'root');
    if (!rootNode) return;
    ensureFrame();
    const animate = canAnimate(root) && !quiet;
    const origin = stage!.getBoundingClientRect();
    const first = entries.size === 0;

    // Where every node is drawn right now, so movers glide from there (even mid-glide).
    const before = new Map<string, Point>();
    if (animate) for (const entry of entries.values()) {
      const p = live(entry, origin);
      if (p) before.set(entry.id, p);
    }

    model = buildModel(run, rootNode.id);
    const added: Entry[] = [];
    for (const node of run.nodes) {
      if (!model.level.has(node.id)) continue;
      let entry = entries.get(node.id);
      if (!entry) {
        entry = addNode(node);
        added.push(entry);
      }
      entry.parent = model.parent.get(node.id) ?? null;
      entry.contested = node.state === 'contested';
      syncEntry(entry, model.level.get(node.id)!, model.code.get(node.id) ?? '');
      syncContested(entry.item, node, entry.label, entry.button);
      if (entry.parent && !links.has(node.id)) {
        const path = svgEl(doc, 'path');
        path.setAttribute('class', 'ps-radial__link');
        path.setAttribute('pathLength', '1');
        lines!.append(path);
        links.set(node.id, path);
      }
      links.get(node.id)?.setAttribute('data-link', `${node.id}:${entry.parent}`);
    }
    for (const [id, entry] of entries) {
      if (model.level.has(id)) continue;
      entry.item.remove();
      entry.card.remove();
      entries.delete(id);
    }
    for (const [id, path] of links) if (!entries.get(id)?.parent) { path.remove(); links.delete(id); }

    const u = unit();
    const deepest = Math.max(...model.level.values());
    if (layout === 'radial') {
      positions = radialLayout(model);
      height = SIZE;
    } else {
      const v = verticalLayout(model, u);
      positions = v.pos;
      height = v.height;
      for (const [id, w] of v.column) {
        const entry = entries.get(id);
        if (entry) entry.maxW = w * u - 8;
      }
    }
    stage!.style.setProperty('--h', round(height));
    for (const [id, p] of positions) {
      const item = entries.get(id)!.item;
      item.style.setProperty('--x', round(p.x));
      item.style.setProperty('--y', round(p.y));
      item.style.setProperty('--r', round(p.r));
    }
    syncRings(deepest, first);
    placeLabels(u, animate && !switched && !first);
    drawLinks(false);

    const reviewNode = run.nodes.find((n) => nameOf(n) === 'review');
    if (reviewNode && !review) review = addReview(reviewNode);
    if (review) {
      if (reviewNode) syncContested(review, reviewNode, review.querySelector('.ps-radial__review-head'), review.querySelector('.ps-radial__more'));
      if (root.lastElementChild !== review) root.append(review);
    }
    syncOpen();

    if (!animate) return;
    let moved = false;
    const isNew = new Set(added.map((e) => e.id));
    for (const entry of entries.values()) {
      const to = modelPoint(entry.id, u);
      if (!to) continue;
      if (isNew.has(entry.id)) {
        // A newcomer grows out of its parent: from where the parent is drawn now.
        const parent = entry.parent;
        const from = (parent && (before.get(parent) ?? modelPoint(parent, u))) || to;
        const delay = first ? 140 * (entry.level - 1) : 0;
        glide(entry, from, to, delay);
        entry.button.animate([{ transform: 'scale(0)' }, { transform: 'none' }], { duration: 480, delay, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
        for (const el of [entry.label, entry.code]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: delay + 380, easing: EASE, fill: 'backwards' });
        links.get(entry.id)?.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 520, delay, easing: EASE, fill: 'backwards' });
        moved = true;
        continue;
      }
      const from = before.get(entry.id);
      if (from) moved = glide(entry, from, to, 0) || moved;
      // Labels may change side when the tree reshapes; a fresh fade hides the jump.
      if (switched) for (const el of [entry.label, entry.code, entry.leader]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: GLIDE - 160, easing: EASE, fill: 'backwards' });
    }
    if (moved || switched) settle(GLIDE + 40 + (first ? 140 * (deepest - 1) : 0));
  }

  function setLayout(next: Layout): void {
    if (next === layout) return;
    layout = next;
    root.setAttribute('data-layout', next);
    for (const [value, button] of toggles) button.setAttribute('aria-pressed', String(value === next));
    // A side that suited the other layout earns no stickiness in this one.
    for (const entry of entries.values()) {
      entry.placed = null;
      entry.codePlaced = null;
    }
    render(true);
  }

  function update(run: PsToolRun): void {
    last = run;
    render(false);
  }

  /** Lay out for a container this many pixels wide (tests; normally the ResizeObserver decides). */
  function layoutFor(px: number): void {
    widthOverride = px;
    render(false, true);
  }

  // A width change moves the vertical columns and the label sides; lines follow.
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        if (widthOverride !== null) return;
        const w = root.getBoundingClientRect().width;
        if (!stage || Math.abs(w - width) < 0.5) return;
        width = w;
        if (layout === 'vertical') render(false, true);
        else {
          placeLabels(unit());
          drawLinks(false);
        }
      })
    : null;
  observer?.observe(root);

  /** Stop the size watch, the line-settling loop and any glide still running once the canvas drops this view. */
  function destroy(): void {
    observer?.disconnect();
    if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = 0;
    settleUntil = 0;
    cancelAnimations(root);
  }

  return { el: root, update, layout: layoutFor, destroy };
}
