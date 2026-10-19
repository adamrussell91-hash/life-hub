// tests/unit/problem-solver-machine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_IDS, TOOLS as REGISTRY } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, applyScores, canEdge, checkNode, canPlace, isComplete, newRun, nextSlots, placeNode, toolDef } from '../../packages/problem-solver/machine.mjs';

const node = (id, slot) => ({ id, slot, text: slot, state: 'accepted', skills: [], turnId: 't' });

test('registry lists every tool in order', () => {
  assert.deepEqual(TOOL_IDS, ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart', 'contradiction', 'causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement', 'problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker']);
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

test('applyScores appends a snapshot under the tool score key, validated by the tool', () => {
  let run = newRun('gap_radar', 'r');
  for (const [i, slot] of ['current', 'objective', 'axis:1', 'axis:2', 'axis:3'].entries()) run = placeNode(run, { id: `n${i}`, slot, text: slot, state: 'accepted' });
  const next = applyScores(run, { current: [3, 4, 5], objective: [8, 8, 9], junk: 1 }, '2026-10-19T09:00:00.000Z');
  assert.deepEqual(next.radar.snapshots, [{ at: '2026-10-19T09:00:00.000Z', current: [3, 4, 5], objective: [8, 8, 9] }]);
  assert.throws(() => applyScores(run, { current: [3], objective: [8] }, 'x'), (err) => err.code === 'invalid_scores' && /one score per topic/.test(err.message));
});

test('applyScores refuses tools that take no scores', () => {
  assert.throws(() => applyScores(newRun('five_whys', 'r'), {}, 'x'), (err) => err.code === 'invalid_scores');
});

const fakeTool = {
  id: 'fake_tagged', name: 'Fake', kind: 'diagnostic', step: 'analyse', when: 'test', failureModes: ['a', 'b'], steps: [], edgeKinds: ['link'],
  slots: { item: 'An item', pick: 'A pick' },
  nodeTags: { pick: ['up', 'down'] },
  validateNode(run, node, edges) { return node.slot.startsWith('item') && !edges.some((e) => e.kind === 'link') ? 'Link each item.' : null; },
  nextSlots: () => ['item:1', 'pick'], complete: () => false
};

test('checkNode requires a listed tag on tagged slots and rejects tags elsewhere', () => {
  REGISTRY.fake_tagged = fakeTool; // test-only registration
  try {
    const run = { id: 'r', tool: 'fake_tagged', status: 'active', nodes: [], edges: [] };
    assert.equal(checkNode(run, { slot: 'pick', text: 'x', tag: 'up' }, []), null);
    assert.match(checkNode(run, { slot: 'pick', text: 'x' }, []), /pick needs a tag: one of up, down/);
    assert.match(checkNode(run, { slot: 'pick', text: 'x', tag: 'sideways' }, []), /pick needs a tag: one of up, down/);
    assert.equal(checkNode(run, { slot: 'item:1', text: 'x', tag: 'up' }, [{ from: 'item:1', to: 'pick', kind: 'link' }]), 'Slot item takes no tag.');
    assert.equal(checkNode(run, { slot: 'item:1', text: 'x' }, []), 'Link each item.');
    assert.equal(checkNode(run, { slot: 'item:1', text: 'x' }, [{ from: 'item:1', to: 'pick', kind: 'link' }]), null);
  } finally {
    delete REGISTRY.fake_tagged;
  }
});
