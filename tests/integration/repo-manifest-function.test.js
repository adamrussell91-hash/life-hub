import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGitHubClient } from '../../netlify/functions/_shared/github-client.mjs';
import { createRepoManifestHandler } from '../../netlify/functions/repo-manifest.mjs';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const TARGET_SHA = 'a'.repeat(40);
const MEAL_SHA = 'b'.repeat(40);
const TOKEN = 'github-secret-token';
const MANIFEST_ID = 'f95323cafa62c089c60916e61c803dc892de617ef781730712ab14aae1551a73';
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'feature/live-sync',
  GITHUB_TOKEN: TOKEN
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request(query = '?from=2026-07-02&to=2026-08-01', headers = {}, method = 'GET') {
  return new Request(`https://life.example/api/repo/manifest${query}`, {
    method,
    headers: { cookie: `life_hub_session=${session}`, ...headers }
  });
}

function createGitHubFetch({ tree = standardTree(), status = 200, upstreamBody = { private: 'do not expose' } } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (status !== 200) return Response.json(upstreamBody, { status });
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    return Response.json(tree);
  };
  return { calls, fetchImpl };
}

function standardTree() {
  return {
    sha: TREE_SHA,
    truncated: false,
    tree: [
      { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', type: 'blob', sha: MEAL_SHA, size: 120 },
      { path: 'config/targets.yml', type: 'blob', sha: TARGET_SHA, size: 90 }
    ]
  };
}

test('manifest rejects a missing session before GitHub configuration or calls', async () => {
  let githubCalls = 0;
  const handler = createRepoManifestHandler({
    env: { SESSION_SECRET: SECRET, LIFE_HUB_PASSPHRASE_HASH: 'configured' },
    fetchImpl: async () => { githubCalls += 1; }
  });
  const response = await handler(new Request(
    'https://life.example/api/repo/manifest?from=2026-07-02&to=2026-08-01'
  ));

  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

test('manifest rejects unsupported methods and invalid ranges without calling GitHub', async () => {
  let githubCalls = 0;
  const handler = createRepoManifestHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: async () => { githubCalls += 1; }
  });

  const wrongMethod = await handler(request('', {}, 'POST'));
  const invalidRange = await handler(request('?from=2025-01-01&to=2026-08-01'));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');
  assert.equal(invalidRange.status, 400);
  assert.equal((await invalidRange.json()).error.code, 'invalid_date_range');
  assert.equal(githubCalls, 0);
});

test('manifest returns sorted allowlisted files and a quoted range-specific ETag', async () => {
  const github = createGitHubFetch();
  const handler = createRepoManifestHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: github.fetchImpl
  });
  const response = await handler(request());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('etag'), `"${MANIFEST_ID}"`);
  assert.deepEqual(body, {
    ok: true,
    data: {
      commitSha: COMMIT_SHA,
      treeSha: TREE_SHA,
      manifestId: MANIFEST_ID,
      from: '2026-07-02',
      to: '2026-08-01',
      files: [
        { path: 'config/targets.yml', sha: TARGET_SHA, size: 90 },
        { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: MEAL_SHA, size: 120 }
      ]
    }
  });
  assert.deepEqual(github.calls.map(call => call.url), [
    'https://api.github.com/repos/life-owner/life-repo/commits/feature%2Flive-sync',
    `https://api.github.com/repos/life-owner/life-repo/git/trees/${TREE_SHA}?recursive=1`
  ]);
  for (const call of github.calls) {
    assert.equal(call.options.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(call.options.headers.accept, 'application/vnd.github+json');
    assert.equal(call.options.headers['user-agent'], 'life-hub');
    assert.equal(call.options.headers['x-github-api-version'], '2026-03-10');
  }
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
  assert.equal(JSON.stringify(body).includes('api.github.com'), false);
});

test('matching a range-specific ETag returns 304 without a body', async () => {
  const github = createGitHubFetch();
  const response = await createRepoManifestHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: github.fetchImpl
  })(request(undefined, { 'if-none-match': `"${MANIFEST_ID}"` }));

  assert.equal(response.status, 304);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('etag'), `"${MANIFEST_ID}"`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('the same commit with a wider range returns 200 instead of matching the old ETag', async () => {
  const github = createGitHubFetch();
  const response = await createRepoManifestHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: github.fetchImpl
  })(request('?from=2026-07-01&to=2026-08-01', { 'if-none-match': `"${MANIFEST_ID}"` }));

  assert.equal(response.status, 200);
  assert.notEqual(response.headers.get('etag'), `"${MANIFEST_ID}"`);
  assert.equal((await response.json()).data.commitSha, COMMIT_SHA);
});

test('manifest maps a truncated tree to a sanitized incomplete-repository error', async () => {
  const github = createGitHubFetch({ tree: { ...standardTree(), truncated: true } });
  const response = await createRepoManifestHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: github.fetchImpl
  })(request());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body.error, {
    code: 'repository_tree_incomplete',
    message: 'The repository is temporarily unavailable.',
    retryable: true
  });
  assert.equal(JSON.stringify(body).includes('api.github.com'), false);
});

for (const [status, code, retryable] of [
  [401, 'github_authentication_failed', false],
  [403, 'github_access_denied', false],
  [404, 'repository_not_found', false],
  [429, 'github_rate_limited', true],
  [500, 'github_unavailable', true]
]) {
  test(`manifest maps GitHub ${status} to sanitized ${code}`, async () => {
    const github = createGitHubFetch({ status, upstreamBody: { message: `private upstream ${TOKEN}` } });
    const response = await createRepoManifestHandler({
      env: validEnv,
      now: () => Date.parse('2026-08-01T01:00:00Z'),
      fetchImpl: github.fetchImpl
    })(request());
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(response.status, 503);
    assert.equal(body.error.code, code);
    assert.equal(body.error.retryable, retryable);
    assert.equal(text.includes(TOKEN), false);
    assert.equal(text.includes('private upstream'), false);
  });
}

test('manifest reports missing provider configuration only after authenticating', async () => {
  const response = await createRepoManifestHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET },
    now: () => Date.parse('2026-08-01T01:00:00Z')
  })(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'misconfigured');
});

test('GitHub client reads an exact canonical blob without exposing configuration', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ sha: TARGET_SHA, encoding: 'base64', content: 'eA==' });
  };
  const client = createGitHubClient({ env: validEnv, fetchImpl });

  assert.deepEqual(await client.readBlob(TARGET_SHA), {
    sha: TARGET_SHA, encoding: 'base64', content: 'eA=='
  });
  assert.equal(calls[0].url, `https://api.github.com/repos/life-owner/life-repo/git/blobs/${TARGET_SHA}`);
  assert.throws(() => client.readBlob('A'.repeat(40)), /blob/i);
});
