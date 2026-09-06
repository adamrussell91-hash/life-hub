import test from 'node:test';
import assert from 'node:assert/strict';
import { createTasksApi } from '../../apps/life/js/app/tasks-api.js';

test('listTasks unwraps the tasks array from a successful payload', async () => {
  const tasks = [{ id: 't1', title: 'Mark essays' }];
  const api = createTasksApi(async url => {
    assert.equal(url, '/api/tasks');
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { tasks } })
    };
  });
  assert.deepEqual(await api.listTasks(), tasks);
});

test('loadStressFlags unwraps flags from GET /api/stress-flags', async () => {
  const flags = [{
    id: 'sf_1',
    pattern_description: 'Two excursions overlap this fortnight',
    created_at: '2026-07-01T10:00:00Z'
  }];
  const api = createTasksApi(async url => {
    assert.equal(url, '/api/stress-flags');
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { flags } })
    };
  });
  assert.deepEqual(await api.loadStressFlags(), flags);
});

test('loadStressFlags throws on 404 so the controller can skip the source', async () => {
  const api = createTasksApi(async () => ({
    ok: false,
    status: 404,
    json: async () => ({ ok: false, error: { code: 'not_found' } })
  }));
  await assert.rejects(
    () => api.loadStressFlags(),
    error => error.status === 404 && /Tasks request failed/.test(error.message)
  );
});
