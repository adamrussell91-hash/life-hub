// tests/unit/problem-solver-analyse-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, applyScores, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { levels } from '../../packages/problem-solver/tools/hierarchy.mjs';
import { forceTotals } from '../../packages/problem-solver/tools/force-field.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `n${(n += 1)}`, slot, text: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('analyse step lists its six tools in order', () => {
  assert.deepEqual(toolsForBookStep('analyse'), ['causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement']);
});

test('causal map: problem first; causes and influences; links only toward causes or the problem; complete when every cause leads somewhere', () => {
  let r = newRun('causal_map', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  assert.deepEqual(nextSlots(r), ['cause:1', 'influence:1']);
  for (const s of ['cause:1', 'cause:2', 'cause:3', 'influence:1']) r = put(r, s);
  assert.equal(canEdge(r, idOf(r, 'cause:1'), idOf(r, 'problem'), 'plus'), true);
  assert.equal(canEdge(r, idOf(r, 'influence:1'), idOf(r, 'cause:2'), 'minus_strong'), true);
  assert.equal(canEdge(r, idOf(r, 'problem'), idOf(r, 'cause:1'), 'plus'), false, 'nothing flows out of the problem');
  assert.equal(canEdge(r, idOf(r, 'cause:1'), idOf(r, 'influence:1'), 'plus'), false, 'influences receive nothing');
  r = link(r, 'cause:1', 'problem', 'plus');
  assert.equal(canEdge(r, idOf(r, 'cause:1'), idOf(r, 'problem'), 'minus'), false, 'one link per pair');
  assert.equal(isComplete(r), false);
  r = link(r, 'cause:2', 'problem', 'minus');
  r = link(r, 'cause:3', 'cause:1', 'plus_strong');
  assert.equal(isComplete(r), true);
});

test('perspective shift: each stakeholder gets a view then an insight; reframe after two insights', () => {
  let r = newRun('perspective_shift', 'r');
  assert.deepEqual(nextSlots(r), ['stakeholder:1']);
  r = put(r, 'stakeholder:1');
  assert.deepEqual(nextSlots(r), ['stakeholder:2', 'view:1']);
  r = put(r, 'view:1');
  assert.deepEqual(nextSlots(r), ['stakeholder:2', 'insight:1']);
  r = put(r, 'insight:1');
  r = put(r, 'stakeholder:2');
  r = put(r, 'view:2');
  r = put(r, 'insight:2');
  assert.ok(nextSlots(r).includes('reframe'));
  assert.equal(isComplete(r), false);
  r = put(r, 'reframe');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
});

test('radial tree: nodes hang from the root or another node, one parent each; levels; complete with depth and a review', () => {
  let r = newRun('radial_tree', 'r');
  assert.deepEqual(nextSlots(r), ['root']);
  r = put(r, 'root');
  for (const s of ['node:1', 'node:2', 'node:3']) r = put(r, s);
  r = link(r, 'node:3', 'node:1', 'parent');
  assert.equal(canEdge(r, idOf(r, 'node:3'), idOf(r, 'node:2'), 'parent'), false, 'one parent');
  assert.equal(canEdge(r, idOf(r, 'root'), idOf(r, 'node:1'), 'parent'), false, 'the root has no parent');
  const lv = levels(r, 'root', 'node');
  assert.deepEqual([lv.get(idOf(r, 'root')), lv.get(idOf(r, 'node:1')), lv.get(idOf(r, 'node:2')), lv.get(idOf(r, 'node:3'))], [1, 2, 2, 3]);
  assert.ok(nextSlots(r).includes('review'));
  r = put(r, 'review');
  assert.equal(isComplete(r), true);
});

test('force field: current, goal, then forces; scores 1 to 5 per force; totals from the latest snapshot', () => {
  let r = newRun('force_field', 'r');
  assert.deepEqual(nextSlots(r), ['current']);
  r = put(r, 'current');
  assert.deepEqual(nextSlots(r), ['goal']);
  r = put(r, 'goal');
  assert.deepEqual(nextSlots(r), ['for:1', 'against:1']);
  for (const s of ['for:1', 'for:2', 'against:1']) r = put(r, s);
  assert.equal(isComplete(r), false);
  assert.throws(() => applyScores(r, { for: [3], against: [2] }, 't'), /one score per force/);
  assert.throws(() => applyScores(r, { for: [3, 6], against: [2] }, 't'), /1 to 5/);
  r = applyScores(r, { for: [4, 2], against: [5] }, 't1');
  assert.deepEqual(forceTotals(r), { for: 6, against: 5 });
  assert.equal(isComplete(r), true);
});

test('from…to: aspect, trend (tagged), from, to per row; insight after two rows', () => {
  let r = newRun('from_to', 'r');
  assert.deepEqual(nextSlots(r), ['aspect:1']);
  r = put(r, 'aspect:1');
  assert.deepEqual(nextSlots(r), ['aspect:2', 'trend:1']);
  assert.match(checkNode(r, { slot: 'trend:1', text: 'x' }, []), /needs a tag: one of growing, stable, declining/);
  r = put(r, 'trend:1', { tag: 'declining' });
  r = put(r, 'from:1');
  r = put(r, 'to:1');
  assert.ok(!nextSlots(r).includes('insight'));
  for (const s of ['aspect:2', 'trend:2', 'from:2', 'to:2']) r = put(r, s, s.startsWith('trend') ? { tag: 'growing' } : {});
  assert.ok(nextSlots(r).includes('insight'));
  r = put(r, 'insight');
  assert.equal(isComplete(r), true);
});

test('intent statement: six parts in order', () => {
  let r = newRun('intent_statement', 'r');
  for (const s of ['problem', 'stakeholders', 'failures', 'approach', 'opportunity', 'risk']) {
    assert.deepEqual(nextSlots(r), [s]);
    r = put(r, s);
  }
  assert.equal(isComplete(r), true);
});
