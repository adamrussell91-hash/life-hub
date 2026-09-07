/**
 * Tranche E — Confirm reloads the persisted turn. Not a browser Confirm suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeAction, runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { createMemoryTurnStore } from '../../netlify/functions/_shared/agent-turn-store.mjs';
import { bindPendingToTurn, resumeConfirmedTurn } from '../../netlify/functions/_shared/agent-confirm.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

test('confirm on a new store instance executes the action once and resumes', () => {
  const persist = createMemoryTurnStore();
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10' }] },
    persist
  });
  const proposed = proposeAction(kernel, {
    intent: 'create_task',
    snapshot: { tasks: 1 },
    idempotencyKey: 'write-1'
  });
  persist.save(kernel);
  const pending = bindPendingToTurn({ id: proposed.action.id, slug: 'clare' }, kernel.id);

  const snap = persist.exportJson();
  const restarted = createMemoryTurnStore();
  restarted.importJson(snap);
  const first = resumeConfirmedTurn({
    persist: restarted,
    turnId: pending.turnId,
    actionId: proposed.action.id,
    decision: 'confirm',
    currentRecords: { tasks: 1 }
  });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.state.actions[0].status, 'executed');

  const second = resumeConfirmedTurn({
    persist: restarted,
    turnId: pending.turnId,
    actionId: proposed.action.id,
    decision: 'confirm',
    currentRecords: { tasks: 1 }
  });
  assert.equal(second.duplicate, true);
});

test('stale snapshot invalidates the proposal', () => {
  const persist = createMemoryTurnStore();
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open' }] },
    persist
  });
  const proposed = proposeAction(kernel, {
    intent: 'update_task',
    snapshot: { title: 'Mark essays' },
    idempotencyKey: 'stale-1'
  });
  persist.save(kernel);
  const result = resumeConfirmedTurn({
    persist,
    turnId: kernel.id,
    actionId: proposed.action.id,
    decision: 'confirm',
    currentRecords: { title: 'Mark essays — done' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'stale_proposal');
});

test('reject does not execute', () => {
  const persist = createMemoryTurnStore();
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open' }] },
    persist
  });
  const proposed = proposeAction(kernel, { intent: 'create_task', idempotencyKey: 'rej-1' });
  persist.save(kernel);
  const result = resumeConfirmedTurn({
    persist,
    turnId: kernel.id,
    actionId: proposed.action.id,
    decision: 'reject'
  });
  assert.equal(result.rejected, true);
  assert.equal(result.state.actions[0].status, 'rejected');
});
