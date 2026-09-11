import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDueBadge, topOpenTasks } from '../../apps/life/js/shell/task-glance.js';

test('topOpenTasks drops done tasks and sorts by due date, undated last', () => {
  const tasks = [
    { id: '1', status: 'open', due_date: '2026-09-20', created_at: '2026-09-01T00:00:00Z' },
    { id: '2', status: 'done', due_date: '2026-09-10' },
    { id: '3', status: 'open', created_at: '2026-09-05T00:00:00Z' },
    { id: '4', status: 'open', due_date: '2026-09-12', created_at: '2026-09-02T00:00:00Z' }
  ];
  assert.deepEqual(topOpenTasks(tasks).map(task => task.id), ['4', '1', '3']);
});

test('topOpenTasks respects the limit', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => ({ id: String(i), status: 'open', created_at: `2026-09-0${i + 1}T00:00:00Z` }));
  assert.equal(topOpenTasks(tasks, 3).length, 3);
});

test('topOpenTasks tolerates non-array input', () => {
  assert.deepEqual(topOpenTasks(null), []);
  assert.deepEqual(topOpenTasks(undefined), []);
});

test('formatDueBadge labels today and tomorrow relative to the given date', () => {
  assert.equal(formatDueBadge('2026-09-15', { today: '2026-09-15' }), 'Today');
  assert.equal(formatDueBadge('2026-09-16', { today: '2026-09-15' }), 'Tomorrow');
  assert.equal(formatDueBadge('2026-12-25', { today: '2026-09-15' }), '25/12');
  assert.equal(formatDueBadge('', { today: '2026-09-15' }), '');
});
