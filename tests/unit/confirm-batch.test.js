import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBatchableScheduleProposal,
  mergeIntoScheduleBatch,
  mergeProposalWrites,
  buildBatchScheduleIntent,
  collectGhostIdsFromWrites,
  ghostIdFromConfirmPath
} from '../../netlify/functions/_shared/confirm-batch.mjs';
import {
  addPendingAction,
  patchPendingAction,
  findPendingActionById,
  isPendingActionExecutable
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

function schedulePatch(taskId, dueTime) {
  return {
    path: `tasks:task:${taskId}`,
    mode: 'append',
    content: JSON.stringify({ due_date: '2026-10-01', due_time: dueTime }),
    diff: `update ${taskId}: due_date, due_time`
  };
}

function ghostConfirm(id, title) {
  return {
    path: `data/os/calendar-ghost-confirm/${id}.md`,
    mode: 'create',
    content: `# ghost ${id}`,
    diff: `Confirm calendar proposal: protect_block — ${title}`
  };
}

test('schedule task patches and ghost confirms are batchable', () => {
  assert.equal(
    isBatchableScheduleProposal({
      writes: [schedulePatch('task_a', '16:00'), schedulePatch('task_b', '16:20')]
    }),
    true
  );
  assert.equal(
    isBatchableScheduleProposal({
      writes: [ghostConfirm('clare-protect-1', 'Set 1'), schedulePatch('task_a', '16:00')]
    }),
    true
  );
});

test('create-task and note patches are not batchable schedule moves', () => {
  assert.equal(
    isBatchableScheduleProposal({
      writes: [{
        path: 'tasks:task:task_new',
        mode: 'create',
        content: JSON.stringify({ id: 'task_new', title: 'New' }),
        diff: 'new task'
      }]
    }),
    false
  );
  assert.equal(
    isBatchableScheduleProposal({
      writes: [{
        path: 'tasks:task:task_a',
        mode: 'append',
        content: JSON.stringify({ title: 'Rename', due_time: '16:00' }),
        diff: 'update title'
      }]
    }),
    false
  );
});

test('merge grows one proposal with shared intent', () => {
  const first = {
    proposal: {
      intent: 'Update task task_a',
      writes: [schedulePatch('task_a', '16:00')],
      surfaces: ['confirm_card']
    },
    calendarGhostId: null
  };
  const second = {
    intent: 'Update task task_b',
    writes: [schedulePatch('task_b', '16:20')],
    surfaces: ['confirm_card', 'governance_log']
  };
  const merged = mergeIntoScheduleBatch(first, second, {});
  assert.equal(merged.proposal.writes.length, 2);
  assert.match(merged.proposal.intent, /Move 2 tasks together/);
  assert.match(merged.proposal.intent, /one Confirm applies all 2/);
});

test('merge collects multiple calendar ghost ids', () => {
  const first = {
    proposal: {
      intent: 'Confirm calendar proposal: protect_block — A',
      writes: [ghostConfirm('ghost-a', 'A')],
      surfaces: ['confirm_card', 'calendar']
    },
    calendarGhostId: 'ghost-a'
  };
  const next = {
    intent: 'Confirm calendar proposal: protect_block — B',
    writes: [ghostConfirm('ghost-b', 'B')],
    surfaces: ['confirm_card', 'calendar']
  };
  const merged = mergeIntoScheduleBatch(first, next, { calendarGhostId: 'ghost-b' });
  assert.deepEqual(merged.calendarGhostIds, ['ghost-a', 'ghost-b']);
  assert.equal(merged.calendarGhostId, 'ghost-a');
  assert.equal(collectGhostIdsFromWrites(merged.proposal.writes).length, 2);
  assert.equal(ghostIdFromConfirmPath(ghostConfirm('ghost-a', 'A').path), 'ghost-a');
});

test('patchPendingAction grows a live Confirm without a second id', () => {
  let queue = [];
  const entry = {
    id: 'act_batch1',
    slug: 'clare',
    proposal: {
      intent: 'Update task task_a',
      writes: [schedulePatch('task_a', '16:00')]
    },
    bases: {}
  };
  queue = addPendingAction(queue, entry);
  const merged = mergeIntoScheduleBatch(entry, {
    intent: 'Update task task_b',
    writes: [schedulePatch('task_b', '16:20')]
  });
  queue = patchPendingAction(queue, 'act_batch1', {
    proposal: merged.proposal,
    calendarGhostIds: merged.calendarGhostIds
  });
  const found = findPendingActionById(queue, 'act_batch1');
  assert.equal(isPendingActionExecutable(found), true);
  assert.equal(found.proposal.writes.length, 2);
  assert.equal(queue.filter((row) => isPendingActionExecutable(row)).length, 1);
});

test('mergeProposalWrites replaces same path', () => {
  const writes = mergeProposalWrites(
    [schedulePatch('task_a', '16:00')],
    [schedulePatch('task_a', '17:00'), schedulePatch('task_b', '17:20')]
  );
  assert.equal(writes.length, 2);
  assert.match(writes.find((w) => w.path.includes('task_a')).content, /17:00/);
});

test('buildBatchScheduleIntent names mixed task + calendar stacks', () => {
  const intent = buildBatchScheduleIntent([
    schedulePatch('task_a', '16:00'),
    ghostConfirm('g1', 'Life block'),
    ghostConfirm('g2', 'Other')
  ]);
  assert.equal(intent, 'Move 1 task + 2 calendar blocks together — one Confirm applies all 3');
});
