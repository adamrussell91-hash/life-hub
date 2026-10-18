import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotionClient } from '../../netlify/functions/_shared/notion-client.mjs';

test('every request carries an abort signal, and a hung request is retried then fails', async () => {
  let calls = 0;
  const hung = (_url, init) => {
    calls += 1;
    assert.ok(init.signal instanceof AbortSignal);
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  };
  const client = createNotionClient({ token: 't', fetchImpl: hung, sleep: async () => {}, requestTimeoutMs: 5, maxRetries: 2 });
  await assert.rejects(() => client.getPage('p'), (e) => e.name === 'TimeoutError');
  assert.equal(calls, 3);
});

test('a timeout on the first try is retried and can succeed', async () => {
  let calls = 0;
  const flaky = (_url, init) => {
    calls += 1;
    if (calls === 1) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    return Promise.resolve(new Response(JSON.stringify({ id: 'p' }), { status: 200 }));
  };
  const client = createNotionClient({ token: 't', fetchImpl: flaky, sleep: async () => {}, requestTimeoutMs: 5 });
  assert.deepEqual(await client.getPage('p'), { id: 'p' });
  assert.equal(calls, 2);
});
