/**
 * Unit tests: deadline runway + waiting follow-up ghost proposers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeDeadlineRunwayGhosts } from '../../netlify/functions/_shared/deadline-runway-ghosts.mjs';
import {
  proposeWaitingFollowUpGhosts,
  selectAgedWaitingTasks
} from '../../netlify/functions/_shared/waiting-follow-up-ghosts.mjs';
import { alreadyQueued, appendPendingCalendarGhost } from '../../netlify/functions/calendar-ghosts.mjs';
import { mergeTask } from '../../netlify/functions/tasks.mjs';

const TODAY = '2026-09-29';
const NOW = '2026-09-29T06:45:00+10:00';

function task(partial) {
  return {
    id: 'task_x',
    title: 'Mark pack',
    status: 'open',
    estimated_duration: 90,
    due_date: '2026-09-30',
    waiting_on: null,
    waiting_since: null,
    ...partial
  };
}

test('deadline runway proposes protect_block for due-tomorrow open task', () => {
  const ghosts = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_due', due_date: '2026-09-30' })],
    today: TODAY,
    nowIso: NOW
  });
  assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0].id, 'clare-runway-task_due');
  assert.equal(ghosts[0].kind, 'protect_block');
  assert.equal(ghosts[0].taskId, 'task_due');
  assert.equal(ghosts[0].agent, 'clare');
});

test('deadline runway skips clear risk with due in 2 days and light load', () => {
  const ghosts = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_light', due_date: '2026-10-01', estimated_duration: 20 })],
    today: TODAY,
    nowIso: NOW
  });
  // 20 min over 3 days of coarse capacity → clear and daysLeft>1 → skip
  assert.equal(ghosts.length, 0);
});

test('deadline runway de-dupes via stable id in alreadyQueued', () => {
  const [ghost] = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_due', due_date: '2026-09-30' })],
    today: TODAY,
    nowIso: NOW
  });
  const first = appendPendingCalendarGhost('[]', ghost);
  assert.equal(first.added, true);
  const second = appendPendingCalendarGhost(first.content, ghost);
  assert.equal(second.added, false);
  assert.equal(alreadyQueued(first.list, ghost), true);
});

test('waiting follow-up uses waiting_since age only', () => {
  const aged = selectAgedWaitingTasks(
    [
      task({
        id: 'w1',
        waiting_on: 'Sam',
        waiting_since: '2026-09-20T00:00:00.000Z',
        updated_at: '2026-09-29T00:00:00.000Z'
      }),
      task({
        id: 'w2',
        waiting_on: 'Sam',
        waiting_since: '2026-09-27T00:00:00.000Z'
      }),
      task({
        id: 'w3',
        waiting_on: 'Sam',
        waiting_since: null,
        updated_at: '2026-09-01T00:00:00.000Z'
      })
    ],
    TODAY,
    5
  );
  assert.deepEqual(aged.map((row) => row.task.id), ['w1']);
  const ghosts = proposeWaitingFollowUpGhosts({
    tasks: aged.map((row) => row.task),
    today: TODAY,
    nowIso: NOW
  });
  // selectAged already filtered; proposeWaiting recomputes from tasks list
  const fromAll = proposeWaitingFollowUpGhosts({
    tasks: [
      task({ id: 'w1', waiting_on: 'Sam', waiting_since: '2026-09-20T00:00:00.000Z' }),
      task({ id: 'w3', waiting_on: 'Sam', waiting_since: null })
    ],
    today: TODAY,
    nowIso: NOW
  });
  assert.equal(fromAll.length, 1);
  assert.equal(fromAll[0].id, 'clare-waiting-w1');
  assert.equal(fromAll[0].kind, 'draft_message');
  assert.ok(ghosts);
});

test('mergeTask stamps waiting_since when waiting_on first set', () => {
  const existing = {
    id: 't1',
    title: 'Wait',
    status: 'open',
    waiting_on: null,
    waiting_since: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    schema_version: 1
  };
  const next = mergeTask(existing, { waiting_on: 'Alex' });
  assert.equal(next.waiting_on, 'Alex');
  assert.ok(typeof next.waiting_since === 'string' && next.waiting_since.length > 0);
  const cleared = mergeTask(next, { waiting_on: '' });
  assert.equal(cleared.waiting_on, '');
  assert.equal(cleared.waiting_since, null);
});
