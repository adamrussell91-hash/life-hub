import assert from 'node:assert/strict';
import test from 'node:test';

// The module listens on window at import, so stand up the browser bits first.
const calls = { fetches: [], reloads: 0 };
let handler = null;
const store = new Map();
globalThis.window = { addEventListener: (type, fn) => type === 'vite:preloadError' && (handler = fn) };
globalThis.location = { href: 'https://hub.example/teaching/lessons/l1', reload: () => (calls.reloads += 1) };
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
globalThis.fetch = (href, init) => {
  calls.fetches.push({ href, cache: init?.cache });
  return Promise.resolve({ ok: true });
};
const { refreshPageCache } = await import('../../packages/stale-chunk-reload.js');
const settle = () => new Promise((r) => setTimeout(r, 10));

test('a missing chunk fetches the page past the cache, then reloads', async () => {
  handler();
  await settle();
  assert.deepEqual(calls.fetches, [{ href: 'https://hub.example/teaching/lessons/l1', cache: 'reload' }]);
  assert.equal(calls.reloads, 1);
});

test('a second failure within a minute is left to surface', async () => {
  handler();
  await settle();
  assert.equal(calls.reloads, 1);
});

test('a failed or slow refetch still lets the reload happen', async () => {
  await refreshPageCache(() => Promise.reject(new Error('offline')), 'https://hub.example/');
  const started = Date.now();
  await refreshPageCache(() => new Promise(() => {}), 'https://hub.example/', 20);
  assert.ok(Date.now() - started < 1000);
});
