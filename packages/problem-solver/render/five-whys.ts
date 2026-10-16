// packages/problem-solver/render/five-whys.ts
// The 5 Whys chart from the toolkit (p.47): a red half-disc for the problem, a
// stack of yellow downward triangles, one per accepted why, and a blue half-disc
// for the root cause. Each shape carries a two or three word title; clicking a
// shape opens a details card beneath it with the full answer, the skills it
// showed and any coach objection. One card is open at a time.
// Rows appear only once an answer is accepted (or kept), and only new rows animate.
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { slotLabel } from './outline';
import { skillChip } from '../glyphs';

const SVG = 'http://www.w3.org/2000/svg';

export type FiveWhysView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Kind = 'problem' | 'why' | 'root';

const PATHS: Record<Kind, string> = {
  problem: 'M0 100A100 100 0 0 1 200 100Z', // half-disc, flat edge down
  why: 'M0 0H200L100 100Z', // downward triangle, 2:1 like the book
  root: 'M0 0A100 100 0 0 0 200 0Z' // half-disc, flat edge up
};

let uid = 0;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function kindOf(node: PsNode): Kind {
  const name = parseSlot(node.slot)?.name;
  return name === 'problem' || name === 'root' ? name : 'why';
}

function order(node: PsNode): number {
  const slot = parseSlot(node.slot);
  if (slot?.name === 'problem') return 0;
  if (slot?.name === 'root') return 1000;
  return slot?.index ?? 999;
}

function metaLabel(node: PsNode, kind: Kind): string {
  return kind === 'why' ? slotLabel(node.slot) : kind === 'root' ? 'The root cause' : 'The problem';
}

function shapeSvg(doc: Document, kind: Kind): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'ps-whys__svg');
  svg.setAttribute('viewBox', '0 0 200 100');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[kind]);
  path.setAttribute('class', `ps-whys__${kind}`);
  svg.append(path);
  return svg;
}

function shapeButton(doc: Document, node: PsNode, kind: Kind, detailsId: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ps-whys__shape';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', detailsId);
  const label = doc.createElement('span');
  label.className = 'ps-whys__label';
  const meta = doc.createElement('span');
  meta.className = 'ps-whys__meta';
  meta.textContent = metaLabel(node, kind);
  const title = doc.createElement('span');
  title.className = 'ps-whys__title';
  title.textContent = nodeTitle(node);
  label.append(meta, title);
  if (node.state === 'contested') {
    const chip = doc.createElement('span');
    chip.className = 'ps-objection';
    chip.textContent = 'Contested';
    chip.title = node.objection ?? '';
    label.append(chip);
  }
  button.append(shapeSvg(doc, kind), label);
  button.setAttribute('aria-label', `${metaLabel(node, kind)}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
  return button;
}

function details(doc: Document, node: PsNode, kind: Kind, id: string): HTMLDivElement {
  const wrap = doc.createElement('div');
  wrap.className = 'ps-whys__details';
  wrap.id = id;
  const inner = doc.createElement('div');
  inner.className = 'ps-whys__details-inner';
  const card = doc.createElement('div');
  card.className = `ps-whys__card ps-whys__card--${kind}`;
  const text = doc.createElement('p');
  text.className = 'ps-whys__text';
  text.textContent = node.text;
  card.append(text);
  if (node.skills?.length) {
    const skills = doc.createElement('div');
    skills.className = 'ps-whys__skills';
    skills.append(...node.skills.map((skill) => skillChip(skill, {}, doc)));
    card.append(skills);
  }
  if (node.state === 'contested') {
    const note = doc.createElement('p');
    note.className = 'ps-whys__note';
    const lead = doc.createElement('strong');
    lead.textContent = 'Coach objected: ';
    const body = doc.createElement('span');
    body.textContent = node.objection ?? '';
    note.append(lead, body);
    card.append(note);
  }
  inner.append(card);
  wrap.append(inner);
  return wrap;
}

function animateIn(item: HTMLElement, kind: Kind): void {
  if (reducedMotion() || typeof item.animate !== 'function') return;
  const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const svg = item.querySelector<SVGSVGElement>('.ps-whys__svg');
  const label = item.querySelector<HTMLElement>('.ps-whys__label');
  // The shape unfolds from the edge it hangs off; the title follows a beat later.
  svg?.animate(
    kind === 'problem'
      ? [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }]
      : [{ opacity: 0, transform: 'translateY(-24px) scaleY(0.4)' }, { opacity: 1, transform: 'none' }],
    { duration: 520, easing, fill: 'backwards' }
  );
  label?.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 260, easing, fill: 'backwards' });
}

export function createFiveWhysView(doc: Document = document): FiveWhysView {
  const root = doc.createElement('div');
  root.className = 'ps-whys';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', '5 Whys');
  const drawn = new Map<string, HTMLDivElement>();

  function setOpen(item: HTMLElement, open: boolean): void {
    item.classList.toggle('is-open', open);
    item.querySelector('.ps-whys__shape')?.setAttribute('aria-expanded', String(open));
  }

  function toggle(item: HTMLElement): void {
    const open = !item.classList.contains('is-open');
    for (const other of drawn.values()) if (other !== item) setOpen(other, false);
    setOpen(item, open);
  }

  function update(run: PsToolRun): void {
    const nodes = [...run.nodes].sort((a, b) => order(a) - order(b));
    for (const node of nodes) {
      const kind = kindOf(node);
      let item = drawn.get(node.id);
      if (!item) {
        uid += 1;
        const detailsId = `ps-whys-details-${uid}`;
        item = doc.createElement('div');
        item.className = `ps-whys__item ps-whys__item--${kind}`;
        item.setAttribute('role', 'listitem');
        item.setAttribute('data-node', node.id);
        const button = shapeButton(doc, node, kind, detailsId);
        const current = item;
        button.addEventListener('click', () => toggle(current));
        item.append(button, details(doc, node, kind, detailsId));
        drawn.set(node.id, item);
        root.append(item);
        animateIn(item, kind);
      }
      item.classList.toggle('is-contested', node.state === 'contested');
    }
    // Keep DOM order equal to chain order; only move items that are out of place.
    nodes.forEach((node, index) => {
      const item = drawn.get(node.id)!;
      if (root.children[index] !== item) root.insertBefore(item, root.children[index] ?? null);
    });
  }

  return { el: root, update };
}
