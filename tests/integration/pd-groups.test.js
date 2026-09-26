import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPdGroupsHandler } from '../../netlify/functions/pd-groups.mjs';

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
  url = 'https://api.adam-russell.com/api/pd-groups',
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

function pdGroupsHandler(store) {
  return createPdGroupsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store,
    pdGroupNow: () => '2026-09-26T00:00:00.000Z'
  });
}

test('POST, GET and PATCH a PD group', async () => {
  const store = memoryStore();
  const handler = pdGroupsHandler(store);
  const created = await (await send(handler, 'POST', '/api/pd-groups', { shape: 'series', title: 'Warlight', provider: 'Warlight' })).json();
  const id = created.data.group.id;
  assert.equal((await (await send(handler, 'GET', '/api/pd-groups')).json()).data.groups.length, 1);
  assert.equal((await (await send(handler, 'GET', `/api/pd-groups?id=${id}`)).json()).data.group.shape, 'series');
  const patched = await (await send(handler, 'PATCH', `/api/pd-groups?id=${id}`, { shape: 'program' })).json();
  assert.equal(patched.data.group.shape, 'program');
});
