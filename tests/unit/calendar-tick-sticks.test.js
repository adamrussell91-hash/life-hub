import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubSourceLoader } from '../../packages/design-kit/js/calendar/load-hub-sources.js';

// Netlify Blobs reads are eventually consistent: the refetch straight after a tick can
// return the task as it was before the save. The calendar must keep the saved copy.

const OLD = { id: 'task_a', title: 'Hand in report', domain: 'teaching', due_date: '2026-11-10', status: 'open', updated_at: '2026-11-10T00:00:00.000Z' };
const SAVED = { ...OLD, status: 'done', completed_at: '2026-11-10T01:00:00.000Z', updated_at: '2026-11-10T01:00:00.000Z' };

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => ({ ok: status < 400, data }), clone() { return this; } });

function fakeApi(listed) {
  return async (path, init = {}) => {
    if (path.startsWith('/api/tasks?id=') && init.method === 'PATCH') return json(SAVED);
    if (path === '/api/tasks') return json({ tasks: [listed()] });
    if (path === '/api/work-blocks') return json({ work_blocks: [] });
    return json({});
  };
}

const taskStatus = (loader) => loader.getEvents().find(event => event.record?.id === 'task_a')?.record?.status;

test('a tick stays ticked when the next read is stale', async () => {
  const loader = createHubSourceLoader({ apiFetch: fakeApi(() => OLD) });
  await loader.loadAll();
  assert.equal(taskStatus(loader), 'open');
  await loader.apiFetch('/api/tasks?id=task_a', { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
  // The repaint while the refetch is in flight already shows it done.
  assert.equal(taskStatus(loader), 'done');
  await loader.loadAll();
  assert.equal(taskStatus(loader), 'done');
});

test('a newer server copy wins over the remembered write', async () => {
  const NEWER = { ...OLD, status: 'open', completed_at: null, updated_at: '2026-11-10T02:00:00.000Z' };
  let listed = OLD;
  const loader = createHubSourceLoader({ apiFetch: fakeApi(() => listed) });
  await loader.apiFetch('/api/tasks?id=task_a', { method: 'PATCH', body: '{}' });
  listed = NEWER;
  await loader.loadAll();
  assert.equal(taskStatus(loader), 'open');
});
