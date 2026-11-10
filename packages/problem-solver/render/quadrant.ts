// packages/problem-solver/render/quadrant.ts
// A config-driven 2x2 chart, drawn as the Eisenhower matrix was first drawn: a yellow header band
// split in two over a 2x2 grid, a yellow side band down the left split in two (words running up
// it), a coloured quadrant each with a flat picture, and items as pills under the picture. The
// config names the quadrants in reading order (top left, top right, bottom left, bottom right),
// the two column words and the two row words. The grid and pictures appear with the run's first
// item; each item drops in on arrival. An item whose quadrant changes moves there, the same
// element (FLIP by measured centres). An item in a quadrant that can become a task carries a
// small "Task" tag with its live status (setTasks); a deleted task's item says "Task removed".
// An item with a pending proposal (setProposed) says so. Details open in one panel under the
// chart. Phone: smaller pictures; under 340px the bands go and the quadrants stack, each
// carrying its two axis words as meta. Styles are shared under the ps-eisen prefix.
import type { PsNode, PsTaskLink, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { taskStatusLabel } from './task-status';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type QuadrantView = {
  el: HTMLDivElement;
  update(run: PsToolRun): void;
  setTasks(links: PsTaskLink[]): void;
  /** Node ids with a task proposal waiting for the person's answer. */
  setProposed(nodeIds: string[]): void;
  destroy(): void;
};

type Fill = 'blue' | 'yellow' | 'red';
type Quadrant = string;
/** One flat shape of a quadrant's picture, in a 100 x 100 box. */
export type QuadrantShape = { tag: 'polygon' | 'circle' | 'path' | 'rect'; attrs: Record<string, string> };
export type QuadrantSpec = { id: string; heading: string; fill: Fill; shapes: QuadrantShape[] };
export type QuadrantConfig = {
  /** Label on the root group, e.g. "Eisenhower matrix". */
  label: string;
  /** Grid: top left, top right, bottom left, bottom right. Lists: left to right. */
  quadrants: QuadrantSpec[];
  /** Grid only: words over the left and right columns. */
  columns?: [string, string];
  /** Grid only: words beside the top and bottom rows. */
  rows?: [string, string];
  /** 'lists' draws the quadrants as side-by-side columns with no bands (stacked on a phone). */
  layout?: 'grid' | 'lists';
};

type Region = { quadrant: Quadrant; box: HTMLDivElement; items: HTMLDivElement };
type Pill = {
  node: PsNode;
  quadrant: Quadrant;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  meta: HTMLSpanElement;
  task: HTMLSpanElement | null;
  card: HTMLDivElement;
  cardKey: string;
};

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function setAttr(target: Element, name: string, value: string | null): void {
  if (value === null) {
    if (target.hasAttribute(name)) target.removeAttribute(name);
  } else if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

const slug = (words: string): string => words.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SVG = 'http://www.w3.org/2000/svg';
const nameOf = (node: PsNode): string | undefined => parseSlot(node.slot)?.name;
const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const bySlot = (a: PsNode, b: PsNode): number => indexOf(a) - indexOf(b);
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');
const keyOf = (node: PsNode, quadrant: Quadrant): string => `${node.id}\u0000${node.text}\u0000${node.state}\u0000${(node.skills ?? []).join(',')}\u0000${quadrant}`;
/** The quadrant's picture (decorative: the heading says it). */
function icon(doc: Document, quadrant: QuadrantSpec): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `ps-eisen__icon ps-eisen__icon--${quadrant.id}`);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const shape of quadrant.shapes) {
    const out = doc.createElementNS(SVG, shape.tag);
    for (const [name, value] of Object.entries(shape.attrs)) out.setAttribute(name, value);
    svg.append(out);
  }
  return svg;
}

export function createQuadrantView(config: QuadrantConfig, doc: Document = document): QuadrantView {
  const SPECS = new Map<Quadrant, QuadrantSpec>(config.quadrants.map((q) => [q.id, q]));
  const QUADS = config.quadrants.map((q) => q.id);
  const QUAD = (id: Quadrant): QuadrantSpec => SPECS.get(id)!;
  const quadOf = (node: PsNode): Quadrant => (SPECS.has(node.tag ?? '') ? (node.tag as Quadrant) : QUADS[0]);
  const root = doc.createElement('div');
  root.className = 'ps-eisen';
  root.setAttribute('data-quadrant-chart', '');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', config.label);
  const group = createDisclosureGroup();

  const chart = el(doc, 'div', 'ps-eisen__chart');
  const panel = el(doc, 'div', 'ps-eisen__panel');
  const regions = new Map<Quadrant, Region>();
  const pills = new Map<string, Pill>();
  let links = new Map<string, string>();
  let proposed = new Set<string>();
  let lastRun: PsToolRun | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- grid

  function band(className: string, words: string, fill: 'yellow'): HTMLDivElement {
    const out = el(doc, 'div', className);
    out.setAttribute('aria-hidden', 'true');
    out.setAttribute('data-shape', '');
    out.setAttribute('data-fill', fill);
    out.append(el(doc, 'span', 'ps-eisen__band-word', words));
    return out;
  }

  function buildGrid(): void {
    const lists = config.layout === 'lists';
    const [c1, c2] = config.columns ?? ['', ''];
    const [r1, r2] = config.rows ?? ['', ''];
    if (lists) root.classList.add('ps-eisen--lists');
    else {
      chart.append(
        band('ps-eisen__corner', '', 'yellow'),
        band(`ps-eisen__band ps-eisen__band--c1 ps-eisen__band--${slug(c1)}`, c1, 'yellow'),
        band(`ps-eisen__band ps-eisen__band--c2 ps-eisen__band--${slug(c2)}`, c2, 'yellow'),
        band(`ps-eisen__side ps-eisen__side--r1 ps-eisen__side--${slug(r1)}`, r1, 'yellow'),
        band(`ps-eisen__side ps-eisen__side--r2 ps-eisen__side--${slug(r2)}`, r2, 'yellow')
      );
    }
    config.quadrants.forEach((spec, at) => {
      const { id: quadrant, heading, fill } = spec;
      const colWord = lists ? '' : at % 2 === 0 ? c1 : c2;
      const rowWord = lists ? '' : at < 2 ? r1 : r2;
      const box = el(doc, 'div', `ps-eisen__quadrant ps-eisen__quadrant--${quadrant} ps-eisen__quadrant--at-${at + 1}`);
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', lists ? heading : `${heading}: ${colWord.toLowerCase()}, ${rowWord.toLowerCase()}`);
      box.setAttribute('data-region', quadrant);
      box.setAttribute('data-quadrant', quadrant);
      box.setAttribute('data-shape', '');
      box.setAttribute('data-fill', fill);
      const head = el(doc, 'div', 'ps-eisen__head');
      head.setAttribute('aria-hidden', 'true');
      head.append(el(doc, 'span', 'ps-eisen__heading', heading), el(doc, 'span', 'ps-eisen__meta ps-eisen__axes', lists ? '' : `${colWord} · ${rowWord}`));
      const items = el(doc, 'div', 'ps-eisen__items');
      box.append(head, icon(doc, spec), items);
      chart.append(box);
      regions.set(quadrant, { quadrant, box, items });
    });
    root.append(chart, panel);
  }

  // ---------------------------------------------------------------- pills

  function makePill(node: PsNode): Pill {
    const detailsId = nextId('ps-eisen-details');
    const item = el(doc, 'div', 'ps-eisen__item');
    item.setAttribute('data-shape', '');
    const button = el(doc, 'button', 'ps-eisen__pill');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const head = el(doc, 'span', 'ps-eisen__pill-head');
    const title = el(doc, 'span', 'ps-eisen__title');
    head.append(title);
    const meta = el(doc, 'span', 'ps-eisen__meta ps-eisen__proposed', 'Proposed task');
    meta.hidden = true;
    button.append(head, meta);
    item.append(button);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    group.register(card, button);
    return { node, quadrant: quadOf(node), item, button, head, title, meta, task: null, card, cardKey: '' };
  }

  function dropPill(id: string): void {
    const pill = pills.get(id);
    if (!pill) return;
    if (pill.card.classList.contains('is-open')) group.close();
    group.unregister(pill.card);
    cancelAnimations(pill.item);
    pill.item.remove();
    pill.card.remove();
    pills.delete(id);
  }

  /** Keep a pill's words, colour, task tag and details in step with its node and task. Returns true when its task tag first appeared. */
  function syncPill(pill: Pill, node: PsNode): boolean {
    const quadrant = quadOf(node);
    pill.node = node;
    pill.quadrant = quadrant;
    setAttr(pill.item, 'data-node', node.id);
    setAttr(pill.card, 'data-for', node.id);
    setAttr(pill.item, 'data-fill', QUAD(quadrant).fill);
    pill.item.style.order = String(indexOf(node));
    setText(pill.title, nodeTitle(node));

    const status = links.get(node.id);
    const removed = status === 'removed';
    const linked = status !== undefined && !removed;
    const label = status === undefined ? '' : taskStatusLabel(status);
    setAttr(pill.item, 'data-task-status', status ?? null);
    pill.item.classList.toggle('is-task', linked);
    pill.item.classList.toggle('is-removed', removed);
    const waiting = status === undefined && proposed.has(node.id);
    pill.meta.hidden = !waiting;

    let born = false;
    if (status === undefined) {
      pill.task?.remove();
      pill.task = null;
    } else {
      if (!pill.task) {
        pill.task = el(doc, 'span', 'ps-eisen__task');
        pill.task.setAttribute('data-shape', '');
        pill.task.append(el(doc, 'span', 'ps-eisen__tag ps-eisen__task-mark'), el(doc, 'span', 'ps-eisen__tag ps-eisen__task-status'));
        pill.button.append(pill.task);
        born = true;
      }
      setAttr(pill.task, 'data-fill', removed ? 'card' : QUAD(quadrant).fill === 'yellow' ? 'blue' : 'yellow');
      pill.task.classList.toggle('is-removed', removed);
      setText(pill.task.children[0], removed ? label : 'Task');
      setText(pill.task.children[1], removed ? '' : label);
      (pill.task.children[1] as HTMLElement).hidden = removed || !label;
    }

    const taskWords = removed ? ', task removed' : linked ? (label ? `, task: ${label}` : ', task') : waiting ? ', proposed task' : '';
    setAttr(pill.button, 'aria-label', `${QUAD(quadrant).heading} item ${indexOf(node)}: ${nodeTitle(node)}${taskWords}${contested(node)}. Show details`);
    const key = keyOf(node, quadrant);
    if (pill.cardKey !== key) {
      pill.card.replaceChildren(...detailsCard(doc, node, QUAD(quadrant).fill, pill.card.id).childNodes);
      pill.cardKey = key;
    }
    syncContested(pill.item, node, pill.head, pill.button);
    return born;
  }

  // ---------------------------------------------------------------- layout

  function teardown(): void {
    for (const id of [...pills.keys()]) dropPill(id);
    cancelAnimations(root);
    regions.clear();
    chart.replaceChildren();
    panel.replaceChildren();
    root.replaceChildren();
  }

  /** Draw the run: create, place and move pills. Motion only after the first paint. */
  function layout(run: PsToolRun, justConfirmed: Set<string> = new Set()): void {
    const nodes = run.nodes.filter((node) => nameOf(node) === 'item').sort(bySlot);
    if (!nodes.length) {
      if (root.children.length) teardown();
      painted = true;
      return;
    }
    const gridBorn = !chart.parentElement;
    if (gridBorn) buildGrid();
    const wanted = new Set(nodes.map((node) => node.id));

    // Reads first: where each pill stands now, before anything moves.
    const before = new Map<Pill, DOMRect>();
    if (painted) for (const [id, pill] of pills) if (wanted.has(id) && pill.item.isConnected) before.set(pill, pill.item.getBoundingClientRect());
    // Moving an element drops its focus: remember what had it, to give it back after the writes.
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && active !== root && root.contains(active) ? active : null;

    for (const id of [...pills.keys()]) if (!wanted.has(id)) dropPill(id);

    const fresh: Pill[] = [];
    const tagged: Pill[] = [];
    for (const node of nodes) {
      let pill = pills.get(node.id);
      if (!pill) {
        pill = makePill(node);
        pills.set(node.id, pill);
        fresh.push(pill);
      }
      if (syncPill(pill, node) && justConfirmed.has(node.id)) tagged.push(pill);
      const target = regions.get(pill.quadrant)!.items;
      if (pill.item.parentElement !== target) target.append(pill.item);
    }
    // Keep each quadrant in slot order (an item can also change slot on another device).
    for (const region of regions.values()) {
      const items = [...region.items.children] as HTMLDivElement[];
      const sorted = [...items].sort((a, b) => Number(a.style.order) - Number(b.style.order));
      const at = sorted.findIndex((item, i) => items[i] !== item);
      if (at >= 0) region.items.append(...sorted.slice(at));
    }

    // Details cards sit in one panel under the chart, in reading order.
    const order = QUADS.flatMap((quadrant) => [...regions.get(quadrant)!.items.children].map((child) => [...pills.values()].find((p) => p.item === child)!.card));
    order.forEach((card, i) => {
      if (panel.children[i] !== card) panel.insertBefore(card, panel.children[i] ?? null);
    });
    if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });

    if (painted) {
      if (gridBorn && canAnimate(chart)) {
        chart.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
      }
      // An interrupted move still offsets its pill: stop every one first (the before rects already
      // hold where they are drawn), then read all the new places, then write the motion.
      const moving = [...before.keys()];
      for (const pill of moving) cancelAnimations(pill.item);
      const after = new Map<Pill, DOMRect>();
      for (const pill of moving) after.set(pill, pill.item.getBoundingClientRect());
      for (const [pill, rect] of after) {
        const was = before.get(pill)!;
        const dx = was.left + was.width / 2 - (rect.left + rect.width / 2);
        const dy = was.top + was.height / 2 - (rect.top + rect.height / 2);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !canAnimate(pill.item)) continue;
        pill.item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: EASE });
      }
      for (const pill of fresh) {
        if (!canAnimate(pill.item)) continue;
        pill.item.animate([{ opacity: 0, transform: 'translateY(-22px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: gridBorn ? 260 : 80, easing: EASE, fill: 'backwards' });
      }
      for (const pill of tagged) {
        if (!pill.task || !canAnimate(pill.task)) continue;
        pill.task.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE, fill: 'backwards' });
      }
    }
    painted = true;
  }

  function update(run: PsToolRun): void {
    if (destroyed) return;
    lastRun = run;
    layout(run);
  }

  function setTasks(next: PsTaskLink[]): void {
    if (destroyed) return;
    const map = new Map(next.map((link) => [link.nodeId, link.status]));
    if (map.size === links.size && [...map].every(([id, status]) => links.get(id) === status)) return;
    // The tag grows in only for a proposal the person has just confirmed, never for a saved run's statuses.
    const confirmed = new Set([...map.keys()].filter((id) => !links.has(id) && proposed.has(id)));
    links = map;
    if (lastRun) layout(lastRun, confirmed);
  }

  function setProposed(nodeIds: string[]): void {
    if (destroyed) return;
    const next = new Set(nodeIds);
    if (next.size === proposed.size && [...next].every((id) => proposed.has(id))) return;
    proposed = next;
    if (lastRun) layout(lastRun);
  }

  return {
    el: root,
    update,
    setTasks,
    setProposed,
    /** Stop any motion and ignore later calls once the canvas drops this view. */
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
