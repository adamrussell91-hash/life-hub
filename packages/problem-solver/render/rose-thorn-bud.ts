// packages/problem-solver/render/rose-thorn-bud.ts
// Rose, Thorn, Bud (toolkit, Improve): three lists side by side (stacked on a phone). Buds can become tasks. Drawn by the shared quadrant view; this file only says what is on it.
import { createQuadrantView, type QuadrantConfig, type QuadrantView } from './quadrant';

export const ROSE_THORN_BUD_CONFIG: QuadrantConfig = {
  label: 'Rose, Thorn, Bud',
  layout: 'lists',
  quadrants: [
    { id: 'rose', heading: 'Rose', fill: 'red', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '46', fill: 'var(--ps-yellow)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '28', fill: 'var(--ps-blue)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '10', fill: 'var(--ps-red)' } }
    ] },
    { id: 'thorn', heading: 'Thorn', fill: 'blue', shapes: [
      { tag: 'polygon', attrs: { points: '50,4 92,92 8,92', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'bud', heading: 'Bud', fill: 'yellow', shapes: [
      { tag: 'path', attrs: { d: 'M50 94 C14 70 22 30 50 6 C78 30 86 70 50 94 Z', fill: 'var(--ps-blue)' } }
    ] }
  ]
};

export function createRoseThornBudView(doc: Document = document): QuadrantView {
  return createQuadrantView(ROSE_THORN_BUD_CONFIG, doc);
}
