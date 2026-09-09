/**
 * Queue + durable turn Confirm round trip through the real chat and confirm handlers.
 * Not a live model conversation after Confirm.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';
import { AGENT_TURNS_PATH } from '../../netlify/functions/_shared/agent-turn-store.mjs';
import { PENDING_ACTIONS_PATH } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01',
  ANTHROPIC_API_KEY: 'anthropic-secret-key'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const NOW = () => Date.parse('2026-08-01T06:00:00Z');
const CHALLENGE = 'data/challenges/2026-08-01-no-sugar.json';

function chatRequest(body) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function confirmRequest(body) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

function sha40(n) {
  return String(n).padStart(40, '0');
}

function statefulGithub() {
  const blobs = new Map();
  const puts = [];
  let seq = 1;
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: sha40(9), commit: { tree: { sha: sha40(8) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [...blobs.entries()].map(([path, blob]) => ({ path, type: 'blob', sha: blob.sha }))
      });
    }
    const blobMatch = /\/git\/blobs\/([0-9a-f]{40})/.exec(url);
    if (blobMatch) {
      const found = [...blobs.values()].find(item => item.sha === blobMatch[1]);
      if (!found) return Response.json({ message: 'not found' }, { status: 404 });
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(found.content, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      const path = decodeURIComponent(url.split('/contents/')[1] ?? '');
      const body = JSON.parse(options.body);
      const content = Buffer.from(body.content, 'base64').toString('utf8');
      const sha = sha40(seq);
      seq += 1;
      blobs.set(path, { sha, content });
      puts.push({ path, content, url });
      return Response.json({ content: { sha }, commit: { sha: sha40(7) } });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  return { fetchImpl, blobs, puts };
}

const proposalInput = {
  intent: 'open a 7-day no-refined-sugar tracker',
  writes: [{
    path: CHALLENGE,
    mode: 'create',
    content: JSON.stringify({ title: 'No refined sugar', duration_days: 7 }, null, 2),
    diff: 'new challenge file'
  }]
};

test('chat proposal checkpoints a turn, confirm reloads it, write runs once', async () => {
  const github = statefulGithub();
  const chat = createChatHandler({
    env: validEnv,
    now: NOW,
    fetchImpl: github.fetchImpl,
    createAnthropicClient: () => ({
      async *streamMessage(args) {
        const result = await args.executeTools({
          id: 'call_act',
          name: 'os_propose_action',
          input: proposalInput
        });
        assert.equal(JSON.parse(result).status, 'awaiting_confirm');
        yield { type: 'done' };
      }
    })
  });

  const events = await readSse(await chat(chatRequest({
    message: 'Brisket, open a no-sugar week tracker',
    priorAgentSlug: 'brisket',
    agentKernel: true
  })));
  const card = events.find(event => event.type === 'action_proposal');
  assert.ok(card?.id);
  assert.equal(card.turnBound, true);

  const pending = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, card.id);
  assert.ok(pending[0].turnId);
  assert.ok(pending[0].actionId);
  const turns = JSON.parse(github.blobs.get(AGENT_TURNS_PATH).content);
  assert.ok(turns[pending[0].turnId]);
  assert.equal(turns[pending[0].turnId].stores, undefined);
  assert.equal(turns[pending[0].turnId].actions[0].status, 'pending');

  let continuationCalls = 0;
  const confirm = createChatConfirmHandler({
    env: validEnv,
    fetchImpl: github.fetchImpl,
    now: NOW,
    continueConversation: async () => {
      continuationCalls += 1;
      return { text: 'Done. The tracker is open.' };
    }
  });
  const first = await confirm(confirmRequest({
    kind: 'action',
    slug: 'brisket',
    id: card.id
  }));
  const firstPayload = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstPayload.data.intent, proposalInput.intent);
  assert.equal(firstPayload.data.turnResumed, true);
  assert.equal(firstPayload.data.continuation.invoked, true);
  assert.match(firstPayload.data.continuation.text, /tracker is open/i);
  assert.ok(github.puts.some(put => put.path === CHALLENGE));
  const afterTurns = JSON.parse(github.blobs.get(AGENT_TURNS_PATH).content);
  assert.equal(afterTurns[pending[0].turnId].actions[0].status, 'executed');
  assert.equal(afterTurns[pending[0].turnId].continuation.status, 'done');
  assert.equal(afterTurns[pending[0].turnId].stores, undefined);
  const challengeWrites = github.puts.filter(put => put.path === CHALLENGE).length;
  assert.equal(continuationCalls, 1);

  const second = await confirm(confirmRequest({
    kind: 'action',
    slug: 'brisket',
    id: card.id
  }));
  assert.notEqual(second.status, 200);
  assert.equal(github.puts.filter(put => put.path === CHALLENGE).length, challengeWrites);
  assert.equal(continuationCalls, 1);
});

test('chat dismiss rejects the persisted turn and does not write the proposal', async () => {
  const github = statefulGithub();
  const chat = createChatHandler({
    env: validEnv,
    now: NOW,
    fetchImpl: github.fetchImpl,
    createAnthropicClient: () => ({
      async *streamMessage(args) {
        await args.executeTools({
          id: 'call_act',
          name: 'os_propose_action',
          input: proposalInput
        });
        yield { type: 'done' };
      }
    })
  });
  const events = await readSse(await chat(chatRequest({
    message: 'Brisket, open a no-sugar week tracker',
    priorAgentSlug: 'brisket',
    agentKernel: true
  })));
  const card = events.find(event => event.type === 'action_proposal');
  const pending = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content)[0];
  const confirm = createChatConfirmHandler({
    env: validEnv,
    fetchImpl: github.fetchImpl,
    now: NOW
  });
  const dismissed = await confirm(confirmRequest({
    kind: 'action_dismiss',
    slug: 'brisket',
    id: card.id
  }));
  assert.equal(dismissed.status, 200);
  assert.equal(github.puts.filter(put => put.path === CHALLENGE).length, 0);
  const turns = JSON.parse(github.blobs.get(AGENT_TURNS_PATH).content);
  assert.equal(turns[pending.turnId].actions[0].status, 'rejected');
  const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
  const tomb = queue.find(item => item.id === card.id);
  assert.ok(tomb, 'dismissed action remains as a durable tombstone');
  assert.equal(tomb.status, 'dismissed');
  assert.ok(typeof tomb.dismissedAt === 'string' && tomb.dismissedAt);
});

test('failed required checkpoint does not bind a turnId to the pending action', async () => {
  const github = statefulGithub();
  const fetchImpl = async (url, options) => {
    if (options?.method === 'PUT' && url.includes('agent-turns.json')) {
      return Response.json({ message: 'unavailable' }, { status: 500 });
    }
    return github.fetchImpl(url, options);
  };
  const chat = createChatHandler({
    env: validEnv,
    now: NOW,
    fetchImpl,
    createAnthropicClient: () => ({
      async *streamMessage(args) {
        await args.executeTools({
          id: 'call_act',
          name: 'os_propose_action',
          input: proposalInput
        });
        yield { type: 'done' };
      }
    })
  });
  const events = await readSse(await chat(chatRequest({
    message: 'Brisket, open a no-sugar week tracker',
    priorAgentSlug: 'brisket',
    agentKernel: true
  })));
  const card = events.find(event => event.type === 'action_proposal');
  assert.ok(card.id);
  assert.equal(card.turnBound, false);
  assert.equal(card.resumeUnavailable, true);
  const pending = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
  assert.equal(pending[0].turnId, null);
  assert.equal(pending[0].resumeUnavailable, true);
});
