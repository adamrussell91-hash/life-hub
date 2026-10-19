import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareerFuturesHandler } from '../../netlify/functions/career-futures.mjs';
import { createCareerStonesHandler } from '../../netlify/functions/career-stones.mjs';

function setup(createHandler, path) {
  const records = new Map();
  const store = {
    get: async key => records.get(key) ?? null,
    setJSON: async (key, value) => records.set(key, structuredClone(value)),
    list: async ({ prefix }) => ({ blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) })
  };
  const handler = createHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'test-only', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    getContentStore: async () => store,
    now: () => '2026-10-19T12:00:00.000Z'
  });
  const request = (method, body, id = '') => new Request(
    'https://life-hub.adam-russell.com' + path + (id ? '?id=' + id : ''),
    { method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { handler, request, records };
}

test('future POST keeps the entered title and PATCH updates it', async () => {
  const { handler, request } = setup(createCareerFuturesHandler, '/api/career-futures');
  const response = await handler(request('POST', { title: 'Director of Innovation',
    criteria: [{ text: 'Leads change', order: 0, source: 'ad' }] }));
  assert.equal(response.status, 201, await response.clone().text());
  const { data: { future } } = await response.json();
  assert.equal(future.title, 'Director of Innovation');
  assert.equal(future.criteria[0].text, 'Leads change');
  const patched = await handler(request('PATCH', { title: 'Head of Innovation' }, future.id));
  assert.equal(patched.status, 200, await patched.clone().text());
  assert.equal((await patched.json()).data.future.title, 'Head of Innovation');
});

test('future POST rejects malformed JSON without writing', async () => {
  const { handler, request, records } = setup(createCareerFuturesHandler, '/api/career-futures');
  const response = await handler(request('POST', '{'));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_json');
  assert.equal(records.size, 0);
});

test('stone POST keeps the entered label and PATCH updates it', async () => {
  const { handler, request } = setup(createCareerStonesHandler, '/api/career-stones');
  const response = await handler(request('POST', { label: 'Lead a staff PL session' }));
  assert.equal(response.status, 201, await response.clone().text());
  const { data: { stone } } = await response.json();
  assert.equal(stone.label, 'Lead a staff PL session');
  const patched = await handler(request('PATCH', { label: 'Lead two PL sessions' }, stone.id));
  assert.equal(patched.status, 200, await patched.clone().text());
  assert.equal((await patched.json()).data.stone.label, 'Lead two PL sessions');
});
