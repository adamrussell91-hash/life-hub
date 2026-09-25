// tests/unit/ghost-task-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTaskStep, ghostTaskId } from '../../netlify/functions/calendar-ghosts.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';

function memoryTasks(seed = {}) {
  const data = new Map([[TASKS_INDEX_KEY, []], ...Object.entries(seed)]);
  return {
    data,
    async get(key, options) {
      const value = data.get(key);
      if (value == null) return null;
      return options?.type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); }
  };
}

test('split steps get stable suffixed ids, step fields, and retries are no-ops', async () => {
  const store = memoryTasks();
  const step = {
    target: 'tasks', method: 'POST', suffix: 's1',
    body: { title: 'Pull examples', kind: 'step', parent_task_id: 't1', step_order: 1, status: 'open', parent_goal_id: 'g1', domain: 'other' }
  };
  await applyTaskStep(store, step, { ghostId: 'goal-g1-split-t1' });
  await applyTaskStep(store, step, { ghostId: 'goal-g1-split-t1' });
  const id = `${ghostTaskId('goal-g1-split-t1')}-s1`;
  const saved = store.data.get(taskKey(id));
  assert.equal(saved.kind, 'step');
  assert.equal(saved.parent_task_id, 't1');
  assert.equal(saved.parent_goal_id, 'g1');
  assert.equal(saved.step_order, 1);
  assert.equal(saved.domain, 'other');
  assert.deepEqual(store.data.get(TASKS_INDEX_KEY), [id]);
});

test('a goals PATCH step merges, normalises and stamps the goal', async () => {
  const store = memoryTasks({
    'goals/g1': { schema_version: 1, id: 'g1', title: 'HA', rest_weeks: ['2026-10-19'], created_at: 'a', updated_at: '2026-09-01T00:00:00.000Z' }
  });
  await applyTaskStep(store, { target: 'tasks', collection: 'goals', method: 'PATCH', id: 'g1', body: { rest_weeks: ['2026-10-19', '2026-11-16', 'bad'] } });
  const goal = store.data.get('goals/g1');
  assert.deepEqual(goal.rest_weeks, ['2026-10-19', '2026-11-16']);
  assert.notEqual(goal.updated_at, '2026-09-01T00:00:00.000Z');
  await assert.rejects(
    () => applyTaskStep(store, { target: 'tasks', collection: 'goals', method: 'PATCH', id: 'missing', body: {} }),
    error => error.code === 'goal_not_found'
  );
});
