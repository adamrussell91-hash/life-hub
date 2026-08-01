import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createRepoFilesHandler } from '../../netlify/functions/repo-files.mjs';

const SECRET = 's'.repeat(32);
const TOKEN = 'github-secret-token';
const COMMIT_SHA = 'f'.repeat(40);
const TREE_SHA = '0'.repeat(40);
const TARGET_SHA = 'a'.repeat(40);
const WRONG_SHA = 'b'.repeat(40);
const NOW = Date.parse('2026-08-01T01:00:00Z');
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: TOKEN,
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const validCookie = `life_hub_session=${createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token}`;

function jsonRequest(body, cookie = validCookie, method = 'POST') {
  return new Request('https://life.example/api/repo/files', {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

function requestBody(files) {
  return { from: '2026-07-02', to: '2026-08-01', files };
}

function entry(path, sha = TARGET_SHA, size = 20) {
  return { path, type: 'blob', sha, size };
}

function createClientDouble({ tree = [entry('config/targets.yml')], blobs = new Map(), resolveError, blobError } = {}) {
  const calls = { resolve: 0, blobs: [] };
  const client = {
    async resolveTree() {
      calls.resolve += 1;
      if (resolveError) throw resolveError;
      return { commitSha: COMMIT_SHA, treeSha: TREE_SHA, tree };
    },
    async readBlob(sha) {
      calls.blobs.push(sha);
      if (blobError) throw blobError;
      return blobs.get(sha) ?? {
        sha,
        encoding: 'base64',
        content: Buffer.from('target_sets: []\n').toString('base64')
      };
    }
  };
  return { calls, createClient: () => client };
}

function handlerFor(clientDouble) {
  return createRepoFilesHandler({
    env: validEnv,
    now: () => NOW,
    createGitHubClient: clientDouble.createClient
  });
}

test('files endpoint returns only exact current manifest pairs and decodes folded base64', async () => {
  const folded = Buffer.from('target_sets: []\n').toString('base64').replace(/(.{8})/g, '$1\n');
  const github = createClientDouble({
    blobs: new Map([[TARGET_SHA, { sha: TARGET_SHA, encoding: 'base64', content: folded }]])
  });
  const response = await handlerFor(github)(jsonRequest(requestBody([
    { path: 'config/targets.yml', sha: TARGET_SHA }
  ])));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      commitSha: COMMIT_SHA,
      files: [{ path: 'config/targets.yml', sha: TARGET_SHA, content: 'target_sets: []\n' }]
    }
  });
  assert.deepEqual(github.calls, { resolve: 1, blobs: [TARGET_SHA] });
});

test('files endpoint rejects stale pairs before blob reads', async () => {
  const github = createClientDouble();
  const response = await handlerFor(github)(jsonRequest(requestBody([
    { path: 'config/targets.yml', sha: WRONG_SHA }
  ])));

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'stale_manifest');
  assert.equal(github.calls.resolve, 1);
  assert.equal(github.calls.blobs.length, 0);
});

test('files endpoint rejects excessive, duplicate, malformed, and unknown requests before provider reads', async () => {
  for (const [files, expectedStatus] of [
    [Array.from({ length: 51 }, () => ({ path: 'config/targets.yml', sha: TARGET_SHA })), 413],
    [[
      { path: 'config/targets.yml', sha: TARGET_SHA },
      { path: 'config/targets.yml', sha: TARGET_SHA }
    ], 400],
    [[{ path: 'config/targets.yml', sha: 'A'.repeat(40) }], 400],
    [[{ path: 'private/secret.md', sha: TARGET_SHA }], 400]
  ]) {
    const github = createClientDouble();
    const response = await handlerFor(github)(jsonRequest(requestBody(files)));
    assert.equal(response.status, expectedStatus);
    assert.equal(github.calls.resolve, 0);
    assert.equal(github.calls.blobs.length, 0);
  }
});

test('files endpoint applies the manifest date-window boundary before provider reads', async () => {
  for (const body of [
    { from: '2025-01-01', to: '2026-08-01', files: [] },
    { from: '2026-08-02', to: '2026-08-01', files: [] },
    { from: '2026-02-30', to: '2026-08-01', files: [] }
  ]) {
    const github = createClientDouble();
    const response = await handlerFor(github)(jsonRequest(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_request');
    assert.equal(github.calls.resolve, 0);
  }
});

test('files endpoint rejects a declared aggregate over 1 MiB before blob reads', async () => {
  const files = [
    ['config/targets.yml', 'a'],
    ['config/agents.yml', 'b'],
    ['data/nutrition/2026/08/2026-08-01-breakfast.md', 'c'],
    ['data/fitness/2026/08/2026-08-01-workout.md', 'd'],
    ['data/mind/2026/08/2026-08-01-diary.md', 'e']
  ];
  const tree = files.map(([path, character]) => entry(path, character.repeat(40), 220 * 1024));
  const github = createClientDouble({ tree });
  const response = await handlerFor(github)(jsonRequest(requestBody(
    files.map(([path, character]) => ({ path, sha: character.repeat(40) }))
  )));

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'batch_too_large');
  assert.equal(github.calls.resolve, 1);
  assert.equal(github.calls.blobs.length, 0);
});

test('files endpoint enforces individual and aggregate limits after decoding', async () => {
  const single = createClientDouble({
    tree: [entry('config/targets.yml', TARGET_SHA, 1)],
    blobs: new Map([[TARGET_SHA, {
      sha: TARGET_SHA,
      encoding: 'base64',
      content: Buffer.alloc(256 * 1024 + 1, 120).toString('base64')
    }]])
  });
  const individual = await handlerFor(single)(jsonRequest(requestBody([
    { path: 'config/targets.yml', sha: TARGET_SHA }
  ])));
  assert.equal(individual.status, 413);
  assert.equal((await individual.json()).error.code, 'file_too_large');

  const fileDefinitions = [
    ['config/targets.yml', 'a'],
    ['config/agents.yml', 'b'],
    ['data/nutrition/2026/08/2026-08-01-breakfast.md', 'c'],
    ['data/fitness/2026/08/2026-08-01-workout.md', 'd'],
    ['data/mind/2026/08/2026-08-01-diary.md', 'e']
  ];
  const blobs = new Map(fileDefinitions.map(([, character]) => [character.repeat(40), {
    sha: character.repeat(40),
    encoding: 'base64',
    content: Buffer.alloc(220 * 1024, 120).toString('base64')
  }]));
  const aggregateGithub = createClientDouble({
    tree: fileDefinitions.map(([path, character]) => entry(path, character.repeat(40), 1)),
    blobs
  });
  const aggregate = await handlerFor(aggregateGithub)(jsonRequest(requestBody(
    fileDefinitions.map(([path, character]) => ({ path, sha: character.repeat(40) }))
  )));
  assert.equal(aggregate.status, 413);
  assert.equal((await aggregate.json()).error.code, 'batch_too_large');
});

test('files endpoint rejects non-base64, mismatched, and invalid UTF-8 blobs without returning content', async () => {
  const cases = [
    { sha: TARGET_SHA, encoding: 'utf-8', content: 'private upstream content' },
    { sha: WRONG_SHA, encoding: 'base64', content: 'cHJpdmF0ZSB1cHN0cmVhbSBjb250ZW50' },
    { sha: TARGET_SHA, encoding: 'base64', content: Buffer.from([0xc3, 0x28]).toString('base64') }
  ];

  for (const blob of cases) {
    const github = createClientDouble({ blobs: new Map([[TARGET_SHA, blob]]) });
    const response = await handlerFor(github)(jsonRequest(requestBody([
      { path: 'config/targets.yml', sha: TARGET_SHA }
    ])));
    const text = await response.text();
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(text).error.code, 'github_invalid_response');
    assert.equal(text.includes('private upstream content'), false);
  }
});

test('files endpoint bounds JSON, validates authentication first, and accepts POST only', async () => {
  const github = createClientDouble();
  const unauthenticated = await handlerFor(github)(jsonRequest(requestBody([]), ''));
  const unsupported = await handlerFor(github)(jsonRequest(requestBody([]), validCookie, 'GET'));
  const oversized = await handlerFor(github)(jsonRequest({
    from: '2026-07-02', to: '2026-08-01', files: [], padding: 'x'.repeat(16 * 1024)
  }));

  assert.equal(unauthenticated.status, 401);
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get('allow'), 'POST');
  assert.equal(oversized.status, 413);
  assert.equal(github.calls.resolve, 0);
});

test('files endpoint sanitizes provider failures and never leaks the upstream body', async () => {
  const fetchImpl = async () => Response.json({ message: `private upstream ${TOKEN}` }, { status: 500 });
  const handler = createRepoFilesHandler({ env: validEnv, now: () => NOW, fetchImpl });
  const response = await handler(jsonRequest(requestBody([
    { path: 'config/targets.yml', sha: TARGET_SHA }
  ])));
  const text = await response.text();

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(text).error.code, 'github_unavailable');
  assert.equal(text.includes('private upstream'), false);
  assert.equal(text.includes(TOKEN), false);
});
