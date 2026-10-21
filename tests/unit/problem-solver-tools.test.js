// tests/unit/problem-solver-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { problemTree } from '../../packages/problem-solver/tools/problem-tree.mjs';
import { conceptMap } from '../../packages/problem-solver/tools/concept-map.mjs';
import { gapBasic } from '../../packages/problem-solver/tools/gap-basic.mjs';
import { gapRadar } from '../../packages/problem-solver/tools/gap-radar.mjs';
import { problemStatement } from '../../packages/problem-solver/tools/problem-statement.mjs';
import { smart } from '../../packages/problem-solver/tools/smart.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEP_IDS } from '../../packages/problem-solver/steps.mjs';
import { newRun, placeNode, nextSlots, isComplete } from '../../packages/problem-solver/machine.mjs';

const run = (tool, slots, extra = {}) => ({ id: 'r', tool, status: 'active', edges: [], nodes: slots.map((slot, i) => ({ id: `n${i}`, slot, text: slot })), ...extra });

test('problem tree: trunk, then causes and effects', () => {
  assert.deepEqual(problemTree.nextSlots(run('problem_tree', [])), ['trunk']);
  assert.deepEqual(problemTree.nextSlots(run('problem_tree', ['trunk'])), ['cause:1', 'effect:1']);
  assert.ok(!problemTree.complete(run('problem_tree', ['trunk', 'cause:1', 'effect:1'])));
  assert.ok(problemTree.complete(run('problem_tree', ['trunk', 'cause:1', 'cause:2', 'effect:1'])));
  const r = run('problem_tree', ['trunk', 'cause:1', 'effect:1']);
  assert.ok(problemTree.canEdge(r, 'n1', 'n2', 'relates'));
  assert.ok(!problemTree.canEdge(r, 'n0', 'n1', 'relates'), 'the trunk is linked implicitly');
});

test('concept map: theme, concepts, typed links', () => {
  assert.deepEqual(conceptMap.nextSlots(run('concept_map', [])), ['theme']);
  const r = run('concept_map', ['theme', 'concept:1', 'concept:2', 'concept:3']);
  assert.deepEqual(conceptMap.nextSlots(r), ['concept:4']);
  assert.ok(!conceptMap.complete(r));
  assert.ok(conceptMap.complete({ ...r, edges: [{ from: 'n0', to: 'n1', kind: 'hierarchical' }, { from: 'n1', to: 'n2', kind: 'association' }] }));
  assert.deepEqual(conceptMap.edgeKinds, ['association', 'hierarchical', 'cross']);
});

test('gap basic: actions only after a must', () => {
  assert.deepEqual(gapBasic.nextSlots(run('gap_basic', [])), ['current', 'objective']);
  assert.deepEqual(gapBasic.nextSlots(run('gap_basic', ['objective'])), ['current']);
  const both = run('gap_basic', ['current', 'objective']);
  assert.deepEqual(gapBasic.nextSlots(both), ['known:1', 'done:1', 'must_know:1', 'must_do:1']);
  assert.ok(gapBasic.nextSlots(run('gap_basic', ['current', 'objective', 'must_do:1'])).includes('action:1'));
  assert.ok(gapBasic.complete(run('gap_basic', ['current', 'objective', 'known:1', 'must_do:1', 'action:1'])));
});

test('gap radar: axes then a scored snapshot', () => {
  const r = run('gap_radar', ['current', 'objective', 'axis:1', 'axis:2', 'axis:3'], { radar: { snapshots: [] } });
  assert.deepEqual(gapRadar.nextSlots(r), ['axis:4']);
  assert.ok(!gapRadar.complete(r));
  assert.ok(gapRadar.complete({ ...r, radar: { snapshots: [{ at: 'x', current: [1, 2, 3], objective: [8, 9, 10] }] } }));
  assert.deepEqual(gapRadar.validateScores(r, { current: [1, 2, 3], objective: [8, 9, 10] }), null);
  assert.match(gapRadar.validateScores(r, { current: [1, 2], objective: [8, 9, 10] }), /one score per topic/);
  assert.match(gapRadar.validateScores(r, { current: [0, 2, 3], objective: [8, 9, 10] }), /1 to 10/);
});

test('problem statement: strict order', () => {
  assert.deepEqual(problemStatement.nextSlots(run('problem_statement', [])), ['problem']);
  assert.deepEqual(problemStatement.nextSlots(run('problem_statement', ['problem'])), ['impact']);
  assert.deepEqual(problemStatement.nextSlots(run('problem_statement', ['problem', 'impact', 'benefit'])), ['statement']);
  assert.ok(problemStatement.complete(run('problem_statement', ['problem', 'impact', 'benefit', 'statement'])));
});

test('smart: problem, then the five letters in any order', () => {
  assert.deepEqual(smart.nextSlots(run('smart', [])), ['problem']);
  assert.deepEqual(smart.nextSlots(run('smart', ['problem', 'm'])), ['s', 'a', 'r', 't']);
  assert.ok(smart.complete(run('smart', ['problem', 's', 'm', 'a', 'r', 't'])));
});

test('every tool names its book step and at least two failure modes', () => {
  for (const tool of Object.values(TOOLS)) {
    assert.ok(BOOK_STEP_IDS.includes(tool.step), `${tool.id}.step`);
    assert.ok(Array.isArray(tool.failureModes) && tool.failureModes.length >= 2, `${tool.id}.failureModes`);
    for (const line of tool.failureModes) assert.equal(typeof line, 'string');
  }
});

test('v1 tools are all Define tools', () => {
  assert.deepEqual(toolsForBookStep('define'), ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart']);
});

test('contradiction: improving, worsening, then the statement', () => {
  let run = newRun('contradiction', 'r');
  assert.deepEqual(nextSlots(run), ['improving']);
  run = placeNode(run, { id: 'a', slot: 'improving', text: 'Faster replies', state: 'accepted' });
  assert.deepEqual(nextSlots(run), ['worsening']);
  run = placeNode(run, { id: 'b', slot: 'worsening', text: 'Less careful answers', state: 'accepted' });
  assert.deepEqual(nextSlots(run), ['statement']);
  assert.equal(isComplete(run), false);
  run = placeNode(run, { id: 'c', slot: 'statement', text: 'Speeding replies up makes them less careful.', state: 'accepted' });
  assert.equal(isComplete(run), true);
  assert.deepEqual(nextSlots(run), []);
});
