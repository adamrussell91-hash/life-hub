// packages/problem-solver/render/stakeholder-map.ts
// Stakeholder map (toolkit, Define): power over interest. People are roles, never names. Manage closely sits top right. Drawn by the shared quadrant view; this file only says what is on it.
import { createQuadrantView, type QuadrantConfig, type QuadrantView } from './quadrant';

export const STAKEHOLDER_CONFIG: QuadrantConfig = {
  label: 'Stakeholder map',
  columns: ['Low interest', 'High interest'],
  rows: ['High power', 'Low power'],
  quadrants: [
    { id: 'keep_satisfied', heading: 'Keep satisfied', fill: 'yellow', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '46', fill: 'var(--ps-blue)' } },
      { tag: 'rect', attrs: { x: '34', y: '34', width: '32', height: '32', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'manage_closely', heading: 'Manage closely', fill: 'blue', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '30', r: '20', fill: 'var(--ps-yellow)' } },
      { tag: 'path', attrs: { d: 'M12 96 A38 38 0 0 1 88 96 Z', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'monitor', heading: 'Monitor', fill: 'red', shapes: [
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '46', fill: 'var(--ps-blue)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '14', fill: 'var(--ps-yellow)' } }
    ] },
    { id: 'keep_informed', heading: 'Keep informed', fill: 'yellow', shapes: [
      { tag: 'polygon', attrs: { points: '6,50 50,8 94,50 50,92', fill: 'var(--ps-red)' } },
      { tag: 'circle', attrs: { cx: '50', cy: '50', r: '12', fill: 'var(--ps-yellow)' } }
    ] }
  ]
};

export function createStakeholderMapView(doc: Document = document): QuadrantView {
  return createQuadrantView(STAKEHOLDER_CONFIG, doc);
}
