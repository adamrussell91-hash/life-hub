import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAlchemyLabHandler } from '../../netlify/functions/alchemy-lab.mjs';
import { createAiJobHandler } from '../../netlify/functions/ai-job.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { createCompositionHandler } from '../../netlify/functions/composition.mjs';
import { createCompositionsHandler } from '../../netlify/functions/compositions.mjs';
import { createExportHandler } from '../../netlify/functions/export.mjs';
import { createRestoreFromTrashHandler } from '../../netlify/functions/restore-from-trash.mjs';
import { createScopeSequenceHandler } from '../../netlify/functions/scope-sequence.mjs';
import { createScopeSequencesHandler } from '../../netlify/functions/scope-sequences.mjs';
import { createTrashHandler } from '../../netlify/functions/trash.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  ALCHEMIST_SHARED_SECRET: 'alchem-secret',
  KNOWLEDGE_ALCHEMIST_URL: 'https://api.adam-russell.com/api/lesson-alchemist'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const now = () => Date.parse('2026-08-01T01:00:00Z');

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
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request(url, { method = 'GET', body, cookie = true } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      origin: 'https://life-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

const seed = {
  'subjects/subject_1': { id: 'subject_1', title: 'English', type: 'subject' },
  'units/unit_1': {
    id: 'unit_1',
    title: 'Unit',
    subject_id: 'subject_1',
    lesson_ids: ['lesson_1'],
    status: 'active'
  },
  'lessons/lesson_1': {
    id: 'lesson_1',
    title: 'Lesson',
    unit_id: 'unit_1',
    status: 'active',
    blocks: []
  },
  'lessons/lesson_trashed': {
    id: 'lesson_trashed',
    title: 'Old',
    status: 'trashed',
    previous_status: 'active',
    trashed_at: '2026-08-01T00:00:00Z'
  }
};

test('leftover Teaching operator routes reject anonymous callers', async () => {
  const store = memoryStore(seed);
  const deps = { env, now, getContentStore: async () => store };
  const urls = [
    ['POST', 'https://api.adam-russell.com/api/alchemy-lab'],
    ['GET', 'https://api.adam-russell.com/api/compositions'],
    ['GET', 'https://api.adam-russell.com/api/trash'],
    ['POST', 'https://api.adam-russell.com/api/scope-sequences'],
    ['GET', 'https://api.adam-russell.com/api/export?kind=archive'],
    ['GET', 'https://api.adam-russell.com/api/ai/jobs']
  ];
  const handlers = [
    createAlchemyLabHandler(deps),
    createCompositionsHandler(deps),
    createTrashHandler(deps),
    createScopeSequencesHandler(deps),
    createExportHandler(deps),
    createAiJobsHandler(deps)
  ];
  for (const [index, [method, url]] of urls.entries()) {
    const response = await handlers[index](request(url, {
      method,
      cookie: false,
      body: method === 'POST' ? {} : undefined
    }));
    assert.equal(response.status, 401);
  }
});

test('compositions list, create, and load', async () => {
  const store = memoryStore(seed);
  const deps = { env, now, getContentStore: async () => store };
  const created = await read(await createCompositionsHandler(deps)(
    request('https://api.adam-russell.com/api/compositions', {
      method: 'POST',
      body: { title: 'Essay frame', root: { type: 'section', content: { blocks: [] } } }
    })
  ));
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.data.title, 'Essay frame');
  const list = await read(await createCompositionsHandler(deps)(
    request('https://api.adam-russell.com/api/compositions')
  ));
  assert.equal(list.body.data.compositions.length, 1);
  const loaded = await read(await createCompositionHandler(deps)(
    request(`https://api.adam-russell.com/api/compositions/${created.body.data.id}`)
  ));
  assert.equal(loaded.body.data.root.type, 'section');
});

test('trash lists trashed records and restore returns them to active', async () => {
  const store = memoryStore(seed);
  const deps = { env, now, getContentStore: async () => store };
  const listed = await read(await createTrashHandler(deps)(
    request('https://api.adam-russell.com/api/trash')
  ));
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].id, 'lesson_trashed');
  const restored = await read(await createRestoreFromTrashHandler(deps)(
    request('https://api.adam-russell.com/api/lessons/lesson_trashed/restore-from-trash', { method: 'POST', body: {} })
  ));
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.status, 'active');
});

test('scope sequence create links the subject and accepts a timeline patch', async () => {
  const store = memoryStore(seed);
  const deps = { env, now, getContentStore: async () => store };
  const created = await read(await createScopeSequencesHandler(deps)(
    request('https://api.adam-russell.com/api/scope-sequences', {
      method: 'POST',
      body: { title: 'Y12 English', subject_id: 'subject_1', academic_year: 2026 }
    })
  ));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.week_count, 40);
  const patched = await read(await createScopeSequenceHandler(deps)(
    request(`https://api.adam-russell.com/api/scope-sequences/${created.body.data.id}`, {
      method: 'PATCH',
      body: {
        timeline_items: [{ kind: 'unit', unit_id: 'unit_1', start_week: 1, end_week: 4 }]
      }
    })
  ));
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.timeline_items[0].unit_id, 'unit_1');
});

test('export returns lesson, unit, and archive packs', async () => {
  const store = memoryStore(seed);
  const deps = { env, now, getContentStore: async () => store };
  const lesson = await read(await createExportHandler(deps)(
    request('https://api.adam-russell.com/api/export?kind=lesson&id=lesson_1')
  ));
  assert.equal(lesson.body.data.kind, 'lesson');
  assert.equal(lesson.body.data.lesson.id, 'lesson_1');
  const archive = await read(await createExportHandler(deps)(
    request('https://api.adam-russell.com/api/export?kind=archive')
  ));
  assert.equal(archive.body.data.kind, 'archive');
  assert.ok(archive.body.data.objects.lessons >= 1);
});

test('AI jobs create, conflict, poll, and resolve', async () => {
  const store = memoryStore(seed);
  const deps = { env, now, getContentStore: async () => store };
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', {
      method: 'POST',
      body: { lesson_id: 'lesson_1', agent: 'clementine', message: 'Draft a hook' }
    })
  ));
  assert.equal(created.status, 202);
  const conflict = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', {
      method: 'POST',
      body: { lesson_id: 'lesson_1', agent: 'clementine', message: 'Again' }
    })
  ));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.details.id, created.body.data.id);
  const polled = await read(await createAiJobHandler(deps)(
    request(`https://api.adam-russell.com/api/ai/jobs/${created.body.data.id}`)
  ));
  assert.equal(polled.body.data.status, 'working');
  const resolved = await read(await createAiJobHandler(deps)(
    request(`https://api.adam-russell.com/api/ai/jobs/${created.body.data.id}`, {
      method: 'PATCH',
      body: { resolution: 'dismissed' }
    })
  ));
  assert.equal(resolved.body.data.resolution, 'dismissed');
});

test('Alchemy Lab proxies lessonText to the alchemist with the Life session', async () => {
  const handler = createAlchemyLabHandler({
    env,
    now,
    fetchImpl: async (url, init) => {
      assert.equal(url, env.KNOWLEDGE_ALCHEMIST_URL);
      assert.equal(init.headers['x-alchemist-secret'], 'alchem-secret');
      assert.deepEqual(JSON.parse(init.body), { lessonText: 'Miller chunking' });
      return new Response(JSON.stringify({
        connections: [{
          sourcePageId: 'page_1',
          summary: 'Working memory is limited',
          sourcePageTitle: 'Miller'
        }],
        mode: 'synthesis'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const result = await read(await handler(request('https://api.adam-russell.com/api/alchemy-lab', {
    method: 'POST',
    body: { lessonText: 'Miller chunking' }
  })));
  assert.equal(result.status, 200);
  assert.equal(result.body.data.mode, 'synthesis');
  assert.equal(result.body.data.connections[0].sourcePageId, 'page_1');
});
