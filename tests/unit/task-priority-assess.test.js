import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDueDatePriorityFloor,
  assessOpenTaskPriorities,
  assessTaskPriority,
  priorityBandFromDays
} from '../../netlify/functions/_shared/task-priority-assess.mjs';

const from = new Date('2026-09-21T12:00:00+10:00');

function task(partial) {
  return {
    id: 'task_x',
    title: 'Task',
    status: 'open',
    bucket: 'active',
    priority: 'medium',
    due_date: null,
    waiting_status: null,
    ...partial
  };
}

test('priority bands follow how soon the task needs attention', () => {
  assert.equal(priorityBandFromDays(-1).priority, 'urgent');
  assert.equal(priorityBandFromDays(0).priority, 'urgent');
  assert.equal(priorityBandFromDays(2).priority, 'high');
  assert.equal(priorityBandFromDays(7).priority, 'medium');
  assert.equal(priorityBandFromDays(14).priority, 'low');
});

test('full assess raises overdue medium work and can lower far-out urgent work', () => {
  const overdue = assessTaskPriority(
    task({ id: 'overdue', title: 'Mark essays', due_date: '2026-09-18' }),
    from,
    'full'
  );
  assert.equal(overdue.suggested, 'urgent');
  assert.equal(overdue.changed, true);

  const later = assessTaskPriority(
    task({ id: 'later', title: 'Plan 2027', priority: 'urgent', due_date: '2026-12-01' }),
    from,
    'full'
  );
  assert.equal(later.suggested, 'low');
  assert.equal(later.changed, true);

  const floorKeeps = assessTaskPriority(
    task({ id: 'later', title: 'Plan 2027', priority: 'urgent', due_date: '2026-12-01' }),
    from,
    'floor'
  );
  assert.equal(floorKeeps.changed, false);
});

test('due-date writes raise the floor unless priority was explicit', () => {
  const raised = applyDueDatePriorityFloor(
    task({ priority: 'low', due_date: '2026-09-21' }),
    { due_date: '2026-09-21' },
    from
  );
  assert.equal(raised.priority, 'urgent');
  const kept = applyDueDatePriorityFloor(
    task({ priority: 'low', due_date: '2026-09-21' }),
    { due_date: '2026-09-21', priority: 'low' },
    from
  );
  assert.equal(kept.priority, 'low');
});

test('batch assess skips parked and closed rows', () => {
  const result = assessOpenTaskPriorities(
    [
      task({ id: 'open', title: 'Today', due_date: '2026-09-21', priority: 'medium' }),
      task({ id: 'done', title: 'Done', status: 'done', due_date: '2026-09-21', priority: 'low' }),
      task({ id: 'park', title: 'Someday', bucket: 'someday', due_date: '2026-09-21' })
    ],
    from,
    'floor'
  );
  assert.deepEqual(result.changes.map(row => row.id), ['open']);
  assert.equal(result.skipped, 2);
});
