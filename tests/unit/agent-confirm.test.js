/**
 * Tranche E — Confirm reloads the persisted turn. Not a browser Confirm suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeAction, runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { createMemoryTurnStore } from '../../netlify/functions/_shared/agent-turn-store.mjs';
import {
  bindPendingToTurn,
  continueAfterConfirm,
  resumeConfirmedTurn
} from '../../netlify/functions/_shared/agent-confirm.mjs';

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

test('post-confirm continuation invokes the model once after a successful write', async () => {
  const persist = createMemoryTurnStore();
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'Move that task to tomorrow.',
    today: TODAY,
    now: NOW,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-20' }] },
    persist
  });
  const proposed = proposeAction(kernel, { intent: 'reschedule_task', snapshot: { tasks: 1 }, idempotencyKey: 'cont-1' });
  persist.save(kernel);
  const resumed = resumeConfirmedTurn({
    persist,
    turnId: kernel.id,
    actionId: proposed.action.id,
    decision: 'confirm',
    currentRecords: { tasks: 1 }
  });
  let invocations = 0;
  const first = await continueAfterConfirm({
    persist,
    state: resumed.state,
    writeOk: true,
    writeResult: { ok: true, results: [{ path: 'tasks:task:1', mode: 'overwrite', ok: true }] },
    reloaded: { tasks: { count: 1 } },
    invokeModel: async () => {
      invocations += 1;
      return { text: 'Done. It is now scheduled for tomorrow.' };
    }
  });
  assert.equal(first.invoked, true);
  assert.match(first.text, /tomorrow/i);
  assert.equal(first.state.continuation.status, 'done');
  const saved = persist.load(kernel.id);
  assert.equal(saved.stores, undefined);
  assert.equal(saved.continuation.status, 'done');
  assert.equal(invocations, 1);

  const second = await continueAfterConfirm({
    persist,
    state: persist.load(kernel.id),
    writeOk: true,
    writeResult: { ok: true, results: [{ path: 'tasks:task:1', mode: 'overwrite', ok: true }] },
    duplicate: true,
    invokeModel: async () => {
      invocations += 1;
      return { text: 'Done again.' };
    }
  });
  assert.equal(second.invoked, false);
  assert.equal(second.reason, 'duplicate');
  assert.equal(invocations, 1);
  assert.notEqual(second.state.continuation.text, 'Done again.');
});

test('failed write does not generate a success continuation', async () => {
  const persist = createMemoryTurnStore();
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'Move that task to tomorrow.',
    today: TODAY,
    now: NOW,
    stores: { tasks: [{ id: '1', title: 'Mark essays', status: 'open' }] },
    persist
  });
  persist.save(kernel);
  let invocations = 0;
  const result = await continueAfterConfirm({
    persist,
    state: persist.load(kernel.id),
    writeOk: false,
    writeResult: { ok: false, results: [] },
    invokeModel: async () => {
      invocations += 1;
      return { text: 'Done. It is now scheduled for tomorrow.' };
    }
  });
  assert.equal(result.invoked, false);
  assert.equal(result.reason, 'write_failed');
  assert.equal(invocations, 0);
  assert.doesNotMatch(result.state.continuation?.text ?? '', /done/i);
});

test('reject does not execute and does not continue', async () => {
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
  let invocations = 0;
  const continued = await continueAfterConfirm({
    persist,
    state: result.state,
    writeOk: false,
    rejected: true,
    invokeModel: async () => {
      invocations += 1;
      return { text: 'Rejected continuation' };
    }
  });
  assert.equal(continued.invoked, false);
  assert.equal(continued.reason, 'rejected');
  assert.equal(invocations, 0);
});
