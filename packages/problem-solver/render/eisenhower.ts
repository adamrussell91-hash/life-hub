// packages/problem-solver/render/eisenhower.ts
// Eisenhower matrix (toolkit, Implement), drawn as the book draws it: a yellow header band split
// into "Urgent" and "Not urgent" over a 2x2 grid, and a yellow side band down the left split into
// "Important" and "Not important", the words running up it. The quadrants are blue Do first with
// a large yellow tick, yellow Schedule with a blue pie whose top-right quarter is red, yellow
// Delegate with a red right-pointing triangle, and red Eliminate with a blue square crossed by a
// yellow X. Thin paper rules part every piece. The grid, bands, headings and icons appear with
// the run's first item; each item is a pill under its quadrant's icon, dropping in on arrival.
// An item whose quadrant changes (another device) moves there, the same element (FLIP by
// measured centres). A Do first item that became a real task (setTasks) carries a small "Task"
// tag with its live status; a deleted task's item says "Task removed" and is struck through. An
// item with a pending proposal (setProposed) says so.
// Details open in one panel under the chart, so an open card never stretches a quadrant.
// Phone (the root up to 480px wide): the 2x2 stays, with smaller icons and wrapping pills. Under
// 340px the bands go and the quadrants stack (Do first, Schedule, Delegate, Eliminate), each
// carrying its urgency and importance as meta.
import type { PsNode, PsTaskLink, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { EISENHOWER_QUADRANTS } from '../tools/eisenhower.mjs';
import { taskStatusLabel } from './task-status';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type EisenhowerView = {
  el: HTMLDivElement;
  update(run: PsToolRun): void;
  setTasks(links: PsTaskLink[]): void;
  /** Node ids with a task proposal waiting for the person's answer. */
  setProposed(nodeIds: string[]): void;
  destroy(): void;
};

type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';
const QUADS = EISENHOWER_QUADRANTS as readonly Quadrant[];
const QUAD: Record<Quadrant, { heading: string; fill: 'blue' | 'yellow' | 'red'; urgency: string; importance: string }> = {
  do: { heading: 'Do first', fill: 'blue', urgency: 'Urgent', importance: 'Important' },
  schedule: { heading: 'Schedule', fill: 'yellow', urgency: 'Not urgent', importance: 'Important' },
  delegate: { heading: 'Delegate', fill: 'yellow', urgency: 'Urgent', importance: 'Not important' },
  eliminate: { heading: 'Eliminate', fill: 'red', urgency: 'Not urgent', importance: 'Not important' }
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

const SVG = 'http://www.w3.org/2000/svg';
const nameOf = (node: PsNode): string | undefined => parseSlot(node.slot)?.name;
const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const bySlot = (a: PsNode, b: PsNode): number => indexOf(a) - indexOf(b);
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');
const keyOf = (node: PsNode, quadrant: Quadrant): string => `${node.id}\u0000${node.text}\u0000${node.state}\u0000${(node.skills ?? []).join(',')}\u0000${quadrant}`;
const quadOf = (node: PsNode): Quadrant => ((QUADS as readonly string[]).includes(node.tag ?? '') ? (node.tag as Quadrant) : 'do');

/** The quadrant's picture, in the book's colours (decorative: the heading says it). */
function icon(doc: Document, quadrant: Quadrant): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `ps-eisen__icon ps-eisen__icon--${quadrant}`);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shape = (tag: string, attrs: Record<string, string>): void => {
    const out = doc.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) out.setAttribute(name, value);
    svg.append(out);
  };
  if (quadrant === 'do') {
    // A tick that thickens toward its foot, the long arm rising right.
    shape('polygon', { points: '6,58 20,48 39,70 90,2 96,8 42,98', fill: 'var(--ps-yellow)' });
  } else if (quadrant === 'schedule') {
    shape('circle', { cx: '50', cy: '50', r: '48', fill: 'var(--ps-blue)' });
    shape('path', { d: 'M50 50 L50 2 A48 48 0 0 1 98 50 Z', fill: 'var(--ps-red)' });
  } else if (quadrant === 'delegate') {
    shape('polygon', { points: '24,4 80,50 24,96', fill: 'var(--ps-red)' });
  } else {
    shape('rect', { x: '0', y: '0', width: '100', height: '100', fill: 'var(--ps-blue)' });
    // Two wide bars corner to corner, cut square at the edges.
    shape('polygon', { points: '0,0 13,0 100,87 100,100 87,100 0,13', fill: 'var(--ps-yellow)' });
    shape('polygon', { points: '100,0 100,13 13,100 0,100 0,87 87,0', fill: 'var(--ps-yellow)' });
  }
  return svg;
}

export function createEisenhowerView(doc: Document = document): EisenhowerView {
  const root = doc.createElement('div');
  root.className = 'ps-eisen';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Eisenhower matrix');
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
    chart.append(
      band('ps-eisen__corner', '', 'yellow'),
      band('ps-eisen__band ps-eisen__band--urgent', 'Urgent', 'yellow'),
      band('ps-eisen__band ps-eisen__band--not-urgent', 'Not urgent', 'yellow'),
      band('ps-eisen__side ps-eisen__side--important', 'Important', 'yellow'),
      band('ps-eisen__side ps-eisen__side--not-important', 'Not important', 'yellow')
    );
    for (const quadrant of QUADS) {
      const { heading, fill, urgency, importance } = QUAD[quadrant];
      const box = el(doc, 'div', `ps-eisen__quadrant ps-eisen__quadrant--${quadrant}`);
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', `${heading}: ${urgency.toLowerCase()}, ${importance.toLowerCase()}`);
      box.setAttribute('data-region', quadrant);
      box.setAttribute('data-quadrant', quadrant);
      box.setAttribute('data-shape', '');
      box.setAttribute('data-fill', fill);
      const head = el(doc, 'div', 'ps-eisen__head');
      head.setAttribute('aria-hidden', 'true');
      head.append(el(doc, 'span', 'ps-eisen__heading', heading), el(doc, 'span', 'ps-eisen__meta ps-eisen__axes', `${urgency} · ${importance}`));
      const items = el(doc, 'div', 'ps-eisen__items');
      box.append(head, icon(doc, quadrant), items);
      chart.append(box);
      regions.set(quadrant, { quadrant, box, items });
    }
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
    setAttr(pill.item, 'data-fill', QUAD[quadrant].fill);
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
      setAttr(pill.task, 'data-fill', removed ? 'card' : QUAD[quadrant].fill === 'yellow' ? 'blue' : 'yellow');
      pill.task.classList.toggle('is-removed', removed);
      setText(pill.task.children[0], removed ? label : 'Task');
      setText(pill.task.children[1], removed ? '' : label);
      (pill.task.children[1] as HTMLElement).hidden = removed || !label;
    }

    const taskWords = removed ? ', task removed' : linked ? (label ? `, task: ${label}` : ', task') : waiting ? ', proposed task' : '';
    setAttr(pill.button, 'aria-label', `${QUAD[quadrant].heading} item ${indexOf(node)}: ${nodeTitle(node)}${taskWords}${contested(node)}. Show details`);
    const key = keyOf(node, quadrant);
    if (pill.cardKey !== key) {
      pill.card.replaceChildren(...detailsCard(doc, node, QUAD[quadrant].fill, pill.card.id).childNodes);
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
