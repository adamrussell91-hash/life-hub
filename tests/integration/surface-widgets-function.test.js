import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createSurfaceWidgetsHandler } from '../../netlify/functions/surface-widgets.mjs';

const SECRET = 's'.repeat(32);
const COMMIT_SHA = 'c'.repeat(40);
const TREE_SHA = 'd'.repeat(40);
const WIDGET_SHA = 'a'.repeat(40);
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

const widgetJson = JSON.stringify({
  id: 'wg_test',
  template_id: 'challenge-progress',
  title: 'No refined sugar',
  props: {
    challenge_id: 'ch_1',
    title: 'No refined sugar',
    progress_pct: 42,
    subtitle: 'Day 3'
  },
  owner_agent: 'brisket',
  created_at: '2026-08-31T00:00:00.000Z',
  status: 'published'
}, null, 2);

function request(headers = {}, method = 'GET') {
  return new Request('https://life.example/api/surface/widgets', {
    method,
    headers: { cookie: `life_hub_session=${session}`, ...headers }
  });
}

function encodeBlob(text) {
  return { encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64'), sha: 'blob' };
}

test('surface widgets rejects a missing session before GitHub calls', async () => {
  let githubCalls = 0;
  const handler = createSurfaceWidgetsHandler({
    env: { SESSION_SECRET: SECRET, LIFE_HUB_PASSPHRASE_HASH: 'configured' },
    fetchImpl: async () => { githubCalls += 1; }
  });
  const response = await handler(new Request('https://life.example/api/surface/widgets'));
  assert.equal(response.status, 401);
  assert.equal(githubCalls, 0);
});

test('surface widgets returns approved challenge-progress instances', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: COMMIT_SHA, commit: { tree: { sha: TREE_SHA } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        sha: TREE_SHA,
        truncated: false,
        tree: [
          { path: 'data/widgets/2026-08-31-no-sugar.json', type: 'blob', sha: WIDGET_SHA, size: 200 }
        ]
      });
    }
    if (url.includes(`/git/blobs/${WIDGET_SHA}`)) {
      return Response.json(encodeBlob(widgetJson));
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };

  const handler = createSurfaceWidgetsHandler({
    env: validEnv,
    fetchImpl,
    now: () => Date.parse('2026-08-01T06:00:00Z')
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.widgets.length, 1);
  assert.equal(payload.data.widgets[0].template_id, 'challenge-progress');
  assert.equal(payload.data.widgets[0].props.progress_pct, 42);
});
