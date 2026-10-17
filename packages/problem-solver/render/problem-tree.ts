// packages/problem-solver/render/problem-tree.ts
// The Problem tree from the toolkit (p.51), read bottom to top: blue causes feed
// the red problem, which feeds the yellow effects sitting on a large blue oval.
// Relationship curves are drawn in an SVG layer behind the cards.
// A shape exists only once its answer is accepted; only new shapes animate.
import type { Accent } from './details';
import type { PsEdge, PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { slotLabel } from './outline';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

const SVG = 'http://www.w3.org/2000/svg';

export type ProblemTreeView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Kind = 'trunk' | 'cause' | 'effect';
const ACCENT: Record<Kind, Accent> = { trunk: 'red', cause: 'blue', effect: 'yellow' };
const REGION_LABEL: Record<string, string> = { effects: 'Effects', trunk: 'The problem', causes: 'Causes' };

function kindOf(node: PsNode): Kind | null {
  const name = parseSlot(node.slot)?.name;
  return name === 'trunk' || name === 'cause' || name === 'effect' ? name : null;
}

function byIndex(a: PsNode, b: PsNode): number {
  return (parseSlot(a.slot)?.index ?? 0) - (parseSlot(b.slot)?.index ?? 0);
}

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, name: K): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG, name) as SVGElementTagNameMap[K];
}

function metaLabel(node: PsNode, kind: Kind): string {
  return kind === 'trunk' ? 'The problem' : slotLabel(node.slot);
}

function shapeButton(doc: Document, node: PsNode, kind: Kind, detailsId: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ps-tree__shape';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', detailsId);
  const meta = doc.createElement('span');
  meta.className = 'ps-tree__meta';
  meta.textContent = metaLabel(node, kind);
  const title = doc.createElement('span');
  title.className = 'ps-tree__title';
  title.textContent = nodeTitle(node);
  button.append(meta, title);
  if (node.state === 'contested') button.append(contestedTag(doc, node));
  button.setAttribute('aria-label', `${metaLabel(node, kind)}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
  return button;
}

type Box = { x: number; y: number; w: number; h: number };

const ARROW_LEN = 34;

/** Smooth cubic from the facing edge of one card to the facing edge of the other. */
function curve(a: Box, b: Box, ka: Kind, kb: Kind): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  if (ka !== kb) {
    // Cause (below the trunk) to effect (above it): bottom of the effect, top of the cause.
    const [low, high] = ka === 'cause' ? [a, b] : [b, a];
    const x1 = low.x + low.w / 2;
    const y1 = low.y;
    const x2 = high.x + high.w / 2;
    const y2 = high.y + high.h;
    const lift = Math.max(40, Math.abs(y1 - y2) * 0.45);
    const d = `M${f(x1)} ${f(y1)}C${f(x1)} ${f(y1 - lift)} ${f(x2)} ${f(y2 + lift)} ${f(x2)} ${f(y2)}`;
    return d;
  }
  const cy = (r: Box) => r.y + r.h / 2;
  const apart = a.x + a.w <= b.x || b.x + b.w <= a.x;
  if (apart && Math.abs(cy(a) - cy(b)) < Math.max(a.h, b.h)) {
    // Same row: out of the facing sides.
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    const x1 = left.x + left.w;
    const x2 = right.x;
    const bow = ka === 'cause' ? 1 : -1; // causes bow downward, effects upward
    const mid = (x1 + x2) / 2;
    return `M${f(x1)} ${f(cy(left))}C${f(mid)} ${f(cy(left) + bow * 18)} ${f(mid)} ${f(cy(right) + bow * 18)} ${f(x2)} ${f(cy(right))}`;
  }
  // Different rows: arc out of the left edge of both.
  const x = Math.min(a.x, b.x);
  const reach = 34;
  return `M${f(a.x)} ${f(cy(a))}C${f(x - reach)} ${f(cy(a))} ${f(x - reach)} ${f(cy(b))} ${f(b.x)} ${f(cy(b))}`;
}

function arrowPath(x: number, tipY: number, tailY: number): string {
  // Flat up-arrow: stem plus a chevron head, 24px wide.
  const head = 11;
  const stem = 4;
  const w = 12;
  return `M${x - stem} ${tailY}V${tipY + head}H${x - w}L${x} ${tipY}L${x + w} ${tipY + head}H${x + stem}V${tailY}Z`;
}

export function createProblemTreeView(doc: Document = document): ProblemTreeView {
  const root = doc.createElement('div');
  root.className = 'ps-tree';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Problem tree');

  const regions: Record<'effects' | 'trunk' | 'causes', { el: HTMLElement; row: HTMLElement; panel: HTMLElement }> = {} as never;
  for (const name of ['effects', 'trunk', 'causes'] as const) {
    const el = doc.createElement('div');
    el.className = `ps-tree__region ps-tree__region--${name}`;
    el.setAttribute('data-region', name);
    el.setAttribute('role', 'list');
    el.setAttribute('aria-label', REGION_LABEL[name]);
    const row = doc.createElement('div');
    row.className = 'ps-tree__row';
    row.setAttribute('role', 'presentation');
    const panel = doc.createElement('div');
    panel.className = 'ps-tree__panel';
    panel.setAttribute('role', 'presentation');
    el.append(row, panel);
    regions[name] = { el, row, panel };
  }

  const overlay = svgEl(doc, 'svg');
  overlay.setAttribute('class', 'ps-tree__lines');
  overlay.setAttribute('aria-hidden', 'true');
  root.append(overlay, regions.effects.el, regions.trunk.el, regions.causes.el);

  const group = createDisclosureGroup();
  const items = new Map<string, HTMLElement>();
  const arrows = new Map<string, SVGPathElement>();
  const links = new Map<string, SVGPathElement>();
  const kinds = new Map<string, Kind>();
  let edges: PsEdge[] = [];
  let oval: HTMLElement | null = null;

  function layout(): void {
    const box = root.getBoundingClientRect();
    overlay.setAttribute('viewBox', `0 0 ${Math.max(box.width, 1)} ${Math.max(box.height, 1)}`);
    const rect = (id: string) => {
      const r = items.get(id)?.querySelector('.ps-tree__shape')?.getBoundingClientRect();
      return r ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height } : null;
    };
    const trunkId = [...kinds].find(([, kind]) => kind === 'trunk')?.[0];
    const trunk = trunkId ? rect(trunkId) : null;

    const causeIds = [...kinds].filter(([, k]) => k === 'cause').map(([id]) => id);
    const effectIds = [...kinds].filter(([, k]) => k === 'effect').map(([id]) => id);

    // One arrow from the causes up into the trunk, one from the trunk up into the effects, both centred on the trunk.
    const wanted = new Set<string>();
    const cx = trunk ? trunk.x + trunk.w / 2 : 0;
    if (trunk) {
      const top = (ids: string[]) => Math.min(...ids.map((id) => rect(id)?.y ?? Infinity));
      const bottom = (ids: string[]) => Math.max(...ids.map((id) => { const r = rect(id); return r ? r.y + r.h : -Infinity; }));
      if (causeIds.length) {
        wanted.add('causes');
        const from = trunk.y + trunk.h;
        const gap = top(causeIds) - from;
        placeArrow('causes', cx, from + gap / 2 + ARROW_LEN / 2, from + gap / 2 - ARROW_LEN / 2);
      }
      if (effectIds.length) {
        wanted.add('effects');
        const from = bottom(effectIds);
        const gap = trunk.y - from;
        placeArrow('effects', cx, from + gap / 2 + ARROW_LEN / 2, from + gap / 2 - ARROW_LEN / 2);
      }
    }
    for (const [id, path] of arrows) {
      if (!wanted.has(id)) {
        path.remove();
        arrows.delete(id);
      }
    }

    for (const [key, path] of links) {
      const [from, to] = key.split('\u0000');
      const a = rect(from);
      const b = rect(to);
      if (!a || !b) continue;
      path.setAttribute('d', curve(a, b, kinds.get(from)!, kinds.get(to)!));
    }
  }

  /** Emphasise the lines of any open card. */
  function refreshActive(): void {
    for (const [key, path] of links) {
      const open = key.split('\u0000').some((id) => items.get(id)?.querySelector('.ps-tree__shape')?.getAttribute('aria-expanded') === 'true');
      path.classList.toggle('is-active', open);
    }
  }

  /** `tipY` is where the arrow points; `tailY` where it starts. Arrows point up on screen. */
  function placeArrow(id: string, x: number, from: number, to: number): void {
    // from/to are the two ends (the lower one is the tail).
    const tail = Math.max(from, to);
    const tip = Math.min(from, to);
    let path = arrows.get(id);
    if (!path) {
      path = svgEl(doc, 'path');
      path.setAttribute('class', 'ps-tree__arrow');
      overlay.append(path);
      arrows.set(id, path);
      if (canAnimate(path)) path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 200, easing: EASE, fill: 'backwards' });
    }
    path.setAttribute('d', arrowPath(x, tip, tail));
  }

  function animateIn(item: HTMLElement): void {
    if (!canAnimate(item)) return;
    item.animate([{ opacity: 0, transform: 'translateY(10px) scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
  }

  function ensureOval(): void {
    if (oval) return;
    oval = doc.createElement('div');
    oval.className = 'ps-tree__oval';
    oval.setAttribute('aria-hidden', 'true');
    regions.effects.el.prepend(oval);
    root.classList.add('has-oval');
    if (canAnimate(oval)) oval.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EASE, fill: 'backwards' });
  }

  function addNode(node: PsNode, kind: Kind): HTMLElement {
    const detailsId = nextId('ps-tree-details');
    const item = doc.createElement('div');
    item.className = `ps-tree__item ps-tree__item--${kind}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = shapeButton(doc, node, kind, detailsId);
    item.append(button);
    const region = regions[kind === 'trunk' ? 'trunk' : kind === 'cause' ? 'causes' : 'effects'];
    const card = detailsCard(doc, node, ACCENT[kind], detailsId);
    card.setAttribute('data-for', node.id);
    region.panel.append(card);
    group.register(card, button);
    button.addEventListener('click', refreshActive);
    if (kind === 'effect') ensureOval();
    items.set(node.id, item);
    kinds.set(node.id, kind);
    animateIn(item);
    return item;
  }

  function update(run: PsToolRun): void {
    for (const kind of ['trunk', 'cause', 'effect'] as const) {
      const nodes = run.nodes.filter((n) => kindOf(n) === kind).sort(byIndex);
      const row = regions[kind === 'trunk' ? 'trunk' : kind === 'cause' ? 'causes' : 'effects'].row;
      nodes.forEach((node, index) => {
        const item = items.get(node.id) ?? addNode(node, kind);
        item.classList.toggle('is-contested', node.state === 'contested');
        if (row.children[index] !== item) row.insertBefore(item, row.children[index] ?? null);
      });
    }
    regions.effects.el.classList.toggle('has-nodes', regions.effects.row.children.length > 0);
    regions.causes.el.classList.toggle('has-nodes', regions.causes.row.children.length > 0);
    regions.trunk.el.classList.toggle('has-nodes', regions.trunk.row.children.length > 0);

    // Relationships: one line per edge between two drawn nodes; new lines draw in.
    edges = run.edges.filter((edge) => edge.kind === 'relates' && items.has(edge.from) && items.has(edge.to));
    const keep = new Set<string>();
    for (const edge of edges) {
      const key = `${edge.from}\u0000${edge.to}`;
      keep.add(key);
      if (links.has(key)) continue;
      const line = svgEl(doc, 'path');
      line.setAttribute('class', 'ps-tree__edge');
      line.setAttribute('pathLength', '1');
      line.setAttribute('data-edge', `${edge.from}:${edge.to}`);
      overlay.prepend(line);
      links.set(key, line);
      if (canAnimate(line)) line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, delay: 240, easing: EASE, fill: 'backwards' });
    }
    for (const [key, link] of links) {
      if (!keep.has(key)) {
        link.remove();
        links.delete(key);
      }
    }
    layout();
    refreshActive();
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layout()).observe(root);

  return { el: root, update };
}
