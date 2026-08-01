import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { GitHubClientError, GitHubConfigurationError } from '../../netlify/functions/_shared/github-client.mjs';
import { createHealthHandler } from '../../netlify/functions/health.mjs';

const SECRET = 's'.repeat(32);
const TOKEN = 'github-secret-token';
const BASE_NOW = Date.parse('2026-08-01T01:00:00Z');
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: TOKEN,
  GITHUB_TOKEN_EXPIRES: '2026-08-15'
};
const cookie = `life_hub_session=${createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 5)
}, SECRET).token}`;

function request(cookieValue = cookie, method = 'GET') {
  return new Request('https://life.example/api/health', {
    method,
    headers: cookieValue ? { cookie: cookieValue } : {}
  });
}

function createClientSequence(outcomes) {
  const calls = { create: 0, resolve: 0 };
  return {
    calls,
    createClient() {
      calls.create += 1;
      const outcome = outcomes[Math.min(calls.create - 1, outcomes.length - 1)];
      if (outcome instanceof GitHubConfigurationError) throw outcome;
      return {
        async resolveTree() {
          calls.resolve += 1;
          if (outcome instanceof Error) throw outcome;
          return outcome;
        }
      };
    }
  };
}

test('health validates the session before provider configuration and accepts GET only', async () => {
  const provider = createClientSequence([{ commitSha: 'a'.repeat(40), tree: [] }]);
  const handler = createHealthHandler({
    env: validEnv,
    now: () => BASE_NOW,
    createGitHubClient: provider.createClient
  });

  const unauthenticated = await handler(request(''));
  const unsupported = await handler(request(cookie, 'POST'));
  assert.equal(unauthenticated.status, 401);
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get('allow'), 'GET');
  assert.deepEqual(provider.calls, { create: 0, resolve: 0 });
});

test('health returns only sanitized provider and token state fields', async () => {
  const provider = createClientSequence([{ commitSha: 'a'.repeat(40), tree: [] }]);
  const response = await createHealthHandler({
    env: validEnv,
    now: () => BASE_NOW,
    createGitHubClient: provider.createClient
  })(request());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(body, {
    ok: true,
    data: {
      github: 'healthy',
      token: 'expiring',
      expiresOn: '2026-08-15',
      code: 'ok',
      retryable: false
    }
  });
  assert.deepEqual(Object.keys(body.data).sort(), ['code', 'expiresOn', 'github', 'retryable', 'token']);
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
});

test('health caches only successful checks for less than sixty seconds', async () => {
  let now = BASE_NOW;
  const provider = createClientSequence([
    { commitSha: 'a'.repeat(40), tree: [] },
    { commitSha: 'b'.repeat(40), tree: [] }
  ]);
  const handler = createHealthHandler({
    env: validEnv,
    now: () => now,
    createGitHubClient: provider.createClient
  });

  assert.equal((await handler(request())).status, 200);
  now += 59_999;
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(provider.calls, { create: 1, resolve: 1 });
  now += 1;
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(provider.calls, { create: 2, resolve: 2 });
});

test('health maps missing provider environment to a sanitized misconfigured state', async () => {
  const provider = createClientSequence([new GitHubConfigurationError()]);
  const response = await createHealthHandler({
    env: { ...validEnv, GITHUB_TOKEN: undefined, GITHUB_TOKEN_EXPIRES: 'secret expiry value' },
    now: () => BASE_NOW,
    createGitHubClient: provider.createClient
  })(request());
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(text).data, {
    github: 'misconfigured',
    token: 'unknown',
    expiresOn: null,
    code: 'misconfigured',
    retryable: false
  });
  assert.equal(text.includes('secret expiry value'), false);
});

test('health requires a canonical GitHub token expiry before provider work', async () => {
  for (const expiry of [undefined, '', '2026-02-30', 'secret expiry value']) {
    const provider = createClientSequence([{ commitSha: 'a'.repeat(40), tree: [] }]);
    const response = await createHealthHandler({
      env: { ...validEnv, GITHUB_TOKEN_EXPIRES: expiry },
      now: () => BASE_NOW,
      createGitHubClient: provider.createClient
    })(request());
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(text).data, {
      github: 'misconfigured',
      token: 'unknown',
      expiresOn: null,
      code: 'misconfigured',
      retryable: false
    });
    assert.deepEqual(provider.calls, { create: 0, resolve: 0 });
    assert.equal(text.includes('secret expiry value'), false);
  }
});

test('health sanitizes provider failures and never caches them', async () => {
  const privateMessage = `private upstream ${TOKEN}`;
  const provider = createClientSequence([
    Object.assign(new GitHubClientError('github_rate_limited', true), { message: privateMessage }),
    Object.assign(new Error(privateMessage), { code: 'secret_code', retryable: false })
  ]);
  const handler = createHealthHandler({
    env: validEnv,
    now: () => BASE_NOW,
    createGitHubClient: provider.createClient
  });

  const firstText = await (await handler(request())).text();
  const secondText = await (await handler(request())).text();
  assert.deepEqual(JSON.parse(firstText).data, {
    github: 'unavailable',
    token: 'expiring',
    expiresOn: '2026-08-15',
    code: 'github_rate_limited',
    retryable: true
  });
  assert.deepEqual(JSON.parse(secondText).data, {
    github: 'unavailable',
    token: 'expiring',
    expiresOn: '2026-08-15',
    code: 'github_unavailable',
    retryable: true
  });
  assert.deepEqual(provider.calls, { create: 2, resolve: 2 });
  for (const text of [firstText, secondText]) {
    assert.equal(text.includes('private upstream'), false);
    assert.equal(text.includes(TOKEN), false);
    assert.equal(text.includes('secret_code'), false);
  }
});
