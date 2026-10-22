// tests/unit/review-waits-for-learning.test.js
// Review now waits for the learning question (Adam, 22 Oct): while a session's learning question
// is pending, start_review is refused with a 409, so the person's next message is never read as
// the learning answer by accident. Shared by every tool on the engine; shown on Gear Shifter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoachTurn, moveOn, setReviewTask, startReview } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { committed, deps, reply } from './gear-shifter-test-helpers.mjs';

/** Committed with a check-back task, then moved on to wait for Review, the learning question asked. */
function asked() {
  let s = setReviewTask(committed(), { taskId: 'task-check', due: '2026-11-05' }, deps);
  s = moveOn(s, deps);
  return applyCoachTurn(s, validateCoachTurn({ verdict: 'clarify', message: 'What did you learn about how you get things done?' }).value, deps);
}

test('Review now is refused while the learning question waits for an answer', () => {
  const s = asked();
  assert.equal(s.reviewState.status, 'waiting');
  assert.ok(s.pendingLearning);
  assert.throws(() => startReview(s, {}, deps), (error) => error.status === 409 && error.code === 'action_not_allowed' && /Answer the coach’s question first/.test(error.message));
});

test('once the learning question is answered, Review now starts the review', () => {
  const s = reply(asked(), { verdict: 'clarify', learning: 'A dated check-back keeps me honest.' }, 'A dated check-back keeps me honest.');
  assert.equal(s.pendingLearning, null);
  const started = startReview(s, {}, deps);
  assert.equal(started.reviewState.status, 'reviewing');
  assert.equal(started.turns.at(-1).text, 'Let\'s review how it went.');
});
