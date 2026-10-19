// tests/unit/problem-solver-review.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanOverdue, reviewLive, reviewStart, SNAPSHOT_STATUSES, waitingForReview } from '../../packages/problem-solver/review.mjs';

const base = (extra = {}) => ({
  status: 'active', phase: 'implement', model: { id: 'seven_step' }, reviewTaskId: 'task-r', reviewProposal: null,
  reviewState: null, detour: null, ...extra
});
const waiting = { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null };

test('snapshot statuses are the six the coach reads', () => {
  assert.deepEqual([...SNAPSHOT_STATUSES], ['open', 'in_progress', 'deferred', 'done', 'dead', 'unknown']);
});

test('cleanOverdue trims, drops blanks and non-strings, de-duplicates, cuts long titles and caps at 10', () => {
  assert.deepEqual(cleanOverdue([' Ask for swaps ', 'Ask for swaps', '', '  ', 3, null, 'Post the rota']), ['Ask for swaps', 'Post the rota']);
  assert.equal(cleanOverdue(['x'.repeat(200)])[0].length, 120);
  assert.equal(cleanOverdue(Array.from({ length: 15 }, (_, i) => `Task ${i}`)).length, 10);
  assert.deepEqual(cleanOverdue(undefined), []);
});

test('reviewLive: a review task, or a proposal proposed or confirmed', () => {
  assert.equal(reviewLive(base()), true);
  assert.equal(reviewLive(base({ reviewTaskId: null, reviewProposal: { status: 'proposed' } })), true);
  assert.equal(reviewLive(base({ reviewTaskId: null, reviewProposal: { status: 'confirmed' } })), true);
  assert.equal(reviewLive(base({ reviewTaskId: null, reviewProposal: { status: 'dismissed' } })), false);
  assert.equal(reviewLive(base({ reviewTaskId: null })), false);
});

test('waitingForReview only in an Improve plan step', () => {
  assert.equal(waitingForReview(base({ phase: 'improve', reviewState: waiting })), true);
  assert.equal(waitingForReview(base({ phase: 'evaluate', model: { id: 'polya' }, reviewState: waiting })), true);
  assert.equal(waitingForReview(base({ phase: 'document', reviewState: waiting })), false);
  assert.equal(waitingForReview(base({ phase: 'improve', reviewState: { ...waiting, status: 'reviewing' } })), false);
});

test('reviewStart: move, start, reopen', () => {
  assert.equal(reviewStart(base()), 'move');
  assert.equal(reviewStart(base({ model: { id: 'polya' } })), 'move');
  assert.equal(reviewStart(base({ phase: 'improve', reviewState: waiting })), 'start');
  assert.equal(reviewStart(base({ phase: 'document' })), 'reopen');
  assert.equal(reviewStart(base({ phase: 'finished', status: 'finished' })), 'reopen');
});

test('reviewStart: null when it cannot start', () => {
  assert.equal(reviewStart(base({ status: 'archived' })), null);
  assert.equal(reviewStart(base({ model: null, phase: 'frame' })), null);
  assert.equal(reviewStart(base({ reviewTaskId: null })), null);
  assert.equal(reviewStart(base({ phase: 'improve', reviewState: { ...waiting, status: 'reviewing' } })), null);
  assert.equal(reviewStart(base({ phase: 'document', reviewState: { ...waiting, status: 'done' } })), null);
  assert.equal(reviewStart(base({ phase: 'define', detour: { from: 'improve', to: 'define' } })), null);
  assert.equal(reviewStart(base({ phase: 'decide' })), null);
});
