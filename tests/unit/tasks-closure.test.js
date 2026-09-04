import assert from 'node:assert/strict';
import test from 'node:test';
import { computeProjectVariance, deriveProjectEndDate } from '../../netlify/functions/_shared/tasks-closure.mjs';

test('deriveProjectEndDate uses the latest live task due date', () => {
  const project = { id: 'p1', baseline_end_date: '2026-07-15', current_end_date: '2026-07-20' };
  const tasks = [
    { parent_project_id: 'p1', status: 'done', due_date: '2026-08-01' },
    { parent_project_id: 'p1', status: 'dead', due_date: '2026-09-01' },
    { parent_project_id: 'other', status: 'open', due_date: '2026-10-01' }
  ];
  assert.equal(deriveProjectEndDate(project, tasks), '2026-08-01');
});

test('computeProjectVariance reports slip vs baseline when every task is done', () => {
  const project = {
    id: 'proj_close_demo',
    status: 'active',
    baseline_end_date: '2026-07-15',
    current_end_date: '2026-07-20'
  };
  const tasks = [
    { parent_project_id: 'proj_close_demo', status: 'done', due_date: '2026-08-01' }
  ];
  const variance = computeProjectVariance(project, tasks, new Date('2026-08-16T12:00:00'));
  assert.equal(variance.all_tasks_done, true);
  assert.equal(variance.ready_to_close, true);
  assert.equal(variance.slip_days, 17);
  assert.equal(variance.derived_end_date, '2026-08-01');
  assert.equal(variance.open_task_count, 0);
  assert.equal(variance.done_task_count, 1);
});
