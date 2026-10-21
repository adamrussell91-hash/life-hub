// packages/decision-book/fixtures.mjs
// Sample tools and runs for each chart family: invented content (no book text), shared by the
// family tests, the renderer tests and the contact sheet. Each family has an empty run, a
// partial run and a full run whose last entry is contested.
import { curveTool, listTool, pathTool, plotTool, quadrantTool, scalesTool, tensionTool } from './families/index.mjs';
import { dmOutsideBox } from './tools/outside-box.mjs';
import { dmBlackBox } from './tools/black-box.mjs';
import { RECORD_ID } from './record-slots.mjs';

const steps = [{ id: 'work', title: 'Work it', prompt: 'Fill the chart.' }];
const base = (id, name) => ({ id, name, when: `Sample ${name.toLowerCase()} for tests.`, steps });

export const SAMPLE_TOOLS = Object.freeze({
  quadrant: quadrantTool({
    ...base('dm_sample_quadrant', 'Sample quadrant'),
    chart: {
      axes: { x: { label: 'Effort', low: 'Low effort', high: 'High effort' }, y: { label: 'Value', low: 'Low value', high: 'High value' } },
      cells: [
        { id: 'quick_win', label: 'Quick win', col: 0, row: 0, fill: 'green' },
        { id: 'big_bet', label: 'Big bet', col: 1, row: 0, fill: 'red' },
        { id: 'filler', label: 'Filler', col: 0, row: 1, fill: 'tint' },
        { id: 'drain', label: 'Drain', col: 1, row: 1, fill: 'ink' }
      ],
      item: 'A task, sorted into one cell'
    }
  }),
  plot: plotTool({
    ...base('dm_sample_plot', 'Sample plot'),
    chart: {
      axes: { x: { label: 'Cost', low: 'Cheap', high: 'Costly' }, y: { label: 'Joy', low: 'Little joy', high: 'Much joy' } },
      point: 'An option, placed by the person',
      size: { label: 'Time it takes' },
      band: { label: 'Sweet spot', x: [1, 5], y: [6, 10] }
    }
  }),
  scales: scalesTool({
    ...base('dm_sample_scales', 'Sample scales'),
    chart: {
      mode: 'pairs',
      scales: [
        { id: 'pace', low: 'Slow', high: 'Fast' },
        { id: 'scope', low: 'Narrow', high: 'Broad' },
        { id: 'company', low: 'Alone', high: 'Together' }
      ],
      series: [{ id: 'now', label: 'Now' }, { id: 'wanted', label: 'Wanted' }]
    }
  }),
  radar: scalesTool({
    ...base('dm_sample_radar', 'Sample radar'),
    chart: {
      mode: 'axes',
      layout: 'radar',
      scales: [{ id: 'calm', label: 'Calm' }, { id: 'focus', label: 'Focus' }, { id: 'energy', label: 'Energy' }, { id: 'sleep', label: 'Sleep' }],
      series: [{ id: 'now', label: 'Now' }]
    }
  }),
  shares: scalesTool({
    ...base('dm_sample_shares', 'Sample shares'),
    chart: { mode: 'shares', scales: [{ id: 'work', label: 'Work' }, { id: 'home', label: 'Home' }, { id: 'play', label: 'Play' }] }
  }),
  curve: curveTool({
    ...base('dm_sample_curve', 'Sample curve'),
    chart: {
      axes: { x: { label: 'How many options' }, y: { label: 'How hard it feels' } },
      lines: [{ id: 'main', label: '', shape: 'u' }],
      regions: [{ id: 'few', label: 'Too few', from: 0, to: 0.3 }, { id: 'enough', label: 'Enough', from: 0.3, to: 0.7 }, { id: 'many', label: 'Too many', from: 0.7, to: 1 }],
      position: 'Where your options sit now'
    }
  }),
  tension: tensionTool({
    ...base('dm_sample_tension', 'Sample tension'),
    chart: { variant: 'pull', centre: 'Where you stand', sides: [{ id: 'holds', label: 'Holds you', fill: 'red' }, { id: 'pulls', label: 'Pulls you', fill: 'green' }] }
  }),
  triangle: tensionTool({
    ...base('dm_sample_triangle', 'Sample triangle'),
    chart: { variant: 'triangle', centre: 'The project', sides: [{ id: 'fast', label: 'Fast', fill: 'red' }, { id: 'good', label: 'Good', fill: 'green' }, { id: 'cheap', label: 'Cheap', fill: 'ink' }] }
  }),
  flow: pathTool({
    ...base('dm_sample_flow', 'Sample flow'),
    chart: {
      variant: 'flow',
      stages: [
        { id: 'want', label: 'Do you want it?', kind: 'question', yes: 'afford', no: 'drop' },
        { id: 'afford', label: 'Can you afford it?', kind: 'question', yes: 'go', no: 'wait' },
        { id: 'go', label: 'Go ahead', kind: 'end' },
        { id: 'wait', label: 'Wait and save', kind: 'end' },
        { id: 'drop', label: 'Let it go', kind: 'end' }
      ]
    }
  }),
  stages: pathTool({
    ...base('dm_sample_stages', 'Sample stages'),
    chart: { variant: 'stages', loop: true, stages: [{ id: 'plan', label: 'Plan' }, { id: 'try', label: 'Try' }, { id: 'check', label: 'Check' }] }
  }),
  layers: pathTool({
    ...base('dm_sample_layers', 'Sample layers'),
    chart: { variant: 'layers', layers: { layer: 'A safeguard', hole: 'A gap in that safeguard' } }
  }),
  list: listTool({
    ...base('dm_sample_list', 'Sample list'),
    chart: {
      layout: 'lanes',
      groups: [{ id: 'keep', label: 'Keep' }, { id: 'change', label: 'Change' }, { id: 'stop', label: 'Stop' }],
      entry: 'A habit, in one lane'
    }
  }),
  pyramid: listTool({
    ...base('dm_sample_pyramid', 'Sample pyramid'),
    chart: {
      layout: 'pyramid',
      groups: [
        { id: 'then_base', label: 'Basics', column: 'then' },
        { id: 'then_top', label: 'Growth', column: 'then' },
        { id: 'now_base', label: 'Basics', column: 'now' },
        { id: 'now_top', label: 'Growth', column: 'now' }
      ],
      entry: 'A need, at its level'
    }
  }),
  outside_box: dmOutsideBox,
  black_box: dmBlackBox
});

let at = 0;
/** A placed node, accepted unless `extra` says otherwise. */
export function sampleNode(id, slot, text, extra = {}) {
  at += 1;
  return { id, slot, text, title: text.split(/[.,;:]/)[0].slice(0, 40), state: 'accepted', skills: [], turnId: `t${at}`, ...extra };
}

/** A run of a sample tool. */
export function sampleRun(toolId, nodes = [], extra = {}) {
  return { id: `run-${toolId}`, tool: toolId, status: 'active', nodes, edges: [], ...extra };
}

const contested = { state: 'contested', objection: 'Is that really where it belongs?' };

/** Empty, partial and full runs per family key in SAMPLE_TOOLS, plus the decision record. */
export const SAMPLE_RUNS = Object.freeze({
  quadrant: {
    partial: [sampleNode('q1', 'item:1', 'Answer the landlord', { tag: 'quick_win' }), sampleNode('q2', 'item:2', 'Repaint the hall', { tag: 'big_bet' })],
    full: [
      sampleNode('q1', 'item:1', 'Answer the landlord', { tag: 'quick_win' }),
      sampleNode('q2', 'item:2', 'Repaint the hall', { tag: 'big_bet' }),
      sampleNode('q3', 'item:3', 'Sort old cables', { tag: 'filler' }),
      sampleNode('q4', 'item:4', 'Rebuild the shed', { tag: 'drain', ...contested }),
      sampleNode('q5', 'reflection', 'Start with the landlord, then decide on the hall.')
    ]
  },
  plot: {
    partial: [sampleNode('p1', 'point:1', 'Night class'), sampleNode('p2', 'point:2', 'Weekend trip')],
    full: [sampleNode('p1', 'point:1', 'Night class'), sampleNode('p2', 'point:2', 'Weekend trip'), sampleNode('p3', 'point:3', 'New bike', contested)],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', points: { p1: { x: 3, y: 8, size: 6 }, p2: { x: 7, y: 7, size: 3 } } }, { at: '2026-10-21T10:01:00.000Z', points: { p3: { x: 9, y: 4, size: 2 } } }] }
  },
  scales: {
    partial: [sampleNode('s1', 'note:1', 'Mornings feel rushed', { tag: 'pace' })],
    full: [sampleNode('s1', 'note:1', 'Mornings feel rushed', { tag: 'pace' }), sampleNode('s2', 'note:2', 'I miss team work', { tag: 'company', ...contested })],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', series: 'now', values: { pace: 2, scope: 5, company: 8 } }, { at: '2026-10-21T10:01:00.000Z', series: 'wanted', values: { pace: 5, scope: 4, company: 4 } }] }
  },
  radar: {
    partial: [],
    full: [sampleNode('r1', 'note:1', 'Sleep is the weak point', { tag: 'sleep' }), sampleNode('r2', 'note:2', 'Focus holds up well', { tag: 'focus', ...contested })],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', series: 'now', values: { calm: 6, focus: 7, energy: 5, sleep: 3 } }] }
  },
  shares: {
    partial: [],
    full: [sampleNode('h1', 'note:1', 'Work spills into evenings', { tag: 'work' }), sampleNode('h2', 'note:2', 'Play is the first to go', { tag: 'play', ...contested })],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', series: 'now', values: { work: 60, home: 30, play: 10 } }] }
  },
  curve: {
    partial: [sampleNode('c1', 'position', 'About twelve flats on the list', { tag: 'many' })],
    full: [sampleNode('c1', 'position', 'About twelve flats on the list', { tag: 'many' }), sampleNode('c2', 'note:1', 'I keep adding more', { tag: 'many', ...contested }), sampleNode('c3', 'reflection', 'Cut the list to three.')]
  },
  tension: {
    partial: [sampleNode('t1', 'centre', 'Staying in this job'), sampleNode('t2', 'force:1', 'The team is good', { tag: 'holds' })],
    full: [sampleNode('t1', 'centre', 'Staying in this job'), sampleNode('t2', 'force:1', 'The team is good', { tag: 'holds' }), sampleNode('t3', 'force:2', 'A bigger role elsewhere', { tag: 'pulls' }), sampleNode('t4', 'force:3', 'Shorter commute', { tag: 'pulls', ...contested })]
  },
  triangle: {
    partial: [sampleNode('g1', 'centre', 'The kitchen refit')],
    full: [sampleNode('g1', 'centre', 'The kitchen refit'), sampleNode('g2', 'force:1', 'Done before the holidays', { tag: 'fast' }), sampleNode('g3', 'force:2', 'Solid oak tops', { tag: 'good' }), sampleNode('g4', 'force:3', 'Under budget', { tag: 'cheap' }), sampleNode('g5', 'fix:1', 'Quality first', { tag: 'good' }), sampleNode('g6', 'fix:2', 'Budget is fixed', { tag: 'cheap', ...contested })]
  },
  flow: {
    partial: [sampleNode('f1', 'want', 'Yes, for the commute', { tag: 'yes' })],
    full: [sampleNode('f1', 'want', 'Yes, for the commute', { tag: 'yes' }), sampleNode('f2', 'afford', 'Not this month', { tag: 'no', ...contested }), sampleNode('f3', 'wait', 'Save until March')]
  },
  stages: {
    partial: [sampleNode('a1', 'plan:1', 'Draft the budget')],
    full: [sampleNode('a1', 'plan:1', 'Draft the budget'), sampleNode('a2', 'try:1', 'Live on it for a month'), sampleNode('a3', 'check:1', 'Food ran over', contested), sampleNode('a4', 'plan:2', 'Raise the food line')]
  },
  layers: {
    partial: [sampleNode('l1', 'layer:1', 'A packing list')],
    full: [sampleNode('l1', 'layer:1', 'A packing list'), sampleNode('l2', 'layer:2', 'A check at the door'), sampleNode('l3', 'hole:1', 'The list is out of date', contested), sampleNode('l4', 'hole:2', 'Nobody checks when late')],
    edges: [{ from: 'l3', to: 'l1', kind: 'in' }, { from: 'l4', to: 'l2', kind: 'in' }]
  },
  list: {
    partial: [sampleNode('i1', 'entry:1', 'Morning walk', { tag: 'keep' })],
    full: [sampleNode('i1', 'entry:1', 'Morning walk', { tag: 'keep' }), sampleNode('i2', 'entry:2', 'Late emails', { tag: 'stop' }), sampleNode('i3', 'entry:3', 'Lunch at the desk', { tag: 'change', ...contested })]
  },
  pyramid: {
    partial: [sampleNode('m1', 'entry:1', 'A steady wage', { tag: 'then_base' })],
    full: [sampleNode('m1', 'entry:1', 'A steady wage', { tag: 'then_base' }), sampleNode('m2', 'entry:2', 'Learning a craft', { tag: 'now_top' }), sampleNode('m3', 'entry:3', 'Savings', { tag: 'now_base', ...contested })]
  },
  outside_box: {
    partial: [sampleNode('o1', 'attempt', 'I stayed inside the square')],
    full: [sampleNode('o1', 'attempt', 'I stayed inside the square'), sampleNode('o2', 'assumption', 'That I must stay in this city', contested)]
  },
  black_box: {
    partial: [sampleNode('b1', 'input:1', 'My application')],
    full: [sampleNode('b1', 'input:1', 'My application'), sampleNode('b2', 'input:2', 'Two references'), sampleNode('b3', 'output:1', 'A rejection, no reason'), sampleNode('b4', 'inside', 'How they rank people', contested)]
  },
  record: {
    partial: [sampleNode('d1', 'decision', 'Take the Sydney job')],
    full: [
      sampleNode('d1', 'decision', 'Take the Sydney job'),
      sampleNode('d2', 'reason:1', 'The role grows what I want to do'),
      sampleNode('d3', 'reason:2', 'The team pull is weaker than I thought', contested),
      sampleNode('d4', 'trigger', 'If the rent is over a third of pay'),
      sampleNode('d5', 'action', 'Take the flat-share offer instead'),
      sampleNode('d6', 'first_step', 'Accept the offer in writing'),
      sampleNode('d7', 'review', '2027-02-01')
    ]
  }
});

/** The run for a family key at a stage: 'empty', 'partial' or 'full'. */
export function runFor(key, stage) {
  const sample = SAMPLE_RUNS[key];
  const toolId = key === 'record' ? RECORD_ID : SAMPLE_TOOLS[key].id;
  if (stage === 'empty') return sampleRun(toolId);
  return sampleRun(toolId, sample[stage], { ...(sample.scores ? { scores: sample.scores } : {}), ...(sample.edges && stage === 'full' ? { edges: sample.edges } : {}) });
}
