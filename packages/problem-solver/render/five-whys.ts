// packages/problem-solver/render/five-whys.ts
// The 5 Whys chart from the toolkit (p.47): a red half-disc for the problem, a
// stack of yellow downward triangles, one per accepted why, and a blue half-disc
// for the root cause. Each row is a flat shape with its answer set beside it.
// Rows appear only once an answer is accepted (or kept), and only new rows animate.
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { slotLabel } from './outline';

const SVG = 'http://www.w3.org/2000/svg';

export type FiveWhysView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Kind = 'problem' | 'why' | 'root';

const SHAPES: Record<Kind, { viewBox: string; d: string; label: string; labelY: number }> = {
  // Half-disc, flat edge down.
  problem: { viewBox: '0 0 200 100', d: 'M0 100A100 100 0 0 1 200 100Z', label: 'The problem', labelY: 80 },
  // Downward triangle, flat edge up, 2:1 like the book.
  why: { viewBox: '0 0 200 100', d: 'M0 0H200L100 100Z', label: 'Why?', labelY: 22 },
  // Half-disc, flat edge up.
  root: { viewBox: '0 0 200 100', d: 'M0 0A100 100 0 0 0 200 0Z', label: 'The root cause', labelY: 28 }
};

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

function shape(doc: Document, kind: Kind): SVGSVGElement {
  const spec = SHAPES[kind];
  const svg = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'ps-whys__shape');
  svg.setAttribute('viewBox', spec.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', spec.d);
  path.setAttribute('class', `ps-whys__${kind}`);
  const label = doc.createElementNS(SVG, 'text');
  label.setAttribute('class', 'ps-whys__label');
  label.setAttribute('x', '100');
  label.setAttribute('y', String(spec.labelY));
  label.setAttribute('text-anchor', 'middle');
  label.textContent = spec.label;
  svg.append(path, label);
  return svg;
}

function copy(doc: Document, node: PsNode, kind: Kind): HTMLDivElement {
  const box = doc.createElement('div');
  box.className = 'ps-whys__copy';
  const meta = doc.createElement('p');
  meta.className = 'ps-whys__meta';
  meta.textContent = kind === 'why' ? slotLabel(node.slot) : kind === 'root' ? 'Root cause' : 'Problem';
  const text = doc.createElement('p');
  text.className = 'ps-whys__text';
  text.textContent = node.text;
  box.append(meta, text);
  if (node.state === 'contested') {
    const marker = doc.createElement('button');
    marker.type = 'button';
    marker.className = 'ps-objection';
    marker.textContent = 'Contested';
    marker.title = node.objection ?? '';
    marker.setAttribute('aria-label', `Coach's objection: ${node.objection ?? ''}`);
    meta.append(marker);
    const note = doc.createElement('p');
    note.className = 'ps-whys__note';
    note.textContent = node.objection ?? '';
    box.append(note);
  }
  return box;
}

function animateIn(row: HTMLElement, kind: Kind): void {
  if (reducedMotion() || typeof row.animate !== 'function') return;
  const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const shapeEl = row.querySelector<SVGSVGElement>('.ps-whys__shape');
  const copyEl = row.querySelector<HTMLElement>('.ps-whys__copy');
  // The shape unfolds from the edge it hangs off; the answer follows a beat later.
  shapeEl?.animate(
    kind === 'problem'
      ? [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }]
      : [{ opacity: 0, transform: 'translateY(-24px) scaleY(0.4)' }, { opacity: 1, transform: 'none' }],
    { duration: 520, easing, fill: 'backwards' }
  );
  copyEl?.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 220, easing, fill: 'backwards' });
}

export function createFiveWhysView(doc: Document = document): FiveWhysView {
  const root = doc.createElement('div');
  root.className = 'ps-whys';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', '5 Whys');
  const drawn = new Map<string, HTMLDivElement>();

  function update(run: PsToolRun): void {
    const nodes = [...run.nodes].sort((a, b) => order(a) - order(b));
    for (const node of nodes) {
      const kind = kindOf(node);
      let row = drawn.get(node.id);
      if (!row) {
        row = doc.createElement('div');
        row.className = `ps-whys__row ps-whys__row--${kind}`;
        row.setAttribute('role', 'listitem');
        row.setAttribute('data-node', node.id);
        row.append(shape(doc, kind), copy(doc, node, kind));
        // Rows are a fixed height so the column stays as rigid as the book's.
        // Tapping a row opens it to show the full answer and any objection.
        row.tabIndex = 0;
        row.setAttribute('aria-expanded', 'false');
        const toggle = () => {
          const open = !row!.classList.contains('is-open');
          row!.classList.toggle('is-open', open);
          row!.setAttribute('aria-expanded', String(open));
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        });
        drawn.set(node.id, row);
        root.append(row);
        animateIn(row, kind);
      }
      row.classList.toggle('is-contested', node.state === 'contested');
    }
    // Keep DOM order equal to chain order; only move rows that are out of place.
    nodes.forEach((node, index) => {
      const row = drawn.get(node.id)!;
      if (root.children[index] !== row) root.insertBefore(row, root.children[index] ?? null);
    });
  }

  return { el: root, update };
}
