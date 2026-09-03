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
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({ cookie = true, origin, url = 'https://api.adam-russell.com/api/tasks' } = {}) {
  return new Request(url, {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {})
    }
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

test('Tasks list returns titles from tasks-hub-content', async () => {
  const handler = createTasksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore({
      'tasks/_index': ['task-1'],
      'tasks/task-1': { id: 'task-1', title: 'Mark 12 English', status: 'open' }
    })
  });
  const response = await handler(request({ origin: 'https://tasks-hub.adam-russell.com' }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.tasks, [{
    id: 'task-1',
    title: 'Mark 12 English',
    status: 'open'
  }]);
});
