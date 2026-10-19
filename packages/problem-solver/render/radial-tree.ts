// packages/problem-solver/render/radial-tree.ts
// The Radial tree from the toolkit (Analyse): a yellow disc with a guide ring per level,
// a large red node for the subject at the centre, red nodes on the first ring, then
// smaller blue nodes on each ring out to the rim, joined to their parents by thin
// spokes. Each subtree takes a wedge of the disc in proportion to its leaves.
// A toggle switches to the book's vertical variation: a blue node at the top, a red
// row below it and yellow stacks under each red node, joined by elbow lines. The same
// node elements serve both layouts; they glide between their places.
// Levels 1–2 carry their title beside the node; deeper nodes show it on hover, focus
// or when open. A node exists only once its answer is accepted; only new nodes grow
// (out from their parent), and nodes that move because of a newcomer glide.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { levels, parentEdge } from '../tools/hierarchy.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type RadialTreeView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Layout = 'radial' | 'vertical';
type Pos = { x: number; y: number; r: number };
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Side = 'inside' | 'right' | 'left' | 'below' | 'above' | 'below-right' | 'below-left' | 'above-right' | 'above-left';

const SVG = 'http://www.w3.org/2000/svg';
/** The chart is 220 units across; the stage is at most this many pixels wide. */
const SIZE = 220;
const HALF = SIZE / 2;
const MAX_STAGE = 580;
const GLIDE = 600;

/** Radial: ring radius and node radius per level (1 at the centre, 5 at the rim). */
const RING = [0, 38, 66, 88, 102];
const NODE_R = [14, 9, 7, 5, 4];
/** Level 1 has no ring of its own; its guide circles the centre node. */
const CENTRE_GUIDE = 24;
/** Vertical: row centre and node radius per level; leaf width for levels 3+ (stacks overlap a little). */
const ROW_Y = [16, 58, 112, 146, 176];
const ROW_STEP = 30;
const V_R = [12, 10, 8, 6, 5];
const V_LEAF = [0, 0, 13, 10, 9];
const V_GAP = 6;

const at = (list: number[], level: number): number => list[Math.min(level, list.length) - 1];
const round = (n: number): string => String(Math.round(n * 100) / 100);
const f = (n: number): string => String(Math.round(n * 10) / 10);

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

type Entry = {
  id: string;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  label: HTMLSpanElement;
  card: HTMLElement;
  title: string;
  contested: boolean;
  level: number;
  parent: string | null;
  /** Widest a label may be, in px (vertical level 2 labels keep to their column). */
  maxW: number;
};

type Model = { root: string; parent: Map<string, string | null>; kids: Map<string, string[]>; level: Map<string, number> };

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

/** Recursive leaf-count partition of the full turn; the first branch points straight up. */
function radialLayout(model: Model): Map<string, Pos> {
  const leaves = leafCounts(model);
  const out = new Map<string, Pos>();
  const place = (id: string, start: number, sweep: number, level: number) => {
    const mid = start + sweep / 2;
    const r = level === 1 ? 0 : at(RING, level);
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
  return out;
}

const rowY = (level: number): number => (level <= ROW_Y.length ? ROW_Y[level - 1] : ROW_Y.at(-1)! + (level - ROW_Y.length) * ROW_STEP);

/**
 * Top-down tree: every leaf takes a column, a parent sits over the middle of its
 * children, and each level-2 branch keeps room for its label underneath.
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
  const pos = new Map<string, Pos>();
  const column = new Map<string, number>();
  let deepest = 1;
  const place = (id: string, left: number, level: number) => {
    const w = width.get(id)! * scale;
    const x = left + w / 2;
    deepest = Math.max(deepest, level);
    pos.set(id, { x, y: rowY(level), r: at(V_R, level) });
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
  const height = rowY(deepest) + at(V_R, deepest) + (deepest === 2 ? 40 / unit : deepest === 1 ? 12 : 8);
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

/** Sides to try, best first: away from the centre for radial nodes, under the node in rows. */
function preference(layout: Layout, level: number, p: Pos, tip: boolean): Side[] {
  if (tip) return ['above', 'below', 'right', 'left', 'above-right', 'above-left'];
  if (layout === 'vertical') return level === 1 ? ['right', 'left', 'below-right'] : ['below', 'below-right', 'below-left', 'right', 'left', 'above'];
  if (level === 1) return ['below', 'above', 'below-right', 'below-left', 'above-right', 'above-left', 'right', 'left'];
  const dx = p.x;
  const dy = p.y - HALF;
  const angle = Math.atan2(dy, dx);
  const ring: Side[] = ['right', 'below-right', 'below', 'below-left', 'left', 'above-left', 'above', 'above-right'];
  const k = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  // Outward first, then its neighbours either side, working round.
  const order: Side[] = [ring[k]];
  for (let i = 1; i <= 4; i += 1) order.push(ring[(k + i) % 8], ring[(k + 8 - i) % 8]);
  return [...new Set(order)];
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
  let positions = new Map<string, Pos>();
  let height = SIZE;
  let layout: Layout = 'radial';
  let last: PsToolRun | null = null;
  let model: Model | null = null;

  let bar: HTMLDivElement | null = null;
  let stage: HTMLDivElement | null = null;
  let disc: SVGSVGElement | null = null;
  let ringLayer: SVGGElement | null = null;
  let lines: SVGSVGElement | null = null;
  let panel: HTMLDivElement | null = null;
  let review: HTMLElement | null = null;
  const toggles = new Map<Layout, HTMLButtonElement>();
  let settleUntil = 0;
  let frame = 0;
  let width = 0;

  function unit(): number {
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
    const label = span(doc, 'ps-radial__label');
    const meta = span(doc, 'ps-radial__meta');
    label.append(meta, span(doc, 'ps-radial__title', nodeTitle(node)));
    if (node.state === 'contested') label.append(contestedTag(doc, node));
    button.append(label);
    item.append(button);

    const card = detailsCard(doc, node, 'red', detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);

    stage!.append(item);
    const entry: Entry = { id: node.id, item, button, label, card, title: nodeTitle(node), contested: node.state === 'contested', level: 0, parent: null, maxW: 112 };
    entries.set(node.id, entry);
    return entry;
  }

  function setLevel(entry: Entry, level: number): void {
    if (entry.level === level) return;
    entry.level = level;
    entry.item.setAttribute('data-level', String(level));
    entry.item.classList.toggle('is-deep', level >= 3);
    entry.label.classList.toggle('is-tip', level >= 3);
    entry.label.querySelector('.ps-radial__meta')!.textContent = level >= 3 ? `Level ${level}` : '';
    const card = entry.card.querySelector('.ps-details__card');
    card?.classList.remove('ps-details__card--red', 'ps-details__card--blue');
    card?.classList.add(`ps-details__card--${accentOf(level)}`);
    entry.button.setAttribute('aria-label', `Level ${level}: ${entry.title}${entry.contested ? ', contested' : ''}. Show details`);
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

  function buildModel(run: PsToolRun, rootId: string): Model {
    const level = levels(run, 'root', 'node') as Map<string, number>;
    const parent = new Map<string, string | null>([[rootId, null]]);
    const kids = new Map<string, string[]>();
    for (const node of run.nodes) {
      if (nameOf(node) !== 'node' || !level.has(node.id)) continue;
      const to = parentEdge(run, node.id)?.to as string | undefined;
      const p = to && level.get(to) === level.get(node.id)! - 1 ? to : rootId;
      parent.set(node.id, p);
      kids.set(p, [...(kids.get(p) ?? []), node.id]);
    }
    return { root: rootId, parent, kids, level };
  }

  /** A node's centre in stage pixels: where it is drawn now (mid-glide included), or where the model puts it. */
  function live(entry: Entry, origin: DOMRect): Point | null {
    const r = entry.button.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2 };
  }

  function modelPoint(id: string, u: number): Point | null {
    const p = positions.get(id);
    return p ? { x: (p.x + HALF) * u, y: p.y * u } : null;
  }

  function placeLabels(u: number): void {
    const placed: Box[] = [];
    const circles = [...positions].map(([id, p]) => ({ id, c: { x: (p.x + HALF) * u, y: p.y * u }, r: p.r * u + 3 }));
    const W = SIZE * u;
    const H = height * u;
    const order = [...entries.values()].filter((e) => positions.has(e.id)).sort((a, b) => a.level - b.level);
    for (const entry of order) {
      const p = positions.get(entry.id)!;
      const tip = entry.level >= 3;
      const R = p.r * u;
      const font = entry.level === 1 ? (W < 420 ? 13 : 14) : 12;
      const maxW = entry.level === 1 ? 150 : layout === 'vertical' && entry.level === 2 ? Math.max(48, Math.min(120, entry.maxW)) : 112;
      entry.label.style.setProperty('--lw', `${maxW}px`);
      // The real size when the page has laid out; an estimate otherwise. The side never
      // changes a label's size, so one measurement serves every candidate.
      let w = entry.label.offsetWidth;
      let h = entry.label.offsetHeight;
      if (!w || !h) {
        const textW = entry.title.length * font * 0.56;
        const lines = textW <= maxW ? 1 : 2;
        // The contested tag and a tip's level line can be wider than a short title.
        w = Math.max(Math.min(textW, maxW), entry.contested ? 74 : 0, tip ? 54 : 0) + (tip ? 16 : 12);
        h = lines * font * 1.2 + 4 + (entry.contested ? 16 : 0) + (tip ? 14 : 0);
      }
      const c = { x: (p.x + HALF) * u, y: p.y * u };
      // Each side, then the same side slid a little along the node's edge.
      const candidates: Array<{ side: Side; dx: number; dy: number; cost: number }> = [];
      preference(layout, entry.level, p, tip).forEach((side, i) => {
        candidates.push({ side, dx: 0, dy: 0, cost: i * 40 });
        const slide = side === 'left' || side === 'right' ? [0, Math.min(h / 2, R)] : side === 'above' || side === 'below' ? [Math.min(w / 3, R + 8), 0] : null;
        if (slide) for (const k of [1, -1]) candidates.push({ side, dx: slide[0] * k, dy: slide[1] * k, cost: i * 40 + 120 });
      });
      let best = candidates[0];
      let bestScore = Infinity;
      for (const cand of candidates) {
        const rel = sideBox(cand.side, R, w, h);
        const box = { x: c.x + rel.x + cand.dx, y: c.y + rel.y + cand.dy, w, h };
        let score = cand.cost;
        // Off the chart: off the disc in radial, off the stage in vertical.
        if (layout === 'radial' && !tip) {
          const corners = [[box.x, box.y], [box.x + w, box.y], [box.x, box.y + h], [box.x + w, box.y + h]];
          const out = corners.filter(([x, y]) => Math.hypot(x - W / 2, y - W / 2) > W / 2 - 3).length;
          score += out * w * h * 0.6;
        }
        const inside = overlap(box, { x: 0, y: 0, w: W, h: Math.max(H, layout === 'radial' ? W : 0) });
        score += (w * h - inside) * 8;
        // Tips float over the chart, so they only try to keep clear of other nodes.
        for (const other of circles) {
          if (other.id === entry.id) continue;
          score += overlap(box, { x: other.c.x - other.r, y: other.c.y - other.r, w: other.r * 2, h: other.r * 2 }) * (tip ? 2 : 4);
        }
        if (!tip) for (const done of placed) score += overlap(box, done) * 3;
        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      entry.label.setAttribute('data-side', best.side);
      entry.label.style.setProperty('--ldx', `${f(best.dx)}px`);
      entry.label.style.setProperty('--ldy', `${f(best.dy)}px`);
      if (!tip) {
        const rel = sideBox(best.side, R, w, h);
        placed.push({ x: c.x + rel.x + best.dx, y: c.y + rel.y + best.dy, w, h });
      }
    }
  }

  /** Spokes in the radial layout; elbows (across from the parent, then down) in the vertical one. */
  function drawLinks(useLive: boolean): void {
    if (!stage || !lines) return;
    const u = unit();
    const origin = stage.getBoundingClientRect();
    const W = SIZE * u;
    const H = useLive && origin.height ? origin.height : height * u;
    lines.setAttribute('viewBox', `0 0 ${f(W)} ${f(H)}`);
    const point = (id: string): Point | null => {
      const entry = entries.get(id);
      return (useLive && entry && live(entry, origin)) || modelPoint(id, u);
    };
    for (const [child, path] of links) {
      const parent = entries.get(child)?.parent;
      const a = parent ? point(parent) : null;
      const b = point(child);
      if (!a || !b) continue;
      if (layout === 'radial') {
        path.setAttribute('d', `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`);
        continue;
      }
      // Down from the parent, across a bus just over the child's row, and down into it.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) < 1 || dy <= 1) {
        path.setAttribute('d', `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`);
        continue;
      }
      const childR = (positions.get(child)?.r ?? 8) * u;
      const parentR = (positions.get(parent!)?.r ?? 10) * u;
      const level = entries.get(child)?.level ?? 2;
      const top = b.y - childR;
      const bus = level === 2 ? (a.y + parentR + top) / 2 : top - Math.min(9, (top - a.y) / 3);
      const bend = Math.max(0, Math.min(7, Math.abs(dx) / 2, (bus - a.y) / 2, (b.y - bus) / 2));
      const dir = Math.sign(dx);
      path.setAttribute('d', `M${f(a.x)} ${f(a.y)}V${f(bus - bend)}Q${f(a.x)} ${f(bus)} ${f(a.x + dir * bend)} ${f(bus)}H${f(b.x - dir * bend)}Q${f(b.x)} ${f(bus)} ${f(b.x)} ${f(bus + bend)}V${f(b.y)}`);
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
    for (let level = 1; level <= deepest; level += 1) {
      if (rings.has(level)) continue;
      const ring = svgEl(doc, 'circle');
      ring.setAttribute('class', 'ps-radial__ring');
      ring.setAttribute('data-level', String(level));
      const r = level === 1 ? CENTRE_GUIDE : at(RING, level);
      ring.setAttribute('r', String(r));
      ringLayer.append(ring);
      rings.set(level, ring);
      if (canAnimate(ring)) {
        // A new ring widens out from the one inside it.
        const inner = level <= 2 ? 0.3 : at(RING, level - 1) / r;
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

  /** `quiet` re-lays out without motion (a resize). */
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
      if (!model.level.has(node.id) || (node.id !== rootNode.id && !model.parent.has(node.id))) continue;
      let entry = entries.get(node.id);
      if (!entry) {
        entry = addNode(node);
        added.push(entry);
      }
      entry.parent = model.parent.get(node.id) ?? null;
      setLevel(entry, model.level.get(node.id)!);
      entry.item.classList.toggle('is-contested', node.state === 'contested');
      if (entry.parent && !links.has(node.id)) {
        const path = svgEl(doc, 'path');
        path.setAttribute('class', 'ps-radial__link');
        path.setAttribute('data-link', `${node.id}:${entry.parent}`);
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
      links.get(id)?.remove();
      links.delete(id);
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
    placeLabels(u);
    drawLinks(false);

    if (review && root.lastElementChild !== review) root.append(review);
    const reviewNode = run.nodes.find((n) => nameOf(n) === 'review');
    if (reviewNode && !review) review = addReview(reviewNode);
    if (review) review.classList.toggle('is-contested', reviewNode?.state === 'contested');
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
        moved = glide(entry, from, to, delay) || moved;
        entry.button.animate([{ transform: 'scale(0)' }, { transform: 'none' }], { duration: 480, delay, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
        entry.label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: delay + 380, easing: EASE, fill: 'backwards' });
        links.get(entry.id)?.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 520, delay, easing: EASE, fill: 'backwards' });
        moved = true;
        continue;
      }
      const from = before.get(entry.id);
      if (from) moved = glide(entry, from, to, 0) || moved;
      // Labels may change side when the tree reshapes; a fresh fade hides the jump.
      if (switched) entry.label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: GLIDE - 160, easing: EASE, fill: 'backwards' });
    }
    if (moved || switched) settle(GLIDE + 40 + (first ? 140 * (deepest - 1) : 0));
  }

  function setLayout(next: Layout): void {
    if (next === layout) return;
    layout = next;
    root.setAttribute('data-layout', next);
    for (const [value, button] of toggles) button.setAttribute('aria-pressed', String(value === next));
    render(true);
  }

  function update(run: PsToolRun): void {
    last = run;
    render(false);
  }

  // A width change moves the vertical columns and the label sides; lines follow.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const w = stage?.getBoundingClientRect().width ?? 0;
      if (!stage || Math.abs(w - width) < 0.5) return;
      width = w;
      if (layout === 'vertical') render(false, true);
      else {
        placeLabels(unit());
        drawLinks(false);
      }
    }).observe(root);
  }

  return { el: root, update };
}
