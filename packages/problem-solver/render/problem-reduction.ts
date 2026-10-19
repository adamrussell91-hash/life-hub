// packages/problem-solver/render/problem-reduction.ts
// Problem reduction (toolkit, Devise): the book draws it top to bottom. A large red
// problem circle, small yellow chevrons leaning out to a row of yellow sub-problem
// circles, a chevron straight down from each to its blue solution, chevrons leaning back
// in, and a large blue circle for the whole solution at the foot.
// Each sub-problem and its solution share a lane (data-row is the sub's number). Once the
// priority exists, each sub carries a rank badge, the lanes re-order by priority (FLIP over
// 600ms), and a small "Order" button above the subs opens the priority's details.
// A chevron appears only when both its ends exist. On a narrow panel each lane becomes a
// row: sub on the left, a chevron pointing right, its solution on the right.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { priorityOrder } from '../tools/problem-reduction.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type ProblemReductionView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Kind = 'problem' | 'priority' | 'sub' | 'solution' | 'integrated';
type Region = 'problem' | 'priority' | 'lanes' | 'integrated';
type ChevronKind = 'in' | 'down' | 'out';
type LaneSlot = ChevronKind | 'sub' | 'solution';

/**
 * Book order, top to bottom. Every region, lane and holder is a display: contents wrapper,
 * so all circles and chevrons sit in the one chart grid. Each lane holds its sub, its
 * solution and their chevrons in flow order, and the lanes sort by priority, so the DOM
 * (and tab order) runs sub 1st, solution 1st, sub 2nd… on the phone's rows as on the wide chart.
 */
const REGIONS: Region[] = ['problem', 'priority', 'lanes', 'integrated'];
const LANE_SLOTS: LaneSlot[] = ['in', 'sub', 'down', 'solution', 'out'];
const REGION_NAME: Record<Region, string> = { problem: 'problem', priority: 'priority', lanes: 'lanes', integrated: 'integrated' };
const REGION_LABEL: Record<Region, string> = {
  problem: 'The whole problem',
  priority: 'Order to tackle the parts',
  lanes: 'Parts and their solutions',
  integrated: 'The whole solution'
};
/** Each sub and solution sits in a holder that names its row of the chart. */
const HOLDER: Record<'sub' | 'solution', [string, string]> = { sub: ['subs', 'Smaller part'], solution: ['solutions', 'Solution to the part'] };
const ACCENT: Record<Kind, Accent> = { problem: 'red', priority: 'yellow', sub: 'yellow', solution: 'blue', integrated: 'blue' };
const KINDS: Kind[] = ['problem', 'priority', 'sub', 'solution', 'integrated'];
const FLIP_MS = 600;

const isKind = (name: string | undefined): name is Kind => KINDS.includes(name as Kind);
const laned = (kind: Kind): boolean => kind === 'sub' || kind === 'solution';

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

type Shape = { item: HTMLDivElement; button: HTMLButtonElement; kind: Kind; index: number; node: PsNode; rank: HTMLSpanElement | null };
type Chevron = { el: HTMLSpanElement; kind: ChevronKind; index: number };
/** Where a lane element sits now: its position and the lane count it was placed against. */
type Place = { pos: number; count: number };

export function createProblemReductionView(doc: Document = document): ProblemReductionView {
  const root = doc.createElement('div');
  root.className = 'ps-reduce';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Problem reduction');

  const group = createDisclosureGroup();
  const shapes = new Map<string, Shape>();
  const cards = new Map<string, HTMLElement>();
  const lanes = new Map<number, { el: HTMLDivElement; sub?: Shape; solution?: Shape }>();
  const chevrons = new Map<string, Chevron>();
  const regions = new Map<Region, HTMLDivElement>();
  const places = new Map<HTMLElement, Place>();
  const flips = new Map<HTMLElement, Animation>();
  let problem: Shape | null = null;
  let integrated: Shape | null = null;
  let priority: Shape | null = null;
  let chart: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;

  function ensureChart(): HTMLDivElement {
    if (chart) return chart;
    chart = doc.createElement('div');
    chart.className = 'ps-reduce__chart';
    panel = doc.createElement('div');
    panel.className = 'ps-reduce__panel';
    root.append(chart, panel);
    return chart;
  }

  function ensureRegion(region: Region): HTMLDivElement {
    let el = regions.get(region);
    if (el) return el;
    el = doc.createElement('div');
    el.className = `ps-reduce__region ps-reduce__region--${region}`;
    el.setAttribute('data-region', REGION_NAME[region]);
    el.setAttribute('aria-label', REGION_LABEL[region]);
    const later = REGIONS.slice(REGIONS.indexOf(region) + 1).map((r) => regions.get(r)).find(Boolean) ?? null;
    ensureChart().insertBefore(el, later);
    regions.set(region, el);
    return el;
  }

  function ensureLane(index: number): { el: HTMLDivElement; sub?: Shape; solution?: Shape } {
    let lane = lanes.get(index);
    if (lane) return lane;
    const el = doc.createElement('div');
    el.className = 'ps-reduce__lane';
    el.setAttribute('data-row', String(index));
    ensureRegion('lanes').append(el);
    lane = { el };
    lanes.set(index, lane);
    return lane;
  }

  /** Put a child into its lane in flow order: in-chevron, sub, down-chevron, solution, out-chevron. */
  function placeInLane(index: number, slot: LaneSlot, child: HTMLElement): void {
    const lane = ensureLane(index).el;
    child.setAttribute('data-slot', slot);
    const later = new Set(LANE_SLOTS.slice(LANE_SLOTS.indexOf(slot) + 1));
    const after = [...lane.children].find((kid) => later.has(kid.getAttribute('data-slot') as LaneSlot)) ?? null;
    lane.insertBefore(child, after);
  }

  const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

  function meta(shape: Pick<Shape, 'kind' | 'index'>): string {
    switch (shape.kind) {
      case 'problem': return 'Problem';
      case 'priority': return 'Order';
      case 'sub': return `Part ${shape.index}`;
      case 'solution': return `Solution ${shape.index}`;
      default: return 'Whole solution';
    }
  }

  function label(shape: Shape): string {
    const title = nodeTitle(shape.node);
    switch (shape.kind) {
      case 'problem': return `Problem: ${title}${contested(shape.node)}. Show details`;
      case 'priority': return `Order to tackle the parts: ${title}${contested(shape.node)}. Show details`;
      case 'sub': {
        const rank = shape.item.getAttribute('data-rank');
        return `Part ${shape.index}${rank ? `, tackle ${ordinal(Number(rank))}` : ''}: ${title}${contested(shape.node)}. Show details`;
      }
      case 'solution': return `Solution to part ${shape.index}: ${title}${contested(shape.node)}. Show details`;
      default: return `Whole solution: ${title}${contested(shape.node)}. Show details`;
    }
  }

  function syncOpen(): void {
    for (const [id, shape] of shapes) cards.get(id)?.classList.toggle('is-open', shape.item.classList.contains('is-open'));
  }

  function addShape(node: PsNode, kind: Kind, index: number): Shape {
    const detailsId = nextId('ps-reduce-details');
    const item = doc.createElement('div');
    item.className = `ps-reduce__item ps-reduce__item--${kind}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    if (laned(kind)) item.setAttribute('data-row', String(index));
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = kind === 'priority' ? 'ps-reduce__pill' : 'ps-reduce__circle';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const shape: Shape = { item, button, kind, index, node, rank: null };
    const words = span(doc, 'ps-reduce__words');
    words.append(span(doc, 'ps-reduce__meta', meta(shape)), span(doc, 'ps-reduce__title', nodeTitle(node)));
    if (node.state === 'contested') words.append(contestedTag(doc, node));
    button.append(words);
    item.append(button);
    if (kind === 'sub' || kind === 'solution') {
      const holder = doc.createElement('div');
      holder.className = 'ps-reduce__holder';
      holder.setAttribute('data-region', HOLDER[kind][0]);
      holder.setAttribute('aria-label', `${HOLDER[kind][1]} ${index}`);
      holder.append(item);
      placeInLane(index, kind, holder);
    } else {
      ensureRegion(kind as Region).append(item);
    }

    const card = detailsCard(doc, node, ACCENT[kind], detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    shapes.set(node.id, shape);
    cards.set(node.id, card);
    button.setAttribute('aria-label', label(shape));
    return shape;
  }

  function addChevron(kind: ChevronKind, index: number, from: Shape, to: Shape): Chevron {
    const el = span(doc, `ps-reduce__chevron ps-reduce__chevron--${kind}`);
    el.setAttribute('data-from', from.node.id);
    el.setAttribute('data-to', to.node.id);
    el.setAttribute('data-row', String(index));
    el.setAttribute('aria-hidden', 'true');
    el.append(span(doc, 'ps-reduce__tip'));
    placeInLane(index, kind, el);
    const chevron = { el, kind, index };
    chevrons.set(`${kind}:${index}`, chevron);
    return chevron;
  }

  function setRank(shape: Shape, rank: number | null): boolean {
    const now = shape.item.getAttribute('data-rank');
    const next = rank ? String(rank) : null;
    if (now === next) return false;
    if (next) {
      shape.item.setAttribute('data-rank', next);
      if (!shape.rank) {
        shape.rank = span(doc, 'ps-reduce__rank');
        shape.rank.setAttribute('aria-hidden', 'true');
        shape.button.append(shape.rank);
      }
      shape.rank.textContent = ordinal(rank!);
    } else {
      shape.item.removeAttribute('data-rank');
      shape.rank?.remove();
      shape.rank = null;
    }
    shape.button.setAttribute('aria-label', label(shape));
    return true;
  }

  /** Lane numbers in display order: the priority's order once set, then any others by number. */
  function laneOrder(run: PsToolRun, indices: number[]): number[] {
    const order = (priorityOrder(run) as number[] | null) ?? [];
    const ranked = order.filter((i) => indices.includes(i));
    return [...ranked, ...indices.filter((i) => !ranked.includes(i)).sort((a, b) => a - b)];
  }

  function laneElements(): Array<{ el: HTMLElement; index: number }> {
    const out: Array<{ el: HTMLElement; index: number }> = [];
    for (const [index, lane] of lanes) {
      if (lane.sub) out.push({ el: lane.sub.item, index });
      if (lane.solution) out.push({ el: lane.solution.item, index });
    }
    for (const chevron of chevrons.values()) out.push({ el: chevron.el, index: chevron.index });
    return out;
  }

  function setPlace(el: HTMLElement, pos: number, count: number): void {
    const off = pos - (count + 1) / 2;
    el.style.setProperty('--pos', String(pos));
    el.style.setProperty('--row', String(pos + 2));
    el.style.setProperty('--off', String(off));
    el.style.setProperty('--lean', (off / count).toFixed(4));
    places.set(el, { pos, count });
  }

  /** Keep the lanes in display order, so reading and tab order follow the chart. */
  function sortLanes(position: Map<number, number>): void {
    const el = regions.get('lanes');
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    const sorted = [...kids].sort((a, b) => (position.get(Number(a.getAttribute('data-row'))) ?? 0) - (position.get(Number(b.getAttribute('data-row'))) ?? 0));
    if (sorted.every((kid, i) => kid === kids[i])) return;
    el.append(...sorted);
  }

  function popIn(el: HTMLElement, delay: number, keyframes: Keyframe[], duration = 440, easing = 'cubic-bezier(0.34, 1.4, 0.64, 1)'): void {
    if (canAnimate(el)) el.animate(keyframes, { duration, delay, easing, fill: 'backwards' });
  }

  function update(run: PsToolRun): void {
    const placed = run.nodes
      .map((node) => ({ node, slot: parseSlot(node.slot) }))
      .filter((entry): entry is { node: PsNode; slot: { name: Kind; index: number | null } } => isKind(entry.slot?.name));
    if (!placed.length && !chart) return;

    // Plan the lanes before touching the DOM.
    const indices = [...new Set(placed.filter(({ slot }) => laned(slot.name) && slot.index).map(({ slot }) => slot.index!))];
    const order = laneOrder(run, indices);
    const count = Math.max(order.length, 1);
    const position = new Map(order.map((index, i) => [index, i + 1]));
    const ranks = priorityOrder(run) as number[] | null;

    // FLIP, first: one read of where every existing lane element sits now (in-flight
    // transforms included). Anything can move it: a re-order, a new lane, or the Order pill
    // arriving above the subs, so the measured delta decides, not the logical place.
    const movers = laneElements();
    const animate = movers.length > 0 && canAnimate(root);
    const first = animate ? movers.map(({ el }) => el.getBoundingClientRect()) : [];
    for (const flip of flips.values()) flip.cancel();
    flips.clear();

    // Writes.
    const chartEl = ensureChart();
    chartEl.style.setProperty('--count', String(count));
    const fresh: Shape[] = [];
    for (const { node, slot } of placed) {
      let shape = shapes.get(node.id);
      if (!shape) {
        const index = slot.index ?? 0;
        if (slot.name === 'problem' && problem) continue;
        if (slot.name === 'integrated' && integrated) continue;
        if (slot.name === 'priority' && priority) continue;
        if (laned(slot.name)) {
          if (!index) continue;
          if (lanes.get(index)?.[slot.name as 'sub' | 'solution']) continue;
          shape = addShape(node, slot.name, index);
          ensureLane(index)[slot.name as 'sub' | 'solution'] = shape;
        } else {
          shape = addShape(node, slot.name, 0);
          if (slot.name === 'problem') problem = shape;
          if (slot.name === 'integrated') integrated = shape;
          if (slot.name === 'priority') priority = shape;
        }
        fresh.push(shape);
      }
      const relabel = shape.node.state !== node.state || nodeTitle(shape.node) !== nodeTitle(node);
      shape.node = node;
      if (relabel) shape.button.setAttribute('aria-label', label(shape));
      shape.item.classList.toggle('is-contested', node.state === 'contested');
    }

    // Chevrons, each once both its ends exist.
    const freshChevrons: Chevron[] = [];
    for (const [index, lane] of lanes) {
      if (problem && lane.sub && !chevrons.has(`in:${index}`)) freshChevrons.push(addChevron('in', index, problem, lane.sub));
      if (lane.sub && lane.solution && !chevrons.has(`down:${index}`)) freshChevrons.push(addChevron('down', index, lane.sub, lane.solution));
      if (lane.solution && integrated && !chevrons.has(`out:${index}`)) freshChevrons.push(addChevron('out', index, lane.solution, integrated));
    }

    // Ranks from the priority, then every lane element to its place.
    const freshRanks: HTMLElement[] = [];
    for (const [index, lane] of lanes) {
      if (!lane.sub) continue;
      const rank = ranks ? ranks.indexOf(index) + 1 || null : null;
      const had = lane.sub.rank;
      if (setRank(lane.sub, rank) && !had && lane.sub.rank) freshRanks.push(lane.sub.rank);
    }
    for (const { el, index } of laneElements()) {
      const pos = position.get(index) ?? 1;
      const place = places.get(el);
      if (!place || place.pos !== pos || place.count !== count) setPlace(el, pos, count);
    }
    sortLanes(position);

    // FLIP, last and invert: one read of the new places, then animate each from the old.
    // Centres, not edges: a chevron stretches to its lane, so its edges move with the width.
    if (animate) {
      const last = movers.map(({ el }) => el.getBoundingClientRect());
      const centre = (r: DOMRect): [number, number] => [r.left + r.width / 2, r.top + r.height / 2];
      movers.forEach(({ el }, i) => {
        const [fx, fy] = centre(first[i]);
        const [lx, ly] = centre(last[i]);
        const dx = fx - lx;
        const dy = fy - ly;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        const flip = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: FLIP_MS, easing: EASE });
        flips.set(el, flip);
        flip.onfinish = () => { if (flips.get(el) === flip) flips.delete(el); };
      });
    }

    // New circles pop in, staggered in book order; chevrons follow; new badges land last.
    fresh.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (position.get(a.index) ?? 0) - (position.get(b.index) ?? 0));
    const step = fresh.length > 1 ? Math.min(70, 420 / (fresh.length - 1)) : 0;
    fresh.forEach((shape, i) => popIn(shape.button, Math.round(i * step), [{ opacity: 0, transform: 'scale(0.55)' }, { opacity: 1, transform: 'none' }]));
    // Chevrons fade in behind the circles; a whole chart still settles inside a second.
    const after = fresh.length ? Math.min(Math.round((fresh.length - 1) * step), 300) + 160 : 0;
    const gap = freshChevrons.length > 1 ? Math.min(30, 200 / (freshChevrons.length - 1)) : 0;
    freshChevrons.forEach((chevron, i) => {
      const tip = chevron.el.firstElementChild as HTMLElement;
      popIn(tip, after + Math.round(i * gap), [{ opacity: 0 }, { opacity: 1 }], 320, EASE);
    });
    const land = animate ? FLIP_MS - 160 : after;
    freshRanks.forEach((rank, i) => popIn(rank, land + i * 60, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], 380));
  }

  return { el: root, update };
}
