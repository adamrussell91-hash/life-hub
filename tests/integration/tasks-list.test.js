import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createTasksHandler } from '../../netlify/functions/tasks.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  origin,
  url = 'https://api.adam-russell.com/api/tasks',
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('Tasks list requires the Life session and does not load Teaching Blobs', async () => {
  let teachingLoads = 0;
  const handler = createTasksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      teachingLoads += 1;
      throw new Error('Tasks store must be injected');
    }
  });
  const response = await handler(request({ cookie: false }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(teachingLoads, 0);
});

test('Tasks list is 503 when the Tasks store is unbound', async () => {
  const handler = createTasksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      throw new Error('MissingBlobsBinding');
    }
  });
  const response = await handler(request({ origin: 'https://tasks-hub.adam-russell.com' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'tasks_blobs_unbound');
});

test('Tasks list returns stored records the remounted SPA can render', async () => {
  const stored = {
    id: 'task-1',
    title: 'Mark 12 English',
    status: 'open',
    description: 'Year 12 scripts',
    domain: 'teaching',
    parent_project_id: 'proj_1',
    tags: ['marking'],
    depends_on: [],
    attachments: [],
    kind: 'task',
    bucket: 'active'
  };
  const handler = createTasksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore({
      'tasks/_index': ['task-1'],
      'tasks/task-1': stored
    })
  });
  const response = await handler(request({ origin: 'https://tasks-hub.adam-russell.com' }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.tasks, [stored]);
});

test('Tasks list fills missing depends_on and tags so Board and Graph can iterate them', async () => {
  const stored = {
    id: 'task-dirty',
    title: 'Breakfast'
  };
  const handler = createTasksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore({
      'tasks/_index': ['task-dirty'],
      'tasks/task-dirty': stored
    })
  });
  const response = await handler(request({ origin: 'https://life-hub.adam-russell.com' }));
  assert.equal(response.status, 200);
  const [task] = (await response.json()).data.tasks;
  assert.deepEqual(task.depends_on, []);
  assert.deepEqual(task.tags, []);
  assert.deepEqual(task.attachments, []);
});

test('Tasks POST/PATCH/DELETE use the Life session and keep the index', async () => {
  const store = memoryStore({
    'tasks/_index': ['task-1'],
    'tasks/task-1': { id: 'task-1', title: 'Mark 12 English', status: 'open' }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const created = await createTasksHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://tasks-hub.adam-russell.com',
      body: { title: 'Book florist', domain: 'wedding' }
    })
  );
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.match(createdBody.data.id, /^task_/);
  assert.equal(createdBody.data.domain, 'wedding');
  assert.deepEqual(await store.get('tasks/_index', { type: 'json' }), ['task-1', createdBody.data.id]);

  const patched = await createTasksHandler(deps)(
    request({
      method: 'PATCH',
      url: `https://api.adam-russell.com/api/tasks?id=${createdBody.data.id}`,
      body: { status: 'done' }
    })
  );
  assert.equal(patched.status, 200);
  const patchedBody = await patched.json();
  assert.equal(patchedBody.data.status, 'done');
  assert.equal(typeof patchedBody.data.completed_at, 'string');

  const removed = await createTasksHandler(deps)(
    request({
      method: 'DELETE',
      url: `https://api.adam-russell.com/api/tasks?id=${createdBody.data.id}`
    })
  );
  assert.equal(removed.status, 200);
  assert.equal(await store.get(`tasks/${createdBody.data.id}`, { type: 'json' }), null);
  assert.deepEqual(await store.get('tasks/_index', { type: 'json' }), ['task-1']);

  const anon = await createTasksHandler(deps)(
    request({ cookie: false, method: 'POST', body: { title: 'Nope', domain: 'life' } })
  );
  assert.equal(anon.status, 401);
});

test('Tasks POST rejects a missing domain', async () => {
  const handler = createTasksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore()
  });
  const response = await handler(request({ method: 'POST', body: { title: 'Untitled' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'validation_error');
});
