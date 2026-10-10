import test from 'node:test';
import assert from 'node:assert/strict';
import * as calendar from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { createHubSourceLoader } from '../../packages/design-kit/js/calendar/load-hub-sources.js';
import { riverItemsFromHubEvents } from '../../packages/design-kit/js/calendar/term-river.js';

test('project calendar spans follow creation, milestone and linked task dates, preserving subtype', () => {
  const projects = [{ id: 'p', title: 'Camp', type: 'excursion', status: 'active',
    created_at: '2026-07-01T00:00:00Z', current_end_date: '2026-09-10', baseline_end_date: '2026-09-20',
    key_dates: { payment_due: '2026-06-20' }, milestones: [{ due_date: '2026-06-15' }] }];
  const events = calendar.tasksEventsFromProjects(projects, [
    { id: 't', parent_project_id: 'p', due_date: '2026-06-10' },
    { id: 'other', parent_project_id: 'other', due_date: '2026-05-01' },
    { id: 'dead', parent_project_id: 'p', due_date: '2026-01-01', deleted_at: '2026-02-01' }
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].path, 'projects:p');
  assert.deepEqual([events[0].record.type, events[0].record.project_type,
    events[0].record.start_date, events[0].record.end_date], ['project', 'excursion', '2026-06-10', '2026-09-10']);
  assert.equal(events[0].record.created_at, projects[0].created_at);
});

test('project spans use baseline then latest dated milestone/task; missing and invalid dates stay absent', () => {
  const events = calendar.tasksEventsFromProjects([
    { id: 'baseline', current_end_date: 'invalid', baseline_end_date: '2026-09-12', created_at: '2026-10-01' },
    { id: 'derived', milestones: [{ due_date: '2026-09-09' }, { due_date: '2026-09-11' }] },
    { id: 'undated', created_at: '2026-09-01' },
    { id: 'impossible', current_end_date: '2026-02-30' },
    { id: 'bad-month', current_end_date: '2026-13-01' }
  ], [{ parent_project_id: 'derived', due_date: '2026-09-10' }]);
  assert.deepEqual(events.map(({ record: r }) => [r.id, r.start_date, r.end_date]), [
    ['baseline', '2026-09-12', '2026-09-12'], ['derived', '2026-09-09', '2026-09-11']
  ]);
});

test('project creation timestamps use the local calendar day while date-only origins stay fixed', () => {
  const previousZone = process.env.TZ;
  process.env.TZ = 'Australia/Sydney';
  try {
    const events = calendar.tasksEventsFromProjects([
      { id: 'instant', created_at: '2026-09-01T20:00:00Z', current_end_date: '2026-09-10' },
      { id: 'offset', created_at: '2026-09-01T23:00:00-04:00', current_end_date: '2026-09-10' },
      { id: 'day', created_at: '2026-09-01', current_end_date: '2026-09-10' }
    ]);
    assert.deepEqual(events.map(e => [e.record.id, e.record.start_date]), [
      ['instant', '2026-09-02'], ['offset', '2026-09-02'], ['day', '2026-09-01']
    ]);
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test('terminal, archived and every canonical deleted project state cannot enter the calendar', () => {
  const rows = ['completed', 'done', 'archived', 'archived_dead', 'dead', 'trashed', 'trash', 'deleted', 'removed']
    .map(status => ({ id: status, status, current_end_date: '2026-09-10' }));
  rows.push({ id: 'stamp', status: 'active', deleted_at: '2026-01-01', current_end_date: '2026-09-10' });
  rows.push({ id: 'bucket', bucket: 'trash', current_end_date: '2026-09-10' });
  assert.deepEqual(calendar.tasksEventsFromProjects(rows, []), []);
});

test('task events preserve project, goal and step relationships for calendar grouping', () => {
  const task = { id: 't', due_date: '2026-09-10', parent_project_id: 'p', parent_task_id: 'parent',
    parent_goal_id: 'goal', linked_project_ids: ['p2'], linked_goal_ids: ['g2'] };
  const { record } = calendar.tasksEventsFromTasks([task])[0];
  for (const field of ['parent_project_id', 'parent_task_id', 'parent_goal_id', 'linked_project_ids', 'linked_goal_ids']) {
    assert.deepEqual(record[field], task[field], field);
  }
});

test('live Tasks source fetches projects and joins their actual task dates', async () => {
  const calls = [];
  const apiFetch = async path => {
    calls.push(path);
    const data = path === '/api/projects' ? { projects: [{ id: 'p', title: 'Live project', status: 'active' }] }
      : path === '/api/tasks' ? { tasks: [{ id: 't', parent_project_id: 'p', due_date: '2026-09-15' }] } : {};
    return { ok: true, json: async () => ({ ok: true, data }) };
  };
  const loader = createHubSourceLoader({ apiFetch });
  await loader.retry('tasks');
  assert.ok(calls.includes('/api/projects'));
  assert.equal(loader.getStatuses().tasks.status, 'live');
  const project = loader.getEvents().find(e => e.record.type === 'project');
  assert.equal(project.record.end_date, '2026-09-15');
  assert.equal(loader.getEvents().find(e => e.record.type === 'task').record.parent_project_id, 'p');
  const items = riverItemsFromHubEvents(loader.getEvents());
  assert.deepEqual(items.map(item => [item.id, item.shape]), [['t', 'diamond'], ['p', 'bar']]);
  assert.equal(items.find(item => item.id === 't').parent_project_id, 'p');
  assert.equal(items.find(item => item.id === 'p').to, '2026-09-15');
});

test('an unavailable optional projects API retains the live task source', async () => {
  const loader = createHubSourceLoader({ apiFetch: async path => {
    if (path === '/api/projects') throw new Error('older deployment');
    return { ok: true, json: async () => ({ ok: true, data: path === '/api/tasks'
      ? { tasks: [{ id: 't', due_date: '2026-09-15' }] } : {} }) };
  } });
  await loader.retry('tasks');
  assert.equal(loader.getStatuses().tasks.status, 'live');
  assert.deepEqual(loader.getEvents().map(e => e.record.id), ['t']);
});
