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

test('createTask POSTs title and domain to /api/tasks and returns the created task', async () => {
  const created = { id: 't9', title: 'Pack for the trip', domain: 'life', status: 'open' };
  const api = createTasksApi(async (url, init) => {
    assert.equal(url, '/api/tasks');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { title: 'Pack for the trip', domain: 'life' });
    return {
      ok: true,
      status: 201,
      json: async () => ({ ok: true, data: created })
    };
  });
  assert.deepEqual(await api.createTask({ title: 'Pack for the trip' }), created);
});

test('createTask surfaces validation errors', async () => {
  const api = createTasksApi(async () => ({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, error: { code: 'validation_error' } })
  }));
  await assert.rejects(
    () => api.createTask({ title: '' }),
    error => error.status === 400 && error.code === 'validation_error'
  );
});

test('setTaskStatus PATCHes the task id in the query string', async () => {
  const updated = { id: 't9', status: 'done' };
  const api = createTasksApi(async (url, init) => {
    assert.equal(url, '/api/tasks?id=t9');
    assert.equal(init.method, 'PATCH');
    assert.deepEqual(JSON.parse(init.body), { status: 'done' });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: updated })
    };
  });
  assert.deepEqual(await api.setTaskStatus('t9', 'done'), updated);
});
