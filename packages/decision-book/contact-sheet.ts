// packages/decision-book/contact-sheet.ts
// The contact sheet: every Decision Book chart, empty, partial and full, at desktop width and
// at 390px, then the four reused Problem Solver charts in the Decision Maker palette. Built by
// scripts/build-decision-book-contact-sheet.mjs into docs/mockups/decision-maker/; for one
// look by Adam, not shipped in the app.
import '../design-kit/tokens.css';
import '../problem-solver/problem-solver.css';
import './decision-book.css';
import { SAMPLE_TOOLS, runFor, sampleNode, sampleRun } from './fixtures.mjs';
import type { ChartView, DmToolRun } from './render/core';
import { createQuadrantView } from './render/quadrant';
import { createPlotView } from './render/plot';
import { createScalesView } from './render/scales';
import { createCurveView } from './render/curve';
import { createTensionView } from './render/tension';
import { createPathView } from './render/path';
import { createListView } from './render/list';
import { createOutsideBoxView } from './render/outside-box';
import { createBlackBoxView } from './render/black-box';
import { createRecordView } from './render/record';
import { createSwotView } from '../problem-solver/render/swot';
import { createParetoView } from '../problem-solver/render/pareto';
import { createMorphologicalView } from '../problem-solver/render/morphological';
import { createDoubleLoopView } from '../problem-solver/render/double-loop';
import type { PsToolRun } from '../problem-solver/types';

type Sample = { id: string; name: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, Sample>;
const BY_FAMILY: Record<string, (tool: never) => ChartView> = {
  quadrant: createQuadrantView,
  plot: createPlotView,
  scales: createScalesView,
  curve: createCurveView,
  tension: createTensionView,
  path: createPathView,
  list: createListView
};
const make = (key: string): ChartView => {
  if (key === 'record') {
    const view = createRecordView();
    view.setBasis({ d2: [{ model: 'Rubber band', title: 'A bigger role elsewhere' }] });
    return view;
  }
  const tool = TOOLS[key];
  if (tool.id === 'dm_outside_box') return createOutsideBoxView(tool as never);
  if (tool.id === 'dm_black_box') return createBlackBoxView(tool as never);
  return BY_FAMILY[tool.family](tool as never);
};

function cell(title: string, width: string, view: { el: HTMLElement }): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'sheet__cell';
  figure.style.width = width;
  const caption = document.createElement('figcaption');
  caption.textContent = title;
  figure.append(caption, view.el);
  return figure;
}

const sheet = document.getElementById('sheet')!;
for (const key of [...Object.keys(TOOLS), 'record']) {
  const section = document.createElement('section');
  section.className = 'sheet__row';
  const heading = document.createElement('h2');
  heading.textContent = key === 'record' ? 'Decision record' : `${TOOLS[key].name} (${TOOLS[key].family})`;
  const row = document.createElement('div');
  row.className = 'sheet__cells';
  for (const stage of ['empty', 'partial', 'full'] as const) {
    const view = make(key);
    view.update(runFor(key, stage) as DmToolRun);
    row.append(cell(stage, '560px', view));
  }
  const phone = make(key);
  phone.update(runFor(key, 'full') as DmToolRun);
  row.append(cell('full at 390px', '358px', phone));
  section.append(heading, row);
  sheet.append(section);
}

// The reused Problem Solver charts, re-skinned (invented content).
const n = sampleNode;
const reused: [string, { el: HTMLElement; update(run: PsToolRun): void }, PsToolRun][] = [
  ['SWOT analysis', createSwotView(), {
    ...sampleRun('swot', [n('w1', 'goal', 'A calmer week'), n('w2', 'option:1', 'Four-day week'), n('w3', 'strength:1', 'More time with family'), n('w4', 'weakness:1', 'Less pay'), n('w5', 'opportunity:1', 'Freelance work'), n('w6', 'threat:1', 'Role may be cut', { state: 'contested', objection: 'Is that likely?' })]),
    edges: ['w3', 'w4', 'w5', 'w6'].map((from) => ({ from, to: 'w2', kind: 'of' }))
  } as PsToolRun],
  ['Pareto analysis', createParetoView(), {
    ...sampleRun('pareto', [n('p0', 'target', 'Late starts last month'), n('p1', 'item:1', 'Phone in bed'), n('p2', 'item:2', 'No alarm'), n('p3', 'item:3', 'Late dinner')]),
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', counts: [14, 4, 2] }] }
  } as PsToolRun],
  ['Morphological analysis', createMorphologicalView(), {
    ...sampleRun('morphological', [n('m0', 'problem', 'A weekend away'), n('m1', 'subject:1', 'Where'), n('m2', 'subject:2', 'How'), n('m3', 'attribute:1', 'Coast'), n('m4', 'attribute:2', 'Hills'), n('m5', 'attribute:3', 'Train'), n('m6', 'attribute:4', 'Car')]),
    edges: [{ from: 'm3', to: 'm1', kind: 'of' }, { from: 'm4', to: 'm1', kind: 'of' }, { from: 'm5', to: 'm2', kind: 'of' }, { from: 'm6', to: 'm2', kind: 'of' }]
  } as PsToolRun],
  ['Double-loop learning', createDoubleLoopView(), sampleRun('double_loop', [n('d0', 'problem', 'Weekly plan slips'), n('d1', 'single', 'Shorter list'), n('d2', 'recurs', 'Still slips by Wednesday', { tag: 'yes' }), n('d3', 'governing:1', 'I must say yes to every request'), n('d4', 'reframe', 'The plan has no room for others')]) as PsToolRun]
];
const section = document.createElement('section');
section.className = 'sheet__row';
const heading = document.createElement('h2');
heading.textContent = 'Reused Problem Solver charts in the Decision Maker palette';
const row = document.createElement('div');
row.className = 'sheet__cells';
for (const [title, view, run] of reused) {
  view.update(run);
  row.append(cell(title, '560px', view));
}
section.append(heading, row);
sheet.append(section);
