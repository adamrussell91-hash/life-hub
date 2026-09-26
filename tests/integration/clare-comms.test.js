import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createClareCommsHandler } from '../../netlify/functions/clare-comms.mjs';

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
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, value);
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
  url = 'https://api.adam-russell.com/api/clare/comms',
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

function send(handler, method, path, body) {
  return handler(request({ url: `https://api.adam-russell.com${path}`, method, body }));
}

const context = {
  title: 'Declan J. · essay feedback', kind: 'comm', when: 'Wed 14/10/26 11:50',
  people: [{ ref: 'shared:person:p_declan', name: 'Declan J.', role: 'with' }], previous: [], open_promises: [], notes: 'x'
};

function makeHandler(deps = {}) {
  return createClareCommsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    ...deps
  });
}

test('brief action returns Clare’s brief', async () => {
  const handler = makeHandler({ env: { ...env, ANTHROPIC_API_KEY: 'k' }, complete: async () => ({ points: [{ text: 'One', source: 'comm 1' }], owed_line: null }) });
  const body = await (await send(handler, 'POST', '/api/clare/comms', { action: 'brief', context })).json();
  assert.equal(body.data.points[0].text, 'One');
});

test('propose_next queues a book_comm ghost, never writes the comm', async () => {
  const queued = [];
  const handler = makeHandler({
    env: { ...env, ANTHROPIC_API_KEY: 'k' },
    complete: async () => ({ date: '2026-10-21', time: '11:50', duration_min: 15, reason: 'Weekly.' }),
    enqueue: async (entry) => { queued.push(entry); return { added: true, id: entry.id }; },
    clareNow: () => new Date('2026-10-14T01:10:00.000Z')
  });
  const res = await send(handler, 'POST', '/api/clare/comms', {
    action: 'propose_next',
    context: { ...context, time_zone: 'Australia/Sydney', purpose_tag: 'feedback', thread_ref: 'professional:thread:thread_00000000-0000-4000-8000-000000000001' }
  });
  assert.equal(res.status, 200);
  assert.equal(queued[0].kind, 'book_comm');
  assert.equal(queued[0].agent, 'clare');
  assert.deepEqual(queued[0].person_refs, ['shared:person:p_declan']);
});

test('no API key is a clear 503', async () => {
  const handler = makeHandler({ env });
  const res = await send(handler, 'POST', '/api/clare/comms', { action: 'brief', context });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'clare_unconfigured');
});

test('unknown action is a 400', async () => {
  const handler = makeHandler({ env: { ...env, ANTHROPIC_API_KEY: 'k' }, complete: async () => ({}) });
  assert.equal((await send(handler, 'POST', '/api/clare/comms', { action: 'send_email', context })).status, 400);
});
