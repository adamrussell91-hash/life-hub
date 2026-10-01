import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatPendingHandler } from '../../netlify/functions/chat-pending.mjs';
import { PENDING_ACTIONS_PATH } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

test('GET /api/chat/pending returns live Confirm projections without write content', async () => {
  const queue = JSON.stringify([
    {
      id: 'act_live',
      createdAt: '2026-10-01',
      slug: 'clare',
      status: 'pending',
      proposal: {
        intent: 'Move Lisa review',
        writes: [
          {
            path: 'tasks:task:1',
            mode: 'overwrite',
            diff: 'Lisa',
            content: 'SECRET'
          }
        ]
      }
    },
    {
      id: 'act_dead',
      createdAt: '2026-10-01',
      slug: 'clare',
      status: 'consumed',
      proposal: { intent: 'Gone', writes: [] }
    }
  ]);

  const handler = createChatPendingHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    createGitHubClient: () => ({
      async resolveTree() {
        return {
          tree: [{ path: PENDING_ACTIONS_PATH, type: 'blob', sha: 'sha1' }],
          commitSha: 'c',
          treeSha: 't'
        };
      },
      async readBlob() {
        return {
          encoding: 'base64',
          content: Buffer.from(queue, 'utf8').toString('base64')
        };
      }
    })
  });

  const response = await handler(
    new Request('https://life.example/api/chat/pending', {
      method: 'GET',
      headers: { cookie: `life_hub_session=${session}` }
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.count, 1);
  assert.equal(body.data.pending[0].id, 'act_live');
  assert.equal(body.data.pending[0].proposal.intent, 'Move Lisa review');
  assert.equal(body.data.pending[0].proposal.writes[0].content, undefined);
  assert.equal(JSON.stringify(body).includes('SECRET'), false);
});
