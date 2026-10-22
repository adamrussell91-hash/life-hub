// tests/unit/decision-book-families.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, applyScores, checkNode, isComplete, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { FAMILY_FACTORIES, curveTool, listTool, pathTool, plotTool, quadrantTool, scalesTool, tensionTool } from '../../packages/decision-book/families/index.mjs';
import { itemsByCell } from '../../packages/decision-book/families/quadrant.mjs';
import { positionsOf } from '../../packages/decision-book/families/plot.mjs';
import { valuesOf } from '../../packages/decision-book/families/scales.mjs';
import { flowRoute } from '../../packages/decision-book/families/path.mjs';
import { entriesByGroup } from '../../packages/decision-book/families/list.mjs';
import { CHASM_GAP, CURVE_IDS, curveAt, curvePoints } from '../../packages/decision-book/curves.mjs';
import { SAMPLE_TOOLS, sampleNode, sampleRun } from '../../packages/decision-book/fixtures.mjs';

// The machine looks tools up in the registry; register the samples for this file only.
for (const def of Object.values(SAMPLE_TOOLS)) TOOLS[def.id] = def;
test.after(() => {
  for (const def of Object.values(SAMPLE_TOOLS)) delete TOOLS[def.id];
});

const T = SAMPLE_TOOLS;
const place = (run, id, slot, text, extra = {}) => placeNode(run, sampleNode(id, slot, text, extra));
const AT = '2026-10-21T10:00:00.000Z';

test('the factories, keyed by catalogue family (ratings is Gear Shifter\'s)', () => {
  assert.deepEqual(Object.keys(FAMILY_FACTORIES), ['quadrant', 'plot', 'scales', 'curve', 'tension', 'path', 'list', 'ratings']);
});

test('every sample tool meets the shared contract', () => {
  for (const def of Object.values(T)) {
    assert.ok(Object.isFrozen(def) && Object.isFrozen(def.chart), def.id);
    assert.equal(def.step, 'explore', def.id);
    assert.ok(def.id.startsWith('dm_'), def.id);
    for (const key of ['name', 'when', 'steps', 'slots', 'edgeKinds', 'nextSlots', 'complete']) assert.ok(def[key], `${def.id} ${key}`);
    assert.equal(isComplete(sampleRun(def.id)), false, def.id);
  }
});

test('a bad config fails at build time, naming the tool', () => {
  const base = { id: 'dm_bad', name: 'Bad', when: 'never', steps: [{ id: 's', title: 's', prompt: 'p' }] };
  const axes = { x: { label: 'X', low: 'l', high: 'h' }, y: { label: 'Y', low: 'l', high: 'h' } };
  const cell = (id, col, row) => ({ id, label: id, col, row, fill: 'red' });
  assert.throws(() => quadrantTool({ ...base, chart: { axes, item: 'i', cells: [cell('a', 0, 0), cell('b', 0, 0), cell('c', 1, 0), cell('d', 1, 1)] } }), /dm_bad: cells must fill the four places once/);
  assert.throws(() => quadrantTool({ ...base, chart: { axes, item: 'i', cells: [cell('a', 0, 0), cell('b', 0, 1), cell('c', 1, 0), { ...cell('d', 1, 1), fill: 'yellow' }] } }), /fill must be one of/);
  assert.throws(() => quadrantTool({ ...base, id: 'bad', chart: {} }), /ids start with dm_/);
  assert.throws(() => curveTool({ ...base, chart: { axes, lines: [{ id: 'm', shape: 'u' }], regions: [{ id: 'a', label: 'A', from: 0, to: 0.5 }, { id: 'b', label: 'B', from: 0.6, to: 1 }], position: 'p' } }), /must start where the last ended/);
  assert.throws(() => pathTool({ ...base, chart: { variant: 'flow', stages: [{ id: 'a', label: 'A', kind: 'question', yes: 'b', no: 'a' }, { id: 'b', label: 'B', kind: 'end' }] } }), /loops back to a/);
  assert.throws(() => scalesTool({ ...base, chart: { mode: 'shares', layout: 'radar', scales: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] } }), /radar needs axes mode/);
  assert.throws(() => tensionTool({ ...base, chart: { variant: 'pull', centre: 'c', sides: [{ id: 'a', label: 'A', fill: 'red' }] } }), /a pull has 2 sides/);
  assert.throws(() => listTool({ ...base, chart: { layout: 'rows', groups: [{ id: 'a', label: 'A', column: 'x' }, { id: 'b', label: 'B', column: 'y' }], entry: 'e' } }), /columns belong to pyramid or lanes/);
  assert.throws(() => plotTool({ ...base, chart: { axes, point: 'p', band: { label: 'b', x: [0, 5], y: [1, 2] } } }), /band needs a label and 1–10 bounds/);
});

test('quadrant: items tagged by cell; axis direction lives in the cells; reflection after two cells', () => {
  const def = T.quadrant;
  const top = def.chart.cells.filter((cell) => cell.row === 0).map((cell) => cell.id);
  assert.deepEqual(top, ['quick_win', 'big_bet']);
  assert.equal(def.chart.cells.find((cell) => cell.col === 1 && cell.row === 0).id, 'big_bet');
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['item:1']);
  assert.match(checkNode(run, { slot: 'item:1', text: 'x' }), /needs a tag: one of quick_win, big_bet, filler, drain/);
  run = place(run, 'a', 'item:1', 'One', { tag: 'quick_win' });
  run = place(run, 'b', 'item:2', 'Two', { tag: 'quick_win' });
  run = place(run, 'c', 'item:3', 'Three', { tag: 'quick_win' });
  assert.deepEqual(nextSlots(run), ['item:4'], 'one cell is not enough');
  run = place(run, 'd', 'item:4', 'Four', { tag: 'drain' });
  assert.deepEqual(nextSlots(run), ['item:5', 'reflection']);
  assert.equal(isComplete(run), false);
  run = place(run, 'e', 'reflection', 'So what');
  assert.deepEqual(nextSlots(run), []);
  assert.equal(isComplete(run), true);
  assert.deepEqual(Object.fromEntries(Object.entries(itemsByCell(run, def.chart)).map(([k, v]) => [k, v.length])), { quick_win: 3, big_bet: 0, filler: 0, drain: 1 });
});

test('quadrant: an optional subject comes first', () => {
  const def = quadrantTool({ ...T.quadrant, chart: { ...structuredClone(T.quadrant.chart), subject: 'What is being sorted' } });
  assert.deepEqual(def.nextSlots(sampleRun(def.id)), ['subject']);
  assert.equal(def.slots.subject, 'What is being sorted');
  assert.deepEqual(Object.keys(def.slots), ['subject', 'item', 'reflection']);
});

test('plot: the person places points by score snapshots, merged in order', () => {
  const def = T.plot;
  let run = sampleRun(def.id);
  run = place(run, 'a', 'point:1', 'Night class');
  run = place(run, 'b', 'point:2', 'Weekend trip');
  assert.match(def.awaiting(run), /places each point/);
  assert.deepEqual(nextSlots(run), ['point:3']);
  assert.throws(() => applyScores(run, { points: { a: { x: 0, y: 3 } } }, AT), /run from 1 to 10/);
  assert.throws(() => applyScores(run, { points: { zz: { x: 2, y: 3 } } }, AT), /Only placed points/);
  run = applyScores(run, { points: { a: { x: 2, y: 9, size: 4 } } }, AT);
  assert.ok(def.awaiting(run), 'b is not placed yet');
  run = applyScores(run, { points: { b: { x: 8, y: 6 } } }, AT);
  run = applyScores(run, { points: { a: { x: 3, y: 9 } } }, AT);
  assert.deepEqual(positionsOf(run), { a: { x: 3, y: 9, size: 4 }, b: { x: 8, y: 6 } });
  assert.equal(def.awaiting(run), null);
  assert.deepEqual(nextSlots(run), ['point:3', 'reflection']);
});

test('plot: several plots tag their points and never need a size', () => {
  const axes = (a) => ({ x: { label: `${a}x`, low: 'l', high: 'h' }, y: { label: `${a}y`, low: 'l', high: 'h' } });
  const def = plotTool({ id: 'dm_two_plots', name: 'Two', when: 'w', steps: [{ id: 's', title: 's', prompt: 'p' }], chart: { point: 'p', plots: [{ id: 'cost', label: 'Cost', axes: axes('c') }, { id: 'learning', label: 'Learning', axes: axes('l') }] } });
  assert.deepEqual(def.nodeTags, { point: ['cost', 'learning'] });
  const run = { ...sampleRun(def.id), nodes: [sampleNode('a', 'point:1', 'A', { tag: 'cost' })] };
  assert.match(def.validateScores(run, { points: { a: { x: 2, y: 2, size: 3 } } }), /no bubble size/);
});

test('scales: pairs share ten, axes run 1–10, shares sum to 100; reflection once every series is scored', () => {
  const pairs = T.scales;
  let run = sampleRun(pairs.id);
  assert.match(pairs.awaiting(run), /scores now and wanted/);
  assert.throws(() => applyScores(run, { series: 'now', values: { pace: 11, scope: 5, company: 5 } }, AT), /shares 10 points/);
  assert.throws(() => applyScores(run, { series: 'now', values: { pace: 2, scope: 5 } }, AT), /every scale/);
  assert.throws(() => applyScores(run, { series: 'later', values: { pace: 2, scope: 5, company: 5 } }, AT), /Score one of: now, wanted/);
  run = applyScores(run, { series: 'now', values: { pace: 2, scope: 5, company: 8 } }, AT);
  assert.deepEqual(nextSlots(run), ['note:1']);
  run = applyScores(run, { series: 'wanted', values: { pace: 6, scope: 4, company: 4 } }, AT);
  run = applyScores(run, { series: 'now', values: { pace: 3, scope: 5, company: 8 } }, AT);
  assert.deepEqual(valuesOf(run), { now: { pace: 3, scope: 5, company: 8 }, wanted: { pace: 6, scope: 4, company: 4 } });
  assert.deepEqual(nextSlots(run), ['note:1', 'reflection']);
  assert.match(checkNode(run, { slot: 'note:1', text: 'x', tag: 'mood' }), /one of pace, scope, company/);
  assert.match(T.radar.validateScores(sampleRun(T.radar.id), { series: 'now', values: { calm: 0, focus: 2, energy: 2, sleep: 2 } }), /1 to 10/);
  assert.match(T.shares.validateScores(sampleRun(T.shares.id), { series: 'now', values: { work: 50, home: 30, play: 10 } }), /add up to 100/);
  assert.equal(T.shares.validateScores(sampleRun(T.shares.id), { series: 'now', values: { work: 60, home: 30, play: 10 } }), null);
});

test('curve: one position tagged by region, notes optional, reflection after the position', () => {
  const def = T.curve;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['position', 'note:1']);
  assert.match(checkNode(run, { slot: 'position', text: 'x' }), /one of few, enough, many/);
  run = place(run, 'p', 'position', 'Twelve flats', { tag: 'many' });
  assert.deepEqual(nextSlots(run), ['note:1', 'reflection']);
  run = place(run, 'r', 'reflection', 'Cut to three');
  assert.equal(isComplete(run), true);
});

test('curve shapes are ideas, not data: bounded, and the U is high at both ends', () => {
  for (const id of CURVE_IDS) for (const [, h] of curvePoints(id, 20)) assert.ok(h >= 0 && h <= 1, id);
  assert.ok(curveAt('u', 0) > curveAt('u', 0.5) && curveAt('u', 1) > curveAt('u', 0.5));
  assert.ok(curveAt('rise', 1) > curveAt('rise', 0));
  assert.ok(curveAt('tail', 0) > curveAt('tail', 0.6));
  assert.ok(curveAt('spike', 0.82) > curveAt('spike', 0.4) + 0.5);
  assert.deepEqual(CHASM_GAP, [0.3, 0.36]);
  assert.equal(curvePoints('s', 4).length, 5);
  assert.throws(() => curvePoints('zigzag'), /Unknown curve shape/);
});

test('tension: centre first, a force on every side, then reflection; equal sides have no scores', () => {
  const def = T.tension;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['centre']);
  assert.equal(def.validateScores, undefined);
  run = place(run, 'c', 'centre', 'Staying');
  run = place(run, 'a', 'force:1', 'Team', { tag: 'holds' });
  assert.deepEqual(nextSlots(run), ['force:2']);
  run = place(run, 'b', 'force:2', 'Role', { tag: 'pulls' });
  assert.deepEqual(nextSlots(run), ['force:3', 'reflection']);
});

test('tension triangle: fix exactly `pick` distinct corners', () => {
  const def = T.triangle;
  let run = place(sampleRun(def.id), 'c', 'centre', 'Refit');
  for (const [i, side] of ['fast', 'good', 'cheap'].entries()) run = place(run, `f${i}`, `force:${i + 1}`, side, { tag: side });
  assert.ok(nextSlots(run).includes('fix:1'));
  run = place(run, 'x1', 'fix:1', 'Quality', { tag: 'good' });
  assert.match(checkNode(run, { slot: 'fix:2', text: 'Again', tag: 'good' }), /already fixed/);
  run = place(run, 'x2', 'fix:2', 'Budget', { tag: 'cheap' });
  assert.deepEqual(nextSlots(run), ['force:4', 'reflection']);
});

test('path flow: answers choose the route; an end closes it', () => {
  const def = T.flow;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['want']);
  assert.deepEqual(def.nodeTags, { want: ['yes', 'no'], afford: ['yes', 'no'] });
  run = place(run, 'a', 'want', 'Yes', { tag: 'yes' });
  assert.deepEqual(nextSlots(run), ['afford']);
  run = place(run, 'b', 'afford', 'No', { tag: 'no' });
  assert.deepEqual(nextSlots(run), ['wait']);
  assert.deepEqual(flowRoute(run, def.chart.stages).map((step) => step.stage.id), ['want', 'afford', 'wait']);
  run = place(run, 'c', 'wait', 'Save until March');
  assert.deepEqual(nextSlots(run), ['reflection']);
  assert.equal(isComplete(run), false);
  run = place(run, 'r', 'reflection', 'Fine');
  assert.equal(isComplete(run), true);
});

test('path stages: in order, then a new round or the reflection', () => {
  const def = T.stages;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['plan:1']);
  run = place(run, 'a', 'plan:1', 'Draft');
  run = place(run, 'b', 'try:1', 'Try');
  assert.deepEqual(nextSlots(run), ['check:1']);
  run = place(run, 'c', 'check:1', 'Check');
  assert.deepEqual(nextSlots(run), ['plan:2', 'reflection']);
  run = place(run, 'd', 'plan:2', 'Again');
  assert.deepEqual(nextSlots(run), ['try:2']);
});

test('path layers: holes link into their layer', () => {
  const def = T.layers;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['layer:1']);
  run = place(run, 'l1', 'layer:1', 'List');
  run = place(run, 'l2', 'layer:2', 'Check');
  assert.match(checkNode(run, { slot: 'hole:1', text: 'Old list' }, []), /Link each hole to the layer/);
  assert.equal(checkNode(run, { slot: 'hole:1', text: 'Old list' }, [{ from: 'hole:1', to: 'layer:1', kind: 'in' }]), null);
  run = place(run, 'h1', 'hole:1', 'Old list');
  run = addEdge(run, { from: 'h1', to: 'l1', kind: 'in' });
  assert.throws(() => addEdge(run, { from: 'h1', to: 'l2', kind: 'in' }), /not allowed/);
  assert.ok(nextSlots(run).includes('reflection'));
});

test('list: entries tagged by group, a full group refuses more', () => {
  const def = listTool({ ...T.list, chart: { ...structuredClone(T.list.chart), perGroup: 1 } });
  TOOLS[def.id] = def;
  let run = sampleRun(def.id);
  run = place(run, 'a', 'entry:1', 'Walk', { tag: 'keep' });
  assert.match(checkNode(run, { slot: 'entry:2', text: 'Run', tag: 'keep' }), /already has 1 entries/);
  delete TOOLS[def.id];
  const pyramid = T.pyramid;
  const full = { ...sampleRun(pyramid.id), nodes: [sampleNode('a', 'entry:1', 'Wage', { tag: 'then_base' })] };
  assert.deepEqual(entriesByGroup(full, pyramid.chart).then_base.map((node) => node.id), ['a']);
  assert.deepEqual([...new Set(pyramid.chart.groups.map((group) => group.column))], ['then', 'now']);
});

test('the one-offs: nine dots and the black box', () => {
  let run = sampleRun(T.outside_box.id);
  assert.deepEqual(nextSlots(run), ['attempt', 'assumption']);
  run = place(run, 'a', 'assumption', 'Must stay in this city');
  assert.deepEqual(nextSlots(run), ['attempt', 'reflection']);
  assert.equal(T.outside_box.tier, 'lens');
  let box = sampleRun(T.black_box.id);
  assert.deepEqual(nextSlots(box), ['input:1', 'output:1']);
  box = place(box, 'i', 'input:1', 'Application');
  box = place(box, 'o', 'output:1', 'Rejection');
  assert.deepEqual(nextSlots(box), ['input:2', 'output:2', 'inside']);
});
