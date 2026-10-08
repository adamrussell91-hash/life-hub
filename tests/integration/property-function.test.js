import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPropertyHandler } from '../../netlify/functions/property.mjs';
import { PROPERTY_DATA_PATH } from '../../apps/life/js/app/property-model.js';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const RECORD_SHA = 'a'.repeat(40);
const UPDATED_SHA = 'b'.repeat(40);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-12-01'
};
const session = createSessionToken({
  now: Date.parse('2026-10-08T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request({ method = 'GET', body, cookie = `life_hub_session=${session}` } = {}) {
  return new Request('https://life.example/api/property', {
    method,
    headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function githubStub({ record } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    if (url.includes('/git/trees/')) {
      return Response.json({ truncated: false, tree: record === undefined ? [] : [{ path: PROPERTY_DATA_PATH, type: 'blob', sha: RECORD_SHA }] });
    }
    if (url.includes(`/git/blobs/${RECORD_SHA}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(typeof record === 'string' ? record : JSON.stringify(record), 'utf8').toString('base64') });
    }
    if (options.method === 'PUT') return Response.json({ content: { sha: UPDATED_SHA }, commit: { sha: COMMIT_SHA } });
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  return { calls, fetchImpl };
}

function handler(fetchImpl) {
  return createPropertyHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-10-08T01:00:00Z'), newId: () => 'abc123' });
}

const puts = calls => calls.filter(call => call.options.method === 'PUT').map(call => ({ url: call.url, body: JSON.parse(call.options.body) }));
const written = put => JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8'));

test('GET without a stored record returns an empty property and writes nothing', async () => {
  const { calls, fetchImpl } = githubStub();
  const response = await handler(fetchImpl)(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(payload.data.record.entries, []);
  assert.equal(puts(calls).length, 0);
});

test('GET returns the parsed record', async () => {
  const { fetchImpl } = githubStub({ record: { property: { name: '1 Test St' }, entries: [{ id: 'v', kind: 'valuation', date: '2026-01-01', amount: 900000 }] } });
  const payload = await (await handler(fetchImpl)(request())).json();
  assert.equal(payload.data.record.property.name, '1 Test St');
  assert.equal(payload.data.record.entries.length, 1);
});

test('POST add validates, stamps an id and writes with the current sha', async () => {
  const { calls, fetchImpl } = githubStub({ record: { entries: [] } });
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'add', entry: { kind: 'expense', date: '2026-10-01', amount: 180, category: 'repairs', note: 'Plumber' } } }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.entry.id, 'expense-abc123');
  assert.equal(payload.data.entry.recordedOn, '2026-10-08');
  const [put] = puts(calls);
  assert.ok(put.url.includes(encodeURIComponent(PROPERTY_DATA_PATH).replace(/%2F/g, '/')) || put.url.includes(PROPERTY_DATA_PATH));
  assert.equal(put.body.sha, RECORD_SHA);
  assert.match(put.body.message, /add expense/);
  assert.equal(written(put).entries[0].note, 'Plumber');
});

test('POST add on a fresh store creates the file without a sha', async () => {
  const { calls, fetchImpl } = githubStub();
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'add', entry: { kind: 'valuation', date: '2026-10-08', amount: 820000 } } }));
  assert.equal(response.status, 200);
  assert.equal(puts(calls)[0].body.sha, undefined);
});

test('POST with an invalid entry explains the problem and writes nothing', async () => {
  const { calls, fetchImpl } = githubStub({ record: { entries: [] } });
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'add', entry: { kind: 'statement', date: '2026-10-01' } } }));
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.match(payload.error.message, /gross rent/);
  assert.equal(puts(calls).length, 0);
});

test('POST remove deletes the entry outright', async () => {
  const { calls, fetchImpl } = githubStub({ record: { entries: [{ id: 'gone', kind: 'valuation', date: '2026-01-01', amount: 900000 }, { id: 'kept', kind: 'valuation', date: '2026-02-01', amount: 910000 }] } });
  const payload = await (await handler(fetchImpl)(request({ method: 'POST', body: { action: 'remove', id: 'gone' } }))).json();
  assert.deepEqual(payload.data.record.entries.map(entry => entry.id), ['kept']);
  assert.deepEqual(written(puts(calls)[0]).entries.map(entry => entry.id), ['kept']);
});

test('POST settings and lodged update the record', async () => {
  const { fetchImpl } = githubStub({ record: { entries: [] } });
  const settings = await (await handler(fetchImpl)(request({ method: 'POST', body: { action: 'settings', patch: { tenancy: { weeklyRent: 600 }, annualCosts: { insurance: { amount: 1500, estimate: false } } } } }))).json();
  assert.equal(settings.data.record.tenancy.weeklyRent, 600);
  assert.equal(settings.data.record.annualCosts.insurance.amount, 1500);
  const lodged = await (await handler(fetchImpl)(request({ method: 'POST', body: { action: 'lodged', fy: '2025-26' } }))).json();
  assert.deepEqual(lodged.data.record.lodgedYears, ['2025-26']);
});

test('rejects bad bodies, unknown actions and signed-out requests', async () => {
  const { fetchImpl } = githubStub({ record: { entries: [] } });
  assert.equal((await handler(fetchImpl)(request({ method: 'POST', body: { action: 'explode' } }))).status, 400);
  assert.equal((await handler(fetchImpl)(request({ method: 'POST', body: { action: 'remove' } }))).status, 400);
  assert.equal((await handler(fetchImpl)(request({ method: 'DELETE' }))).status, 405);
  assert.equal((await handler(fetchImpl)(request({ cookie: '' }))).status, 401);
});

test('a corrupt stored file is reported, not overwritten', async () => {
  const { calls, fetchImpl } = githubStub({ record: '{not json' });
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { action: 'add', entry: { kind: 'valuation', date: '2026-10-08', amount: 820000 } } }));
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error.code, 'property_corrupt');
  assert.equal(puts(calls).length, 0);
});
