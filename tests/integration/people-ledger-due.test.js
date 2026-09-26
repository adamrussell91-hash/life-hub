import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleLedgerHandler } from '../../netlify/functions/people-ledger.mjs';

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
  url = 'https://api.adam-russell.com/api/people/ledger',
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

async function callHandler(handler, method, path) {
  const url = path.startsWith('http') ? path : `https://api.adam-russell.com${path}`;
  return handler(request({ method, url }));
}

test('GET ?due_from&due_to returns the repository range', async () => {
  const calls = [];
  const handler = createPeopleLedgerHandler({
    env,
    now: () => Date.parse('2026-08-01T00:00:00Z'),
    getContentStore: async () => memoryStore(),
    professionalStore: {},
    ledgerRepo: {
      async listDueBetween(from, to) {
        calls.push([from, to]);
        return [{ id: 'ledger_x', text: 'Email Denielle', due: '2026-09-23', direction: 'you_owe' }];
      }
    }
  });
  const response = await callHandler(handler, 'GET', '/api/people/ledger?due_from=2026-09-21&due_to=2026-09-27');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [['2026-09-21', '2026-09-27']]);
  assert.equal(body.data.items[0].text, 'Email Denielle');
});

test('GET with a bad range is a 400 invalid_due_range', async () => {
  const handler = createPeopleLedgerHandler({
    env,
    now: () => Date.parse('2026-08-01T00:00:00Z'),
    getContentStore: async () => memoryStore(),
    professionalStore: {},
    ledgerRepo: { async listDueBetween() { return []; } }
  });
  const response = await callHandler(handler, 'GET', '/api/people/ledger?due_from=2026-09-27&due_to=2026-09-21');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_due_range');
});
