import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createSkincareLibraryHandler } from '../../netlify/functions/skincare-library.mjs';
import { SKINCARE_PRODUCT_LIBRARY_PATH } from '../../js/app/skincare-product-library.js';
import { SKINCARE_ROUTINE_MEMBERSHIP_PATH } from '../../js/app/skincare-routine-membership.js';
import { SKINCARE_CATALOG_PATH } from '../../js/app/skincare-catalog.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const LIBRARY_SHA = 'a'.repeat(40);
const MEMBERSHIP_SHA = 'e'.repeat(40);
const CATALOG_SHA = 'f'.repeat(40);
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
  return new Request('https://life.example/api/skincare/library', {
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

function pathFromContentsUrl(url) {
  const marker = '/contents/';
  const index = url.indexOf(marker);
  return decodeURIComponent(url.slice(index + marker.length));
}

function githubFetchStub({
  library = undefined,
  membership = undefined,
  catalog = undefined,
  writeStatus = 200
} = {}) {
  const calls = [];
  const knownShaByPath = new Map();
  if (library !== undefined) knownShaByPath.set(SKINCARE_PRODUCT_LIBRARY_PATH, LIBRARY_SHA);
  if (membership !== undefined) knownShaByPath.set(SKINCARE_ROUTINE_MEMBERSHIP_PATH, MEMBERSHIP_SHA);
  if (catalog !== undefined) knownShaByPath.set(SKINCARE_CATALOG_PATH, CATALOG_SHA);
  const blobBySha = {};
  if (library !== undefined) blobBySha[LIBRARY_SHA] = library;
  if (membership !== undefined) blobBySha[MEMBERSHIP_SHA] = membership;
  if (catalog !== undefined) blobBySha[CATALOG_SHA] = catalog;

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (url.includes('/git/trees/')) {
      const tree = [];
      if (library !== undefined) {
        tree.push({ path: SKINCARE_PRODUCT_LIBRARY_PATH, type: 'blob', sha: LIBRARY_SHA });
      }
      if (membership !== undefined) {
        tree.push({ path: SKINCARE_ROUTINE_MEMBERSHIP_PATH, type: 'blob', sha: MEMBERSHIP_SHA });
      }
      if (catalog !== undefined) {
        tree.push({ path: SKINCARE_CATALOG_PATH, type: 'blob', sha: CATALOG_SHA });
      }
      return Response.json({ truncated: false, tree });
    }
    for (const [sha, value] of Object.entries(blobBySha)) {
      if (url.includes(`/git/blobs/${sha}`)) return Response.json(encodeBlob(value));
    }
    if (options.method === 'PUT') {
      if (writeStatus !== 200) {
        return Response.json({ message: 'conflict' }, { status: writeStatus });
      }
      const path = pathFromContentsUrl(url);
      const body = JSON.parse(options.body);
      const existingSha = knownShaByPath.get(path);
      if (existingSha && body.sha !== existingSha) {
        return Response.json({ message: 'conflict' }, { status: 422 });
      }
      knownShaByPath.set(path, UPDATED_SHA);
      return Response.json({ content: { sha: UPDATED_SHA }, commit: { sha: COMMIT_SHA } });
    }
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  return { calls, fetchImpl };
}

function handler(fetchImpl) {
  return createSkincareLibraryHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T01:00:00Z')
  });
}

const defaultNameCount = new Set([
  ...SKINCARE_ROUTINES.am.products,
  ...SKINCARE_ROUTINES.pm.products
]).size;

test('GET seeds library from defaults when no blobs and writes it', async () => {
  const { calls, fetchImpl } = githubFetchStub();

  const response = await handler(fetchImpl)(request());
  const payload = await response.json();
  const put = calls.find(call => call.options.method === 'PUT');

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.library.products.length, defaultNameCount);
  assert.ok(put);
  assert.equal(put.url.includes(SKINCARE_PRODUCT_LIBRARY_PATH), true);
  const write = JSON.parse(put.options.body);
  assert.equal(write.sha, undefined);
  assert.deepEqual(
    JSON.parse(Buffer.from(write.content, 'base64').toString('utf8')),
    payload.data.library
  );
});

test('POST save adds a product to the library', async () => {
  const library = {
    schema_version: 1,
    products: [{ id: 'cleanser', name: 'Cleanser', notes: '' }]
  };
  const { calls, fetchImpl } = githubFetchStub({ library });

  const response = await handler(fetchImpl)(request({
    method: 'POST',
    body: { action: 'save', name: 'Test Serum', notes: 'AM' }
  }));
  const payload = await response.json();
  const put = calls.find(call => call.options.method === 'PUT');

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.sha, UPDATED_SHA);
  assert.equal(payload.data.library.products.length, 2);
  assert.ok(payload.data.library.products.some(p => p.name === 'Test Serum' && p.notes === 'AM'));
  assert.equal(put.url.includes(SKINCARE_PRODUCT_LIBRARY_PATH), true);
  const write = JSON.parse(put.options.body);
  assert.equal(write.sha, LIBRARY_SHA);
});

test('POST save on cold start seeds then updates with seed sha', async () => {
  const { calls, fetchImpl } = githubFetchStub();

  const response = await handler(fetchImpl)(request({
    method: 'POST',
    body: { action: 'save', name: 'Cold Start Serum' }
  }));
  const payload = await response.json();
  const puts = calls
    .filter(call => call.options.method === 'PUT' && call.url.includes(SKINCARE_PRODUCT_LIBRARY_PATH))
    .map(call => JSON.parse(call.options.body));

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.ok(payload.data.library.products.some(p => p.name === 'Cold Start Serum'));
  assert.ok(puts.length >= 1);
  if (puts.length >= 2) {
    assert.equal(puts[0].sha, undefined);
    assert.equal(puts[1].sha, UPDATED_SHA);
  }
  assert.equal(payload.data.sha, UPDATED_SHA);
});

test('rejects unauthenticated requests before GitHub calls', async () => {
  let githubCalls = 0;
  const response = await handler(async () => { githubCalls += 1; })(
    new Request('https://life.example/api/skincare/library')
  );

  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
});

test('rejects invalid POST bodies before GitHub calls', async () => {
  let githubCalls = 0;

  const response = await handler(async () => { githubCalls += 1; })(request({
    method: 'POST',
    body: { action: 'replace', name: '' }
  }));

  assert.equal(response.status, 400);
  assert.equal(githubCalls, 0);
});
