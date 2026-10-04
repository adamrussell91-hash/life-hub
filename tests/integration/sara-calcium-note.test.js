import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';
import {
  buildAgentTools,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { selectCapabilityIdsForTurn } from '../../netlify/functions/_shared/capabilities/intent-router.mjs';

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

function request(body) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

function cnWriteFetch(puts) {
  const cnSha = '9'.repeat(40);
  const cn = [
    '# Purpose',
    'Purpose body.',
    '## 🔴 Current Constraints & Priorities',
    '- Existing rule',
    "## ⚡ Today's Status (Saturday 1 August 2026)",
    '**Flags:** Quiet day.',
    '## 🤝 Cross-Agent Coordination',
    '*One-line directives only.*',
    '## 📝 Recent Agent Actions',
    '*48-hour rolling window.*'
  ].join('\n');
  return async (url, options) => {
    if (options?.method === 'PUT') {
      puts.push({ url, body: JSON.parse(options.body) });
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [{ path: 'central-node.md', type: 'blob', sha: cnSha, size: cn.length }] });
    }
    if (url.includes(`/git/blobs/${cnSha}`)) {
      return Response.json({ encoding: 'base64', content: Buffer.from(cn, 'utf8').toString('base64') });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

test('Sara screenshot: yes / calcium note for Brisket still has coordinate_request_cn_write', () => {
  resetCapabilityCaches();
  for (const message of [
    'And yes to the calcium note',
    'Make the calcium note for brisket'
  ]) {
    const ids = selectCapabilityIdsForTurn({ slug: 'sara', message });
    assert.ok(
      ids.includes('coordinate.request-cn-write'),
      `expected CN write capability on ${JSON.stringify(message)}; got ${ids.join(',')}`
    );
    const tools = buildAgentTools({
      slug: 'sara',
      allowedTypes: ['medical', 'weight', 'composition', 'measurements', 'bloods'],
      needsSaraMedicalTools: true,
      message
    });
    assert.ok(
      tools.some(tool => tool.name === 'coordinate_request_cn_write'),
      `expected coordinate_request_cn_write in Sara tools for ${JSON.stringify(message)}`
    );
  }
});

test('Sara "yes to the calcium note" still lists coordinate_request_cn_write and can write it', async () => {
  const puts = [];
  let toolNames = [];
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: cnWriteFetch(puts),
    createAnthropicClient: () => ({
      async *streamMessage(args) {
        toolNames = (args.tools ?? []).map(tool => tool.name);
        const result = JSON.parse(await args.executeTools({
          id: 'call_cn',
          name: 'coordinate_request_cn_write',
          input: {
            section: 'cross_agent',
            op: 'append_line',
            text: '- Sara→Brisket: flag the ~535mg/day calcium average against the 1,000mg bone target.',
            summary: 'Calcium note for Brisket',
            reason: 'Adam said yes to sending the calcium note'
          }
        }));
        assert.equal(result.status, 'applied');
        yield { type: 'text', delta: 'Sent Brisket the calcium flag.' };
        yield { type: 'done' };
      }
    })
  });

  const events = (await readSse(await handler(request({
    message: 'And yes to the calcium note',
    priorAgentSlug: 'sara',
    history: [
      { role: 'assistant', content: 'Want me to send that calcium note to Brisket now?' }
    ]
  })))).filter(event => event.type !== 'status');

  assert.ok(
    toolNames.includes('coordinate_request_cn_write'),
    `CN write tool missing; tools were ${toolNames.join(',')}`
  );
  assert.ok(events.some(event => event.type === 'central_node_patched'));
  assert.ok(events.some(event => event.type === 'text' && /Brisket/.test(event.delta)));
  assert.ok(!events.some(event => event.code === 'turn_incomplete'));
});
