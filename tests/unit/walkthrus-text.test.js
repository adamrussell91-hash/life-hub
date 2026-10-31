import test from 'node:test';
import assert from 'node:assert/strict';
import { WALKTHRUS_MAX_AGE_MS, loadWalkthrus, privateWalkthruPath, refreshWalkthrus } from '../../netlify/functions/_shared/walkthrus-text.mjs';
import { createWalkthrusTextHandler } from '../../netlify/functions/walkthrus-text.mjs';

// Filler only. The real text lives in the private data repo.
const setFile = (set) => ({
  set,
  techniques: [{ id: `w${set}-sample-technique`, steps: [1, 2, 3, 4, 5].map((n) => ({ n, label: `Step ${n}`, text: `Lorem ipsum ${n}` })), footer: 'Lorem' }],
  frameworks: [{ id: `w${set}-fw-sample`, summary: 'Lorem ipsum' }]
});

function storeFixture() {
  const data = new Map();
  return { data, async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; }, async setJSON(k, v) { data.set(k, structuredClone(v)); return { modified: true }; } };
}
const env = { GITHUB_TOKEN: 'test-token' };
function fakeFetch(fn = (n) => (n === 1 ? setFile(1) : null)) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const n = Number(/set-(\d+)\.json/.exec(url)[1]);
    const body = fn(n);
    return body ? new Response(JSON.stringify(body)) : new Response('nope', { status: 404 });
  };
  return { calls, impl };
}

test('first load copies set 1 from the private repo, later loads use the copy, refresh replaces it', async () => {
  const store = storeFixture();
  const { calls, impl } = fakeFetch();
  const text = await loadWalkthrus(store, { env, fetchImpl: impl });
  assert.equal(text.sets.length, 1);
  assert.ok(calls[0].includes(privateWalkthruPath(1)));
  const before = calls.length;
  await loadWalkthrus(store, { env, fetchImpl: impl });
  assert.equal(calls.length, before);
  await refreshWalkthrus(store, { env, fetchImpl: impl });
  assert.ok(calls.length > before);
});

test('a later set is picked up when its file exists', async () => {
  const text = await loadWalkthrus(storeFixture(), { env, fetchImpl: fakeFetch((n) => (n <= 2 ? setFile(n) : null)).impl });
  assert.deepEqual(text.sets.map((s) => s.set), [1, 2]);
});

test('a malformed or missing set 1 is reported, not invented', async () => {
  await assert.rejects(loadWalkthrus(storeFixture(), { env, fetchImpl: fakeFetch(() => ({ set: 'x' })).impl }), { status: 500 });
  await assert.rejects(loadWalkthrus(storeFixture(), { env, fetchImpl: fakeFetch(() => null).impl }), { status: 404 });
  await assert.rejects(loadWalkthrus(storeFixture(), { env: {}, fetchImpl: fakeFetch().impl }), { status: 503 });
});

test('the endpoint is teacher only, never cached, and refreshes on request', async () => {
  const store = storeFixture();
  const gateEnv = { ...env, LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const make = (valid) => createWalkthrusTextHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid }), fetchImpl: fakeFetch().impl });
  assert.equal((await make(false)(new Request('https://example.test/api/walkthrus-text'))).status, 401);
  const ok = await make(true)(new Request('https://example.test/api/walkthrus-text'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await ok.json()).data.text.sets.length, 1);
  const refresh = await make(true)(new Request('https://example.test/api/walkthrus-text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) }));
  assert.equal(refresh.status, 200);
  assert.equal((await make(true)(new Request('https://example.test/api/walkthrus-text', { method: 'POST', body: JSON.stringify({ action: 'nope' }) }))).status, 400);
});

test('a copy older than the max age is fetched again, and kept if the repo is unreachable', async () => {
  const store = storeFixture();
  const { calls, impl } = fakeFetch();
  await loadWalkthrus(store, { env, fetchImpl: impl });
  const before = calls.length;
  const later = Date.now() + WALKTHRUS_MAX_AGE_MS + 1000;
  await loadWalkthrus(store, { env, fetchImpl: impl, now: later });
  assert.ok(calls.length > before);
  const down = async () => { throw new Error('offline'); };
  const text = await loadWalkthrus(store, { env, fetchImpl: down, now: later + WALKTHRUS_MAX_AGE_MS * 2 });
  assert.equal(text.sets.length, 1);
});
