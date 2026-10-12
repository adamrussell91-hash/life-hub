import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAlchemyLabHandler } from '../../netlify/functions/alchemy-lab.mjs';
import { createAiJobHandler } from '../../netlify/functions/ai-job.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { createCompositionHandler } from '../../netlify/functions/composition.mjs';
import { createCompositionsHandler } from '../../netlify/functions/compositions.mjs';
import { createExportHandler } from '../../netlify/functions/export.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
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
  const readStored = store.get.bind(store);
  store.get = async (key, options = {}) => {
    // A newly saved blob is unavailable through an eventually consistent read.
    if (key.startsWith('templates/compositions/') && options.consistency !== 'strong') return null;
    return readStored(key, options);
  };
  const deps = { env, now, getContentStore: async () => store };
  const created = await read(await createCompositionsHandler(deps)(
    request('https://api.adam-russell.com/api/compositions', {
      method: 'POST',
      body: { title: 'Essay frame', root: {
        id: 'section_1', type: 'block', block_type: 'section',
        variant: 'medium', visibility: 'student_teacher',
        content: { title: 'Essay frame', blocks: [] },
        layout: {}, print: {}, settings: {},
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z', schema_version: 1
      } }
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
  assert.equal(loaded.body.data.root.type, 'block');
  assert.equal(loaded.body.data.root.block_type, 'section');
});

test('compositions reject legacy-shaped and non-section roots instead of saving unusable records', async () => {
  const store = memoryStore();
  const handler = createCompositionsHandler({ env, now, getContentStore: async () => store });
  for (const root of [
    { type: 'section', content: { blocks: [] } },
    { type: 'block', block_type: 'rich_text', content: { html: '<p>Text</p>' } },
    { type: 'block', block_type: 'section' }
  ]) {
    const response = await handler(request('https://api.adam-russell.com/api/compositions', {
      method: 'POST', body: { title: 'Invalid', root }
    }));
    assert.equal(response.status, 400);
  }
});

test('publishing linked compositions freezes their source content while preserving the draft links', async () => {
  const root = {
    id: 'source_section', type: 'block', block_type: 'section', visibility: 'student_teacher',
    content: { title: 'Reading pack', blocks: [
      { id: 'source_text', type: 'block', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Read this</p><script>bad()</script>' } },
      { id: 'private_text', type: 'block', block_type: 'rich_text', visibility: 'teacher_only', content: { html: '<p>Private</p>' } }
    ] }
  };
  const linked = (id) => ({
    id, type: 'block', block_type: 'section', visibility: 'student_teacher',
    content: { title: 'Reading pack', blocks: [], link: { mode: 'linked', source_composition_id: 'composition_1' } }
  });
  const draft = { ...seed['lessons/lesson_1'], blocks: [linked('linked_1'), linked('linked_2')] };
  const store = memoryStore({
    'lessons/lesson_1': draft,
    'templates/compositions/composition_1': { id: 'composition_1', type: 'composition_template', status: 'active', root }
  });
  const handler = createLessonPublishHandler({ env, now, getContentStore: async () => store });
  const response = await handler(request('https://api.adam-russell.com/api/lessons/lesson_1/publish', { method: 'POST' }));
  assert.equal(response.status, 200);
  const published = await store.get('published/lessons/lesson_1', { type: 'json' });
  assert.equal(published.blocks.length, 2);
  const childIds = [];
  for (const section of published.blocks) {
    assert.equal(section.content.link, undefined);
    assert.equal(section.content.blocks.length, 1);
    assert.equal(section.content.blocks[0].content.html, '<p>Read this</p>');
    childIds.push(section.content.blocks[0].id);
  }
  assert.notEqual(childIds[0], childIds[1]);
  assert.deepEqual((await store.get('lessons/lesson_1')).blocks, draft.blocks);
  root.content.blocks[0].content.html = '<p>Changed source</p>';
  assert.equal(published.blocks[0].content.blocks[0].content.html, '<p>Read this</p>');
});

test('publish refuses a missing linked composition without writing a partial student snapshot', async () => {
  const store = memoryStore({ 'lessons/lesson_1': {
    ...seed['lessons/lesson_1'], blocks: [{
      id: 'linked_1', type: 'block', block_type: 'section', visibility: 'student_teacher',
      content: { title: 'Missing', blocks: [], link: { mode: 'linked', source_composition_id: 'missing' } }
    }]
  } });
  const handler = createLessonPublishHandler({ env, now, getContentStore: async () => store });
  const response = await handler(request('https://api.adam-russell.com/api/lessons/lesson_1/publish', { method: 'POST' }));
  assert.equal(response.status, 400);
  assert.equal(await store.get('published/lessons/lesson_1'), null);
});

test('a teacher-only composition root stays out of the student snapshot', async () => {
  const store = memoryStore({
    'lessons/lesson_1': { ...seed['lessons/lesson_1'], blocks: [{
      id: 'linked_1', type: 'block', block_type: 'section', visibility: 'student_teacher',
      content: { title: 'Private source', blocks: [], link: { mode: 'linked', source_composition_id: 'private' } }
    }] },
    'templates/compositions/private': {
      id: 'private', type: 'composition_template', status: 'active', root: {
        id: 'private_root', type: 'block', block_type: 'section', visibility: 'teacher_only',
        content: { title: 'Private source', blocks: [] }
      }
    }
  });
  const response = await createLessonPublishHandler({ env, now, getContentStore: async () => store })(
    request('https://api.adam-russell.com/api/lessons/lesson_1/publish', { method: 'POST' })
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await store.get('published/lessons/lesson_1')).blocks, []);
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
