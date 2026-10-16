// packages/problem-solver/render/smart.ts
// SMART objectives from the toolkit (p.61): a blue header band of five yellow
// triangles (S M A R T) over their labels, and below it a red grid of cells each
// holding one flat yellow shape. The header and problem bar appear with the problem;
// a letter fills its column (shape and title in the cell, triangle solid) when its
// answer is accepted. On a phone the five columns become five stacked rows.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

const SVG = 'http://www.w3.org/2000/svg';

export type SmartView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Letter = 's' | 'm' | 'a' | 'r' | 't';
const LETTERS: Letter[] = ['s', 'm', 'a', 'r', 't'];
const NAMES: Record<Letter, string> = { s: 'Specific', m: 'Measurable', a: 'Attainable', r: 'Relevant', t: 'Time-based' };
// One fixed flat shape per column, drawn in a 48 x 48 box.
const SHAPES: Record<Letter, { kind: string; d: string }> = {
  s: { kind: 'triangle', d: 'M24 5 L44 41 H4 Z' },
  m: { kind: 'half-circle', d: 'M4 34 A20 20 0 0 1 44 34 Z' },
  a: { kind: 'square', d: 'M6 6 H42 V42 H6 Z' },
  r: { kind: 'circle', d: 'M24 4 A20 20 0 1 1 24 44 A20 20 0 1 1 24 4 Z' },
  t: { kind: 'triangle-down', d: 'M4 7 H44 L24 43 Z' }
};

function letterOf(node: PsNode): Letter | 'problem' | null {
  const name = parseSlot(node.slot)?.name;
  return name === 'problem' || LETTERS.includes(name as Letter) ? (name as Letter | 'problem') : null;
}

function span(doc: Document, className: string, value: string): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  el.textContent = value;
  return el;
}

function shapeArt(doc: Document, letter: Letter): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ps-smart__shape-art');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('data-shape', SHAPES[letter].kind);
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', SHAPES[letter].d);
  svg.append(path);
  return svg;
}

function triangle(doc: Document, letter: Letter): HTMLElement {
  const wrap = doc.createElement('span');
  wrap.className = 'ps-smart__tri';
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 90');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const poly = doc.createElementNS(SVG, 'polygon');
  poly.setAttribute('points', '50,5 95,86 5,86');
  svg.append(poly);
  wrap.append(svg, span(doc, 'ps-smart__letter', letter.toUpperCase()));
  return wrap;
}

export function createSmartView(doc: Document = document): SmartView {
  const root = doc.createElement('div');
  root.className = 'ps-smart';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'SMART objectives');
  const bar = doc.createElement('div');
  bar.className = 'ps-smart__bar';
  const table = doc.createElement('div');
  table.className = 'ps-smart__table';
  const panel = doc.createElement('div');
  panel.className = 'ps-smart__panel';
  const group = createDisclosureGroup();
  const cols = new Map<Letter, { col: HTMLElement; cell: HTMLElement; tri: HTMLElement }>();
  const drawn = new Map<string, HTMLElement>();

  for (const letter of LETTERS) {
    const col = doc.createElement('div');
    col.className = 'ps-smart__col';
    col.setAttribute('data-letter', letter);
    const head = doc.createElement('div');
    head.className = 'ps-smart__head';
    const tri = triangle(doc, letter);
    head.append(tri, span(doc, 'ps-smart__name', NAMES[letter]));
    const cell = doc.createElement('div');
    cell.className = 'ps-smart__cell';
    col.append(head, cell);
    table.append(col);
    cols.set(letter, { col, cell, tri });
  }

  function button(node: PsNode, accent: Accent, className: string, content: Node[], aria: string): { item: HTMLElement; button: HTMLButtonElement } {
    const id = nextId('ps-smart-details');
    const item = doc.createElement('div');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);
    btn.setAttribute('aria-label', `${aria}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
    btn.append(...content);
    if (node.state === 'contested') btn.append(contestedTag(doc, node));
    item.append(btn);
    const card = detailsCard(doc, node, accent, id);
    panel.append(card);
    group.register(card, btn);
    return { item, button: btn };
  }

  function addProblem(node: PsNode): HTMLElement {
    const { item } = button(node, 'red', 'ps-smart__shape ps-smart__problem', [span(doc, 'ps-smart__meta', 'The problem'), span(doc, 'ps-smart__title', nodeTitle(node))], 'The problem');
    item.className = 'ps-smart__problem-item';
    bar.append(item);
    if (canAnimate(item)) item.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 480, easing: EASE, fill: 'backwards' });
    return item;
  }

  function addLetter(node: PsNode, letter: Letter): HTMLElement {
    const entry = cols.get(letter)!;
    const { item } = button(node, 'yellow', 'ps-smart__shape ps-smart__fill', [shapeArt(doc, letter), span(doc, 'ps-smart__title', nodeTitle(node))], NAMES[letter]);
    item.className = 'ps-smart__item';
    entry.cell.append(item);
    entry.tri.classList.add('is-filled');
    entry.col.classList.add('is-filled');
    if (canAnimate(item)) item.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
    return item;
  }

  function update(run: PsToolRun): void {
    for (const node of run.nodes) {
      const kind = letterOf(node);
      if (!kind) continue;
      let item = drawn.get(node.id);
      if (!item) {
        if (!table.isConnected) root.append(bar, table, panel);
        item = kind === 'problem' ? addProblem(node) : addLetter(node, kind);
        drawn.set(node.id, item);
      }
      item.classList.toggle('is-contested', node.state === 'contested');
    }
  }

  return { el: root, update };
}
