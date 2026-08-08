import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createSkincareCatalogHandler } from '../../netlify/functions/skincare-catalog.mjs';
import { SKINCARE_CATALOG_PATH } from '../../js/app/skincare-catalog.js';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const CATALOG_SHA = 'a'.repeat(40);
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

function request({ method = 'GET', body, headers = {} } = {}) {
  return new Request('https://life.example/api/skincare/catalog', {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function encodeBlob(value) {
  return {
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
  };
}

function githubFetchStub({ catalog = undefined } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        truncated: false,
        tree: catalog === undefined ? [] : [{ path: SKINCARE_CATALOG_PATH, type: 'blob', sha: CATALOG_SHA }]
      });
    }
    if (url.includes(`/git/blobs/${CATALOG_SHA}`)) return Response.json(encodeBlob(catalog));
    if (options.method === 'PUT') {
      return Response.json({ content: { sha: UPDATED_SHA }, commit: { sha: COMMIT_SHA } });
    }
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  return { calls, fetchImpl };
}

function handler(fetchImpl) {
  return createSkincareCatalogHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T01:00:00Z')
  });
}

test('GET returns null catalog when its blob is missing', async () => {
  const { fetchImpl } = githubFetchStub();

  const response = await handler(fetchImpl)(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { catalog: null } });
});

test('POST append seeds and writes a missing catalog', async () => {
  const { calls, fetchImpl } = githubFetchStub();

  const response = await handler(fetchImpl)(request({
    method: 'POST',
    body: { action: 'append', routine: 'am', name: 'Test Serum' }
  }));
  const payload = await response.json();
  const put = calls.find(call => call.options.method === 'PUT');

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.sha, UPDATED_SHA);
  assert.ok(payload.data.catalog.am.products.includes('Test Serum'));
  assert.equal(put.url.includes(SKINCARE_CATALOG_PATH), true);
  const write = JSON.parse(put.options.body);
  assert.equal(write.message, 'chore(skincare): append am product');
  assert.equal(write.sha, undefined);
  assert.deepEqual(JSON.parse(Buffer.from(write.content, 'base64').toString('utf8')), payload.data.catalog);
});

test('POST retire moves an existing product to retired', async () => {
  const catalog = {
    schema_version: 1,
    am: { products: ['Cleanser'], retired: [], extras: [] },
    pm: { products: ['Night Cream'], retired: [], extras: [] }
  };
  const { calls, fetchImpl } = githubFetchStub({ catalog });

  const response = await handler(fetchImpl)(request({
    method: 'POST',
    body: { action: 'retire', routine: 'am', name: 'Cleanser' }
  }));
  const payload = await response.json();
  const write = JSON.parse(calls.find(call => call.options.method === 'PUT').options.body);

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.catalog.am.products, []);
  assert.deepEqual(payload.data.catalog.am.retired, ['Cleanser']);
  assert.equal(write.sha, CATALOG_SHA);
  assert.equal(write.message, 'chore(skincare): retire am product');
});

test('rejects unauthenticated requests before GitHub calls', async () => {
  let githubCalls = 0;
  const response = await handler(async () => { githubCalls += 1; })(
    new Request('https://life.example/api/skincare/catalog')
  );

  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
});

test('rejects invalid POST bodies before GitHub calls', async () => {
  let githubCalls = 0;

  const response = await handler(async () => { githubCalls += 1; })(request({
    method: 'POST',
    body: { action: 'replace', routine: 'noon', name: '' }
  }));

  assert.equal(response.status, 400);
  assert.equal(githubCalls, 0);
});
