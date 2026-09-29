/**
 * Unit tests: deadline runway + waiting follow-up ghost proposers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeDeadlineRunwayGhosts,
  pickProtectSlot,
  minutesScheduledForTask,
  SCHOOL_DAY_END
} from '../../netlify/functions/_shared/deadline-runway-ghosts.mjs';
import {
  proposeWaitingFollowUpGhosts,
  selectAgedWaitingTasks
} from '../../netlify/functions/_shared/waiting-follow-up-ghosts.mjs';
import { alreadyQueued, appendPendingCalendarGhost } from '../../netlify/functions/calendar-ghosts.mjs';
import { mergeTask } from '../../netlify/functions/tasks.mjs';
import {
  formatDailySweepMissedLine,
  isDailySweepMissed
} from '../../apps/life/js/core/governance-log.js';

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
  assert.equal(ghosts[0].id, 'clare-runway-task_due-2026-09-30');
  assert.equal(ghosts[0].kind, 'protect_block');
  assert.equal(ghosts[0].taskId, 'task_due');
  assert.equal(ghosts[0].agent, 'clare');
  assert.ok(ghosts[0].start >= SCHOOL_DAY_END, `expected after-school start, got ${ghosts[0].start}`);
});

test('deadline runway skips when work blocks already cover remaining time', () => {
  const ghosts = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_covered', due_date: '2026-09-30', estimated_duration: 60 })],
    today: TODAY,
    nowIso: NOW,
    workBlocks: [{
      id: 'wb1',
      task_id: 'task_covered',
      date: '2026-09-29',
      start_time: '16:00',
      end_time: '17:00',
      duration_minutes: 60
    }]
  });
  assert.equal(ghosts.length, 0);
  assert.equal(minutesScheduledForTask([{
    task_id: 'task_covered', date: '2026-09-29', duration_minutes: 60
  }], 'task_covered', TODAY, '2026-09-30'), 60);
});

test('pickProtectSlot avoids lesson busy time and prefers after school', () => {
  const slot = pickProtectSlot({
    durationMinutes: 60,
    busy: [{ start: 15 * 60 + 30, end: 16 * 60 + 30 }]
  });
  assert.ok(slot);
  assert.ok(slot.start >= '16:30');
});

test('deadline runway skips clear risk with due in 2 days and light load', () => {
  const ghosts = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_light', due_date: '2026-10-01', estimated_duration: 20 })],
    today: TODAY,
    nowIso: NOW
  });
  assert.equal(ghosts.length, 0);
});

test('deadline runway re-proposes when due date changes after dismiss', () => {
  const [ghost] = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_due', due_date: '2026-09-30', estimated_duration: 180 })],
    today: TODAY,
    nowIso: NOW
  });
  assert.ok(ghost);
  const dismissed = { ...ghost, status: 'dismissed' };
  const first = appendPendingCalendarGhost('[]', dismissed);
  assert.equal(first.added, true);

  // Same morning, due slipped a day — new id must not match the dismissed entry.
  const moved = proposeDeadlineRunwayGhosts({
    tasks: [task({ id: 'task_due', due_date: '2026-10-01', estimated_duration: 180 })],
    today: '2026-09-30',
    nowIso: '2026-09-30T06:45:00+10:00'
  });
  assert.ok(moved.length >= 1);
  assert.equal(moved[0].id, 'clare-runway-task_due-2026-10-01');
  assert.equal(alreadyQueued(first.list, moved[0]), false);
});

test('waiting follow-up uses waiting_since age only', () => {
  const fromAll = proposeWaitingFollowUpGhosts({
    tasks: [
      task({ id: 'w1', waiting_on: 'Sam', waiting_since: '2026-09-20T00:00:00.000Z' }),
      task({ id: 'w3', waiting_on: 'Sam', waiting_since: null })
    ],
    today: TODAY,
    nowIso: NOW
  });
  assert.equal(fromAll.length, 1);
  assert.equal(fromAll[0].id, 'clare-waiting-w1-2026-09');
  assert.equal(fromAll[0].kind, 'draft_message');
  assert.equal(selectAgedWaitingTasks([
    task({ id: 'w1', waiting_on: 'Sam', waiting_since: '2026-09-20T00:00:00.000Z' })
  ], TODAY, 5).length, 1);
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

test('Daily Sweep missed line is silent when governance log is not loaded', () => {
  assert.equal(formatDailySweepMissedLine(null, TODAY), null);
  assert.equal(formatDailySweepMissedLine(undefined, TODAY), null);
  assert.equal(isDailySweepMissed(null, TODAY), false);
  assert.match(formatDailySweepMissedLine('# Governance Log\n', TODAY), /no sweep in the log/);
});
