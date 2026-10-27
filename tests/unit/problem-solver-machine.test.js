// tests/unit/problem-solver-machine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_TOOLS } from '../../packages/decision-book/models/index.mjs';
import { TOOL_IDS, TOOLS as REGISTRY } from '../../packages/problem-solver/tools/index.mjs';
import { GEAR_TOOLS } from '../../packages/get-things-done/tools/index.mjs';
import { RULE_TOOLS } from '../../packages/rules-book/tools/index.mjs';
import { CHANGE_TOOLS } from '../../packages/change-book/tools/index.mjs';
import { addEdge, applyScores, canEdge, canPropose, checkNode, canPlace, isComplete, newRun, nextSlots, placeNode, toolDef } from '../../packages/problem-solver/machine.mjs';

const node = (id, slot) => ({ id, slot, text: slot, state: 'accepted', skills: [], turnId: 't' });

test('registry lists every tool in order: the toolkit, Decision Maker’s models and record, then Gear Shifter’s techniques, Commit and Review tools, then the Rules Book’s rules, Act and Review tools, then the Change Book’s models, Act and Review tools', () => {
  const gear = [...Object.keys(GEAR_TOOLS), 'gt_commit', 'gt_review'];
  const rules = [...Object.keys(RULE_TOOLS), 'rb_commit', 'rb_review'];
  const change = [...Object.keys(CHANGE_TOOLS), 'ch_commit', 'ch_review'];
  const books = rules.length + change.length;
  assert.deepEqual(TOOL_IDS.slice(-change.length), change);
  assert.deepEqual(TOOL_IDS.slice(-books, -change.length), rules);
  assert.deepEqual(TOOL_IDS.slice(-books - gear.length, -books), gear);
  const rest = TOOL_IDS.slice(0, -books - gear.length);
  assert.deepEqual(rest.slice(-Object.keys(DECISION_TOOLS).length - 1, -1), Object.keys(DECISION_TOOLS));
  assert.equal(rest.at(-1), 'dm_record');
  assert.deepEqual(TOOL_IDS.filter((id) => !/^(dm|gt|rb|ch)_/.test(id)), ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart', 'contradiction', 'causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement', 'problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker', 'decision_matrix', 'swot', 'morphological', 'pareto', 'dmaic', 'fifteen_percent', 'kanban', 'eisenhower', 'after_action_review', 'double_loop', 'feedback_matrix', 'five_cs', 'knowledge_management']);
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

test('canPropose follows the tool\'s taskSlots and is false without them', () => {
  REGISTRY.fake_tasks = {
    id: 'fake_tasks', name: 'Fake', kind: 'plan', step: 'implement', when: 'w', failureModes: ['a', 'b'], steps: [], edgeKinds: [],
    slots: { card: 'A card', note: 'A note' },
    taskSlots: { card: (node) => node.tag !== 'done' },
    nextSlots: () => ['card:1', 'note'], complete: () => false
  };
  try {
    const run = { id: 'r', tool: 'fake_tasks', status: 'active', nodes: [], edges: [] };
    assert.equal(canPropose(run, { slot: 'card:1', text: 'x', tag: 'todo' }), true);
    assert.equal(canPropose(run, { slot: 'card:2', text: 'x', tag: 'done' }), false);
    assert.equal(canPropose(run, { slot: 'note', text: 'x' }), false);
    assert.equal(canPropose({ ...run, tool: 'five_whys' }, { slot: 'why:1', text: 'x' }), false);
  } finally {
    delete REGISTRY.fake_tasks;
  }
});
