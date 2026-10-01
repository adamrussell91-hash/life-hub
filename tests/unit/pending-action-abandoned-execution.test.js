/**
 * Stuck Confirm cards: an abandoned pending→executing fence must become
 * dismissable / recoverable so sticky tray cards can clear.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PENDING_ACTION_EXECUTING_ABANDON_MS,
  isAbandonedPendingExecution,
  getPendingActionStatus,
  isPendingActionExecutable,
  markPendingActionExecuting,
  markPendingActionPending,
  markPendingActionDismissed
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

const NOW = Date.parse('2026-10-01T04:00:00.000Z');

test('fresh executing fence is not abandoned', () => {
  const entry = {
    id: 'act_fresh',
    status: 'executing',
    executionStartedAt: new Date(NOW - 30_000).toISOString()
  };
  assert.equal(isAbandonedPendingExecution(entry, NOW), false);
  assert.equal(isPendingActionExecutable(entry), false);
});

test('executing fence older than TTL is abandoned (Adam Genevieve stuck-card case)', () => {
  // Live symptom: act_1b28edfa03c3 left executing at 02:33 while Confirm/Discard kept failing.
  const entry = {
    id: 'act_1b28edfa03c3',
    status: 'executing',
    executionStartedAt: '2026-10-01T02:33:50.342Z',
    proposal: {
      intent: 'Reschedule Genevieve Quoyle accreditation set 2 of 5 to today 4:20pm (20 min)'
    }
  };
  assert.equal(NOW - Date.parse(entry.executionStartedAt) > PENDING_ACTION_EXECUTING_ABANDON_MS, true);
  assert.equal(isAbandonedPendingExecution(entry, NOW), true);
  assert.equal(getPendingActionStatus(entry), 'executing');
  assert.equal(isPendingActionExecutable(entry), false);
});

test('executing without executionStartedAt counts as abandoned (corrupt fence)', () => {
  assert.equal(
    isAbandonedPendingExecution({ id: 'act_x', status: 'executing' }, NOW),
    true
  );
});

test('pending and terminal statuses are never abandoned-executing', () => {
  assert.equal(isAbandonedPendingExecution({ status: 'pending' }, NOW), false);
  assert.equal(isAbandonedPendingExecution({ status: 'consumed' }, NOW), false);
  assert.equal(isAbandonedPendingExecution({ status: 'dismissed' }, NOW), false);
});

test('recover abandoned fence → pending → dismissible', () => {
  let queue = [{
    id: 'act_stuck',
    status: 'executing',
    executionStartedAt: new Date(NOW - PENDING_ACTION_EXECUTING_ABANDON_MS - 1).toISOString(),
    proposal: { intent: 'x', writes: [] }
  }];
  assert.equal(isAbandonedPendingExecution(queue[0], NOW), true);
  queue = markPendingActionPending(queue, 'act_stuck', { extra: { executionRecovered: true } });
  assert.equal(isPendingActionExecutable(queue[0]), true);
  queue = markPendingActionDismissed(queue, 'act_stuck', { dismissedAt: new Date(NOW).toISOString() });
  assert.equal(getPendingActionStatus(queue[0]), 'dismissed');
});

test('markPendingActionExecuting then abandon threshold', () => {
  let queue = [{ id: 'act_1', status: 'pending', proposal: { intent: 'x', writes: [] } }];
  const started = new Date(NOW - PENDING_ACTION_EXECUTING_ABANDON_MS - 5_000).toISOString();
  queue = markPendingActionExecuting(queue, 'act_1', { executionStartedAt: started });
  assert.equal(isAbandonedPendingExecution(queue[0], NOW), true);
});
