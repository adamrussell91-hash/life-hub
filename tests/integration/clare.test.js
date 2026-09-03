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
  assert.equal((await dumped.json()).data.proposals.length, 2);

  const anon = await handler(request({
    cookie: false,
    method: 'POST',
    url: 'https://api.adam-russell.com/api/clare',
    body: { action: 'propose', title: 'Nope', domain: 'teaching' }
  }));
  assert.equal(anon.status, 401);
});
