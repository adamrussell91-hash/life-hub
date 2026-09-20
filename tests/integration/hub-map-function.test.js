import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createHubMapHandler } from '../../netlify/functions/hub-map.mjs';
import { HUB_MAP_PATH, updateNode, validateMap } from '../../apps/life/js/app/hub-map-model.js';
import { buildHubMapSeed } from '../../apps/life/js/app/hub-map-seed.js';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const MAP_SHA = 'a'.repeat(40);
const UPDATED_SHA = 'b'.repeat(40);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request({ method = 'GET', body, rawBody, cookie = true } = {}) {
  const payload = rawBody ?? (body ? JSON.stringify(body) : undefined);
  return new Request('https://life.example/api/hub-map', {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {})
    },
    ...(payload ? { body: payload } : {})
  });
}

function githubFetchStub({ stored, writeStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        truncated: false,
        tree: stored === undefined ? [] : [{ path: HUB_MAP_PATH, type: 'blob', sha: MAP_SHA }]
      });
    }
    if (url.includes(`/git/blobs/${MAP_SHA}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(stored, 'utf8').toString('base64') });
    }
    if (options.method === 'PUT') {
      return writeStatus === 200
        ? Response.json({ content: { sha: UPDATED_SHA }, commit: { sha: COMMIT_SHA } })
        : Response.json({ message: 'conflict' }, { status: writeStatus });
    }
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  return { calls, fetchImpl };
}

const handler = fetchImpl => createHubMapHandler({
  env: validEnv,
  fetchImpl,
  now: () => Date.parse('2026-08-01T01:00:00Z')
});
const puts = calls => calls.filter(call => call.options.method === 'PUT');

test('rejects a missing session before any GitHub call', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const response = await handler(fetchImpl)(request({ cookie: false }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(calls.length, 0);
});

test('GET returns the seed when nothing is stored yet', async () => {
  const { fetchImpl } = githubFetchStub();
  const payload = await (await handler(fetchImpl)(request())).json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.seeded, true);
  assert.equal(payload.data.sha, null);
  assert.deepEqual(payload.data.map, buildHubMapSeed());
});

test('GET returns the stored map and its blob sha', async () => {
  const stored = updateNode(buildHubMapSeed(), 'life-home', { status: 'built' });
  const { fetchImpl } = githubFetchStub({ stored: JSON.stringify(stored) });
  const payload = await (await handler(fetchImpl)(request())).json();
  assert.equal(payload.data.seeded, false);
  assert.equal(payload.data.sha, MAP_SHA);
  assert.equal(payload.data.map.nodes.find(node => node.id === 'life-home').status, 'built');
});

test('GET reports a corrupt stored file instead of returning the seed', async () => {
  const { fetchImpl } = githubFetchStub({ stored: '{not json' });
  const response = await handler(fetchImpl)(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'map_corrupt');
});

test('POST creates the file when none exists and baseSha is null', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const map = validateMap(buildHubMapSeed()).map;
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { map, baseSha: null } }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.sha, UPDATED_SHA);
  const [put] = puts(calls);
  assert.ok(put.url.includes(HUB_MAP_PATH));
  const write = JSON.parse(put.options.body);
  assert.equal(write.sha, undefined);
  assert.deepEqual(JSON.parse(Buffer.from(write.content, 'base64').toString('utf8')), map);
});

test('POST updates an existing file when baseSha matches', async () => {
  const stored = buildHubMapSeed();
  const { calls, fetchImpl } = githubFetchStub({ stored: JSON.stringify(stored) });
  const map = updateNode(stored, 'life-home', { status: 'partial' });
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { map, baseSha: MAP_SHA } }));
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(puts(calls)[0].options.body).sha, MAP_SHA);
});

test('POST with a stale baseSha is a 409 and writes nothing', async () => {
  const { calls, fetchImpl } = githubFetchStub({ stored: JSON.stringify(buildHubMapSeed()) });
  const map = validateMap(buildHubMapSeed()).map;
  const stale = await handler(fetchImpl)(request({ method: 'POST', body: { map, baseSha: 'e'.repeat(40) } }));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'write_conflict');
  const noBase = await handler(fetchImpl)(request({ method: 'POST', body: { map, baseSha: null } }));
  assert.equal(noBase.status, 409);
  assert.equal(puts(calls).length, 0);
});

test('POST maps a GitHub write conflict to 409', async () => {
  const { fetchImpl } = githubFetchStub({ stored: JSON.stringify(buildHubMapSeed()), writeStatus: 409 });
  const map = validateMap(buildHubMapSeed()).map;
  const response = await handler(fetchImpl)(request({ method: 'POST', body: { map, baseSha: MAP_SHA } }));
  assert.equal(response.status, 409);
});

test('POST rejects invalid maps, bad bodies and oversized bodies without writing', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const map = validateMap(buildHubMapSeed()).map;
  const broken = { ...map, edges: map.edges.slice(1) };
  const cases = [
    [request({ method: 'POST', body: { map: broken, baseSha: null } }), 400],
    [request({ method: 'POST', body: { map } }), 400],
    [request({ method: 'POST', rawBody: 'nope' }), 400],
    [request({ method: 'POST', rawBody: JSON.stringify({ map, baseSha: null, pad: 'x'.repeat(300 * 1024) }) }), 413]
  ];
  for (const [req, status] of cases) {
    assert.equal((await handler(fetchImpl)(req)).status, status);
  }
  assert.equal(puts(calls).length, 0);
});

test('other methods are rejected', async () => {
  const { fetchImpl } = githubFetchStub();
  assert.equal((await handler(fetchImpl)(request({ method: 'DELETE' }))).status, 405);
});
