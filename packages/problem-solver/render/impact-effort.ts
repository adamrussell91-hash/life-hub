// packages/problem-solver/render/impact-effort.ts
// Impact vs Effort (toolkit, Decide): high impact over low impact, low effort beside high effort. Quick wins sit top left and can become tasks. Drawn by the shared quadrant view; this file only says what is on it.
import { createQuadrantView, type QuadrantConfig, type QuadrantView } from './quadrant';

export const IMPACT_EFFORT_CONFIG: QuadrantConfig = {
  label: 'Impact vs Effort',
  columns: ['Low effort', 'High effort'],
  rows: ['High impact', 'Low impact'],
  quadrants: [
    { id: 'quick_win', heading: 'Quick wins', fill: 'blue', shapes: [
      { tag: 'polygon', attrs: { points: '55,2 18,56 46,56 38,98 82,40 54,40', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'big_bet', heading: 'Big bets', fill: 'yellow', shapes: [
      { tag: 'polygon', attrs: { points: '50,4 95,92 5,92', fill: 'var(--ps-blue)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '66', r: '12', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'fill_in', heading: 'Fill-ins', fill: 'yellow', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '46', fill: 'var(--ps-blue)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '22', fill: 'var(--ps-red)' } }
    ] },
    { id: 'drop', heading: 'Drop', fill: 'red', shapes: [
      { tag: 'rect', attrs: { x: '4', y: '4', width: '92', height: '92', fill: 'var(--ps-blue)' } },
      { tag: 'polygon', attrs: { points: '0,44 100,44 100,56 0,56', fill: 'var(--ps-yellow)' } }
    ] }
  ]
};

export function createImpactEffortView(doc: Document = document): QuadrantView {
  return createQuadrantView(IMPACT_EFFORT_CONFIG, doc);
}
