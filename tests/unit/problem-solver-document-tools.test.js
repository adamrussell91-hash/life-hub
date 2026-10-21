// tests/unit/problem-solver-document-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptProblem, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { correspondName, filledCs, FIVE_CS } from '../../packages/problem-solver/tools/five-cs.mjs';
import { kmStage } from '../../packages/problem-solver/tools/knowledge-management.mjs';

let n = 0;
const put = (run, slot, text = `${slot} answer`) => placeNode(run, { id: `d${(n += 1)}`, slot, text, title: slot, state: 'accepted' });

test('document step lists its two tools in order', () => {
  assert.deepEqual(toolsForBookStep('document'), ['five_cs', 'knowledge_management']);
});

test('5 Cs: the Cs in order, more essentials until Correct, then the name', () => {
  let r = newRun('five_cs', 'r');
  assert.deepEqual(FIVE_CS, ['contextualise', 'categorise', 'condense', 'correct', 'correspond']);
  for (const slot of ['contextualise', 'categorise', 'condense:1']) {
    assert.deepEqual(nextSlots(r), [slot]);
    r = put(r, slot);
  }
  assert.deepEqual(nextSlots(r), ['condense:2', 'correct']);
  r = put(r, 'condense:2');
  r = put(r, 'correct', 'Nothing needs correcting');
  assert.deepEqual(nextSlots(r), ['correspond']);
  assert.match(TOOLS.five_cs.promptNote(r), /exactly in node\.text/);
  assert.equal(isComplete(r), false);
  assert.deepEqual(filledCs(r), ['contextualise', 'categorise', 'condense', 'correct']);
  r = put(r, 'correspond', 'Kitchen rota case file 20261020 v1 Final');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
  assert.equal(TOOLS.five_cs.promptNote(r), null);
  assert.equal(correspondName(r), 'Kitchen rota case file 20261020 v1 Final');
});

test('5 Cs: a name breaking a strict rule cannot be accepted; other slots are never refused', () => {
  const r = newRun('five_cs', 'r');
  assert.match(acceptProblem(r, { slot: 'correspond', text: 'rota stuff' }), /naming rule: add the date/);
  assert.equal(acceptProblem(r, { slot: 'correspond', text: 'Kitchen rota case file 20261020 v1 Final' }), null);
  assert.equal(acceptProblem(r, { slot: 'condense:1', text: 'x' }), null);
  assert.equal(acceptProblem(newRun('five_whys', 'w'), { slot: 'problem', text: 'x' }), null);
});

test('knowledge management: consider, then capture both kinds, then share and review', () => {
  let r = newRun('knowledge_management', 'r');
  assert.equal(kmStage(r), null);
  assert.deepEqual(nextSlots(r), ['consider']);
  r = put(r, 'consider');
  assert.deepEqual(nextSlots(r), ['explicit:1', 'tacit:1']);
  r = put(r, 'explicit:1');
  assert.equal(kmStage(r), 'capture');
  assert.deepEqual(nextSlots(r), ['explicit:2', 'tacit:1']);
  r = put(r, 'tacit:1');
  assert.deepEqual(nextSlots(r), ['explicit:2', 'tacit:2', 'share', 'review']);
  r = put(r, 'review');
  assert.equal(isComplete(r), true, 'share is optional');
  assert.deepEqual(nextSlots(r), ['explicit:2', 'tacit:2', 'share']);
  r = put(r, 'share');
  assert.equal(kmStage(r), 'share');
});
