import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createShortcutsHandler } from '../../netlify/functions/shortcuts.mjs';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const DRAFT_SHA = 'a'.repeat(40);
const TOKEN = 'github-secret-token';
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: TOKEN,
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const draft = {
  proposed_id: 'track.morning-weigh-in',
  tool_name: 'track_morning_weigh_in',
  summary: 'Morning weigh-in tracker',
  example_intent: 'log morning weight',
  example_writes: [{
    path: 'data/challenges/2026-08-31-weigh-in.json',
    mode: 'create',
    content: '{\n  "title": "Morning weigh-in"\n}\n',
    diff: 'new weigh-in challenge'
  }],
  risk: 'confirm',
  proposed_by: 'brisket',
  status: 'ready'
};

function request(method = 'GET', body) {
  return new Request('https://life.example/api/shortcuts', {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function encodeBlob(text) {
  return { encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64'), sha: 'blob' };
}

function githubFetch() {
  return async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        sha: TREE_SHA,
        truncated: false,
        tree: [
          { path: 'data/os/promoted-shortcuts/track-morning-weigh-in.json', type: 'blob', sha: DRAFT_SHA, size: 200 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${DRAFT_SHA}`)) {
      return Response.json(encodeBlob(JSON.stringify(draft)));
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

test('shortcuts list rejects a missing session before GitHub calls', async () => {
  let githubCalls = 0;
  const handler = createShortcutsHandler({
    env: { SESSION_SECRET: SECRET, LIFE_HUB_PASSPHRASE_HASH: 'configured' },
    fetchImpl: async () => { githubCalls += 1; }
  });
  const response = await handler(new Request('https://life.example/api/shortcuts'));
  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
});

test('GET /api/shortcuts returns catalog plus promoted drafts', async () => {
  const handler = createShortcutsHandler({
    env: validEnv,
    fetchImpl: githubFetch(),
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.data.catalog.some(item => item.id === 'remember.set-week-flag'));
  assert.equal(payload.data.promoted[0].proposed_id, 'track.morning-weigh-in');
  assert.equal(payload.data.promoted[0].proposed_by, 'brisket');
});

test('GET /api/shortcuts fails visibly when the repository tree is incomplete', async () => {
  const handler = createShortcutsHandler({
    env: validEnv,
    fetchImpl: async url => {
      if (url.includes('/commits/')) {
        return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
      }
      if (url.includes('/git/trees/')) {
        return Response.json({ sha: TREE_SHA, truncated: true, tree: [] });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'repository_tree_incomplete');
});

test('POST /api/shortcuts runs a promoted draft into a Confirm proposal', async () => {
  const handler = createShortcutsHandler({
    env: validEnv,
    fetchImpl: githubFetch(),
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });
  const response = await handler(request('POST', {
    proposed_id: 'track.morning-weigh-in',
    agent_slug: 'brisket'
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.match(payload.data.proposal.intent, /morning/i);
  assert.equal(payload.data.proposal.writes[0].path, 'data/challenges/2026-08-31-weigh-in.json');
});
