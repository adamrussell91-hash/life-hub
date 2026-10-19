// packages/problem-solver/render/causal-map.ts
// The Causal map from the toolkit: a red circle for the problem on the left, a
// column of yellow half-discs (dome up) for the causes in the middle, and on the
// right a blue strip of interlocking downward arrowheads for the wider influences.
// Thin arrows run from influences to causes and from causes to the problem, each
// marked + (makes it more) or − (makes it less); strong links are thicker.
// A shape exists only once its answer is accepted; only new shapes and links animate.
// Shapes that move because a neighbour arrived glide to their new place, and the
// links follow them while anything is moving.
import type { Accent } from './details';
import type { PsEdge, PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { slotLabel } from './outline';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

const SVG = 'http://www.w3.org/2000/svg';
const MINUS = '−';

export type CausalMapView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Kind = 'problem' | 'cause' | 'influence';
type RegionName = 'problem' | 'causes' | 'influences';
type Sign = 'plus' | 'minus';
type Strength = 'strong' | 'normal';
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

const ACCENT: Record<Kind, Accent> = { problem: 'red', cause: 'yellow', influence: 'blue' };
const REGION: Record<Kind, RegionName> = { problem: 'problem', cause: 'causes', influence: 'influences' };
const REGION_LABEL: Record<RegionName, string> = { problem: 'The problem', causes: 'Causes', influences: 'Influences' };
const EDGE_KINDS: Record<string, [Sign, Strength]> = {
  plus: ['plus', 'normal'],
  minus: ['minus', 'normal'],
  plus_strong: ['plus', 'strong'],
  minus_strong: ['minus', 'strong']
};

/**
 * Influence arrowheads, as fractions of their box: the top edge tilts one way or the
 * other in turn and the tip leans to match, so the stacked strip zig-zags like the book.
 * The CSS clip-paths in problem-solver.css use the same numbers.
 */
const ARROWHEAD = {
  odd: { topLeft: 0, topRight: 0.14, tip: 0.56 },
  even: { topLeft: 0.14, topRight: 0, tip: 0.44 }
};

function kindOf(node: PsNode): Kind | null {
  const name = parseSlot(node.slot)?.name;
  return name === 'problem' || name === 'cause' || name === 'influence' ? name : null;
}

const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, name: K): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG, name) as SVGElementTagNameMap[K];
}

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

function metaLabel(node: PsNode, kind: Kind): string {
  return kind === 'problem' ? 'The problem' : slotLabel(node.slot);
}

const f = (n: number): string => String(Math.round(n * 10) / 10);

/** Where a link leaves or meets a shape, on the side facing the other end. */
function anchor(kind: Kind, box: Box, side: 'left' | 'right' | 'top' | 'bottom' | 'loop', parity: 'odd' | 'even', toward: Point): Point {
  const cx = box.x + box.w / 2;
  if (kind === 'problem') {
    const cy = box.y + box.h / 2;
    const r = Math.min(box.w, box.h) / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
  }
  if (kind === 'cause') {
    // A point on the dome just above the flat edge, where the book's arrows land.
    const reach = (box.w / 2) * 0.98;
    // Loops between causes leave higher on the dome, clear of the links to the problem.
    if (side === 'loop') return { x: cx - (box.w / 2) * 0.8, y: box.y + box.h * 0.4 };
    if (side === 'left') return { x: cx - reach, y: box.y + box.h * 0.8 };
    if (side === 'right') return { x: cx + reach, y: box.y + box.h * 0.8 };
    if (side === 'top') return { x: cx, y: box.y };
    return { x: cx, y: box.y + box.h };
  }
  const shape = ARROWHEAD[parity];
  const at = 0.3; // level of the label, the widest visible band of each arrowhead
  if (side === 'left' || side === 'loop') {
    const t = Math.max(0, (at - shape.topLeft) / (1 - shape.topLeft));
    return { x: box.x + shape.tip * box.w * t, y: box.y + box.h * at };
  }
  if (side === 'right') {
    const t = Math.max(0, (at - shape.topRight) / (1 - shape.topRight));
    return { x: box.x + box.w - (1 - shape.tip) * box.w * t, y: box.y + box.h * at };
  }
  if (side === 'top') return { x: cx, y: box.y + box.h * 0.07 };
  return { x: box.x + shape.tip * box.w, y: box.y + box.h };
}

type Route = { d: string; mask: string; head: string; mid: Point };

/**
 * A gentle arc from one anchor to the other, ending in a small arrowhead. Links between
 * columns bow slightly to one side of the straight line (as the book's arrows run nearly
 * straight); links inside one column loop out to the left.
 */
function route(a: Point, b: Point, axis: 'line' | 'bow', strong: boolean): Route {
  let c1: Point;
  let c2: Point;
  if (axis === 'bow') {
    const reach = 22 + Math.abs(b.y - a.y) * 0.16;
    const x = Math.max(10, Math.min(a.x, b.x) - reach); // stays on the map when a cause sits at its left edge
    c1 = { x, y: a.y };
    c2 = { x, y: b.y };
  } else {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Bend to the left of travel, a few percent of the length.
    const bend = Math.min(18, len * 0.07);
    const nx = (dy / len) * bend;
    const ny = (-dx / len) * bend;
    c1 = { x: a.x + dx / 3 + nx, y: a.y + dy / 3 + ny };
    c2 = { x: a.x + (2 * dx) / 3 + nx, y: a.y + (2 * dy) / 3 + ny };
  }
  // The line stops at the base of the arrowhead; the head's tip touches the shape.
  const len = strong ? 10 : 8;
  const half = strong ? 5.5 : 4.5;
  const tx = b.x - c2.x;
  const ty = b.y - c2.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const base = { x: b.x - ux * len, y: b.y - uy * len };
  const head = `M${f(b.x)} ${f(b.y)}L${f(base.x - uy * half)} ${f(base.y + ux * half)}L${f(base.x + uy * half)} ${f(base.y - ux * half)}Z`;
  const curve = (end: Point) => `M${f(a.x)} ${f(a.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(end.x)} ${f(end.y)}`;
  // The +/− badge sits past the middle, towards the shape it acts on, as in the book.
  const t = axis === 'bow' || Math.hypot(b.x - a.x, b.y - a.y) < 90 ? 0.5 : 0.64;
  const u = 1 - t;
  const at = (p0: number, p1: number, p2: number, p3: number) => u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  const mid = { x: at(a.x, c1.x, c2.x, b.x), y: at(a.y, c1.y, c2.y, b.y) };
  return { d: curve(base), mask: curve(b), head, mid };
}

type Link = {
  group: SVGGElement;
  path: SVGPathElement;
  head: SVGPathElement;
  maskPath: SVGPathElement;
  badge: SVGGElement;
  badgeText: SVGTextElement;
  edge: PsEdge;
};

export function createCausalMapView(doc: Document = document): CausalMapView {
  const root = doc.createElement('div');
  root.className = 'ps-causal';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Causal map');

  const group = createDisclosureGroup();
  const items = new Map<string, HTMLElement>();
  const cards = new Map<string, HTMLElement>();
  const kinds = new Map<string, Kind>();
  const parity = new Map<string, 'odd' | 'even'>();
  const links = new Map<string, Link>();

  let map: HTMLDivElement | null = null;
  let overlay: SVGSVGElement | null = null;
  let defs: SVGDefsElement | null = null;
  let legend: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  const regions = {} as Record<RegionName, HTMLDivElement>;
  let settleUntil = 0;
  let frame = 0;

  function ensureFrame(): void {
    if (map) return;
    map = doc.createElement('div');
    map.className = 'ps-causal__map';
    overlay = svgEl(doc, 'svg');
    overlay.setAttribute('class', 'ps-causal__lines');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    defs = svgEl(doc, 'defs');
    overlay.append(defs);
    map.append(overlay);
    for (const name of ['problem', 'causes', 'influences'] as const) {
      const region = doc.createElement('div');
      region.className = `ps-causal__region ps-causal__region--${name}`;
      region.setAttribute('data-region', name);
      region.setAttribute('aria-label', REGION_LABEL[name]);
      regions[name] = region;
      map.append(region);
    }
    panel = doc.createElement('div');
    panel.className = 'ps-causal__panel';
    root.append(map, panel);
  }

  function ensureLegend(): void {
    if (legend || !map) return;
    legend = doc.createElement('div');
    legend.className = 'ps-causal__legend';
    const entry = (className: string, mark: string, label: string) => {
      const row = span(doc, `ps-causal__key ${className}`);
      row.append(span(doc, 'ps-causal__key-mark', mark), span(doc, 'ps-causal__key-label', label));
      return row;
    };
    const strength = span(doc, 'ps-causal__key ps-causal__key--strength');
    strength.append(span(doc, 'ps-causal__key-line'), span(doc, 'ps-causal__key-line ps-causal__key-line--strong'), span(doc, 'ps-causal__key-label', 'Thicker: stronger'));
    legend.append(entry('ps-causal__key--plus', '+', 'makes it more'), entry('ps-causal__key--minus', MINUS, 'makes it less'), strength);
    map.after(legend);
    if (canAnimate(legend)) legend.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 520, easing: EASE, fill: 'backwards' });
  }

  function syncOpen(): void {
    let anyOpen = false;
    for (const [id, item] of items) {
      const open = item.classList.contains('is-open');
      anyOpen ||= open;
      cards.get(id)?.classList.toggle('is-open', open);
    }
    root.classList.toggle('has-open', anyOpen);
    for (const link of links.values()) {
      const touches = [link.edge.from, link.edge.to].some((id) => items.get(id)?.classList.contains('is-open'));
      link.group.classList.toggle('is-active', touches);
    }
  }

  function addNode(node: PsNode, kind: Kind): HTMLElement {
    ensureFrame();
    const detailsId = nextId('ps-causal-details');
    const item = doc.createElement('div');
    item.className = `ps-causal__item ps-causal__item--${kind}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-causal__shape';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', `${metaLabel(node, kind)}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
    const body = span(doc, 'ps-causal__body');
    const fill = span(doc, 'ps-causal__fill');
    const label = span(doc, 'ps-causal__label');
    label.append(span(doc, 'ps-causal__meta', metaLabel(node, kind)), span(doc, 'ps-causal__title', nodeTitle(node)));
    if (node.state === 'contested') label.append(contestedTag(doc, node));
    body.append(fill, label);
    button.append(body);
    item.append(button);

    const card = detailsCard(doc, node, ACCENT[kind], detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);

    items.set(node.id, item);
    cards.set(node.id, card);
    kinds.set(node.id, kind);
    animateIn(item, kind);
    return item;
  }

  function animateIn(item: HTMLElement, kind: Kind): void {
    const fill = item.querySelector<HTMLElement>('.ps-causal__fill');
    const label = item.querySelector<HTMLElement>('.ps-causal__label');
    if (!fill || !label || !canAnimate(fill)) return;
    const shape: Keyframe[] =
      kind === 'problem'
        ? [{ opacity: 0, transform: 'scale(0.55)' }, { opacity: 1, transform: 'none' }]
        : kind === 'cause'
          ? [{ opacity: 0, transform: 'scale(0.7, 0.08)' }, { opacity: 1, transform: 'none' }] // grows up from its flat edge
          : [{ opacity: 0, transform: 'translateY(-38%)' }, { opacity: 1, transform: 'none' }]; // slides down into the strip
    fill.animate(shape, { duration: kind === 'influence' ? 480 : 520, easing: EASE, fill: 'backwards' });
    label.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 240, easing: EASE, fill: 'backwards' });
  }

  function boxOf(id: string, origin: DOMRect): Box | null {
    const r = items.get(id)?.querySelector('.ps-causal__fill')?.getBoundingClientRect();
    return r ? { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height } : null;
  }

  function layout(): void {
    if (!map || !overlay) return;
    const origin = map.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${f(Math.max(origin.width, 1))} ${f(Math.max(origin.height, 1))}`);
    const boxes = new Map<string, Box>();
    for (const id of items.keys()) {
      const b = boxOf(id, origin);
      if (b) boxes.set(id, b);
    }
    // Several links leaving (or reaching) one shape fan out a little instead of sharing a point.
    const outs = new Map<string, string[]>();
    const ins = new Map<string, string[]>();
    for (const [key, link] of links) {
      outs.set(link.edge.from, [...(outs.get(link.edge.from) ?? []), key]);
      ins.set(link.edge.to, [...(ins.get(link.edge.to) ?? []), key]);
    }
    // Stacked when the problem sits below the causes (the narrowest container query).
    const problemBox = regions.problem.getBoundingClientRect();
    const causesBox = regions.causes.getBoundingClientRect();
    const stacked = causesBox.height > 0 && problemBox.top >= causesBox.bottom - 1;
    const spread = (list: string[] | undefined, key: string) => {
      if (!list || list.length < 2) return 0;
      return (list.indexOf(key) - (list.length - 1) / 2) * 9;
    };
    for (const [key, link] of links) {
      const { from, to } = link.edge;
      const a = boxes.get(from);
      const b = boxes.get(to);
      if (!a || !b) continue;
      const ka = kinds.get(from)!;
      const kb = kinds.get(to)!;
      const centre = (r: Box) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const ca = centre(a);
      const cb = centre(b);
      let axis: 'line' | 'bow' = 'line';
      let start: Point;
      let end: Point;
      const strong = link.group.getAttribute('data-strength') === 'strong';
      if (ka === kb) {
        axis = 'bow';
        start = anchor(ka, a, 'loop', parity.get(from) ?? 'odd', cb);
        end = anchor(kb, b, 'loop', parity.get(to) ?? 'odd', ca);
      } else if (stacked) {
        // Narrow layout: down from the upper shape into the top of the lower one.
        const down = cb.y > ca.y;
        start = anchor(ka, a, down ? 'bottom' : 'top', parity.get(from) ?? 'odd', cb);
        end = anchor(kb, b, down ? 'top' : 'bottom', parity.get(to) ?? 'odd', start);
        start.x += spread(outs.get(from), key);
        if (kb !== 'problem') end.x += spread(ins.get(to), key);
      } else {
        const leftward = cb.x < ca.x;
        start = anchor(ka, a, leftward ? 'left' : 'right', parity.get(from) ?? 'odd', cb);
        end = anchor(kb, b, leftward ? 'right' : 'left', parity.get(to) ?? 'odd', start);
        start.y += spread(outs.get(from), key);
        if (kb !== 'problem') end.y += spread(ins.get(to), key);
      }
      const r = route(start, end, axis, strong);
      link.path.setAttribute('d', r.d);
      link.maskPath.setAttribute('d', r.mask);
      link.head.setAttribute('d', r.head);
      link.badge.setAttribute('transform', `translate(${f(r.mid.x)} ${f(r.mid.y)})`);
    }
  }

  /** Keep links attached to shapes while anything is gliding or growing. */
  function settle(ms: number): void {
    if (typeof requestAnimationFrame !== 'function' || !canAnimate(root)) return;
    settleUntil = Math.max(settleUntil, performance.now() + ms);
    if (frame) return;
    const tick = () => {
      layout();
      frame = performance.now() < settleUntil ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
  }

  function addLink(key: string, edge: PsEdge): Link {
    const g = svgEl(doc, 'g');
    g.setAttribute('class', 'ps-causal__edge');
    g.setAttribute('data-edge', `${edge.from}:${edge.to}`);
    const maskId = nextId('ps-causal-mask');
    const mask = svgEl(doc, 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    const maskPath = svgEl(doc, 'path');
    maskPath.setAttribute('class', 'ps-causal__reveal');
    maskPath.setAttribute('pathLength', '1');
    mask.append(maskPath);
    defs!.append(mask);

    const stroke = svgEl(doc, 'g');
    stroke.setAttribute('class', 'ps-causal__stroke');
    stroke.setAttribute('mask', `url(#${maskId})`);
    const path = svgEl(doc, 'path');
    path.setAttribute('class', 'ps-causal__path');
    const head = svgEl(doc, 'path');
    head.setAttribute('class', 'ps-causal__head');
    stroke.append(path, head);

    // The badge's position lives on the outer group; the pop animates the inner one.
    const badge = svgEl(doc, 'g');
    badge.setAttribute('class', 'ps-causal__badge');
    const pop = svgEl(doc, 'g');
    pop.setAttribute('class', 'ps-causal__badge-pop');
    const dot = svgEl(doc, 'circle');
    dot.setAttribute('r', '8');
    const badgeText = svgEl(doc, 'text');
    badgeText.setAttribute('text-anchor', 'middle');
    badgeText.setAttribute('dy', '0.36em');
    pop.append(dot, badgeText);
    badge.append(pop);
    g.append(stroke, badge);
    overlay!.append(g);

    if (canAnimate(maskPath)) {
      maskPath.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, delay: 260, easing: EASE, fill: 'backwards' });
      pop.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 560, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' });
    }
    const link = { group: g, path, head, maskPath, badge, badgeText, edge };
    links.set(key, link);
    return link;
  }

  function update(run: PsToolRun): void {
    // Where every shape sits now, so shapes pushed by a newcomer can glide.
    const before = new Map<string, Box>();
    const animate = canAnimate(root) && map !== null;
    if (animate) {
      const origin = map!.getBoundingClientRect();
      for (const id of items.keys()) {
        const b = boxOf(id, origin);
        if (b) before.set(id, b);
      }
    }

    const added: string[] = [];
    for (const kind of ['problem', 'cause', 'influence'] as const) {
      const nodes = run.nodes.filter((n) => kindOf(n) === kind).sort((a, b) => indexOf(a) - indexOf(b));
      nodes.forEach((node, index) => {
        let item = items.get(node.id);
        if (!item) {
          item = addNode(node, kind);
          added.push(node.id);
        }
        item.classList.toggle('is-contested', node.state === 'contested');
        const region = regions[REGION[kind]];
        if (region.children[index] !== item) region.insertBefore(item, region.children[index] ?? null);
      });
      if (kind === 'influence') {
        nodes.forEach((node, index) => {
          const p = index % 2 === 0 ? 'odd' : 'even';
          parity.set(node.id, p);
          const item = items.get(node.id)!;
          item.classList.toggle('is-odd', p === 'odd');
          item.classList.toggle('is-even', p === 'even');
        });
      }
    }

    // Links: one per edge between two drawn shapes; new ones draw in.
    const keep = new Set<string>();
    for (const edge of run.edges) {
      const style = EDGE_KINDS[edge.kind];
      if (!style || !items.has(edge.from) || !items.has(edge.to)) continue;
      const key = `${edge.from}\u0000${edge.to}`;
      keep.add(key);
      const link = links.get(key) ?? addLink(key, edge);
      link.edge = edge;
      const [sign, strength] = style;
      link.group.setAttribute('data-sign', sign);
      link.group.setAttribute('data-strength', strength);
      link.badgeText.textContent = sign === 'plus' ? '+' : MINUS;
    }
    for (const [key, link] of links) {
      if (keep.has(key)) continue;
      link.group.remove();
      link.maskPath.parentElement?.remove();
      links.delete(key);
    }
    if (links.size) ensureLegend();

    layout();
    syncOpen();

    if (animate && before.size) {
      const origin = map!.getBoundingClientRect();
      for (const [id, old] of before) {
        const now = boxOf(id, origin);
        if (!now) continue;
        const dx = old.x - now.x;
        const dy = old.y - now.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        items.get(id)!.querySelector<HTMLElement>('.ps-causal__body')?.animate(
          [{ transform: `translate(${f(dx)}px, ${f(dy)}px)` }, { transform: 'none' }],
          { duration: 460, easing: EASE }
        );
      }
    }
    if (added.length || before.size) settle(820);
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layout()).observe(root);

  return { el: root, update };
}
