import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createThreadsHandler } from '../../netlify/functions/threads.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  {
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  },
  SECRET
).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/threads',
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

async function send(handler, method, path, body) {
  const url = path.startsWith('http') ? path : `https://api.adam-russell.com${path}`;
  return handler(request({ method, url, body }));
}

function threadsHandler(store) {
  return createThreadsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store,
    threadNow: () => '2026-09-26T00:00:00.000Z'
  });
}

test('POST creates, GET lists and reads, PATCH updates goals', async () => {
  const store = memoryStore();
  const handler = threadsHandler(store);
  const created = await send(handler, 'POST', '/api/threads', { kind: 'case', title: 'Fletcher W. · case management' });
  assert.equal(created.status, 200);
  const thread = (await created.json()).data.thread;

  const list = await (await send(handler, 'GET', '/api/threads')).json();
  assert.equal(list.data.threads.length, 1);

  const one = await (await send(handler, 'GET', `/api/threads?id=${thread.id}`)).json();
  assert.equal(one.data.thread.kind, 'case');

  const patched = await (await send(handler, 'PATCH', `/api/threads?id=${thread.id}`, {
    goals: [{ id: 'g1', text: 'Maths C → B', progress: 62 }]
  })).json();
  assert.equal(patched.data.thread.goals[0].progress, 62);
});
