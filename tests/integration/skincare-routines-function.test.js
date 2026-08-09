import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createSkincareRoutinesHandler } from '../../netlify/functions/skincare-routines.mjs';
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
  return new Request('https://life.example/api/skincare/routines', {
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

function githubFetchStub({
  library = undefined,
  membership = undefined,
  catalog = undefined,
  writeStatus = 200
} = {}) {
  const calls = [];
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
      return writeStatus === 200
        ? Response.json({ content: { sha: UPDATED_SHA }, commit: { sha: COMMIT_SHA } })
        : Response.json({ message: 'conflict' }, { status: writeStatus });
    }
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  return { calls, fetchImpl };
}

function handler(fetchImpl) {
  return createSkincareRoutinesHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T01:00:00Z')
  });
}

test('GET seeds membership matching default name counts', async () => {
  const { calls, fetchImpl } = githubFetchStub();

  const response = await handler(fetchImpl)(request());
  const payload = await response.json();
  const puts = calls.filter(call => call.options.method === 'PUT');

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.membership.am.product_ids.length, SKINCARE_ROUTINES.am.products.length);
  assert.equal(payload.data.membership.pm.product_ids.length, SKINCARE_ROUTINES.pm.products.length);
  assert.ok(puts.some(call => call.url.includes(SKINCARE_PRODUCT_LIBRARY_PATH)));
  assert.ok(puts.some(call => call.url.includes(SKINCARE_ROUTINE_MEMBERSHIP_PATH)));
});

test('POST add and remove update membership', async () => {
  const library = {
    schema_version: 1,
    products: [
      { id: 'serum', name: 'Test Serum', notes: '' },
      { id: 'cream', name: 'Night Cream', notes: '' }
    ]
  };
  const membership = {
    schema_version: 1,
    am: { product_ids: ['serum'] },
    pm: { product_ids: [] }
  };
  const { fetchImpl: addFetch } = githubFetchStub({ library, membership });

  const addResponse = await handler(addFetch)(request({
    method: 'POST',
    body: { action: 'add', routine: 'pm', product_id: 'cream' }
  }));
  const addPayload = await addResponse.json();

  assert.equal(addResponse.status, 200);
  assert.deepEqual(addPayload.data.membership.pm.product_ids, ['cream']);
  assert.deepEqual(addPayload.data.membership.am.product_ids, ['serum']);

  const { fetchImpl: removeFetch } = githubFetchStub({
    library,
    membership: addPayload.data.membership
  });
  const removeResponse = await handler(removeFetch)(request({
    method: 'POST',
    body: { action: 'remove', routine: 'am', product_id: 'serum' }
  }));
  const removePayload = await removeResponse.json();

  assert.equal(removeResponse.status, 200);
  assert.deepEqual(removePayload.data.membership.am.product_ids, []);
  assert.deepEqual(removePayload.data.membership.pm.product_ids, ['cream']);
});

test('POST add unknown product id returns 400 unknown_product', async () => {
  const library = {
    schema_version: 1,
    products: [{ id: 'serum', name: 'Test Serum', notes: '' }]
  };
  const membership = {
    schema_version: 1,
    am: { product_ids: [] },
    pm: { product_ids: [] }
  };
  const { calls, fetchImpl } = githubFetchStub({ library, membership });

  const response = await handler(fetchImpl)(request({
    method: 'POST',
    body: { action: 'add', routine: 'am', product_id: 'missing-id' }
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'unknown_product');
  assert.equal(calls.some(call => call.options.method === 'PUT'), false);
});

test('rejects unauthenticated requests before GitHub calls', async () => {
  let githubCalls = 0;
  const response = await handler(async () => { githubCalls += 1; })(
    new Request('https://life.example/api/skincare/routines')
  );

  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
});
