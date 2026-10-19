// tests/unit/problem-solver-machine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_IDS } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, canEdge, canPlace, isComplete, newRun, nextSlots, placeNode, toolDef } from '../../packages/problem-solver/machine.mjs';

const node = (id, slot) => ({ id, slot, text: slot, state: 'accepted', skills: [], turnId: 't' });

test('registry lists all eight tools', () => {
  assert.deepEqual(TOOL_IDS, ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart', 'contradiction']);
  assert.throws(() => toolDef('nope'), /Unknown tool/);
});

test('newRun shapes', () => {
  assert.deepEqual(newRun('five_whys', 'r1'), { id: 'r1', tool: 'five_whys', status: 'active', nodes: [], edges: [] });
  assert.deepEqual(newRun('gap_radar', 'r2').radar, { snapshots: [] });
});

test('placeNode accepts only open slots and never mutates', () => {
  const run = newRun('five_whys', 'r');
  assert.ok(canPlace(run, 'problem'));
  assert.ok(!canPlace(run, 'why:1'));
  assert.throws(() => placeNode(run, node('a', 'why:1')), (err) => err.code === 'illegal_slot');
  const next = placeNode(run, node('a', 'problem'));
  assert.equal(run.nodes.length, 0);
  assert.deepEqual(nextSlots(next), ['why:1']);
});

test('closed runs accept nothing', () => {
  const run = { ...newRun('five_whys', 'r'), status: 'switched' };
  assert.ok(!canPlace(run, 'problem'));
});

test('edges must be a known kind between existing distinct nodes', () => {
  let run = newRun('concept_map', 'r');
  run = placeNode(run, node('t', 'theme'));
  run = placeNode(run, node('c1', 'concept:1'));
  assert.ok(canEdge(run, 't', 'c1', 'hierarchical'));
  assert.ok(!canEdge(run, 't', 'c1', 'relates'));
  assert.ok(!canEdge(run, 't', 't', 'association'));
  assert.ok(!canEdge(run, 't', 'zz', 'association'));
  run = addEdge(run, { from: 't', to: 'c1', kind: 'hierarchical' });
  assert.ok(!canEdge(run, 't', 'c1', 'hierarchical'), 'no duplicates');
  assert.ok(!isComplete(run));
});
