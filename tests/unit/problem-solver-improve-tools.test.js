// tests/unit/problem-solver-improve-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { loopStage, recurs } from '../../packages/problem-solver/tools/double-loop.mjs';
import { satellitesOf } from '../../packages/problem-solver/tools/feedback-matrix.mjs';
import { learnedShare, longestEarlier } from '../../packages/problem-solver/tools/after-action-review.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `v${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('improve step lists its three tools in order', () => {
  assert.deepEqual(toolsForBookStep('improve'), ['after_action_review', 'double_loop', 'feedback_matrix']);
});

test('after action review: four answers in order; the coach is told how full "learned" must be', () => {
  let r = newRun('after_action_review', 'r');
  const answer = (slot, text) => placeNode(r, { id: slot, slot, text, title: slot, state: 'accepted' });
  assert.equal(TOOLS.after_action_review.promptNote(r), null);
  for (const [slot, text] of [
    ['intended', 'Publish the rota a week ahead'],
    ['achieved', 'Published on time three weeks out of four'],
    ['differences', 'The fourth week a manager was off sick and nobody else could sign it off']
  ]) {
    assert.deepEqual(nextSlots(r), [slot]);
    r = answer(slot, text);
  }
  assert.equal(longestEarlier(r), 15);
  assert.match(TOOLS.after_action_review.promptNote(r), /longer than 15 words/);
  assert.deepEqual(nextSlots(r), ['learned']);
  assert.equal(isComplete(r), false);
  r = answer('learned', 'A single person signing off is a weak point, so two people now hold the sign-off, and the rota is drafted on Monday so a sick day still leaves time to publish it on Wednesday');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
  assert.equal(TOOLS.after_action_review.promptNote(r), null);
  const share = learnedShare(r);
  assert.ok(share > 0.4 && share < 0.6, `learned share ${share}`);
});

test('double loop: problem, single loop, recurs; a recurring problem opens the outer loop', () => {
  let r = newRun('double_loop', 'r');
  for (const slot of ['problem', 'single']) {
    assert.deepEqual(nextSlots(r), [slot]);
    r = put(r, slot);
  }
  assert.equal(loopStage(r), 'action');
  assert.deepEqual(nextSlots(r), ['recurs']);
  assert.match(checkNode(r, { slot: 'recurs', text: 'It came back' }, []), /one of yes, no/);
  r = put(r, 'recurs', { tag: 'yes' });
  assert.equal(recurs(r), 'yes');
  assert.equal(loopStage(r), 'consequences');
  assert.deepEqual(nextSlots(r), ['governing:1']);
  assert.equal(isComplete(r), false);
  r = put(r, 'governing:1');
  assert.equal(loopStage(r), 'governing');
  assert.deepEqual(nextSlots(r), ['governing:2', 'reframe']);
  r = put(r, 'reframe');
  assert.deepEqual(nextSlots(r), ['strategy:1']);
  r = put(r, 'strategy:1');
  assert.deepEqual(nextSlots(r), ['strategy:2', 'test']);
  r = put(r, 'test');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), ['monitor']);
  r = put(r, 'monitor');
  assert.equal(loopStage(r), 'solution');
  assert.deepEqual(nextSlots(r), []);
});

test('double loop: a problem that does not recur is complete after the single loop; monitor stays optional', () => {
  let r = newRun('double_loop', 'r');
  r = put(put(r, 'problem'), 'single');
  r = put(r, 'recurs', { tag: 'no' });
  assert.equal(recurs(r), 'no');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), ['monitor']);
});

test('feedback matrix: three quadrants open themes; why and how hang from a theme; an action needs a theme with a how', () => {
  let r = newRun('feedback_matrix', 'r');
  assert.deepEqual(nextSlots(r), ['suggestion:1', 'compliment:1', 'change:1', 'question:1']);
  r = put(r, 'suggestion:1');
  r = put(r, 'compliment:1');
  assert.equal(nextSlots(r).includes('theme:1'), false);
  r = put(r, 'change:1');
  assert.deepEqual(nextSlots(r), ['suggestion:2', 'compliment:2', 'change:2', 'question:1', 'theme:1']);
  assert.match(checkNode(r, { slot: 'theme:1', text: 'x' }, []), /one of do_more, question, change/);
  r = put(r, 'theme:1', { tag: 'change' });
  assert.ok(nextSlots(r).includes('why:1') && nextSlots(r).includes('how:1'));
  assert.equal(nextSlots(r).includes('action:1'), false);
  assert.match(checkNode(r, { slot: 'how:1', text: 'x' }, []), /Link each how to the theme/);
  r = link(put(r, 'how:1'), 'how:1', 'theme:1', 'of');
  r = link(put(r, 'why:1'), 'why:1', 'theme:1', 'of');
  assert.equal(canEdge(r, idOf(r, 'why:1'), idOf(r, 'theme:1'), 'of'), false, 'a satellite hangs from one theme');
  assert.deepEqual(satellitesOf(r, idOf(r, 'theme:1')).how.map((x) => x.slot), ['how:1']);
  assert.equal(isComplete(r), false);
  assert.ok(nextSlots(r).includes('action:1'));
  r = put(r, 'action:1');
  assert.equal(isComplete(r), true);
});

test('feedback matrix: at most four of each satellite per theme', () => {
  let r = newRun('feedback_matrix', 'r');
  for (const slot of ['suggestion:1', 'compliment:1', 'change:1']) r = put(r, slot);
  r = put(r, 'theme:1', { tag: 'do_more' });
  for (let i = 1; i <= 4; i += 1) r = link(put(r, `how:${i}`), `how:${i}`, 'theme:1', 'of');
  r = put(r, 'how:5');
  assert.equal(canEdge(r, idOf(r, 'how:5'), idOf(r, 'theme:1'), 'of'), false);
});
