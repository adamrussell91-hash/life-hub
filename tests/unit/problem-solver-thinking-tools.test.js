// tests/unit/problem-solver-thinking-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPropose, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep, TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { byImpactEffort } from '../../packages/problem-solver/tools/impact-effort.mjs';
import { byStakeholderQuadrant } from '../../packages/problem-solver/tools/stakeholder-map.mjs';
import { byAssumptionQuadrant } from '../../packages/problem-solver/tools/assumptions-map.mjs';
import { byList } from '../../packages/problem-solver/tools/rose-thorn-bud.mjs';
import { SELECTION } from '../../netlify/functions/_shared/problem-solver/knowledge/selection.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `t${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const nodeAt = (run, slot) => run.nodes.find((x) => x.slot === slot);

test('the four tools sit in their steps, after the older tools', () => {
  assert.deepEqual(toolsForBookStep('define').slice(-1), ['stakeholder_map']);
  assert.deepEqual(toolsForBookStep('analyse').slice(-1), ['assumptions_map']);
  assert.deepEqual(toolsForBookStep('decide').slice(-1), ['impact_effort']);
  assert.deepEqual(toolsForBookStep('improve').slice(-1), ['rose_thorn_bud']);
});

test('each tool has the fields a toolkit tool needs, and the coach is told when to choose it', () => {
  for (const id of ['impact_effort', 'stakeholder_map', 'assumptions_map', 'rose_thorn_bud']) {
    const def = TOOLS[id];
    assert.ok(def.when.length > 20, id);
    assert.equal(def.failureModes.length, 3, id);
    assert.ok(def.steps.length >= 2, id);
    assert.ok(def.nodeTags.item.length >= 3, id);
    assert.match(SELECTION[def.step], new RegExp('`' + id + '`'), id);
  }
});

test('impact_effort: tagged items; complete in two quadrants; quick wins can become tasks', () => {
  let r = newRun('impact_effort', 'r');
  assert.deepEqual(nextSlots(r), ['item:1']);
  assert.match(checkNode(r, { slot: 'item:1', text: 'x' }, []), /one of quick_win, big_bet, fill_in, drop/);
  r = put(r, 'item:1', { tag: 'quick_win' });
  r = put(r, 'item:2', { tag: 'quick_win' });
  assert.equal(isComplete(r), false);
  r = put(r, 'item:3', { tag: 'drop' });
  // A Decide tool ends with the choice: items in two quadrants open it, and it completes the run.
  assert.equal(isComplete(r), false);
  assert.deepEqual(nextSlots(r), ['item:4', 'choice']);
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.equal(byImpactEffort(r).quick_win.length, 2);
  assert.equal(canPropose(r, nodeAt(r, 'item:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'item:3')), false);
});

test('stakeholder_map: complete with three placed anywhere; items never become tasks', () => {
  let r = newRun('stakeholder_map', 'r');
  assert.match(checkNode(r, { slot: 'item:1', text: 'x', tag: 'do' }, []), /one of manage_closely, keep_satisfied, keep_informed, monitor/);
  r = put(r, 'item:1', { tag: 'manage_closely' });
  r = put(r, 'item:2', { tag: 'manage_closely' });
  assert.equal(isComplete(r), false);
  r = put(r, 'item:3', { tag: 'monitor' });
  assert.equal(isComplete(r), true);
  assert.equal(byStakeholderQuadrant(r).manage_closely.length, 2);
  assert.equal(canPropose(r, nodeAt(r, 'item:1')), false);
});

test('assumptions_map: complete with three; test-first items can become tasks', () => {
  let r = newRun('assumptions_map', 'r');
  r = put(r, 'item:1', { tag: 'test_first' });
  r = put(r, 'item:2', { tag: 'act_on' });
  assert.equal(isComplete(r), false);
  r = put(r, 'item:3', { tag: 'park' });
  assert.equal(isComplete(r), true);
  assert.equal(byAssumptionQuadrant(r).test_first.length, 1);
  assert.equal(canPropose(r, nodeAt(r, 'item:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'item:2')), false);
});

test('rose_thorn_bud: complete only with an entry in all three lists; buds can become tasks', () => {
  let r = newRun('rose_thorn_bud', 'r');
  assert.match(checkNode(r, { slot: 'item:1', text: 'x' }, []), /one of rose, thorn, bud/);
  r = put(r, 'item:1', { tag: 'rose' });
  r = put(r, 'item:2', { tag: 'rose' });
  r = put(r, 'item:3', { tag: 'thorn' });
  assert.equal(isComplete(r), false);
  r = put(r, 'item:4', { tag: 'bud' });
  assert.equal(isComplete(r), true);
  assert.equal(byList(r).rose.length, 2);
  assert.equal(canPropose(r, nodeAt(r, 'item:4')), true);
  assert.equal(canPropose(r, nodeAt(r, 'item:1')), false);
});
