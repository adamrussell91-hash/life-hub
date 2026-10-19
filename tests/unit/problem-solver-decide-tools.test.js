// tests/unit/problem-solver-decide-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, applyScores, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { matrixTotals } from '../../packages/problem-solver/tools/decision-matrix.mjs';
import { quadrantsOf } from '../../packages/problem-solver/tools/swot.mjs';
import { consistent } from '../../packages/problem-solver/tools/morphological.mjs';
import { paretoRows } from '../../packages/problem-solver/tools/pareto.mjs';
import { CHOICE_SLOT } from '../../packages/problem-solver/tools/choice.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `c${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('decide step lists its four tools in order', () => {
  assert.deepEqual(toolsForBookStep('decide'), ['decision_matrix', 'swot', 'morphological', 'pareto']);
});

test('every Decide tool, and only Decide tools, end with the choice slot and a Choose step', () => {
  for (const [id, def] of Object.entries(TOOLS)) {
    const decide = def.step === 'decide';
    assert.equal(CHOICE_SLOT in def.slots, decide, id);
    assert.equal(def.steps.at(-1).id === 'choose', decide, id);
    assert.ok(Object.isFrozen(def), id);
  }
});

test('decision matrix: criteria and options open together; weights and ratings validated; totals and leader', () => {
  let r = newRun('decision_matrix', 'r');
  assert.deepEqual(nextSlots(r), ['criterion:1', 'option:1']);
  for (const s of ['criterion:1', 'criterion:2', 'option:1', 'option:2']) r = put(r, s);
  assert.equal(isComplete(r), false);
  assert.throws(() => applyScores(r, { mode: 'percent', weights: [60, 30], ratings: [[8, 5], [6, 9]] }, 't'), /add up to 100/);
  assert.throws(() => applyScores(r, { mode: 'rank', weights: [2, 2], ratings: [[8, 5], [6, 9]] }, 't'), /each number from 1 to 2/);
  assert.throws(() => applyScores(r, { mode: 'percent', weights: [60, 40], ratings: [[8, 11], [6, 9]] }, 't'), /1 to 10/);
  assert.throws(() => applyScores(r, { mode: 'percent', weights: [60, 40], ratings: [[8, 5]] }, 't'), /every option against every criterion/);
  assert.throws(() => applyScores(r, { mode: 'guess', weights: [60, 40], ratings: [[8, 5], [6, 9]] }, 't'), /percentage weights or ranks/);
  r = applyScores(r, { mode: 'percent', weights: [60, 40], ratings: [[8, 5], [6, 9]] }, 't1');
  assert.deepEqual(matrixTotals(r), { totals: [6.8, 7.2], leader: 1 });
  assert.equal(isComplete(r), false, 'scored, but no option chosen yet');
  assert.deepEqual(nextSlots(r), ['criterion:3', 'option:3', 'choice']);
  assert.match(TOOLS.decision_matrix.scoreLine(r), /option:2 7\.2 \(leading\)/);
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.ok(!nextSlots(r).includes('choice'), 'one choice per run');
  assert.ok(nextSlots(r).includes('criterion:3'), 'other slots stay open after the choice');
  r = applyScores(r, { mode: 'rank', weights: [2, 1], ratings: [[8, 5], [6, 9]] }, 't2');
  assert.deepEqual(matrixTotals(r), { totals: [21, 21], leader: null });
  r = put(r, 'criterion:3');
  assert.equal(isComplete(r), false, 'a new criterion needs rescoring');
});

test('swot: goal, options, quadrant items linked to their option, synthesis once one option is full', () => {
  let r = newRun('swot', 'r');
  assert.deepEqual(nextSlots(r), ['goal']);
  r = put(r, 'goal');
  assert.deepEqual(nextSlots(r), ['option:1']);
  r = put(r, 'option:1');
  assert.deepEqual(nextSlots(r), ['option:2', 'strength:1', 'weakness:1', 'opportunity:1', 'threat:1']);
  assert.match(checkNode(r, { slot: 'strength:1', text: 'x' }, []), /Link each strength to the option/);
  assert.equal(checkNode(r, { slot: 'strength:1', text: 'x' }, [{ from: 'strength:1', to: 'option:1', kind: 'of' }]), null);
  for (const q of ['strength', 'weakness', 'opportunity']) {
    r = put(r, `${q}:1`);
    r = link(r, `${q}:1`, 'option:1', 'of');
  }
  assert.ok(!nextSlots(r).includes('synthesis'));
  r = put(r, 'threat:1');
  r = link(r, 'threat:1', 'option:1', 'of');
  assert.equal(quadrantsOf(r, idOf(r, 'option:1')).threat.length, 1);
  assert.equal(canEdge(r, idOf(r, 'threat:1'), idOf(r, 'option:1'), 'of'), false, 'one option per item');
  assert.ok(nextSlots(r).includes('synthesis'));
  r = put(r, 'synthesis');
  assert.equal(isComplete(r), false);
  assert.deepEqual(nextSlots(r), ['choice']);
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
});

test('morphological: subjects with linked attributes; contradictions pair two subjects; scenarios pick one per subject; evaluation after a consistent scenario', () => {
  let r = newRun('morphological', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  assert.deepEqual(nextSlots(r), ['subject:1']);
  r = put(r, 'subject:1');
  assert.deepEqual(nextSlots(r), ['subject:2', 'attribute:1']);
  assert.match(checkNode(r, { slot: 'attribute:1', text: 'x' }, []), /Link each attribute to its subject/);
  let a = 0;
  const attr = (subject) => {
    a += 1;
    r = put(r, `attribute:${a}`);
    r = link(r, `attribute:${a}`, subject, 'of');
  };
  for (const s of ['subject:2', 'subject:3']) r = put(r, s);
  attr('subject:1'); attr('subject:1'); attr('subject:2'); attr('subject:2'); attr('subject:3');
  assert.ok(!nextSlots(r).includes('scenario:1'), 'needs two attributes on every subject');
  attr('subject:3');
  assert.ok(nextSlots(r).includes('scenario:1') && nextSlots(r).includes('contradiction:1'));
  const pair = (x, y) => [{ from: 'contradiction:1', to: x, kind: 'pair' }, { from: 'contradiction:1', to: y, kind: 'pair' }];
  assert.match(checkNode(r, { slot: 'contradiction:1', text: 'x' }, pair('attribute:1', 'attribute:2')), /two attributes that cannot go together, from different subjects/);
  assert.equal(checkNode(r, { slot: 'contradiction:1', text: 'x' }, pair('attribute:1', 'attribute:3')), null);
  r = put(r, 'contradiction:1');
  r = link(r, 'contradiction:1', 'attribute:1', 'pair');
  r = link(r, 'contradiction:1', 'attribute:3', 'pair');
  const picks = (slot, ...targets) => targets.map((to) => ({ from: slot, to, kind: 'picks' }));
  assert.match(checkNode(r, { slot: 'scenario:1', text: 'x' }, picks('scenario:1', 'attribute:1', 'attribute:3')), /one attribute from every subject/);
  assert.match(checkNode(r, { slot: 'scenario:1', text: 'x' }, picks('scenario:1', 'attribute:1', 'attribute:2', 'attribute:5')), /one attribute from every subject/);
  r = put(r, 'scenario:1');
  for (const t of ['attribute:1', 'attribute:3', 'attribute:5']) r = link(r, 'scenario:1', t, 'picks');
  assert.equal(consistent(r, idOf(r, 'scenario:1')), false);
  assert.ok(!nextSlots(r).includes('evaluation'));
  assert.ok(!nextSlots(r).some((s) => s.startsWith('subject')), 'subjects close once a scenario exists');
  r = put(r, 'scenario:2');
  for (const t of ['attribute:2', 'attribute:3', 'attribute:6']) r = link(r, 'scenario:2', t, 'picks');
  assert.equal(consistent(r, idOf(r, 'scenario:2')), true);
  assert.ok(nextSlots(r).includes('evaluation'));
  r = put(r, 'evaluation');
  assert.equal(isComplete(r), false);
  assert.deepEqual(nextSlots(r), ['choice'], 'evaluation closes the grid; only the choice remains');
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
});

test('pareto: target, items, one figure per item; rows ranked with percent, cumulative and the vital few', () => {
  let r = newRun('pareto', 'r');
  assert.deepEqual(nextSlots(r), ['target']);
  r = put(r, 'target');
  assert.deepEqual(nextSlots(r), ['item:1']);
  for (const s of ['item:1', 'item:2', 'item:3', 'item:4']) r = put(r, s);
  assert.throws(() => applyScores(r, { counts: [5, 3, 2] }, 't'), /one figure per item/);
  assert.throws(() => applyScores(r, { counts: [5, -1, 2, 1] }, 't'), /zero or more/);
  assert.throws(() => applyScores(r, { counts: [0, 0, 0, 0] }, 't'), /at least one item above zero/);
  r = applyScores(r, { counts: [10, 45, 30, 15] }, 't1');
  const rows = paretoRows(r);
  assert.deepEqual(rows.map((x) => x.node.slot), ['item:2', 'item:3', 'item:4', 'item:1']);
  assert.deepEqual(rows.map((x) => x.percent), [45, 30, 15, 10]);
  assert.deepEqual(rows.map((x) => x.cumulative), [45, 75, 90, 100]);
  assert.deepEqual(rows.map((x) => x.vital), [true, true, true, false]);
  assert.equal(isComplete(r), false);
  assert.ok(nextSlots(r).includes('choice'));
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.match(TOOLS.pareto.scoreLine(r), /Vital few: item:2, item:3, item:4 \(90%\)/);
  r = put(r, 'item:5');
  assert.equal(isComplete(r), false, 'a new item needs its figure');
});
