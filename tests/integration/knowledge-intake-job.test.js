import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobHandler } from '../../netlify/functions/ai-job.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { createKnowledgeTidyHandler } from '../../netlify/functions/knowledge-tidy.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  ANTHROPIC_API_KEY: 'anthropic-test',
  GITHUB_TOKEN: 'knowledge-read-token'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const now = () => Date.parse('2026-08-01T01:00:00Z');

const page = {
  id: 'note-1',
  title: 'Old title',
  tags: ['Note'],
  body: 'Messy body',
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z',
  schema_version: 1
};

const proposal = {
  tags: ['Learning Science and Cognition'],
  title: 'Working memory',
  body: 'Miller seven plus or minus two.'
};

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
    async set(key, value) {
      map.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    }
  };
}

function request(url, { method = 'GET', body, origin = 'https://life-hub.adam-russell.com' } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

function intakeDeps(store, saved = []) {
  return {
    env,
    now,
    getContentStore: async () => store,
    nowIso: () => '2026-09-06T02:00:00.000Z',
    getPage: async id => (id === page.id ? { ...page } : null),
    proposeTidy: async () => proposal,
    savePage: async next => {
      saved.push(next);
      return { ...next, updated_at: '2026-09-06T02:05:00.000Z' };
    }
  };
}

test('POST /api/ai/jobs knowledge_intake runs to awaiting review without writing', async () => {
  const store = memoryStore();
  const saved = [];
  const deps = intakeDeps(store, saved);
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', {
      method: 'POST',
      body: { kind: 'knowledge_intake', page_id: 'note-1', agent: 'clementine' }
    })
  ));
  assert.equal(created.status, 202);
  assert.equal(created.body.data.kind, 'knowledge_intake');
  assert.equal(created.body.data.phase, 'awaiting_review');
  assert.deepEqual(created.body.data.proposal, proposal);
  assert.equal(saved.length, 0);

  const conflict = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', {
      method: 'POST',
      body: { kind: 'knowledge_intake', page_id: 'note-1', agent: 'clementine' }
    })
  ));
  assert.equal(conflict.status, 409);
});

test('PATCH /api/ai/jobs/:id accepts a tidy proposal and writes once', async () => {
  const store = memoryStore();
  const saved = [];
  const deps = intakeDeps(store, saved);
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', {
      method: 'POST',
      body: { kind: 'knowledge_intake', page_id: 'note-1' }
    })
  ));
  const accepted = await read(await createAiJobHandler(deps)(
    request(`https://api.adam-russell.com/api/ai/jobs/${created.body.data.id}`, {
      method: 'PATCH',
      body: { resolution: 'accepted' }
    })
  ));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.phase, 'done');
  assert.equal(accepted.body.data.resolution, 'accepted');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, 'Working memory');
});

test('Knowledge tidy starts an intake job; apply:true still writes immediately', async () => {
  const store = memoryStore();
  const saved = [];
  const deps = intakeDeps(store, saved);
  const started = await read(await createKnowledgeTidyHandler(deps)(
    request('https://api.adam-russell.com/api/knowledge/tidy', {
      method: 'POST',
      origin: 'https://knowledge-hub.adam-russell.com',
      body: { id: 'note-1' }
    })
  ));
  assert.equal(started.status, 202);
  assert.equal(started.body.data.phase, 'awaiting_review');
  assert.equal(saved.length, 0);

  const rejected = await read(await createKnowledgeTidyHandler(deps)(
    request('https://api.adam-russell.com/api/knowledge/tidy', {
      method: 'PATCH',
      origin: 'https://knowledge-hub.adam-russell.com',
      body: { job_id: started.body.data.id, resolution: 'rejected' }
    })
  ));
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.resolution, 'rejected');
  assert.equal(saved.length, 0);

  const applied = await read(await createKnowledgeTidyHandler(deps)(
    request('https://api.adam-russell.com/api/knowledge/tidy', {
      method: 'POST',
      origin: 'https://knowledge-hub.adam-russell.com',
      body: { id: 'note-1', apply: true }
    })
  ));
  assert.equal(applied.status, 200);
  assert.equal(applied.body.data.title, 'Working memory');
  assert.equal(saved.length, 1);
});
