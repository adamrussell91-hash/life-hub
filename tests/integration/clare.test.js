import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createClareHandler } from '../../netlify/functions/clare.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({ cookie = true, url, method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      origin: 'https://tasks-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('Clare propose and accept stay behind the Life session and write Tasks', async () => {
  const store = memoryStore();
  const handler = createClareHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });

  const proposed = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'propose', title: 'Marking load', domain: 'teaching' }
  }));
  assert.equal(proposed.status, 200);
  const proposal = (await proposed.json()).data;
  assert.equal(proposal.domain, 'teaching');
  assert.ok(proposal.proposed_minutes >= 15);
  assert.match(proposal.framework_id, /^fw_/);

  const accepted = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'accept', proposal, accepted_minutes: 50 }
  }));
  assert.equal(accepted.status, 201);
  const created = (await accepted.json()).data;
  assert.match(created.task.id, /^task_/);
  assert.equal(created.task.source, 'suggested_by_agent');
  assert.equal(created.calibration.sample_count, 1);

  const dumped = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'dump', text: 'Email parents\nWrite comment bank', domain: 'teaching' }
  }));
  assert.equal(dumped.status, 200);
  const dump = (await dumped.json()).data;
  assert.equal(dump.proposals.length, 2);
  assert.ok(dump.voice);
  assert.ok(Array.isArray(dump.questions));
  assert.equal(dump.toolkit, null);
  assert.equal(dump.agent, 'clare');

  const shattered = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: {
      action: 'dump',
      text: 'Mark the Year 12 papers',
      domain: 'teaching',
      protocol_id: 'shatter-start'
    }
  }));
  assert.equal(shattered.status, 200);
  const shatter = (await shattered.json()).data;
  assert.equal(shatter.toolkit.title, 'Task paralysis shatterer');
  assert.equal(shatter.proposals[0].protocol_id, 'shatter-start');

  const briefed = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'brief', protocol_id: 'morning-sweep' }
  }));
  assert.equal(briefed.status, 200);
  const briefing = (await briefed.json()).data;
  assert.equal(briefing.protocol_id, 'morning-sweep');
  assert.ok(briefing.lead);
  assert.equal(briefing.closer, 'That is your day. Dump away.');

  await store.setJSON('tasks/task_existing', {
    id: 'task_existing',
    title: 'Move the florist quote',
    status: 'open',
    domain: 'wedding',
    due_date: '2026-08-10'
  });
  const mutated = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: {
      action: 'apply_mutations',
      mutations: [{
        kind: 'task_update',
        summary: 'Push the florist',
        task_id: 'task_existing',
        patch: { due_date: '2026-08-12', title: 'hijack', schema_version: 99 }
      }]
    }
  }));
  assert.equal(mutated.status, 200);
  const mutationResult = (await mutated.json()).data.results[0];
  assert.equal(mutationResult.ok, true);
  const updated = await store.get('tasks/task_existing', { type: 'json' });
  assert.equal(updated.due_date, '2026-08-12');
  assert.equal(updated.schema_version, 1);

  const anon = await handler(request({
    cookie: false,
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'propose', title: 'Nope', domain: 'teaching' }
  }));
  assert.equal(anon.status, 401);
});

test('dump_stream emits status, voice chunks, dump_result, and done over SSE', async () => {
  const store = memoryStore();
  const handler = createClareHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });

  const response = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'dump_stream', text: 'Email parents about camp', domain: 'teaching' }
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const body = await response.text();
  const events = body
    .split('\n\n')
    .map(frame => frame.split('\n').find(line => line.startsWith('data:')))
    .filter(Boolean)
    .map(line => JSON.parse(line.slice(5).trim()));

  assert.equal(events[0]?.type, 'status');
  assert.ok(events.some(event => event.type === 'text' && typeof event.delta === 'string' && event.delta.length > 0));
  const dump = events.find(event => event.type === 'dump_result');
  assert.ok(dump?.result?.voice);
  assert.ok(Array.isArray(dump.result.proposals));
  assert.equal(events.at(-1)?.type, 'done');
});

