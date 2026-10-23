import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorialGroupsHandler } from '../../netlify/functions/tutorial-groups.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const deps = (extra = {}) => ({
  verifySessionToken: () => ({ valid: true }),
  env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y', ANTHROPIC_API_KEY: 'k' },
  ...extra
});
const req = (method, body, raw) =>
  new Request('https://api.adam-russell.com/api/tutorial-groups', {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'umbrella_session=ok' },
    ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(body) })
  });
const call = async (handler, r) => {
  const res = await handler(r, {});
  return { status: res.status, json: await res.json() };
};

test('401 when not signed in', async () => {
  const h = createTutorialGroupsHandler(deps({ verifySessionToken: () => ({ valid: false }) }));
  const out = await call(h, req('POST', { brief: 'S1' }));
  assert.equal(out.status, 401);
});

test('405 for GET', async () => {
  const out = await call(createTutorialGroupsHandler(deps()), req('GET'));
  assert.equal(out.status, 405);
});

test('400 for bad JSON', async () => {
  const out = await call(createTutorialGroupsHandler(deps()), req('POST', null, '{nope'));
  assert.equal(out.status, 400);
  assert.equal(out.json.ok, false);
});

test('400 names_in_brief envelope', async () => {
  const out = await call(createTutorialGroupsHandler(deps()), req('POST', { brief: 'st_ann got it wrong' }));
  assert.equal(out.status, 400);
  assert.equal(out.json.error.code, 'names_in_brief');
});

test('injected model result comes back as { ok, data: { text } }', async () => {
  const h = createTutorialGroupsHandler(deps({ askForGroups: async ({ brief }) => ({ text: `got ${brief}` }) }));
  const out = await call(h, req('POST', { brief: 'S1' }));
  assert.equal(out.status, 200);
  assert.deepEqual(out.json, { ok: true, data: { text: 'got S1' } });
});
