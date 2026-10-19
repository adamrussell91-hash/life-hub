// tests/unit/problem-solver-implement-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, canEdge, canPropose, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { currentPass } from '../../packages/problem-solver/tools/dmaic.mjs';
import { columnForStatus, wipLimit } from '../../packages/problem-solver/tools/kanban.mjs';
import { byQuadrant } from '../../packages/problem-solver/tools/eisenhower.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `m${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const nodeAt = (run, slot) => run.nodes.find((x) => x.slot === slot);
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('implement step lists its four tools in order', () => {
  assert.deepEqual(toolsForBookStep('implement'), ['dmaic', 'fifteen_percent', 'kanban', 'eisenhower']);
});

test('dmaic: five phases in order; a repeat starts a new pass from define; control ends it', () => {
  let r = newRun('dmaic', 'r');
  for (const s of ['define:1', 'measure:1', 'analyse:1', 'improve:1']) {
    assert.deepEqual(nextSlots(r), [s]);
    r = put(r, s);
  }
  assert.deepEqual(nextSlots(r), ['control', 'repeat:1']);
  r = put(r, 'repeat:1');
  assert.deepEqual(nextSlots(r), ['define:2']);
  assert.equal(currentPass(r), 1);
  for (const s of ['define:2', 'measure:2', 'analyse:2', 'improve:2']) r = put(r, s);
  assert.equal(currentPass(r), 2);
  r = put(r, 'repeat:2');
  for (const s of ['define:3', 'measure:3', 'analyse:3', 'improve:3']) r = put(r, s);
  assert.deepEqual(nextSlots(r), ['control'], 'three passes at most');
  assert.equal(isComplete(r), false);
  r = put(r, 'control');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
});

test('15% solutions: reflect, actions, then chosen notes that each pick one action; chosen actions can become tasks', () => {
  let r = newRun('fifteen_percent', 'r');
  assert.deepEqual(nextSlots(r), ['reflect']);
  r = put(r, 'reflect');
  assert.deepEqual(nextSlots(r), ['action:1']);
  r = put(r, 'action:1');
  assert.deepEqual(nextSlots(r), ['action:2']);
  r = put(r, 'action:2');
  assert.deepEqual(nextSlots(r), ['action:3', 'chosen:1']);
  assert.match(checkNode(r, { slot: 'chosen:1', text: 'x' }, []), /Link each chosen note to the action it picks/);
  r = put(r, 'chosen:1');
  r = link(r, 'chosen:1', 'action:2', 'picks');
  assert.equal(canEdge(r, idOf(r, 'chosen:1'), idOf(r, 'action:1'), 'picks'), false, 'one pick per note');
  assert.equal(isComplete(r), true);
  assert.equal(canPropose(r, nodeAt(r, 'chosen:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'action:1')), false);
});

test('kanban: tagged cards, an optional WIP limit as a whole number, live columns from task status; open cards can become tasks', () => {
  let r = newRun('kanban', 'r');
  assert.deepEqual(nextSlots(r), ['card:1', 'wip']);
  assert.match(checkNode(r, { slot: 'card:1', text: 'x' }, []), /one of todo, doing, review, done/);
  r = put(r, 'card:1', { tag: 'todo' });
  r = put(r, 'card:2', { tag: 'doing' });
  assert.match(checkNode(r, { slot: 'wip', text: 'Keep it small' }, []), /whole number from 1 to 20/);
  r = put(r, 'wip', { text: '3 at a time' });
  assert.equal(wipLimit(r), 3);
  assert.deepEqual(nextSlots(r), ['card:3']);
  assert.equal(isComplete(r), false);
  r = put(r, 'card:3', { tag: 'done' });
  assert.equal(isComplete(r), true);
  assert.equal(canPropose(r, nodeAt(r, 'card:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'card:3')), false);
  assert.deepEqual(['open', 'in_progress', 'done', 'dead', 'deferred', 'mystery'].map(columnForStatus), ['todo', 'doing', 'done', 'done', 'todo', 'todo']);
});

test('eisenhower: tagged items; complete with items in two quadrants; do-first items can become tasks', () => {
  let r = newRun('eisenhower', 'r');
  assert.deepEqual(nextSlots(r), ['item:1']);
  assert.match(checkNode(r, { slot: 'item:1', text: 'x' }, []), /one of do, schedule, delegate, eliminate/);
  r = put(r, 'item:1', { tag: 'do' });
  r = put(r, 'item:2', { tag: 'do' });
  assert.equal(isComplete(r), false);
  r = put(r, 'item:3', { tag: 'eliminate' });
  assert.equal(isComplete(r), true);
  assert.equal(byQuadrant(r).do.length, 2);
  assert.equal(canPropose(r, nodeAt(r, 'item:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'item:3')), false);
});
