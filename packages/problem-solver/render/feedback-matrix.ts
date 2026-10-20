// packages/problem-solver/render/feedback-matrix.ts
// Feedback matrix (toolkit, Improve), drawn as the book draws it in two parts.
// Part one: a square 2x2 grid with no gaps. Yellow Suggestions top left, blue Compliments top
// right, red Changes bottom left, yellow Questions bottom right. Four symbol discs sit at the
// centre, one in each quadrant's inner corner: a blue disc with a yellow plus, a yellow disc with
// a blue tick, a yellow disc with a blue cross and a blue disc with a yellow question mark. Each
// heading sits centred on its quadrant's outer edge (top for the top row, bottom for the bottom
// row) with a short line in our own words under it. The grid and its discs are the tool, so they
// show from the start. Items are pills in their quadrant: three show, and "+N more" opens a list
// of the rest.
// Part two, once a theme exists: each theme is a large circle coloured by its tag (Do more blue,
// Question yellow, Change red) with its why and how satellites around it, joined by short yellow
// lines as in the book. Why is blue; how is yellow, or blue on a yellow theme. Satellites spread
// evenly on an arc that faces away from the other clusters; the angles are recomputed on every
// update and satellites glide to them. Actions follow as a numbered list of cards.
// Phone (the root up to 480px wide): the grid stays 2x2 with the headings cut to the codes S, C, X
// and Q and a key under the grid; clusters stack one to a row in boxes of a fixed size, with their
// satellites on a full ring.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { FEEDBACK_QUADRANTS, THEME_TAGS, satellitesOf } from '../tools/feedback-matrix.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type FeedbackMatrixView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type Quadrant = 'suggestion' | 'compliment' | 'change' | 'question';
type ThemeTag = 'do_more' | 'question' | 'change';
type Kind = 'why' | 'how';
const QUADS = FEEDBACK_QUADRANTS as readonly Quadrant[];
const TAGS = THEME_TAGS as readonly ThemeTag[];

const QUAD: Record<Quadrant, { heading: string; one: string; words: string; code: string; fill: Accent; disc: Accent; mark: Accent; row: 'top' | 'bottom' }> = {
  suggestion: { heading: 'Suggestions', one: 'Suggestion', words: 'To try or improve', code: 'S', fill: 'yellow', disc: 'blue', mark: 'yellow', row: 'top' },
  compliment: { heading: 'Compliments', one: 'Compliment', words: 'To keep doing', code: 'C', fill: 'blue', disc: 'yellow', mark: 'blue', row: 'top' },
  change: { heading: 'Changes', one: 'Change', words: 'To stop or remove', code: 'X', fill: 'red', disc: 'yellow', mark: 'blue', row: 'bottom' },
  question: { heading: 'Questions', one: 'Question', words: 'To clear up', code: 'Q', fill: 'yellow', disc: 'blue', mark: 'yellow', row: 'bottom' }
};
const THEME: Record<ThemeTag, { word: string; fill: Accent }> = {
  do_more: { word: 'Do more', fill: 'blue' },
  question: { word: 'Question', fill: 'yellow' },
  change: { word: 'Change', fill: 'red' }
};
/** Pills a quadrant shows before "+N more". */
const SHOWN = 3;
/** Satellite centres sit this far from the theme's centre, in percent of the square cluster box. */
const RING = 36;
/** The theme's and a satellite's radius, and the room kept round them, in the same units. */
const THEME_R = 16;
const SAT_R = 11;
const REACH_PAD = 3;
/** The widest step between neighbouring satellites on a desktop arc, in degrees. */
const STEP = 52;
const GLIDE = 520;

// The symbols on the discs, drawn in a 40 x 40 box over the disc.
const SVG = 'http://www.w3.org/2000/svg';
const SYMBOL: Record<Quadrant, string> = {
  suggestion: '<path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z"/>',
  compliment: '<path d="M10.5 20.5l6.5 6.5 13-14" fill="none" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>',
  change: '<path d="M12.5 12.5l15 15M27.5 12.5l-15 15" fill="none" stroke-width="5.4" stroke-linecap="round"/>',
  question: '<path d="M14.6 15.6a5.6 5.6 0 1 1 8.2 5c-1.8 1-2.8 2.1-2.8 4.1v.8" fill="none" stroke-width="4.4" stroke-linecap="round"/><circle cx="20" cy="30.6" r="2.6"/>'
};

const nameOf = (node: PsNode): string | undefined => parseSlot(node.slot)?.name;
const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const bySlot = (a: PsNode, b: PsNode): number => indexOf(a) - indexOf(b);
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');
const tagOf = (node: PsNode): ThemeTag => ((TAGS as readonly string[]).includes(node.tag ?? '') ? (node.tag as ThemeTag) : 'do_more');
const satFill = (kind: Kind, theme: ThemeTag): Accent => (kind === 'why' || THEME[theme].fill === 'yellow' ? 'blue' : 'yellow');
const cardKeyOf = (node: PsNode, accent: Accent): string => `${accent}\u0000${node.text}\u0000${(node.skills ?? []).join(',')}`;
const f = (n: number): string => n.toFixed(2);

/**
 * Where a cluster's arc faces on a desktop, in degrees clockwise from the right: away from the
 * other clusters in the two-column grid (nearer ones push harder), leaning well upwards so it
 * never faces down. An odd last cluster spans both columns and sits between them, as the book
 * tucks its third cluster under the first two; with nothing to either side it faces left, as
 * the book's does. A lone cluster faces straight up.
 */
export function arcFacing(index: number, count: number): number {
  if (count <= 1) return 270;
  const at = (i: number): [number, number] => [count % 2 === 1 && i === count - 1 ? 0.5 : i % 2, Math.floor(i / 2)];
  const [x, y] = at(index);
  let vx = 0;
  let vy = 0;
  for (let j = 0; j < count; j += 1) {
    if (j === index) continue;
    const [ox, oy] = at(j);
    const dx = x - ox;
    const dy = y - oy;
    const d2 = dx * dx + dy * dy;
    vx += dx / d2 / Math.sqrt(d2);
    vy += dy / d2 / Math.sqrt(d2);
  }
  const len = Math.hypot(vx, vy);
  vx = len < 1e-6 ? 0 : vx / len;
  vy = len < 1e-6 ? 0 : vy / len - 1;
  if (Math.hypot(vx, vy) < 1e-6) return 180;
  const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * How far the drawing reaches above and below the theme's centre on a desktop, in percent of the
 * stage's width: the theme's radius, or a satellite's centre plus its radius, with a small margin.
 */
export function clusterReach(angles: number[]): { top: number; bottom: number } {
  let top = THEME_R;
  let bottom = THEME_R;
  for (const a of angles) {
    const y = RING * Math.sin((a * Math.PI) / 180);
    top = Math.max(top, SAT_R - y);
    bottom = Math.max(bottom, SAT_R + y);
  }
  return { top: top + REACH_PAD, bottom: bottom + REACH_PAD };
}

/** Each satellite's angle: [desktop arc, phone ring], in degrees. */
export function satelliteAngles(count: number, facing: number): Array<[number, number]> {
  const step = count > 1 ? Math.min(STEP, 320 / (count - 1)) : 0;
  return Array.from({ length: count }, (_, k) => [facing + (k - (count - 1) / 2) * step, 270 + (k * 360) / count]);
}

type Pill = { node: PsNode; kind: Quadrant; item: HTMLDivElement; button: HTMLButtonElement; head: HTMLSpanElement; title: HTMLSpanElement; card: HTMLDivElement; cardKey: string };
type QuadBox = { kind: Quadrant; box: HTMLDivElement; list: HTMLDivElement; more: HTMLButtonElement; moreList: HTMLDivElement; moreInner: HTMLDivElement };
type Sat = { node: PsNode; kind: Kind; theme: string; item: HTMLDivElement; button: HTMLButtonElement; line: HTMLSpanElement; ink: HTMLSpanElement; card: HTMLDivElement; cardKey: string; a: string; pa: string };
type Cluster = { node: PsNode; item: HTMLDivElement; stage: HTMLDivElement; layer: HTMLDivElement; lines: HTMLDivElement; button: HTMLButtonElement; head: HTMLSpanElement; meta: HTMLSpanElement; title: HTMLSpanElement; sats: HTMLDivElement; card: HTMLDivElement; cardKey: string };
type Action = { node: PsNode; item: HTMLDivElement; button: HTMLButtonElement; num: HTMLSpanElement; head: HTMLSpanElement; title: HTMLSpanElement; card: HTMLDivElement; cardKey: string };
type PartTwo = { el: HTMLDivElement; head: HTMLParagraphElement; clusters: HTMLDivElement; panel: HTMLDivElement; actions: HTMLDivElement; actionList: HTMLOListElement; actionPanel: HTMLDivElement };

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
function setVar(target: HTMLElement, name: string, value: string): void {
  if (target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
}
const centre = (r: DOMRect): [number, number] => [r.left + r.width / 2, r.top + r.height / 2];

export function createFeedbackMatrixView(doc: Document = document): FeedbackMatrixView {
  const root = doc.createElement('div');
  root.className = 'ps-fbm';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Feedback matrix');
  const group = createDisclosureGroup();

  const pills = new Map<string, Pill>();
  const quads = new Map<Quadrant, QuadBox>();
  const clusters = new Map<string, Cluster>();
  const sats = new Map<string, Sat>();
  const actions = new Map<string, Action>();
  /** Cards in the "+N more" lists, made once per node and kept while it lasts. */
  const moreCards = new Map<string, { card: HTMLElement; key: string }>();
  let two: PartTwo | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- part one: the grid

  const one = el(doc, 'div', 'ps-fbm__part ps-fbm__part--one');
  one.setAttribute('data-part', 'one');
  one.setAttribute('role', 'group');
  one.setAttribute('aria-label', 'Part one');
  const grid = el(doc, 'div', 'ps-fbm__grid');
  const key = el(doc, 'div', 'ps-fbm__key');
  // The key only spells out the phone codes; the quadrants carry their names for screen readers.
  key.setAttribute('aria-hidden', 'true');
  const panelOne = el(doc, 'div', 'ps-fbm__panel');
  one.append(el(doc, 'p', 'ps-fbm__meta ps-fbm__part-head', 'Part one'), grid, key, panelOne);
  root.append(one);

  for (const kind of QUADS) {
    const q = QUAD[kind];
    const box = el(doc, 'div', `ps-fbm__quadrant ps-fbm__quadrant--${kind}`);
    box.setAttribute('data-quadrant', kind);
    box.setAttribute('data-region', kind);
    box.setAttribute('data-row', q.row);
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', q.heading);
    box.setAttribute('data-shape', '');
    box.setAttribute('data-fill', q.fill);
    const head = el(doc, 'div', 'ps-fbm__head');
    const code = el(doc, 'span', 'ps-fbm__code', q.code);
    code.setAttribute('aria-hidden', 'true');
    head.append(code, el(doc, 'span', 'ps-fbm__title ps-fbm__title--quadrant', q.heading), el(doc, 'span', 'ps-fbm__meta ps-fbm__words', q.words));
    const list = el(doc, 'div', 'ps-fbm__items');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', `${q.heading} items`);
    const moreId = nextId('ps-fbm-more');
    const more = el(doc, 'button', 'ps-fbm__more');
    more.type = 'button';
    more.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', moreId);
    const moreList = el(doc, 'div', 'ps-details ps-fbm__more-list');
    moreList.id = moreId;
    moreList.setAttribute('data-more', kind);
    const moreInner = el(doc, 'div', 'ps-details__inner');
    moreList.append(moreInner);
    group.register(moreList, more);
    panelOne.append(moreList);
    // The symbol disc sits in the quadrant's inner corner, so the four meet at the centre
    // whatever height each row grows to. Decoration: the heading says it in words.
    const disc = el(doc, 'span', `ps-fbm__disc ps-fbm__disc--${kind}`);
    disc.setAttribute('aria-hidden', 'true');
    disc.setAttribute('data-disc', kind);
    disc.setAttribute('data-tone', q.disc);
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'ps-fbm__symbol');
    svg.setAttribute('data-mark', q.mark);
    svg.innerHTML = SYMBOL[kind];
    disc.append(svg);
    box.append(head, list, more, disc);
    grid.append(box);
    quads.set(kind, { kind, box, list, more, moreList, moreInner });

    const keyItem = el(doc, 'span', 'ps-fbm__key-item');
    keyItem.setAttribute('data-tone', q.fill);
    keyItem.append(el(doc, 'span', 'ps-fbm__key-code', q.code), el(doc, 'span', 'ps-fbm__key-words', q.heading));
    key.append(keyItem);
  }

  // ---------------------------------------------------------------- shared

  function shapeButton(className: string, detailsId: string): HTMLButtonElement {
    const button = el(doc, 'button', className);
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    return button;
  }

  /** A node's details card: made empty here, filled by fillCard, registered with its button. */
  function newCard(node: PsNode, host: HTMLElement, button: HTMLButtonElement): HTMLDivElement {
    const card = el(doc, 'div', 'ps-details');
    card.id = button.getAttribute('aria-controls')!;
    card.setAttribute('data-for', node.id);
    host.append(card);
    group.register(card, button);
    return card;
  }
  function fillCard(holder: { card: HTMLDivElement; cardKey: string }, node: PsNode, accent: Accent): void {
    const wanted = cardKeyOf(node, accent);
    if (holder.cardKey === wanted) return;
    const built = detailsCard(doc, node, accent, holder.card.id);
    holder.card.replaceChildren(...built.childNodes);
    holder.cardKey = wanted;
  }
  function drop(card: HTMLElement): void {
    if (card.classList.contains('is-open')) group.close();
    group.unregister(card);
    card.remove();
  }

  // ---------------------------------------------------------------- pills

  function addPill(node: PsNode, kind: Quadrant): Pill {
    const item = el(doc, 'div', 'ps-fbm__item');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = shapeButton('ps-fbm__pill', nextId('ps-fbm-details'));
    button.setAttribute('data-shape', '');
    button.setAttribute('data-fill', 'paper');
    const head = el(doc, 'span', 'ps-fbm__pill-head');
    const title = el(doc, 'span', 'ps-fbm__title ps-fbm__title--pill');
    head.append(title);
    button.append(head);
    item.append(button);
    const pill: Pill = { node, kind, item, button, head, title, card: null as unknown as HTMLDivElement, cardKey: '' };
    pill.card = newCard(node, panelOne, button);
    pills.set(node.id, pill);
    return pill;
  }

  function removePill(id: string): void {
    const pill = pills.get(id);
    if (!pill) return;
    drop(pill.card);
    pill.item.remove();
    pills.delete(id);
  }

  function syncQuadrants(run: PsToolRun, fresh: HTMLElement[]): void {
    const byKind = new Map<Quadrant, PsNode[]>(QUADS.map((kind) => [kind, run.nodes.filter((node) => nameOf(node) === kind).sort(bySlot)]));
    for (const [id, pill] of [...pills]) if (!byKind.get(pill.kind)!.some((node) => node.id === id)) removePill(id);
    // The "+N more" cards are kept only for pills that are past the third now.
    const past = new Set(QUADS.flatMap((kind) => byKind.get(kind)!.slice(SHOWN).map((node) => node.id)));
    for (const [id, { card }] of [...moreCards]) {
      if (past.has(id)) continue;
      card.remove();
      moreCards.delete(id);
    }
    const active = doc.activeElement;
    for (const kind of QUADS) {
      const q = quads.get(kind)!;
      const nodes = byKind.get(kind)!;
      let refocus = false;
      nodes.forEach((node, i) => {
        let pill = pills.get(node.id);
        if (!pill) {
          pill = addPill(node, kind);
          fresh.push(pill.item);
        }
        pill.node = node;
        if (q.list.children[i] !== pill.item) q.list.insertBefore(pill.item, q.list.children[i] ?? null);
        const hide = i >= SHOWN;
        // Focus on a pill (or in its card) that moves into "+N more" follows it to that button.
        if (hide && !pill.item.hidden && active && (pill.item.contains(active) || pill.card.contains(active))) refocus = true;
        if (pill.item.hidden !== hide) pill.item.hidden = hide;
        // A card is never left open for a pill that has gone out of view.
        if (hide && pill.card.classList.contains('is-open')) group.close();
        setText(pill.title, nodeTitle(node));
        setAttr(pill.button, 'aria-label', `${QUAD[kind].one}: ${nodeTitle(node)}${contested(node)}. Show details`);
        fillCard(pill, node, QUAD[kind].fill);
        syncContested(pill.item, node, pill.head, pill.button);
      });
      // "+N more": a list of every pill past the third.
      const rest = nodes.slice(SHOWN);
      q.more.hidden = rest.length === 0;
      setText(q.more, `+${rest.length} more`);
      setAttr(q.more, 'aria-label', `${rest.length} more ${QUAD[kind].heading.toLowerCase()}. Show them`);
      if (!rest.length && q.moreList.classList.contains('is-open')) group.close();
      const wanted = rest.map((node) => moreCard(node, QUAD[kind].fill));
      const have = [...q.moreInner.children];
      if (wanted.length !== have.length || wanted.some((card, i) => card !== have[i])) q.moreInner.replaceChildren(...wanted);
      if (refocus) q.more.focus({ preventScroll: true });
    }
  }

  function moreCard(node: PsNode, accent: Accent): HTMLElement {
    const wanted = cardKeyOf(node, accent) + (node.state === 'contested' ? `\u0000${node.objection ?? ''}` : '');
    const have = moreCards.get(node.id);
    if (have && have.key === wanted) return have.card;
    const card = detailsCard(doc, node, accent, '').querySelector<HTMLElement>('.ps-details__card')!;
    card.setAttribute('data-for', node.id);
    card.prepend(el(doc, 'p', 'ps-fbm__card-head', nodeTitle(node)));
    have?.card.replaceWith(card);
    moreCards.set(node.id, { card, key: wanted });
    return card;
  }

  // ---------------------------------------------------------------- part two

  function ensureTwo(): PartTwo {
    if (two) return two;
    const part = el(doc, 'div', 'ps-fbm__part ps-fbm__part--two');
    part.setAttribute('data-part', 'two');
    part.setAttribute('role', 'group');
    part.setAttribute('aria-label', 'Part two');
    const list = el(doc, 'div', 'ps-fbm__clusters');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Themes');
    const panel = el(doc, 'div', 'ps-fbm__panel');
    const block = el(doc, 'div', 'ps-fbm__actions');
    const actionList = el(doc, 'ol', 'ps-fbm__action-list');
    actionList.setAttribute('role', 'list');
    actionList.setAttribute('aria-label', 'Actions');
    const actionPanel = el(doc, 'div', 'ps-fbm__panel');
    block.append(el(doc, 'p', 'ps-fbm__meta ps-fbm__part-head', 'Actions'), actionList, actionPanel);
    const head = el(doc, 'p', 'ps-fbm__meta ps-fbm__part-head', 'Part two');
    part.append(head, list, panel, block);
    root.append(part);
    two = { el: part, head, clusters: list, panel, actions: block, actionList, actionPanel };
    return two;
  }

  function addCluster(node: PsNode, host: PartTwo): Cluster {
    const item = el(doc, 'div', 'ps-fbm__cluster');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const stage = el(doc, 'div', 'ps-fbm__stage');
    const lines = el(doc, 'div', 'ps-fbm__lines');
    lines.setAttribute('aria-hidden', 'true');
    const theme = el(doc, 'div', 'ps-fbm__theme');
    const button = shapeButton('ps-fbm__circle ps-fbm__circle--theme', nextId('ps-fbm-details'));
    button.setAttribute('data-shape', '');
    const head = el(doc, 'span', 'ps-fbm__circle-head');
    const meta = el(doc, 'span', 'ps-fbm__meta');
    head.append(meta);
    const title = el(doc, 'span', 'ps-fbm__title ps-fbm__title--theme');
    button.append(head, title);
    theme.append(button);
    const list = el(doc, 'div', 'ps-fbm__sats');
    list.setAttribute('role', 'list');
    // A square layer with the theme at its centre; the stage around it is cut to the height the
    // satellites reach, and the layer is lifted by what the stage leaves off its top.
    const layer = el(doc, 'div', 'ps-fbm__layer');
    layer.append(lines, theme, list);
    stage.append(layer);
    item.append(stage);
    const cluster: Cluster = { node, item, stage, layer, lines, button, head, meta, title, sats: list, card: null as unknown as HTMLDivElement, cardKey: '' };
    cluster.card = newCard(node, host.panel, button);
    clusters.set(node.id, cluster);
    return cluster;
  }

  function removeCluster(id: string): void {
    const cluster = clusters.get(id);
    if (!cluster) return;
    for (const [satId, sat] of [...sats]) if (sat.theme === id) removeSat(satId);
    drop(cluster.card);
    cluster.item.remove();
    clusters.delete(id);
  }

  function addSat(node: PsNode, kind: Kind, cluster: Cluster, host: PartTwo): Sat {
    const item = el(doc, 'div', `ps-fbm__sat ps-fbm__sat--${kind}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-for', cluster.node.id);
    item.setAttribute('data-kind', kind);
    const button = shapeButton('ps-fbm__circle ps-fbm__circle--sat', nextId('ps-fbm-details'));
    button.setAttribute('data-shape', '');
    button.append(el(doc, 'span', 'ps-fbm__title ps-fbm__title--sat', kind === 'why' ? 'Why' : 'How'));
    item.append(button);
    // The outer span turns to the satellite; the inner one carries the colour and draws in.
    const line = el(doc, 'span', 'ps-fbm__line');
    line.setAttribute('data-edge', `${node.id}>${cluster.node.id}`);
    const ink = el(doc, 'span', 'ps-fbm__line-ink');
    line.append(ink);
    cluster.lines.append(line);
    const sat: Sat = { node, kind, theme: cluster.node.id, item, button, line, ink, card: null as unknown as HTMLDivElement, cardKey: '', a: '', pa: '' };
    sat.card = newCard(node, host.panel, button);
    sats.set(node.id, sat);
    return sat;
  }

  function removeSat(id: string): void {
    const sat = sats.get(id);
    if (!sat) return;
    drop(sat.card);
    sat.item.remove();
    sat.line.remove();
    sats.delete(id);
  }

  function addAction(node: PsNode, host: PartTwo): Action {
    const item = el(doc, 'li', 'ps-fbm__action') as unknown as HTMLDivElement;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = shapeButton('ps-fbm__action-card', nextId('ps-fbm-details'));
    button.setAttribute('data-shape', '');
    button.setAttribute('data-fill', 'card');
    const num = el(doc, 'span', 'ps-fbm__num');
    num.setAttribute('aria-hidden', 'true');
    const head = el(doc, 'span', 'ps-fbm__action-head');
    const title = el(doc, 'span', 'ps-fbm__title ps-fbm__title--action');
    head.append(title);
    button.append(num, head);
    item.append(button);
    const action: Action = { node, item, button, num, head, title, card: null as unknown as HTMLDivElement, cardKey: '' };
    action.card = newCard(node, host.actionPanel, button);
    actions.set(node.id, action);
    return action;
  }

  function removeAction(id: string): void {
    const action = actions.get(id);
    if (!action) return;
    drop(action.card);
    action.item.remove();
    actions.delete(id);
  }

  type Born = { clusters: Cluster[]; sats: Sat[]; actions: Action[] };

  function syncPartTwo(run: PsToolRun, born: Born): void {
    const themes = run.nodes.filter((node) => nameOf(node) === 'theme').sort(bySlot);
    const acts = run.nodes.filter((node) => nameOf(node) === 'action').sort(bySlot);
    const themeIds = new Set(themes.map((node) => node.id));
    // Satellites hang from a theme by their link; one whose link or theme went, goes.
    const wantSats = new Map<string, { node: PsNode; kind: Kind; theme: string }>();
    for (const theme of themes) {
      const { why, how } = satellitesOf(run, theme.id) as { why: PsNode[]; how: PsNode[] };
      for (const node of why) wantSats.set(node.id, { node, kind: 'why', theme: theme.id });
      for (const node of how) wantSats.set(node.id, { node, kind: 'how', theme: theme.id });
    }
    for (const [id, sat] of [...sats]) {
      const want = wantSats.get(id);
      if (!want || want.theme !== sat.theme || want.kind !== sat.kind) removeSat(id);
    }
    for (const id of [...clusters.keys()]) if (!themeIds.has(id)) removeCluster(id);
    const actIds = new Set(acts.map((node) => node.id));
    for (const id of [...actions.keys()]) if (!actIds.has(id)) removeAction(id);

    if (!themes.length && !acts.length) {
      if (two) {
        cancelAnimations(two.el);
        two.el.remove();
        two = null;
      }
      return;
    }
    const host = ensureTwo();
    // Actions can outlast every theme (an undo); then only they show, under their own heading.
    host.head.hidden = !themes.length;
    host.clusters.hidden = !themes.length;

    themes.forEach((node, i) => {
      let cluster = clusters.get(node.id);
      if (!cluster) {
        cluster = addCluster(node, host);
        born.clusters.push(cluster);
      }
      cluster.node = node;
      if (host.clusters.children[i] !== cluster.item) host.clusters.insertBefore(cluster.item, host.clusters.children[i] ?? null);
      const tag = tagOf(node);
      const word = THEME[tag].word;
      setAttr(cluster.item, 'data-tag', tag);
      setAttr(cluster.button, 'data-fill', THEME[tag].fill);
      setText(cluster.meta, word);
      setText(cluster.title, nodeTitle(node));
      setAttr(cluster.sats, 'aria-label', `Why and how: ${nodeTitle(node)}`);
      setAttr(cluster.button, 'aria-label', `${word} theme: ${nodeTitle(node)}${contested(node)}. Show details`);
      fillCard(cluster, node, THEME[tag].fill);
      syncContested(cluster.item, node, cluster.head, cluster.button);

      // Satellites: whys then hows, spread on the arc this cluster faces.
      const { why, how } = satellitesOf(run, node.id) as { why: PsNode[]; how: PsNode[] };
      const ring: Array<[PsNode, Kind]> = [...why.map((n): [PsNode, Kind] => [n, 'why']), ...how.map((n): [PsNode, Kind] => [n, 'how'])];
      const angles = satelliteAngles(ring.length, arcFacing(i, themes.length));
      const reach = clusterReach(angles.map(([a]) => a));
      setAttr(cluster.item, 'data-span', themes.length % 2 === 1 && i === themes.length - 1 && themes.length > 1 ? 'both' : null);
      setVar(cluster.stage, '--h', f(reach.top + reach.bottom));
      setVar(cluster.stage, '--lift', `${f(50 - reach.top)}%`);
      ring.forEach(([satNode, kind], k) => {
        let sat = sats.get(satNode.id);
        if (!sat) {
          sat = addSat(satNode, kind, cluster!, host);
          born.sats.push(sat);
        }
        sat.node = satNode;
        if (cluster!.sats.children[k] !== sat.item) cluster!.sats.insertBefore(sat.item, cluster!.sats.children[k] ?? null);
        const [a, pa] = angles[k];
        const rad = (deg: number): number => (deg * Math.PI) / 180;
        sat.a = f(a);
        sat.pa = f(pa);
        setVar(sat.item, '--a', `${sat.a}deg`);
        setVar(sat.item, '--pa', `${sat.pa}deg`);
        setVar(sat.item, '--x', `${f(50 + RING * Math.cos(rad(a)))}%`);
        setVar(sat.item, '--y', `${f(50 + RING * Math.sin(rad(a)))}%`);
        setVar(sat.item, '--px', `${f(50 + RING * Math.cos(rad(pa)))}%`);
        setVar(sat.item, '--py', `${f(50 + RING * Math.sin(rad(pa)))}%`);
        setVar(sat.line, '--a', `${sat.a}deg`);
        setVar(sat.line, '--pa', `${sat.pa}deg`);
        // A contested tag hangs below a satellite in the upper half, above one in the lower half.
        setAttr(sat.item, 'data-low', Math.sin(rad(a)) > 0.05 ? 'true' : 'false');
        setAttr(sat.item, 'data-plow', Math.sin(rad(pa)) > 0.05 ? 'true' : 'false');
        const fill = satFill(kind, tag);
        setAttr(sat.button, 'data-fill', fill);
        setAttr(sat.line, 'data-kind', kind);
        const word = kind === 'why' ? 'Why' : 'How';
        setAttr(sat.button, 'aria-label', `${word}, for ${nodeTitle(node)}: ${nodeTitle(satNode)}${contested(satNode)}. Show details`);
        fillCard(sat, satNode, fill);
        syncContested(sat.item, satNode, sat.item, sat.button);
      });
    });

    host.actions.hidden = acts.length === 0;
    acts.forEach((node, i) => {
      let action = actions.get(node.id);
      if (!action) {
        action = addAction(node, host);
        born.actions.push(action);
      }
      action.node = node;
      if (host.actionList.children[i] !== action.item) host.actionList.insertBefore(action.item, host.actionList.children[i] ?? null);
      setText(action.num, String(i + 1));
      setText(action.title, nodeTitle(node));
      setAttr(action.button, 'aria-label', `Action ${i + 1}: ${nodeTitle(node)}${contested(node)}. Show details`);
      fillCard(action, node, 'blue');
      syncContested(action.item, node, action.head, action.button);
    });
  }

  // ---------------------------------------------------------------- motion

  type Place = { sat: [number, number]; theme: [number, number] };

  /** Where every satellite and its theme are drawn right now (read before any write). */
  function measure(): Map<string, Place> {
    const out = new Map<string, Place>();
    for (const [id, sat] of sats) {
      const cluster = clusters.get(sat.theme);
      if (!cluster) continue;
      out.set(id, { sat: centre(sat.item.getBoundingClientRect()), theme: centre(cluster.button.getBoundingClientRect()) });
    }
    return out;
  }

  function glide(moved: Sat[], before: Map<string, Place>): void {
    // All the reads first, then the animations.
    const after = new Map(moved.map((sat) => [sat.node.id, { sat: centre(sat.item.getBoundingClientRect()), theme: centre(clusters.get(sat.theme)!.button.getBoundingClientRect()) }]));
    for (const sat of moved) {
      const was = before.get(sat.node.id);
      const now = after.get(sat.node.id);
      if (!was || !now) continue;
      const dx = was.sat[0] - now.sat[0];
      const dy = was.sat[1] - now.sat[1];
      const turnWas = Math.atan2(was.sat[1] - was.theme[1], was.sat[0] - was.theme[0]);
      const turnNow = Math.atan2(now.sat[1] - now.theme[1], now.sat[0] - now.theme[0]);
      let turn = ((turnWas - turnNow) * 180) / Math.PI;
      turn = ((((turn + 180) % 360) + 360) % 360) - 180;
      if (Math.hypot(dx, dy) < 0.5 && Math.abs(turn) < 0.5) continue;
      cancelAnimations(sat.item);
      sat.item.animate([{ translate: `${f(dx)}px ${f(dy)}px` }, { translate: '0px 0px' }], { duration: GLIDE, easing: EASE, fill: 'backwards' });
      cancelAnimations(sat.line);
      sat.line.animate([{ rotate: `${f(turn)}deg` }, { rotate: '0deg' }], { duration: GLIDE, easing: EASE, fill: 'backwards' });
    }
  }

  function enter(fresh: HTMLElement[], born: Born): void {
    fresh.forEach((item, i) => {
      if (item.hidden || !canAnimate(item)) return;
      item.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: Math.min(i * 50, 250), easing: EASE, fill: 'backwards' });
    });
    for (const cluster of born.clusters) {
      if (!canAnimate(cluster.button)) continue;
      cluster.button.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
    }
    // A satellite grows out of its theme: the line draws in, then the circle pops.
    const bornThemes = new Set(born.clusters.map((cluster) => cluster.node.id));
    born.sats.forEach((sat, i) => {
      const delay = (bornThemes.has(sat.theme) ? 260 : 0) + Math.min(i * 90, 360);
      if (canAnimate(sat.ink)) sat.ink.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 320, delay, easing: EASE, fill: 'backwards' });
      if (canAnimate(sat.button)) sat.button.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: delay + 240, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
    });
    born.actions.forEach((action, i) => {
      if (!canAnimate(action.item)) return;
      action.item.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: Math.min(i * 60, 240), easing: EASE, fill: 'backwards' });
    });
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    const animate = painted && canAnimate(root);
    // Read every satellite's place before anything is written, so moves glide from there.
    const before = animate ? measure() : new Map<string, Place>();
    const angleWas = new Map([...sats].map(([id, sat]) => [id, `${sat.a} ${sat.pa}`]));
    const fresh: HTMLElement[] = [];
    const born: Born = { clusters: [], sats: [], actions: [] };
    syncQuadrants(run, fresh);
    syncPartTwo(run, born);
    if (animate) {
      const moved = [...sats.values()].filter((sat) => angleWas.has(sat.node.id) && angleWas.get(sat.node.id) !== `${sat.a} ${sat.pa}`);
      if (moved.length) glide(moved, before);
      enter(fresh, born);
    }
    painted = true;
  }

  return {
    el: root,
    update,
    /** Stop any motion and ignore later updates once the canvas drops this view. */
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
