// packages/problem-solver/render/assumptions-map.ts
// Assumptions map (toolkit, Analyse): importance over how well each is known. Test first sits top left and can become tasks. Drawn by the shared quadrant view; this file only says what is on it.
import { createQuadrantView, type QuadrantConfig, type QuadrantView } from './quadrant';

export const ASSUMPTIONS_CONFIG: QuadrantConfig = {
  label: 'Assumptions map',
  columns: ['Not yet known', 'Known'],
  rows: ['Important', 'Less important'],
  quadrants: [
    { id: 'test_first', heading: 'Test first', fill: 'red', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '46', fill: 'var(--ps-blue)' } },
      { tag: 'polygon', attrs: { points: '40,28 60,28 56,62 44,62', fill: 'var(--ps-yellow)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '78', r: '7', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'act_on', heading: 'Act on', fill: 'blue', shapes: [
      { tag: 'polygon', attrs: { points: '6,58 20,48 39,70 90,2 96,8 42,98', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'watch', heading: 'Watch', fill: 'yellow', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '46', fill: 'var(--ps-blue)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '20', fill: 'var(--ps-yellow)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '8', fill: 'var(--ps-red)' } }
    ] },
    { id: 'park', heading: 'Park', fill: 'yellow', shapes: [
      { tag: 'rect', attrs: { x: '14', y: '14', width: '72', height: '72', fill: 'var(--ps-blue)' } },
      { tag: 'rect', attrs: { x: '34', y: '34', width: '32', height: '32', fill: 'var(--ps-red)' } }
    ] }
  ]
};

export function createAssumptionsMapView(doc: Document = document): QuadrantView {
  return createQuadrantView(ASSUMPTIONS_CONFIG, doc);
}
