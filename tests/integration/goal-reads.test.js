// tests/integration/goal-reads.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGoalReadsHandler, goalReadKey, staleReason } from '../../netlify/functions/goal-reads.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-11-04T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key, { type } = {}) { return map.has(key) ? (type === 'json' ? structuredClone(map.get(key)) : map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) { return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

function request(url, { method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function seed() {
  return memoryStore({
    'meta/hub_prefs': { school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] },
    'goals/_index': ['g1'],
    'goals/g1': { schema_version: 1, id: 'g1', title: 'HA', sphere: 'professional', status: 'active', created_at: 'a', updated_at: '2026-10-20T00:00:00.000Z' },
    'tasks/t1': { id: 't1', title: 'Write up', parent_goal_id: 'g1', status: 'open', kind: 'task', bucket: 'active', domain: 'other', due_date: '2026-11-06', updated_at: '2026-10-01T00:00:00.000Z' }
  });
}

test('staleReason covers first, daily, changed and fresh', () => {
  assert.equal(staleReason(null, { today: '2026-11-04', basis: 'x' }), 'first');
  assert.equal(staleReason({ read: { computed_on: '2026-11-03', basis_updated_at: 'b' } }, { today: '2026-11-04', basis: 'b' }), 'daily');
  assert.equal(staleReason({ read: { computed_on: '2026-11-04', basis_updated_at: '2026-01' } }, { today: '2026-11-04', basis: '2026-02' }), 'changed');
  assert.equal(staleReason({ read: { computed_on: '2026-11-04', basis_updated_at: '2026-02' } }, { today: '2026-11-04', basis: '2026-02' }), null);
});

test('GET computes, caches, and reuses; POST forces a manual rescan', async () => {
  const store = seed();
  const handler = createGoalReadsHandler({ env, now: () => Date.parse('2026-11-04T01:00:00Z'), getContentStore: async () => store });
  const first = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.equal(first.reason, 'first');
  assert.equal(first.read.goal_id, 'g1');
  assert.ok(first.read.ghosts.some(g => g.id === 'goal-g1-split-t1'));
  assert.equal(store.map.get(goalReadKey('g1')).read.computed_on, '2026-11-04');

  const again = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.equal(again.reason, 'first');

  const forced = (await (await handler(request('https://api.adam-russell.com/api/goal-reads', { method: 'POST', body: { goal_id: 'g1' } }))).json()).data;
  assert.equal(forced.reason, 'manual');

  const all = (await (await handler(request('https://api.adam-russell.com/api/goal-reads'))).json()).data;
  assert.deepEqual(all.reads.map(r => r.read.goal_id), ['g1']);

  const missing = await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=nope'));
  assert.equal(missing.status, 404);
});

test('dismissed ids stay out of a recomputed read', async () => {
  const store = seed();
  store.map.set(goalReadKey('g1'), { read: null, dismissed: ['goal-g1-split-t1'], reason: 'first' });
  const handler = createGoalReadsHandler({ env, now: () => Date.parse('2026-11-04T01:00:00Z'), getContentStore: async () => store });
  const body = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.equal(body.read.ghosts.some(g => g.id === 'goal-g1-split-t1'), false);
});
