// packages/problem-solver/render/five-whys.ts
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const W = 380;
const SHAPE_W = 120;
const CAP_H = 60;
const WHY_H = 64;
const GAP = 10;
const TEXT_X = SHAPE_W + 20;

export type FiveWhysView = { el: SVGSVGElement; update(run: PsToolRun): void };

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function order(node: PsNode): number {
  const slot = parseSlot(node.slot);
  if (!slot) return 99;
  if (slot.name === 'problem') return 0;
  if (slot.name === 'why') return slot.index ?? 1;
  return 98;
}

function rowY(index: number): number {
  return index === 0 ? 0 : CAP_H + GAP + (index - 1) * (WHY_H + GAP);
}

function shapeFor(doc: Document, node: PsNode): SVGElement {
  const kind = parseSlot(node.slot)?.name;
  const path = doc.createElementNS(SVG, 'path');
  const cx = SHAPE_W / 2;
  if (kind === 'problem') {
    path.setAttribute('d', `M0 ${CAP_H} A${cx} ${CAP_H} 0 0 1 ${SHAPE_W} ${CAP_H} Z`);
    path.setAttribute('class', 'ps-whys__problem');
  } else if (kind === 'root') {
    path.setAttribute('d', `M0 0 A${cx} ${CAP_H} 0 0 0 ${SHAPE_W} 0 Z`);
    path.setAttribute('class', 'ps-whys__root');
  } else {
    path.setAttribute('d', `M0 0 L${SHAPE_W} 0 L${cx} ${WHY_H} Z`);
    path.setAttribute('class', 'ps-whys__why');
  }
  return path;
}

function labelFor(doc: Document, node: PsNode): SVGTextElement {
  const kind = parseSlot(node.slot)?.name;
  const text = doc.createElementNS(SVG, 'text');
  text.setAttribute('class', `ps-whys__label${kind === 'why' ? ' ps-whys__label--dark' : ''}`);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('x', String(SHAPE_W / 2));
  text.setAttribute('y', kind === 'problem' ? String(CAP_H - 14) : kind === 'root' ? '24' : '24');
  text.textContent = kind === 'problem' ? 'The problem' : kind === 'root' ? 'The root cause' : 'Why?';
  return text;
}

function textFor(doc: Document, node: PsNode, height: number): SVGForeignObjectElement {
  const fo = doc.createElementNS(SVG, 'foreignObject');
  fo.setAttribute('x', String(TEXT_X));
  fo.setAttribute('y', '0');
  fo.setAttribute('width', String(W - TEXT_X));
  fo.setAttribute('height', String(height));
  const p = doc.createElement('p');
  p.className = 'ps-whys__text';
  p.textContent = node.text;
  if (node.state === 'contested') {
    const badge = doc.createElement('button');
    badge.type = 'button';
    badge.className = 'ps-objection';
    badge.textContent = 'Coach objected';
    badge.title = node.objection ?? '';
    badge.setAttribute('aria-label', `Coach's objection: ${node.objection ?? ''}`);
    p.append(badge);
  }
  fo.append(p);
  return fo;
}

function animateIn(group: SVGGElement, kind: string | undefined): void {
  if (reducedMotion() || typeof group.animate !== 'function') return;
  const keyframes = kind === 'root'
    ? [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'scaleY(1)' }]
    : [{ opacity: 0, transform: 'translateY(-18px)' }, { opacity: 1, transform: 'translateY(0)' }];
  group.style.transformBox = 'fill-box';
  group.style.transformOrigin = 'top center';
  group.animate(keyframes, { duration: 460, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
}

export function createFiveWhysView(doc: Document = document): FiveWhysView {
  const svg = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'ps-whys');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '5 Whys');
  svg.setAttribute('viewBox', `0 0 ${W} 1`);
  const drawn = new Map<string, SVGGElement>();

  function update(run: PsToolRun): void {
    const nodes = [...run.nodes].sort((a, b) => order(a) - order(b));
    let rows = 0;
    for (const node of nodes) {
      const kind = parseSlot(node.slot)?.name;
      const index = kind === 'root' ? nodes.filter((n) => parseSlot(n.slot)?.name !== 'root').length : rows;
      const y = rowY(index);
      const height = kind === 'why' ? WHY_H : CAP_H;
      let group = drawn.get(node.id);
      if (!group) {
        group = doc.createElementNS(SVG, 'g') as SVGGElement;
        group.setAttribute('data-node', node.id);
        // The outer group is positioned with the SVG transform attribute; the inner
        // group is animated. A running CSS transform would otherwise override the
        // position and stack every new shape at the top.
        const body = doc.createElementNS(SVG, 'g') as SVGGElement;
        body.setAttribute('class', 'ps-whys__body');
        body.append(shapeFor(doc, node), labelFor(doc, node), textFor(doc, node, height));
        group.append(body);
        svg.append(group);
        drawn.set(node.id, group);
        animateIn(body, kind);
      }
      group.classList.toggle('is-contested', node.state === 'contested');
      group.setAttribute('transform', `translate(0 ${y})`);
      if (kind !== 'root') rows += 1;
    }
    const last = nodes.at(-1);
    const bottom = last ? rowY(parseSlot(last.slot)?.name === 'root' ? rows : rows - 1) + (parseSlot(last.slot)?.name === 'why' ? WHY_H : CAP_H) : 1;
    svg.setAttribute('viewBox', `0 0 ${W} ${bottom}`);
  }

  return { el: svg, update };
}
