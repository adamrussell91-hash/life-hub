import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthHandler } from '../../netlify/functions/auth.mjs';
import { createLogoutHandler } from '../../netlify/functions/logout.mjs';
import { createRepoFilesHandler } from '../../netlify/functions/repo-files.mjs';
import { createRepoManifestHandler } from '../../netlify/functions/repo-manifest.mjs';
import { createSessionHandler } from '../../netlify/functions/session.mjs';

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: 's'.repeat(32),
  GITHUB_REPOSITORY: 'owner/repository',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'provider-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};

for (const [label, headers] of [
  ['foreign Origin', { origin: 'https://foreign.example' }],
  ['same-site fetch metadata', { 'sec-fetch-site': 'same-site' }]
]) {
  test(`all authenticated APIs reject ${label} before authentication or provider work`, async () => {
    let authChecks = 0;
    let providerCreates = 0;
    const verifySessionToken = () => {
      authChecks += 1;
      return { valid: true, payload: { exp: Date.parse('2026-08-02T00:00:00Z') } };
    };
    const createGitHubClient = () => {
      providerCreates += 1;
      throw new Error('provider must not be reached');
    };
    const handlers = [
      [createAuthHandler({
        env,
        verifyPassphrase: async () => {
          authChecks += 1;
          return true;
        }
      }), new Request('https://life.example/api/auth', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ passphrase: 'accepted' })
      })],
      [createSessionHandler({ env, verifySessionToken }), new Request('https://life.example/api/session', { headers })],
      [createLogoutHandler(), new Request('https://life.example/api/logout', { method: 'POST', headers })],
      [createRepoManifestHandler({ env, verifySessionToken, createGitHubClient }), new Request(
        'https://life.example/api/repo/manifest?from=2026-07-02&to=2026-08-01',
        { headers }
      )],
      [createRepoFilesHandler({ env, verifySessionToken, createGitHubClient }), new Request(
        'https://life.example/api/repo/files',
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ from: '2026-07-02', to: '2026-08-01', files: [] })
        }
      )]
    ];

    for (const [handler, request] of handlers) {
      const response = await handler(request);
      assert.equal(response.status, 403, request.url);
      assert.equal((await response.json()).error.code, 'forbidden', request.url);
    }
    assert.equal(authChecks, 0);
    assert.equal(providerCreates, 0);
  });
}

test('Teaching Pages origin is allowed on the umbrella API', async () => {
  const handler = createSessionHandler({
    env,
    verifySessionToken: () => ({ valid: false })
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/session', {
    headers: { origin: 'https://teaching-hub.adam-russell.com' }
  }));
  assert.notEqual(response.status, 403);
});
