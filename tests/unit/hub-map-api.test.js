import test from 'node:test';
import assert from 'node:assert/strict';
import { createHubMapApi } from '../../apps/life/js/app/hub-map-api.js';

const ok = data => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
const failure = (status, code) => new Response(JSON.stringify({ ok: false, error: { code } }), { status });

test('load returns the map, sha and seeded flag', async () => {
  const api = createHubMapApi(async url => {
    assert.equal(url, '/api/hub-map');
    return ok({ map: { version: 1 }, sha: 'abc', seeded: false });
  });
  assert.deepEqual(await api.load(), { map: { version: 1 }, sha: 'abc', seeded: false });
});

test('load treats a missing sha as null', async () => {
  const api = createHubMapApi(async () => ok({ map: { version: 1 }, seeded: true }));
  assert.deepEqual(await api.load(), { map: { version: 1 }, sha: null, seeded: true });
});

test('save posts the map with its base sha', async () => {
  let seen;
  const api = createHubMapApi(async (url, options) => {
    seen = { url, options };
    return ok({ map: { version: 1 }, sha: 'new' });
  });
  const result = await api.save({ version: 1 }, 'old');
  assert.equal(seen.options.method, 'POST');
  assert.deepEqual(JSON.parse(seen.options.body), { map: { version: 1 }, baseSha: 'old' });
  assert.equal(result.sha, 'new');
  await api.save({ version: 1 }, undefined);
  assert.equal(JSON.parse(seen.options.body).baseSha, null);
});

test('errors carry the HTTP status and server code', async () => {
  const api = createHubMapApi(async () => failure(409, 'write_conflict'));
  await assert.rejects(api.save({}, null), error => error.status === 409 && error.code === 'write_conflict');
  const broken = createHubMapApi(async () => new Response('<html>', { status: 502 }));
  await assert.rejects(broken.load(), error => error.status === 502 && error.code === 'request_failed');
});
