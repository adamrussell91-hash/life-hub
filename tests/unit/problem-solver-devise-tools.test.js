// tests/unit/problem-solver-devise-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { priorityOrder } from '../../packages/problem-solver/tools/problem-reduction.mjs';
import { currentRound } from '../../packages/problem-solver/tools/analogical-reasoning.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `d${(n += 1)}`, slot, text: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('devise step lists its five tools in order', () => {
  assert.deepEqual(toolsForBookStep('devise'), ['problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker']);
});

test('problem reduction: subs, then a priority order naming each sub once, then a solution per sub, then the integration', () => {
  let r = newRun('problem_reduction', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  r = put(r, 'sub:1');
  assert.deepEqual(nextSlots(r), ['sub:2']);
  r = put(r, 'sub:2');
  r = put(r, 'sub:3');
  assert.ok(nextSlots(r).includes('priority'));
  assert.match(checkNode(r, { slot: 'priority', text: '2, 1' }, []), /every sub-problem number once/);
  assert.match(checkNode(r, { slot: 'priority', text: '2, 1, 1' }, []), /every sub-problem number once/);
  assert.equal(checkNode(r, { slot: 'priority', text: 'Sub 2 first, then 3, then 1' }, []), null);
  r = put(r, 'priority', { text: 'Sub 2 first, then 3, then 1' });
  assert.deepEqual(priorityOrder(r), [2, 3, 1]);
  assert.deepEqual(nextSlots(r), ['solution:1', 'solution:2', 'solution:3']);
  for (const s of ['solution:1', 'solution:2', 'solution:3']) r = put(r, s);
  assert.deepEqual(nextSlots(r), ['integrated']);
  r = put(r, 'integrated');
  assert.equal(isComplete(r), true);
});

test('analogical reasoning: source, target, rules, filter, assess; unsolved opens another target; solved opens retain', () => {
  let r = newRun('analogical_reasoning', 'r');
  assert.deepEqual(nextSlots(r), ['source']);
  r = put(r, 'source');
  assert.deepEqual(nextSlots(r), ['target:1']);
  r = put(r, 'target:1');
  assert.deepEqual(nextSlots(r), ['rule:1']);
  r = put(r, 'rule:1');
  assert.deepEqual(nextSlots(r), ['rule:2', 'filtered:1']);
  r = put(r, 'filtered:1');
  assert.deepEqual(nextSlots(r), ['assess:1']);
  assert.match(checkNode(r, { slot: 'assess:1', text: 'x' }, []), /one of solved, unsolved/);
  r = put(r, 'assess:1', { tag: 'unsolved' });
  assert.deepEqual(nextSlots(r), ['target:2']);
  r = put(r, 'target:2');
  assert.equal(currentRound(r).round, 2);
  assert.deepEqual(nextSlots(r), ['rule:2']);
  r = put(r, 'rule:2');
  r = put(r, 'filtered:2');
  r = put(r, 'assess:2', { tag: 'solved' });
  assert.deepEqual(nextSlots(r), ['retain']);
  assert.equal(isComplete(r), false);
  r = put(r, 'retain');
  assert.equal(isComplete(r), true);
});

test('solution tree: hows hang from the aim or another how; complete with an alternative', () => {
  let r = newRun('solution_tree', 'r');
  r = put(r, 'aim');
  for (const s of ['how:1', 'how:2', 'how:3']) r = put(r, s);
  assert.equal(canEdge(r, idOf(r, 'how:2'), idOf(r, 'how:1'), 'parent'), true);
  r = link(r, 'how:2', 'how:1', 'parent');
  assert.equal(isComplete(r), true, 'aim has two children (how:1, how:3): an alternative');
});

test('lotus blossom: eight solutions; ideas must name their petal; at most eight per petal; preferred marks an idea', () => {
  let r = newRun('lotus_blossom', 'r');
  r = put(r, 'problem');
  for (let i = 1; i <= 8; i += 1) r = put(r, `solution:${i}`);
  assert.ok(!nextSlots(r).includes('solution:9'));
  assert.match(checkNode(r, { slot: 'idea:1', text: 'x' }, []), /Link each idea to the solution it grows from/);
  assert.equal(checkNode(r, { slot: 'idea:1', text: 'x' }, [{ from: 'idea:1', to: 'solution:1', kind: 'petal' }]), null);
  for (let i = 1; i <= 8; i += 1) {
    r = put(r, `idea:${i}`);
    r = link(r, `idea:${i}`, 'solution:1', 'petal');
  }
  r = put(r, 'idea:9');
  assert.equal(canEdge(r, idOf(r, 'idea:9'), idOf(r, 'solution:1'), 'petal'), false, 'petal full');
  r = link(r, 'idea:9', 'solution:2', 'petal');
  r = put(r, 'idea:10');
  r = link(r, 'idea:10', 'solution:3', 'petal');
  assert.equal(isComplete(r), false);
  r = put(r, 'preferred:1');
  r = link(r, 'preferred:1', 'idea:9', 'marks');
  assert.equal(isComplete(r), true);
});

test('duncker: problem, desired, tagged pathways, solutions under pathways, evaluation once both kinds exist', () => {
  let r = newRun('duncker', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  assert.deepEqual(nextSlots(r), ['desired']);
  r = put(r, 'desired');
  assert.match(checkNode(r, { slot: 'pathway:1', text: 'x' }, []), /one of direct, opposite/);
  r = put(r, 'pathway:1', { tag: 'direct' });
  assert.match(checkNode(r, { slot: 'solution:1', text: 'x' }, []), /Put each solution under its pathway/);
  r = put(r, 'solution:1');
  r = link(r, 'solution:1', 'pathway:1', 'under');
  assert.ok(!nextSlots(r).includes('evaluation'));
  r = put(r, 'pathway:2', { tag: 'opposite' });
  assert.ok(nextSlots(r).includes('redefinition'));
  r = put(r, 'solution:2');
  r = link(r, 'solution:2', 'pathway:2', 'under');
  assert.ok(nextSlots(r).includes('evaluation'));
  r = put(r, 'evaluation');
  assert.equal(isComplete(r), true);
});

const edgeOf = (from, to, kind) => [{ from, to, kind }];

test('lotus: a required link must be one the tool would allow', () => {
  let r = newRun('lotus_blossom', 'r');
  r = put(r, 'problem');
  for (let i = 1; i <= 8; i += 1) r = put(r, `solution:${i}`);
  for (let i = 1; i <= 8; i += 1) {
    r = put(r, `idea:${i}`);
    r = link(r, `idea:${i}`, 'solution:1', 'petal');
  }
  const idea = { slot: 'idea:9', text: 'x' };
  assert.match(checkNode(r, idea, edgeOf('idea:9', 'solution:1', 'petal')), /Link each idea/, 'petal full');
  assert.match(checkNode(r, idea, edgeOf('idea:9', 'solution:42', 'petal')), /Link each idea/, 'no such solution');
  assert.match(checkNode(r, idea, edgeOf('idea:9', 'problem', 'petal')), /Link each idea/, 'not a solution');
  assert.equal(checkNode(r, idea, edgeOf('idea:9', 'solution:2', 'petal')), null);
});

test('duncker: a solution must go under a pathway that exists', () => {
  let r = newRun('duncker', 'r');
  r = put(r, 'problem');
  r = put(r, 'desired');
  r = put(r, 'pathway:1', { tag: 'direct' });
  const solution = { slot: 'solution:1', text: 'x' };
  assert.match(checkNode(r, solution, edgeOf('solution:1', 'pathway:9', 'under')), /Put each solution under its pathway/);
  assert.equal(checkNode(r, solution, edgeOf('solution:1', 'pathway:1', 'under')), null);
});

test('duncker: the last pathway must be the opposite one if none is yet; solutions go to 16', () => {
  let r = newRun('duncker', 'r');
  r = put(r, 'problem');
  r = put(r, 'desired');
  for (const s of ['pathway:1', 'pathway:2', 'pathway:3']) r = put(r, s, { tag: 'direct' });
  assert.match(checkNode(r, { slot: 'pathway:4', text: 'x', tag: 'direct' }, []), /last pathway the functionally opposite/);
  assert.equal(checkNode(r, { slot: 'pathway:4', text: 'x', tag: 'opposite' }, []), null);
  for (let i = 1; i <= 15; i += 1) r = put(r, `solution:${i}`);
  assert.ok(nextSlots(r).includes('solution:16'));
});

test('analogical reasoning: the rule cap is per round', () => {
  let r = newRun('analogical_reasoning', 'r');
  r = put(r, 'source');
  r = put(r, 'target:1');
  for (let i = 1; i <= 8; i += 1) r = put(r, `rule:${i}`);
  assert.ok(!nextSlots(r).includes('rule:9'));
  r = put(r, 'filtered:1');
  r = put(r, 'assess:1', { tag: 'unsolved' });
  r = put(r, 'target:2');
  assert.deepEqual(nextSlots(r), ['rule:9']);
});

test('solution tree: complete needs a nested how and a branching parent', () => {
  let r = newRun('solution_tree', 'r');
  r = put(r, 'aim');
  for (const s of ['how:1', 'how:2', 'how:3']) r = put(r, s);
  assert.equal(isComplete(r), false, 'all hows straight under the aim');
  r = link(r, 'how:2', 'how:1', 'parent');
  assert.equal(isComplete(r), true);
  let t = newRun('solution_tree', 't');
  t = put(t, 'aim');
  for (const s of ['how:1', 'how:2', 'how:3']) t = put(t, s);
  t = link(t, 'how:2', 'how:1', 'parent');
  t = link(t, 'how:3', 'how:2', 'parent');
  assert.equal(isComplete(t), false, 'a single chain has no branching parent');
});

test('problem reduction: numbers beyond the sub count are part of the sentence', () => {
  let r = newRun('problem_reduction', 'r');
  r = put(r, 'problem');
  r = put(r, 'sub:1');
  r = put(r, 'sub:2');
  assert.equal(checkNode(r, { slot: 'priority', text: '2 first (affects 30 people), then 1' }, []), null);
  assert.deepEqual(priorityOrder(put(r, 'priority', { text: '2 first (affects 30 people), then 1' })), [2, 1]);
});
