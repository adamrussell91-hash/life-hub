import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createStallHandler } from '../../netlify/functions/stall.mjs';
import { createTemplatesHandler } from '../../netlify/functions/templates.mjs';

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

function request({ url, method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://tasks-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('templates list and save/create a task template behind the Life session', async () => {
  const store = memoryStore({
    'tasks/task_1': {
      id: 'task_1',
      title: 'Mark 12 English',
      domain: 'teaching',
      priority: 'high',
      tags: ['clare']
    }
  });
  const handler = createTemplatesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });

  const listed = await handler(request({ url: 'https://api.adam-russell.com/api/templates' }));
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).data.task_templates, []);

  const saved = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/templates',
    body: { action: 'save_task_as_template', task_id: 'task_1', name: 'Marking' }
  }));
  assert.equal(saved.status, 201);
  const template = (await saved.json()).data;
  assert.equal(template.name, 'Marking');

  const created = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/templates',
    body: { action: 'create_task_from_template', template_id: template.id }
  }));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).data.title, 'Mark 12 English');
});

test('stall flags a quiet project and records a revive', async () => {
  const store = memoryStore({
    'projects/p1': {
      id: 'p1',
      title: 'Quiet project',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z'
    }
  });
  const handler = createStallHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });

  const flagged = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/stall',
    body: { action: 'flag_stalled', weeks: 6 }
  }));
  assert.equal(flagged.status, 200);
  const flagBody = (await flagged.json()).data;
  assert.equal(flagBody.candidates, 1);
  assert.equal(flagBody.flagged[0].status, 'stalled');

  const resolved = await handler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/stall',
    body: { action: 'resolve', project_id: 'p1', outcome: 'revived', reason: 'Moving again' }
  }));
  assert.equal(resolved.status, 200);
  const result = (await resolved.json()).data;
  assert.equal(result.project.status, 'revived');
  assert.equal(result.review.reason, 'Moving again');
});
