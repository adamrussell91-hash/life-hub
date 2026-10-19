// packages/problem-solver/render/swot.ts
// SWOT analysis (toolkit, Decide), drawn as the book draws it: two full-width blue bands on top,
// "Goal" then "Option", each carrying its answer after the label; under them a blue side band
// split into "Internal" (upper) and "External" (lower) with the words running up the band; and a
// 2x2 grid beside it: yellow Strengths top left, red Weaknesses top right, yellow Opportunities
// bottom left, red Threats bottom right. Each quadrant has its heading and a short description in
// our own words, then the selected option's items as pill buttons. Thin paper rules separate
// every piece. The grid is one option at a time: tabs above the chart (once there are two
// options) or a sideways swipe on the grid switch it. Items with no option are listed in an
// "Unplaced" row under the grid. A synthesis card and the Chosen option card follow.
// Phone (the root up to 520px wide): the side band gives way to small "Internal" and "External"
// headings above the stacked quadrants, in the order S, W, O, T.
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { QUADRANTS } from '../tools/swot.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';
import type { Accent } from './details';
import { createChoiceCard } from './choice-card';

export type SwotView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type Quadrant = 'strength' | 'weakness' | 'opportunity' | 'threat';
const QUADS = QUADRANTS as readonly Quadrant[];
const QUAD: Record<Quadrant, { heading: string; words: string; fill: 'yellow' | 'red'; code: string }> = {
  strength: { heading: 'Strengths', words: 'Helps, in your control', fill: 'yellow', code: 'S' },
  weakness: { heading: 'Weaknesses', words: 'Holds it back, in your control', fill: 'red', code: 'W' },
  opportunity: { heading: 'Opportunities', words: 'Could help, outside your control', fill: 'yellow', code: 'O' },
  threat: { heading: 'Threats', words: 'Puts it at risk, outside your control', fill: 'red', code: 'T' }
};
const SINGULAR: Record<Quadrant, string> = { strength: 'Strength', weakness: 'Weakness', opportunity: 'Opportunity', threat: 'Threat' };
/** A sideways move this long (and mostly sideways) on the grid switches the option. */
const SWIPE_PX = 48;

type Item = { node: PsNode; kind: Quadrant; item: HTMLDivElement; button: HTMLButtonElement; title: HTMLSpanElement; card: HTMLDivElement };
type Opt = { node: PsNode; button: HTMLButtonElement; title: HTMLSpanElement; words: HTMLSpanElement; card: HTMLDivElement; tab: HTMLButtonElement; tabTitle: HTMLSpanElement };
type Frame = {
  tabs: HTMLDivElement;
  band: HTMLDivElement;
  grid: HTMLDivElement;
  lists: Record<Quadrant, HTMLDivElement>;
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

function setLabel(target: Element, value: string): void {
  if (target.getAttribute('aria-label') !== value) target.setAttribute('aria-label', value);
}

const nameOf = (node: PsNode): string | undefined => parseSlot(node.slot)?.name;
const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const bySlot = (a: PsNode, b: PsNode): number => indexOf(a) - indexOf(b);
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

export function createSwotView(doc: Document = document): SwotView {
  const root = doc.createElement('div');
  root.className = 'ps-swot';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'SWOT analysis');
  const group = createDisclosureGroup();
  const choice = createChoiceCard(doc, group);

  // Fixed slots in the root, created on demand and kept in this order.
  let goalBand: { item: HTMLDivElement; button: HTMLButtonElement; title: HTMLSpanElement; words: HTMLSpanElement; card: HTMLDivElement; id: string } | null = null;
  let frame: Frame | null = null;
  let unplaced: { row: HTMLDivElement; list: HTMLDivElement } | null = null;
  let synthesis: { item: HTMLDivElement; head: HTMLDivElement; text: HTMLParagraphElement; more: HTMLButtonElement; id: string } | null = null;
  const panel = el(doc, 'div', 'ps-swot__panel');
  const after = el(doc, 'div', 'ps-swot__after');

  const items = new Map<string, Item>();
  const opts = new Map<string, Opt>();
  let optOrder: PsNode[] = [];
  let selected: string | null = null;
  let picked = false;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- helpers

  function shapeButton(className: string, detailsId: string): HTMLButtonElement {
    const button = el(doc, 'button', className);
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    return button;
  }

  function card(node: PsNode, accent: Accent, detailsId: string): HTMLDivElement {
    const out = detailsCard(doc, node, accent, detailsId);
    out.setAttribute('data-for', node.id);
    panel.append(out);
    return out;
  }

  /** Keep the root's children in their fixed order: tabs, goal, chart, unplaced, details, after. */
  function arrange(): void {
    const want = [frame?.tabs, goalBand?.item, frame?.band, frame?.grid, unplaced?.row, panel, after].filter(Boolean) as HTMLElement[];
    want.forEach((child, i) => {
      if (root.children[i] !== child) root.insertBefore(child, root.children[i] ?? null);
    });
    for (const child of [...root.children]) if (!want.includes(child as HTMLElement)) child.remove();
  }

  function drop(card: HTMLElement): void {
    group.unregister(card);
    card.remove();
  }

  // ---------------------------------------------------------------- goal band

  function syncGoal(node: PsNode | undefined, fresh: HTMLElement[]): void {
    if (goalBand && goalBand.id !== node?.id) {
      drop(goalBand.card);
      goalBand.item.remove();
      goalBand = null;
    }
    if (!node) return;
    if (!goalBand) {
      const detailsId = nextId('ps-swot-details');
      const item = el(doc, 'div', 'ps-swot__band ps-swot__band--goal');
      item.setAttribute('data-node', node.id);
      item.setAttribute('data-shape', '');
      item.setAttribute('data-fill', 'blue');
      const button = shapeButton('ps-swot__band-button', detailsId);
      const words = el(doc, 'span', 'ps-swot__words');
      const title = el(doc, 'span', 'ps-swot__title');
      words.append(el(doc, 'span', 'ps-swot__band-label', 'Goal'), title);
      button.append(words);
      item.append(button);
      const details = card(node, 'blue', detailsId);
      group.register(details, button);
      goalBand = { item, button, title, words, card: details, id: node.id };
      fresh.push(item);
    }
    setText(goalBand.title, nodeTitle(node));
    setLabel(goalBand.button, `Goal: ${nodeTitle(node)}${contested(node)}. Show details`);
    syncContested(goalBand.item, node, goalBand.words, goalBand.button);
  }

  // ---------------------------------------------------------------- frame (option band, tabs, grid)

  function ensureFrame(fresh: HTMLElement[]): Frame {
    if (frame) return frame;
    const tabs = el(doc, 'div', 'ps-swot__tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Option shown');
    tabs.hidden = true;
    const band = el(doc, 'div', 'ps-swot__band ps-swot__band--option');
    band.setAttribute('data-shape', '');
    band.setAttribute('data-fill', 'blue');
    const grid = el(doc, 'div', 'ps-swot__grid');
    const lists = {} as Record<Quadrant, HTMLDivElement>;
    const side = (where: 'internal' | 'external', label: string): HTMLElement[] => {
      // Desktop: a blue strip down the left with the word running up it. Phone: a small heading.
      const strip = el(doc, 'div', `ps-swot__side ps-swot__side--${where}`);
      strip.setAttribute('data-shape', '');
      strip.setAttribute('data-fill', 'blue');
      strip.setAttribute('aria-hidden', 'true');
      strip.append(el(doc, 'span', 'ps-swot__side-label', label));
      const head = el(doc, 'p', `ps-swot__meta ps-swot__group ps-swot__group--${where}`, label);
      return [head, strip];
    };
    const quadrant = (kind: Quadrant): HTMLElement => {
      const q = QUAD[kind];
      const box = el(doc, 'div', `ps-swot__quadrant ps-swot__quadrant--${kind}`);
      box.setAttribute('data-quadrant', kind);
      box.setAttribute('data-region', kind);
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', q.heading);
      box.setAttribute('data-shape', '');
      box.setAttribute('data-fill', q.fill);
      const heading = el(doc, 'p', 'ps-swot__heading', q.heading);
      const words = el(doc, 'p', 'ps-swot__desc', q.words);
      const list = el(doc, 'div', 'ps-swot__items');
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', q.heading);
      lists[kind] = list;
      box.append(heading, words, list);
      return box;
    };
    grid.append(...side('internal', 'Internal'), quadrant('strength'), quadrant('weakness'), ...side('external', 'External'), quadrant('opportunity'), quadrant('threat'));
    listenForSwipes(grid);
    frame = { tabs, band, grid, lists };
    fresh.push(band, grid);
    return frame;
  }

  function addOpt(node: PsNode): Opt {
    const detailsId = nextId('ps-swot-details');
    const button = shapeButton('ps-swot__band-button ps-swot__option', detailsId);
    button.setAttribute('data-node', node.id);
    const words = el(doc, 'span', 'ps-swot__words');
    const title = el(doc, 'span', 'ps-swot__title');
    words.append(el(doc, 'span', 'ps-swot__band-label', 'Option'), title);
    button.append(words);
    frame!.band.append(button);
    const details = card(node, 'blue', detailsId);
    group.register(details, button);

    const tab = el(doc, 'button', 'ps-swot__tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('data-for', node.id);
    const tabTitle = el(doc, 'span', 'ps-swot__tab-title');
    tab.append(tabTitle);
    tab.addEventListener('click', () => {
      picked = true;
      select(node.id);
    });
    // Arrow keys move along the tabs (roving focus), as a tab list should.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const all = optOrder.map((opt) => opts.get(opt.id)!.tab);
      const next = all[(all.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      event.preventDefault();
      next.click();
      next.focus();
    });
    frame!.tabs.append(tab);
    const opt: Opt = { node, button, title, words, card: details, tab, tabTitle };
    opts.set(node.id, opt);
    return opt;
  }

  function removeOpt(id: string): void {
    const opt = opts.get(id);
    if (!opt) return;
    drop(opt.card);
    opt.button.remove();
    opt.tab.remove();
    opts.delete(id);
    if (selected === id) {
      selected = null;
      picked = false;
    }
  }

  // ---------------------------------------------------------------- items

  function addItem(node: PsNode, kind: Quadrant): Item {
    const detailsId = nextId('ps-swot-details');
    const item = el(doc, 'div', 'ps-swot__item');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = shapeButton('ps-swot__pill', detailsId);
    button.setAttribute('data-shape', '');
    button.setAttribute('data-fill', QUAD[kind].fill);
    const title = el(doc, 'span', 'ps-swot__title');
    button.append(title);
    item.append(button);
    const details = card(node, QUAD[kind].fill, detailsId);
    group.register(details, button);
    const out: Item = { node, kind, item, button, title, card: details };
    items.set(node.id, out);
    return out;
  }

  function removeItem(id: string): void {
    const item = items.get(id);
    if (!item) return;
    drop(item.card);
    item.item.remove();
    items.delete(id);
  }

  function ensureUnplaced(): NonNullable<typeof unplaced> {
    if (unplaced) return unplaced;
    const row = el(doc, 'div', 'ps-swot__unplaced');
    row.append(el(doc, 'p', 'ps-swot__meta ps-swot__unplaced-label', 'Unplaced'));
    const list = el(doc, 'div', 'ps-swot__items');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Items not linked to an option');
    row.append(list);
    unplaced = { row, list };
    return unplaced;
  }

  // ---------------------------------------------------------------- synthesis

  function syncSynthesis(node: PsNode | undefined, fresh: HTMLElement[]): void {
    if (synthesis && synthesis.id !== node?.id) {
      group.unregister(synthesis.item);
      synthesis.item.remove();
      synthesis = null;
    }
    if (!node) return;
    if (!synthesis) {
      const detailsId = nextId('ps-swot-details');
      const item = el(doc, 'div', 'ps-swot__synthesis');
      item.setAttribute('data-node', node.id);
      const head = el(doc, 'div', 'ps-swot__synthesis-head');
      head.append(el(doc, 'span', 'ps-swot__synthesis-meta', 'Draw it together'));
      const moves = el(doc, 'div', 'ps-swot__moves');
      moves.setAttribute('aria-hidden', 'true');
      for (const [word, tone] of [['Build on', 'yellow'], ['Shrink', 'red'], ['Counter', 'yellow'], ['Convert', 'red']] as const) {
        const move = el(doc, 'span', `ps-swot__move ps-swot__move--${tone}`, word);
        moves.append(move);
      }
      const text = el(doc, 'p', 'ps-swot__synthesis-text');
      const more = el(doc, 'button', 'ps-swot__more', 'Details');
      more.type = 'button';
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-controls', detailsId);
      more.setAttribute('aria-label', 'Synthesis. Show details');
      const details = detailsCard(doc, node, 'yellow', detailsId);
      details.setAttribute('data-for', node.id);
      // The card shows the answer in full, so its details carry only skills and any objection.
      details.querySelector('.ps-details__text')?.remove();
      item.append(head, moves, text, more, details);
      group.register(item, more);
      synthesis = { item, head, text, more, id: node.id };
      fresh.push(item);
    }
    setText(synthesis.text, node.text);
    syncContested(synthesis.item, node, synthesis.head, synthesis.more);
    if (after.firstElementChild !== synthesis.item) after.prepend(synthesis.item);
  }

  // ---------------------------------------------------------------- selection

  function place(animate: boolean): void {
    if (!frame) return;
    const shown: HTMLElement[] = [];
    for (const opt of optOrder) {
      const o = opts.get(opt.id)!;
      const on = opt.id === selected;
      o.button.hidden = !on;
      o.tab.setAttribute('aria-selected', String(on));
      o.tab.tabIndex = on ? 0 : -1;
    }
    for (const item of items.values()) {
      if (item.item.parentElement === unplaced?.list) continue;
      const hide = item.item.getAttribute('data-option') !== selected;
      if (item.item.hidden !== hide) {
        item.item.hidden = hide;
        if (!hide) shown.push(item.item);
      }
    }
    frame.tabs.hidden = optOrder.length < 2;
    if (animate) {
      for (const node of shown) {
        if (!canAnimate(node)) continue;
        cancelAnimations(node);
        node.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE, fill: 'backwards' });
      }
    }
  }

  function select(id: string): void {
    if (destroyed || selected === id) return;
    selected = id;
    // A tab change never leaves a card open for something that has gone from view.
    group.close();
    place(painted);
  }

  function step(by: 1 | -1): void {
    if (optOrder.length < 2) return;
    const at = optOrder.findIndex((opt) => opt.id === selected);
    const next = optOrder[at + by];
    if (!next) return;
    picked = true;
    select(next.id);
  }

  function listenForSwipes(grid: HTMLElement): void {
    let start: { x: number; y: number; id: number } | null = null;
    let swallow = false;
    grid.addEventListener('pointerdown', (event) => {
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    grid.addEventListener('pointercancel', () => {
      start = null;
    });
    grid.addEventListener('pointerup', (event) => {
      const from = start;
      start = null;
      if (destroyed || !from || from.id !== event.pointerId) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // A swipe that began on a pill must not also open it.
      swallow = true;
      step(dx < 0 ? 1 : -1);
    });
    grid.addEventListener(
      'click',
      (event) => {
        if (!swallow) return;
        swallow = false;
        event.stopPropagation();
        event.preventDefault();
      },
      true
    );
  }

  // ---------------------------------------------------------------- update

  function teardown(): void {
    for (const item of items.values()) group.unregister(item.card);
    for (const opt of opts.values()) group.unregister(opt.card);
    if (goalBand) group.unregister(goalBand.card);
    if (synthesis) group.unregister(synthesis.item);
    choice.reset();
    cancelAnimations(root);
    root.replaceChildren();
    panel.replaceChildren();
    after.replaceChildren();
    items.clear();
    opts.clear();
    goalBand = null;
    frame = null;
    unplaced = null;
    synthesis = null;
    optOrder = [];
    selected = null;
    picked = false;
  }

  function update(run: PsToolRun): void {
    if (destroyed) return;
    const byName = (name: string): PsNode[] => run.nodes.filter((node) => nameOf(node) === name).sort(bySlot);
    const goal = byName('goal')[0];
    const options = byName('option');
    const quadNodes = QUADS.flatMap((kind) => byName(kind).map((node) => ({ node, kind })));
    const synth = byName('synthesis')[0];
    if (!run.nodes.length) {
      if (root.children.length) teardown();
      painted = true;
      return;
    }
    const fresh: HTMLElement[] = [];
    const freshItems: HTMLElement[] = [];

    // Which option each item belongs to (its `of` edge), if that option is on the chart.
    const optionIds = new Set(options.map((node) => node.id));
    const ofOption = new Map<string, string>();
    for (const edge of run.edges) if (edge.kind === 'of' && optionIds.has(edge.to) && !ofOption.has(edge.from)) ofOption.set(edge.from, edge.to);

    // Drop what an undo took away: items, then options (with their tabs and cards).
    const itemIds = new Set(quadNodes.map(({ node }) => node.id));
    for (const id of [...items.keys()]) if (!itemIds.has(id) || items.get(id)!.kind !== quadNodes.find(({ node }) => node.id === id)!.kind) removeItem(id);
    for (const id of [...opts.keys()]) if (!optionIds.has(id)) removeOpt(id);

    syncGoal(goal, fresh);

    // The grid and its bands come with the first option, and go with the last.
    if (options.length) ensureFrame(fresh);
    else frame = null;
    optOrder = options;
    options.forEach((node, j) => {
      let opt = opts.get(node.id);
      if (!opt) opt = addOpt(node);
      opt.node = node;
      if (frame!.band.children[j] !== opt.button) frame!.band.insertBefore(opt.button, frame!.band.children[j] ?? null);
      if (frame!.tabs.children[j] !== opt.tab) frame!.tabs.insertBefore(opt.tab, frame!.tabs.children[j] ?? null);
      setText(opt.title, nodeTitle(node));
      setText(opt.tabTitle, `Option ${j + 1}: ${nodeTitle(node)}`);
      setLabel(opt.button, `Option ${j + 1}: ${nodeTitle(node)}${contested(node)}. Show details`);
      syncContested(opt.button, node, opt.words, opt.button);
    });

    // Items: in their quadrant, tagged with their option; with no option, in the Unplaced row.
    const counts = new Map<string, number>();
    for (const { node, kind } of quadNodes) {
      let item = items.get(node.id);
      if (!item) {
        item = addItem(node, kind);
        freshItems.push(item.item);
      }
      item.node = node;
      const owner = ofOption.get(node.id) ?? null;
      const host = owner ? frame!.lists[kind] : ensureUnplaced().list;
      if (owner) {
        if (item.item.getAttribute('data-option') !== owner) item.item.setAttribute('data-option', owner);
      } else {
        item.item.removeAttribute('data-option');
        item.item.hidden = false;
      }
      // Keep each list in slot order.
      const key = owner ? `${kind}` : 'unplaced';
      const at = counts.get(key) ?? 0;
      counts.set(key, at + 1);
      if (host.children[at] !== item.item) host.insertBefore(item.item, host.children[at] ?? null);
      const words = owner ? '' : `${SINGULAR[kind]} · `;
      setText(item.title, `${words}${nodeTitle(node)}`);
      setLabel(item.button, `${SINGULAR[kind]}: ${nodeTitle(node)}${contested(node)}. Show details`);
      syncContested(item.item, node, item.button, item.button);
    }
    if (unplaced && !unplaced.list.children.length) {
      unplaced.row.remove();
      unplaced = null;
    }

    // Which option shows: the person's pick, else the newest option with an item, else the newest.
    if (options.length) {
      if (!selected || !optionIds.has(selected) || !picked) {
        const withItems = [...options].reverse().find((opt) => [...ofOption.values()].includes(opt.id));
        selected = (withItems ?? options[options.length - 1]).id;
      }
    } else selected = null;
    const was = new Set([...items.values()].filter((i) => !i.item.hidden).map((i) => i.item));
    place(false);
    // Newly shown items (a new default option) fade in like a tab change, but only once painted.
    if (painted) {
      for (const item of items.values()) {
        if (item.item.hidden || was.has(item.item) || freshItems.includes(item.item) || !canAnimate(item.item)) continue;
        cancelAnimations(item.item);
        item.item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE, fill: 'backwards' });
      }
    }

    syncSynthesis(synth, fresh);
    choice.sync(run, after, painted);
    arrange();
    // An open card whose button is hidden (its option is not showing) closes.
    for (const item of items.values()) if (item.item.hidden && item.card.classList.contains('is-open')) group.close();
    for (const opt of opts.values()) if (opt.button.hidden && opt.card.classList.contains('is-open')) group.close();

    // Motion for what is new, never on the first paint of a saved run.
    if (painted) {
      for (const node of fresh) {
        if (!canAnimate(node)) continue;
        if (node.classList.contains('ps-swot__band')) node.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 420, easing: EASE, fill: 'backwards' });
        else if (node === frame?.grid) {
          [...node.querySelectorAll<HTMLElement>('.ps-swot__quadrant, .ps-swot__side')].forEach((piece, i) => {
            piece.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 80 + i * 50, easing: EASE, fill: 'backwards' });
          });
        } else node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
      }
      freshItems.forEach((node, i) => {
        if (node.hidden || !canAnimate(node)) return;
        node.animate([{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(i * 50, 250), easing: EASE, fill: 'backwards' });
      });
    }
    painted = true;
  }

  return {
    el: root,
    update,
    /** Stop swipes and any motion once the canvas drops this view. */
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
