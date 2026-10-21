// packages/problem-solver/render/perspective-shift.ts
// The Perspective shift chart from the toolkit (Analyse): an upright rectangle cut
// by its diagonals into four triangles, yellow at the top and bottom and blue at the
// sides, with a red dot where the diagonals cross. Each stakeholder takes a triangle
// in turn (top, right, bottom, left) with a perspective letter and a short prompt;
// their view shows as a dot beside the prompt and their insight sits under a thin
// rule. More than four stakeholders page in sets of four. The reframe pulses the
// centre dot and appears in full in a card below.
// A triangle exists only once its stakeholder is accepted; only new parts animate.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type PerspectiveShiftView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Quadrant = 'top' | 'right' | 'bottom' | 'left';
type Kind = 'stakeholder' | 'view' | 'insight';

const SVG = 'http://www.w3.org/2000/svg';
const QUADRANTS: Quadrant[] = ['top', 'right', 'bottom', 'left'];
const PER_PAGE = 4;
/** The book's four prompts, one per triangle. */
const PROMPT: Record<Quadrant, string> = { top: 'I think…', right: 'Why is…', bottom: 'I wish…', left: 'What about…' };
const ACCENT: Record<Quadrant, Accent> = { top: 'yellow', right: 'blue', bottom: 'yellow', left: 'blue' };
/** Each triangle wipes in from its outer edge. */
const WIPE: Record<Quadrant, string> = {
  top: 'inset(0 0 100% 0)',
  right: 'inset(0 0 0 100%)',
  bottom: 'inset(100% 0 0 0)',
  left: 'inset(0 100% 0 0)'
};

type Slot = { kind: Kind | 'reframe'; index: number };
function slotOf(node: PsNode): Slot | null {
  const slot = parseSlot(node.slot);
  if (!slot) return null;
  if (slot.name === 'reframe') return { kind: 'reframe', index: 0 };
  if ((slot.name === 'stakeholder' || slot.name === 'view' || slot.name === 'insight') && slot.index) return { kind: slot.name, index: slot.index };
  return null;
}

const letter = (index: number): string => String.fromCharCode(64 + index);
const perspective = (index: number): string => `Perspective ${letter(index)}`;
const quadrantOf = (index: number): Quadrant => QUADRANTS[(index - 1) % PER_PAGE];
const pageOf = (index: number): number => Math.floor((index - 1) / PER_PAGE);

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

type Cell = { quadrant: HTMLDivElement; body: HTMLSpanElement; col: HTMLDivElement; prompt: HTMLElement; index: number };
type Page = { el: HTMLDivElement; cells: Map<Quadrant, Cell> };

export function createPerspectiveShiftView(doc: Document = document): PerspectiveShiftView {
  const root = doc.createElement('div');
  root.className = 'ps-persp';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Perspective shift');

  const group = createDisclosureGroup();
  const items = new Map<string, HTMLElement>();
  const buttons = new Map<string, HTMLButtonElement>();
  const cards = new Map<string, HTMLElement>();
  const cellOf = new Map<string, Cell>();
  const pages: Page[] = [];

  let stage: HTMLDivElement | null = null;
  let centre: HTMLSpanElement | null = null;
  let pager: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let reframe: HTMLElement | null = null;
  let current = -1;
  /** The fade-out running on a leaving set, so a quick switch back can cancel it. */
  const fades = new Map<Page, Animation>();

  function ensureFrame(): void {
    if (stage) return;
    stage = doc.createElement('div');
    stage.className = 'ps-persp__stage';
    // A faint outline of the whole chart, so the triangles still to come have a place.
    const frame = doc.createElementNS(SVG, 'svg');
    frame.setAttribute('class', 'ps-persp__frame');
    frame.setAttribute('viewBox', '0 0 70 90');
    frame.setAttribute('preserveAspectRatio', 'none');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('focusable', 'false');
    const lines = doc.createElementNS(SVG, 'path');
    lines.setAttribute('d', 'M0 0H70V90H0ZM0 0L70 90M70 0L0 90');
    lines.setAttribute('vector-effect', 'non-scaling-stroke');
    frame.append(lines);
    stage.append(frame);
    if (canAnimate(frame)) frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: EASE, fill: 'backwards' });
    centre = span(doc, 'ps-persp__centre');
    centre.setAttribute('aria-hidden', 'true');
    const pop = span(doc, 'ps-persp__centre-pop');
    centre.append(pop);
    stage.append(centre);
    panel = doc.createElement('div');
    panel.className = 'ps-persp__panel';
    root.prepend(stage, panel);
    if (canAnimate(pop)) pop.animate([{ transform: 'scale(0)' }, { transform: 'none' }], { duration: 420, delay: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' });
  }

  function ensurePage(n: number): Page {
    ensureFrame();
    while (pages.length <= n) {
      const el = doc.createElement('div');
      el.className = 'ps-persp__page';
      el.setAttribute('data-page', String(pages.length + 1));
      el.hidden = true;
      stage!.insertBefore(el, centre);
      pages.push({ el, cells: new Map() });
    }
    return pages[n];
  }

  function syncOpen(): void {
    for (const [id, item] of items) cards.get(id)?.classList.toggle('is-open', item.classList.contains('is-open'));
    for (const page of pages) {
      for (const cell of page.cells.values()) cell.quadrant.classList.toggle('is-open', !!cell.col.querySelector('.is-open'));
    }
  }

  function register(id: string, item: HTMLElement, button: HTMLButtonElement, card: HTMLElement, inPanel: boolean): void {
    if (inPanel) {
      card.setAttribute('data-for', id);
      panel!.append(card);
    }
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    items.set(id, item);
    buttons.set(id, button);
    cards.set(id, card);
  }

  function makeButton(className: string, label: string, detailsId: string): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', label);
    return button;
  }

  function makeItem(node: PsNode, kind: Kind): HTMLDivElement {
    const item = doc.createElement('div');
    item.className = `ps-persp__item ps-persp__item--${kind}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    return item;
  }

  const contested = (node: PsNode) => (node.state === 'contested' ? ', contested' : '');

  function addStakeholder(node: PsNode, index: number): Cell {
    const page = ensurePage(pageOf(index));
    const where = quadrantOf(index);
    const quadrant = doc.createElement('div');
    quadrant.className = `ps-persp__quadrant ps-persp__quadrant--${where}`;
    quadrant.setAttribute('data-quadrant', where);
    quadrant.setAttribute('data-region', 'perspective');
    quadrant.setAttribute('aria-label', perspective(index));
    // The coloured triangle sits in a wrapper: the wrapper carries the wipe and the
    // focus ring, the fill carries the clip, so the ring shows around the triangle.
    const body = span(doc, 'ps-persp__body');
    const fill = span(doc, 'ps-persp__fill');
    body.append(fill);
    const col = doc.createElement('div');
    col.className = 'ps-persp__col';

    const detailsId = nextId('ps-persp-details');
    const item = makeItem(node, 'stakeholder');
    const button = makeButton('ps-persp__shape', `${perspective(index)}: ${nodeTitle(node)}${contested(node)}. Show details`, detailsId);
    button.append(span(doc, 'ps-persp__meta', perspective(index)), span(doc, 'ps-persp__title', nodeTitle(node)));
    if (node.state === 'contested') button.append(contestedTag(doc, node));
    item.append(button);
    // The whole triangle is the stakeholder's hit area.
    fill.addEventListener('click', () => button.click());

    // Deliberate order: meta, title, then the prompt line. The plan put the prompt between
    // meta and title, but the prompt line becomes the view's own button once the view is
    // noted (its dot sits beside it), and a button cannot sit inside the stakeholder's
    // button. Keeping it after the title lets the view stay reachable even after the
    // insight arrives under it.
    const prompt = span(doc, 'ps-persp__prompt', PROMPT[where]);
    col.append(item, prompt);
    quadrant.append(body, col);
    // Keep the triangles in quadrant order so the stacking stays the same however they arrive.
    const after = QUADRANTS.slice(QUADRANTS.indexOf(where) + 1).map((q) => page.cells.get(q)?.quadrant).find(Boolean) ?? null;
    page.el.insertBefore(quadrant, after);

    register(node.id, item, button, detailsCard(doc, node, ACCENT[where], detailsId), true);
    const cell = { quadrant, body, col, prompt, index };
    page.cells.set(where, cell);
    return cell;
  }

  function addView(node: PsNode, cell: Cell): HTMLElement {
    const where = quadrantOf(cell.index);
    const detailsId = nextId('ps-persp-details');
    const item = makeItem(node, 'view');
    const button = makeButton('ps-persp__view', `View, ${perspective(cell.index)}: ${nodeTitle(node)}${contested(node)}. Show details`, detailsId);
    button.append(span(doc, 'ps-persp__prompt', PROMPT[where]), span(doc, 'ps-persp__dot'));
    if (node.state === 'contested') button.append(contestedTag(doc, node));
    item.append(button);
    // The view takes the prompt's place: the prompt itself becomes its button.
    cell.prompt.replaceWith(item);
    cell.prompt = item;
    register(node.id, item, button, detailsCard(doc, node, ACCENT[where], detailsId), true);
    return item;
  }

  function addInsight(node: PsNode, cell: Cell): HTMLElement {
    const detailsId = nextId('ps-persp-details');
    const item = makeItem(node, 'insight');
    const button = makeButton('ps-persp__insight', `Insight, ${perspective(cell.index)}: ${nodeTitle(node)}${contested(node)}. Show details`, detailsId);
    const rule = span(doc, 'ps-persp__rule');
    rule.append(span(doc, 'ps-persp__meta', 'Insight'));
    button.append(rule, span(doc, 'ps-persp__title', nodeTitle(node)));
    if (node.state === 'contested') button.append(contestedTag(doc, node));
    item.append(button);
    cell.col.append(item);
    register(node.id, item, button, detailsCard(doc, node, ACCENT[quadrantOf(cell.index)], detailsId), true);
    return item;
  }

  function addReframe(node: PsNode): HTMLElement {
    const detailsId = nextId('ps-persp-details');
    const item = doc.createElement('div');
    item.className = 'ps-persp__reframe';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const head = doc.createElement('div');
    head.className = 'ps-persp__reframe-head';
    head.append(span(doc, 'ps-persp__reframe-meta', 'The reframe'));
    if (node.state === 'contested') head.append(contestedTag(doc, node));
    const text = doc.createElement('p');
    text.className = 'ps-persp__reframe-text';
    text.textContent = node.text;
    const more = makeButton('ps-persp__more', `The reframe${contested(node)}. Show details`, detailsId);
    more.textContent = 'Details';
    const card = detailsCard(doc, node, 'red', detailsId);
    // The card repeats the answer, so here it carries only skills and any objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    register(node.id, item, more, card, false);
    root.append(item);
    return item;
  }

  /** A whole triangle arriving: the colour wipes in from the outer edge, then its words. */
  function animateCell(cell: Cell, delay: number): void {
    const where = cell.quadrant.getAttribute('data-quadrant') as Quadrant;
    if (!canAnimate(cell.body)) return;
    cell.body.animate([{ clipPath: WIPE[where] }, { clipPath: 'inset(0 0 0 0)' }], { duration: 520, delay, easing: EASE, fill: 'backwards' });
    [...cell.col.children].forEach((child, i) => {
      (child as HTMLElement).animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: delay + 260 + i * 70, easing: EASE, fill: 'backwards' });
    });
  }

  function animateView(item: HTMLElement): void {
    const dot = item.querySelector<HTMLElement>('.ps-persp__dot');
    if (!dot || !canAnimate(dot)) return;
    dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.5)', offset: 0.6 }, { transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
  }

  function animateInsight(item: HTMLElement): void {
    const rule = item.querySelector<HTMLElement>('.ps-persp__rule');
    const title = item.querySelector<HTMLElement>('.ps-persp__title');
    if (!rule || !title || !canAnimate(rule)) return;
    rule.animate([{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 420, easing: EASE, fill: 'backwards' });
    title.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 200, easing: EASE, fill: 'backwards' });
  }

  function closeOpenOn(page: Page): void {
    for (const [id, item] of items) {
      if (item.classList.contains('is-open') && page.el.contains(item)) buttons.get(id)?.click();
    }
  }

  /** Show one set of four. A switch fades the old set and sweeps the new one in. */
  function showPage(n: number, animate: boolean): void {
    if (n === current || !pages[n]) return;
    const previous = pages[current];
    current = n;
    const next = pages[n];
    const hadFocus = !!previous && previous.el.contains(doc.activeElement);
    if (previous) closeOpenOn(previous);
    // A set coming back before its fade-out finished: stop the fade so it doesn't flicker.
    fades.get(next)?.cancel();
    fades.delete(next);
    next.el.hidden = false;
    next.el.classList.remove('is-leaving');
    if (previous) {
      fades.get(previous)?.cancel();
      fades.delete(previous);
      if (animate && canAnimate(previous.el)) {
        previous.el.classList.add('is-leaving');
        const fade = previous.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: EASE });
        fades.set(previous, fade);
        fade.onfinish = () => {
          fades.delete(previous);
          previous.el.classList.remove('is-leaving');
          if (pages[current] !== previous) previous.el.hidden = true;
        };
      } else previous.el.hidden = true;
    }
    if (animate) QUADRANTS.forEach((q, i) => {
      const cell = next.cells.get(q);
      if (cell) animateCell(cell, 80 + i * 90);
    });
    syncPager();
    syncFrame();
    // Focus was inside the set that just left: keep it on the chart, at this set's pager dot.
    if (hadFocus) (pager?.children[n] as HTMLElement | undefined)?.focus();
  }

  /** The dashed outline only guides a set with gaps; a full set hides it. */
  function syncFrame(): void {
    stage?.classList.toggle('is-complete', (pages[current]?.cells.size ?? 0) === PER_PAGE);
  }

  function syncPager(): void {
    if (pages.length < 2) return;
    if (!pager) {
      pager = doc.createElement('div');
      pager.className = 'ps-persp__pager';
      pager.setAttribute('role', 'group');
      pager.setAttribute('aria-label', 'Perspective sets');
      stage!.after(pager);
      if (canAnimate(pager)) pager.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE, fill: 'backwards' });
    }
    while (pager.children.length < pages.length) {
      const n = pager.children.length;
      const start = n * PER_PAGE + 1;
      const end = start + PER_PAGE - 1;
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'ps-persp__page-dot';
      dot.textContent = `${start}–${end}`;
      dot.setAttribute('aria-label', `Perspectives ${start} to ${end}`);
      dot.addEventListener('click', () => showPage(n, true));
      pager.append(dot);
    }
    [...pager.children].forEach((dot, n) => {
      if (n === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function update(run: PsToolRun): void {
    const slots = new Map<string, Slot>();
    for (const node of run.nodes) {
      const slot = slotOf(node);
      if (slot) slots.set(node.id, slot);
    }
    const ordered = run.nodes.filter((n) => slots.has(n.id)).sort((a, b) => slots.get(a.id)!.index - slots.get(b.id)!.index);
    const newCells: Cell[] = [];
    const newViews: HTMLElement[] = [];
    const newInsights: HTMLElement[] = [];
    let newest = 0;
    let reframed = false;

    for (const node of ordered.filter((n) => slots.get(n.id)!.kind === 'stakeholder')) {
      const { index } = slots.get(node.id)!;
      if (!items.has(node.id)) {
        const cell = addStakeholder(node, index);
        cellOf.set(String(index), cell);
        newCells.push(cell);
        newest = Math.max(newest, index);
      }
    }
    for (const node of ordered) {
      const { kind, index } = slots.get(node.id)!;
      if (items.has(node.id) || kind === 'stakeholder') continue;
      if (kind === 'reframe') {
        reframe = addReframe(node);
        reframed = true;
        continue;
      }
      const cell = cellOf.get(String(index));
      if (!cell) continue; // drawn once its stakeholder is
      if (kind === 'view') newViews.push(addView(node, cell));
      else newInsights.push(addInsight(node, cell));
    }
    for (const node of run.nodes) {
      const item = items.get(node.id);
      const button = buttons.get(node.id) ?? null;
      if (item) syncContested(item, node, item.querySelector('.ps-persp__reframe-head') ?? button, button);
    }

    // The reframe card always closes the diagram.
    if (reframe && root.lastElementChild !== reframe) root.append(reframe);

    // The set holding the newest stakeholder comes to the front.
    const first = current === -1;
    const target = newest ? pageOf(newest) : Math.max(current, 0);
    const switching = pages.length > 0 && target !== current && !first;
    if (pages.length) {
      if (first) {
        current = target;
        pages[target].el.hidden = false;
        syncPager();
      } else if (switching) showPage(target, true);
      else syncPager();
    }

    const shown = pages[current]?.el;
    const visible = (el: Element) => !!shown && shown.contains(el);
    if (!switching) {
      newCells.filter((cell) => visible(cell.quadrant)).forEach((cell, i) => animateCell(cell, first ? i * 90 : 0));
    }
    const settled = (el: HTMLElement) => visible(el) && !newCells.some((cell) => cell.col.contains(el)) && !switching;
    newViews.filter(settled).forEach(animateView);
    newInsights.filter(settled).forEach(animateInsight);

    if (reframe && centre) {
      centre.classList.add('is-reframed');
      if (reframed) {
        const pop = centre.querySelector<HTMLElement>('.ps-persp__centre-pop')!;
        if (canAnimate(pop)) {
          pop.animate([{ transform: 'none' }, { transform: 'scale(1.35)', offset: 0.45 }, { transform: 'none' }], { duration: 620, delay: first ? 540 : 0, easing: EASE });
          reframe.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: first ? 320 : 240, easing: EASE, fill: 'backwards' });
        }
      }
    }
    syncFrame();
    syncOpen();
  }

  return { el: root, update };
}
