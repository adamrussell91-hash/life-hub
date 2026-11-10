// packages/problem-solver/render/eisenhower.ts
// Eisenhower matrix (toolkit, Implement), drawn as the book draws it: blue Do first with a large
// yellow tick, yellow Schedule with a blue pie whose top-right quarter is red, yellow Delegate
// with a red right-pointing triangle, and red Eliminate with a blue square crossed by a yellow X.
// The drawing and behaviour live in the shared quadrant view; this file only says what is on it.
import { createQuadrantView, type QuadrantConfig, type QuadrantView } from './quadrant';

export type EisenhowerView = QuadrantView;

export const EISENHOWER_CONFIG: QuadrantConfig = {
  label: 'Eisenhower matrix',
  columns: ['Urgent', 'Not urgent'],
  rows: ['Important', 'Not important'],
  quadrants: [
    // A tick that thickens toward its foot, the long arm rising right.
    { id: 'do', heading: 'Do first', fill: 'blue', shapes: [{ tag: 'polygon', attrs: { points: '6,58 20,48 39,70 90,2 96,8 42,98', fill: 'var(--ps-yellow)' } }] },
    {
      id: 'schedule',
      heading: 'Schedule',
      fill: 'yellow',
      shapes: [
        { tag: 'circle', attrs: { cx: '50', cy: '50', r: '48', fill: 'var(--ps-blue)' } },
        { tag: 'path', attrs: { d: 'M50 50 L50 2 A48 48 0 0 1 98 50 Z', fill: 'var(--ps-red)' } }
      ]
    },
    { id: 'delegate', heading: 'Delegate', fill: 'yellow', shapes: [{ tag: 'polygon', attrs: { points: '24,4 80,50 24,96', fill: 'var(--ps-red)' } }] },
    {
      id: 'eliminate',
      heading: 'Eliminate',
      fill: 'red',
      shapes: [
        { tag: 'rect', attrs: { x: '0', y: '0', width: '100', height: '100', fill: 'var(--ps-blue)' } },
        // Two wide bars corner to corner, cut square at the edges.
        { tag: 'polygon', attrs: { points: '0,0 13,0 100,87 100,100 87,100 0,13', fill: 'var(--ps-yellow)' } },
        { tag: 'polygon', attrs: { points: '100,0 100,13 13,100 0,100 0,87 87,0', fill: 'var(--ps-yellow)' } }
      ]
    }
  ]
};

export function createEisenhowerView(doc: Document = document): EisenhowerView {
  return createQuadrantView(EISENHOWER_CONFIG, doc);
}
