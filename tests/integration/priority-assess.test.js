import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPriorityAssessHandler } from '../../netlify/functions/priority-assess.mjs';
import { createTasksHandler } from '../../netlify/functions/tasks.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-09-21T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  const listed = new Set(Object.keys(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
      listed.add(key);
    },
    async delete(key) {
      map.delete(key);
      listed.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...listed].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  url = 'https://api.adam-russell.com/api/priority-assess',
  method = 'POST',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      origin: 'https://tasks-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('priority assess previews and applies due-date urgency writes', async () => {
  const store = memoryStore({
    'tasks/_index': ['task-stale', 'task-ok'],
    'tasks/task-stale': {
      id: 'task-stale',
      title: 'Mark essays',
      status: 'open',
      bucket: 'active',
      priority: 'low',
      due_date: '2020-01-01',
      kind: 'task'
    },
    'tasks/task-ok': {
      id: 'task-ok',
      title: 'Already urgent',
      status: 'open',
      bucket: 'active',
      priority: 'urgent',
      due_date: '2020-01-01',
      kind: 'task'
    }
  });
  const deps = { env, getContentStore: async () => store };
  const handler = createPriorityAssessHandler(deps);

  const preview = await handler(request({ body: { mode: 'full', apply: false } }));
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.ok, true);
  assert.equal(previewBody.data.applied, false);
  assert.deepEqual(previewBody.data.changes.map(row => row.id), ['task-stale']);
  assert.equal(previewBody.data.changes[0].suggested, 'urgent');
  assert.equal((await store.get('tasks/task-stale', { type: 'json' })).priority, 'low');

  const applied = await handler(request({ body: { mode: 'full', apply: true } }));
  assert.equal(applied.status, 200);
  const appliedBody = await applied.json();
  assert.equal(appliedBody.data.applied, true);
  assert.equal(appliedBody.data.tasks[0].priority, 'urgent');
  assert.equal((await store.get('tasks/task-stale', { type: 'json' })).priority, 'urgent');
});

test('task PATCH raises priority when the due date moves closer', async () => {
  const store = memoryStore({
    'tasks/_index': ['task-1'],
    'tasks/task-1': {
      id: 'task-1',
      title: 'Call Kate',
      status: 'open',
      bucket: 'active',
      priority: 'low',
      due_date: '2099-01-01',
      kind: 'task',
      domain: 'life'
    }
  });
  const handler = createTasksHandler({ env, getContentStore: async () => store });
  const patched = await handler(request({
    url: 'https://api.adam-russell.com/api/tasks?id=task-1',
    method: 'PATCH',
    body: { due_date: '2020-01-01' }
  }));
  assert.equal(patched.status, 200);
  const body = await patched.json();
  assert.equal(body.data.priority, 'urgent');
});

test('priority assess requires the Life session', async () => {
  const handler = createPriorityAssessHandler({
    env,
    getContentStore: async () => memoryStore()
  });
  const response = await handler(request({ cookie: false, body: { apply: false } }));
  assert.equal(response.status, 401);
});
