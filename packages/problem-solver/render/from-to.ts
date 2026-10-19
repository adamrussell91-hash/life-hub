// packages/problem-solver/render/from-to.ts
// From…to exploration (toolkit, Analyse): a blue square field topped by a row of red
// header circles (Aspect, Trend, From…, To) that touch edge to edge, with a row of
// touching yellow circles under them for each aspect. The trend circle holds a red
// arrow instead of a title: straight up for a growing trend, right for a stable one and
// down for a declining one, as the book draws them, with the trend's title in small
// type beneath. The insight sits in full in a card under the field.
// The field and headers appear with the first aspect; each circle appears with its own
// node and only new circles animate. On a narrow panel each row becomes a stacked card.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type FromToView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Col = 'aspect' | 'trend' | 'from' | 'to';
type Direction = 'growing' | 'stable' | 'declining';

const SVG = 'http://www.w3.org/2000/svg';
const COLS: Col[] = ['aspect', 'trend', 'from', 'to'];
const HEAD: Record<Col, string> = { aspect: 'Aspect', trend: 'Trend', from: 'From…', to: 'To' };
const META: Record<Col, string> = { aspect: 'Aspect', trend: 'Trend', from: 'Now', to: 'Could be' };
const NAME: Record<Col, string> = { aspect: 'Aspect', trend: 'Trend', from: 'From', to: 'To' };
const ACCENT: Record<Col, Accent> = { aspect: 'yellow', trend: 'red', from: 'yellow', to: 'blue' };
/** The book's arrows are axis-aligned: up, right, down. */
const TURN: Record<Direction, number> = { growing: -90, stable: 0, declining: 90 };
const ARROW = 'M3 9.5H12.5V4.5L21.5 12L12.5 19.5V14.5H3Z';

const isDirection = (tag: string | undefined): tag is Direction => tag === 'growing' || tag === 'stable' || tag === 'declining';

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

type Cell = { item: HTMLDivElement; button: HTMLButtonElement; col: Col; row: number; node: PsNode; arrow?: HTMLSpanElement };

export function createFromToView(doc: Document = document): FromToView {
  const root = doc.createElement('div');
  root.className = 'ps-fromto';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'From…to exploration');

  const group = createDisclosureGroup();
  const cells = new Map<string, Cell>();
  const cards = new Map<string, HTMLElement>();
  const rows = new Map<number, HTMLDivElement>();
  let field: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let insight: { item: HTMLDivElement; id: string } | null = null;

  function ensureField(): void {
    if (field) return;
    field = doc.createElement('div');
    field.className = 'ps-fromto__field';
    field.setAttribute('data-region', 'chart');
    field.setAttribute('aria-label', 'Aspects, trends and possibilities');
    // The headers name the columns for sighted readers; each cell's label names its column.
    const head = doc.createElement('div');
    head.className = 'ps-fromto__head';
    head.setAttribute('aria-hidden', 'true');
    const heads = COLS.map((col) => span(doc, `ps-fromto__head-cell ps-fromto__head-cell--${col}`, HEAD[col]));
    head.append(...heads);
    field.append(head);
    panel = doc.createElement('div');
    panel.className = 'ps-fromto__panel';
    root.prepend(field, panel);
    if (canAnimate(field)) {
      field.animate([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
      heads.forEach((el, i) => el.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120 + i * 70, easing: EASE, fill: 'backwards' }));
    }
  }

  function ensureRow(index: number): HTMLDivElement {
    ensureField();
    let row = rows.get(index);
    if (row) return row;
    row = doc.createElement('div');
    row.className = 'ps-fromto__row';
    row.setAttribute('data-row', String(index));
    const after = [...rows.entries()].filter(([i]) => i > index).sort((a, b) => a[0] - b[0])[0]?.[1] ?? null;
    field!.insertBefore(row, after);
    rows.set(index, row);
    return row;
  }

  const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

  function label(cell: Pick<Cell, 'col' | 'row' | 'node'>): string {
    const trend = cell.col === 'trend' ? `, ${isDirection(cell.node.tag) ? cell.node.tag : 'direction not set'}` : '';
    return `${NAME[cell.col]}, row ${cell.row}${trend}: ${nodeTitle(cell.node)}${contested(cell.node)}. Show details`;
  }

  function syncOpen(): void {
    for (const [id, cell] of cells) cards.get(id)?.classList.toggle('is-open', cell.item.classList.contains('is-open'));
  }

  function makeButton(className: string, detailsId: string): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    return button;
  }

  function arrowSvg(): SVGSVGElement {
    const svg = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS(SVG, 'path');
    path.setAttribute('d', ARROW);
    svg.append(path);
    return svg;
  }

  function setDirection(cell: Cell): void {
    if (isDirection(cell.node.tag)) cell.item.setAttribute('data-direction', cell.node.tag);
    else cell.item.removeAttribute('data-direction');
  }

  function addCell(node: PsNode, col: Col, index: number): Cell {
    const row = ensureRow(index);
    const detailsId = nextId('ps-fromto-details');
    const item = doc.createElement('div');
    item.className = `ps-fromto__item ps-fromto__item--${col}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-col', col);
    const button = makeButton('ps-fromto__cell', detailsId);
    const words = span(doc, 'ps-fromto__words');
    const cell: Cell = { item, button, col, row: index, node };
    if (col === 'trend') {
      const arrow = span(doc, 'ps-fromto__arrow');
      arrow.append(arrowSvg());
      cell.arrow = arrow;
      words.append(arrow, span(doc, 'ps-fromto__trend-title', nodeTitle(node)));
    } else {
      words.append(span(doc, 'ps-fromto__meta', col === 'aspect' ? `${META.aspect} ${index}` : META[col]), span(doc, 'ps-fromto__title', nodeTitle(node)));
    }
    if (node.state === 'contested') words.append(contestedTag(doc, node));
    button.append(words);
    item.append(button);
    // Keep the row in column order whatever order the cells arrive in.
    const later = new Set(COLS.slice(COLS.indexOf(col) + 1));
    const after = [...row.children].find((child) => later.has(child.getAttribute('data-col') as Col)) ?? null;
    row.insertBefore(item, after);

    const card = detailsCard(doc, node, ACCENT[col], detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    cells.set(node.id, cell);
    cards.set(node.id, card);
    setDirection(cell);
    button.setAttribute('aria-label', label(cell));
    return cell;
  }

  function addInsight(node: PsNode): HTMLDivElement {
    const detailsId = nextId('ps-fromto-details');
    const item = doc.createElement('div');
    item.className = 'ps-fromto__insight';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const head = doc.createElement('div');
    head.className = 'ps-fromto__insight-head';
    head.append(span(doc, 'ps-fromto__insight-meta', 'Insight'));
    if (node.state === 'contested') head.append(contestedTag(doc, node));
    const text = doc.createElement('p');
    text.className = 'ps-fromto__insight-text';
    text.textContent = node.text;
    const more = makeButton('ps-fromto__more', detailsId);
    more.textContent = 'Details';
    more.setAttribute('aria-label', `Insight${contested(node)}. Show details`);
    const card = detailsCard(doc, node, 'red', detailsId);
    // The card would repeat the insight, so here it carries only skills and any objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    group.register(item, more);
    more.addEventListener('click', syncOpen);
    root.append(item);
    if (canAnimate(item)) item.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 160, easing: EASE, fill: 'backwards' });
    return item;
  }

  /** New circles scale in, staggered; a new trend arrow turns from pointing right to its direction. */
  function animateCell(cell: Cell, delay: number): void {
    if (!canAnimate(cell.button)) return;
    cell.button.animate([{ opacity: 0, transform: 'scale(0.55)' }, { opacity: 1, transform: 'none' }], { duration: 440, delay, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
    if (cell.arrow && isDirection(cell.node.tag)) {
      const turn = TURN[cell.node.tag];
      if (turn) cell.arrow.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${turn}deg)` }], { duration: 480, delay: delay + 260, easing: EASE, fill: 'backwards' });
    }
  }

  function update(run: PsToolRun): void {
    const fresh: Cell[] = [];
    const placed = run.nodes
      .map((node) => ({ node, slot: parseSlot(node.slot) }))
      .filter((entry) => entry.slot)
      .sort((a, b) => (a.slot!.index ?? 0) - (b.slot!.index ?? 0) || COLS.indexOf(a.slot!.name as Col) - COLS.indexOf(b.slot!.name as Col));
    // The field and its headers wait for the first aspect.
    if (placed.some(({ slot }) => slot!.name === 'aspect')) ensureField();

    for (const { node, slot } of placed) {
      if (slot!.name === 'insight') {
        if (!insight && field) insight = { item: addInsight(node), id: node.id };
        if (insight?.id === node.id) insight.item.classList.toggle('is-contested', node.state === 'contested');
        continue;
      }
      const col = slot!.name as Col;
      if (!COLS.includes(col) || !slot!.index || !field) continue;
      let cell = cells.get(node.id);
      if (!cell) {
        cell = addCell(node, col, slot!.index);
        fresh.push(cell);
      } else if (cell.node.tag !== node.tag) {
        cell.node = node;
        setDirection(cell);
        cell.button.setAttribute('aria-label', label(cell));
      }
      cell.node = node;
      cell.item.classList.toggle('is-contested', node.state === 'contested');
    }

    // Stagger the new circles, but keep a whole chart arriving at once under about a second.
    const step = fresh.length > 1 ? Math.min(70, 360 / (fresh.length - 1)) : 0;
    fresh.forEach((cell, i) => animateCell(cell, Math.round(i * step)));
    if (insight && root.lastElementChild !== insight.item) root.append(insight.item);
  }

  return { el: root, update };
}
