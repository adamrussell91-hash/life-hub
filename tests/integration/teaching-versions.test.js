import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createClassHandler } from '../../netlify/functions/class.mjs';
import { createLessonHandler } from '../../netlify/functions/lesson.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { createTeachingVersionsHandler } from '../../netlify/functions/teaching-versions.mjs';
import { createUnitHandler } from '../../netlify/functions/unit.mjs';
import { parseVersionPath } from '../../netlify/functions/teaching-versions.mjs';

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
    async set(key, value) {
      map.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    },
    async delete(key) {
      map.delete(key);
    },
    snapshot() {
      return Object.fromEntries(map);
    }
  };
}

function lesson(id = 'lesson_1', title = 'Draft lesson') {
  return {
    id,
    type: 'lesson',
    title,
    slug: 'draft-lesson',
    status: 'active',
    unit_id: 'unit_1',
    sequence: 1,
    blocks: [{ id: 'b1' }],
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    schema_version: 1
  };
}

function request(url, { cookie = true, method = 'GET', body, origin = 'https://teaching-hub.adam-russell.com' } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function deps(store) {
  return {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

test('version path parser covers collection, item, and restore', () => {
  assert.deepEqual(parseVersionPath('/api/lessons/lesson_1/versions'), {
    kind: 'lesson',
    parentId: 'lesson_1',
    revision: null,
    restore: false
  });
  assert.deepEqual(parseVersionPath('/api/units/unit_1/versions/3'), {
    kind: 'unit',
    parentId: 'unit_1',
    revision: 3,
    restore: false
  });
  assert.deepEqual(parseVersionPath('/api/classes/class_1/versions/2/restore'), {
    kind: 'class_homepage',
    parentId: 'class_1',
    revision: 2,
    restore: true
  });
  assert.equal(parseVersionPath('/api/lessons/lesson_1/versions/nope').invalidRevision, true);
});

test('version routes require the Life session', async () => {
  const handler = createTeachingVersionsHandler(deps(memoryStore({
    'lessons/lesson_1': lesson()
  })));
  const list = await handler(request('https://api.adam-russell.com/api/lessons/lesson_1/versions', {
    cookie: false
  }));
  assert.equal(list.status, 401);
});

test('manual checkpoint, list, get, restore for a lesson', async () => {
  const store = memoryStore({ 'lessons/lesson_1': lesson() });
  const versions = createTeachingVersionsHandler(deps(store));
  const lessons = createLessonHandler(deps(store));

  const created = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions',
    { method: 'POST', body: { label: 'Before rewrite' } }
  )));
  assert.equal(created.status, 200);
  assert.equal(created.body.data.revision, 1);
  assert.equal(created.body.data.reason, 'manual_checkpoint');
  assert.equal(created.body.data.label, 'Before rewrite');
  assert.equal(created.body.data.snapshot.title, 'Draft lesson');

  const list = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions'
  )));
  assert.equal(list.status, 200);
  assert.equal(list.body.data.latest_revision, 1);
  assert.equal(list.body.data.entries[0].label, 'Before rewrite');

  await read(await lessons(request(
    'https://api.adam-russell.com/api/lessons/lesson_1',
    { method: 'PUT', body: { ...lesson(), title: 'Current draft' } }
  )));

  const restore = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions/1/restore',
    { method: 'POST', body: {} }
  )));
  assert.equal(restore.status, 200);
  assert.equal(restore.body.data.title, 'Draft lesson');

  const after = await read(await lessons(request(
    'https://api.adam-russell.com/api/lessons/lesson_1'
  )));
  assert.equal(after.body.data.title, 'Draft lesson');

  const listAfter = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions'
  )));
  assert.equal(listAfter.body.data.entries.some(entry => entry.reason === 'restore'), true);

  const restoreBlob = await read(await versions(request(
    `https://api.adam-russell.com/api/lessons/lesson_1/versions/${listAfter.body.data.entries[0].revision}`
  )));
  assert.equal(restoreBlob.body.data.snapshot.title, 'Current draft');
});

test('restore does not change the published lesson snapshot', async () => {
  const published = { lesson_id: 'lesson_1', title: 'Published title', blocks: [] };
  const store = memoryStore({
    'lessons/lesson_1': lesson('lesson_1', 'Draft lesson'),
    'published/lessons/lesson_1': published
  });
  const versions = createTeachingVersionsHandler(deps(store));

  await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions',
    { method: 'POST', body: { label: 'Original' } }
  ));
  store.setJSON('lessons/lesson_1', lesson('lesson_1', 'Edited after publish'));

  const restore = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions/1/restore',
    { method: 'POST', body: {} }
  )));
  assert.equal(restore.status, 200);
  assert.equal(restore.body.data.title, 'Draft lesson');
  assert.deepEqual(store.snapshot()['published/lessons/lesson_1'], published);
});

test('publish writes a publish checkpoint; AI accept writes ai_accepted', async () => {
  const store = memoryStore({ 'lessons/lesson_1': lesson() });
  const versions = createTeachingVersionsHandler(deps(store));
  const publish = createLessonPublishHandler(deps(store));
  const lessons = createLessonHandler(deps(store));

  const published = await read(await publish(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/publish',
    { method: 'POST', body: {} }
  )));
  assert.equal(published.status, 200);

  const afterPublish = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions'
  )));
  assert.equal(afterPublish.body.data.entries.some(entry => entry.reason === 'publish'), true);

  const put = await read(await lessons(request(
    'https://api.adam-russell.com/api/lessons/lesson_1',
    {
      method: 'PUT',
      body: { ...lesson(), title: 'AI accepted title', checkpoint_reason: 'ai_accepted' }
    }
  )));
  assert.equal(put.status, 200);
  assert.equal(put.body.data.title, 'AI accepted title');
  assert.equal(put.body.data.checkpoint_reason, undefined);

  const afterAccept = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions'
  )));
  assert.equal(afterAccept.body.data.entries[0].reason, 'ai_accepted');
});

test('unit and class PUT write ai_accepted checkpoints', async () => {
  const store = memoryStore({
    'units/unit_1': {
      id: 'unit_1',
      type: 'unit',
      title: 'Unit A',
      lesson_ids: ['lesson_1']
    },
    'classes/class_1': {
      id: 'class_1',
      type: 'class',
      title: '7A',
      code: '7A',
      meeting_days: [1],
      homepage: { announcements: [], resources: [], custom: [] }
    }
  });
  const versions = createTeachingVersionsHandler(deps(store));
  const units = createUnitHandler(deps(store));
  const classes = createClassHandler(deps(store));

  const unitPut = await read(await units(request(
    'https://api.adam-russell.com/api/units/unit_1',
    {
      method: 'PUT',
      body: {
        id: 'unit_1',
        type: 'unit',
        title: 'Unit accepted',
        lesson_ids: ['lesson_1'],
        checkpoint_reason: 'ai_accepted'
      }
    }
  )));
  assert.equal(unitPut.status, 200);
  const unitList = await read(await versions(request(
    'https://api.adam-russell.com/api/units/unit_1/versions'
  )));
  assert.equal(unitList.body.data.entries[0].reason, 'ai_accepted');

  const classPut = await read(await classes(request(
    'https://api.adam-russell.com/api/classes/class_1',
    {
      method: 'PUT',
      body: {
        id: 'class_1',
        type: 'class',
        title: '7A',
        homepage: { announcements: [{ id: 'a1' }], resources: [], custom: [] },
        checkpoint_reason: 'ai_accepted'
      }
    }
  )));
  assert.equal(classPut.status, 200);
  const classList = await read(await versions(request(
    'https://api.adam-russell.com/api/classes/class_1/versions'
  )));
  assert.equal(classList.body.data.entries[0].reason, 'ai_accepted');
});

test('unit and class version routes restore the right live object', async () => {
  const store = memoryStore({
    'units/unit_1': {
      id: 'unit_1',
      type: 'unit',
      title: 'Unit A',
      lesson_ids: ['lesson_1']
    },
    'classes/class_1': {
      id: 'class_1',
      type: 'class',
      title: '7A',
      code: '7A',
      meeting_days: [1],
      homepage: { announcements: [], resources: [], custom: [] }
    }
  });
  const versions = createTeachingVersionsHandler(deps(store));

  await versions(request(
    'https://api.adam-russell.com/api/units/unit_1/versions',
    { method: 'POST', body: { label: 'Unit checkpoint' } }
  ));
  store.setJSON('units/unit_1', {
    id: 'unit_1',
    type: 'unit',
    title: 'Unit edited',
    lesson_ids: ['lesson_1']
  });
  const unitRestore = await read(await versions(request(
    'https://api.adam-russell.com/api/units/unit_1/versions/1/restore',
    { method: 'POST', body: {} }
  )));
  assert.equal(unitRestore.status, 200);
  assert.equal(unitRestore.body.data.title, 'Unit A');

  await versions(request(
    'https://api.adam-russell.com/api/classes/class_1/versions',
    { method: 'POST', body: {} }
  ));
  store.setJSON('classes/class_1', {
    id: 'class_1',
    type: 'class',
    title: '7A',
    code: '7A',
    meeting_days: [1],
    homepage: { announcements: [{ id: 'new' }], resources: [], custom: [] }
  });
  const classRestore = await read(await versions(request(
    'https://api.adam-russell.com/api/classes/class_1/versions/1/restore',
    { method: 'POST', body: {} }
  )));
  assert.equal(classRestore.status, 200);
  assert.deepEqual(classRestore.body.data.homepage.announcements, []);
  assert.equal(classRestore.body.data.code, '7A');
});

test('missing revision is 404', async () => {
  const versions = createTeachingVersionsHandler(deps(memoryStore({
    'lessons/lesson_1': lesson()
  })));
  const missing = await read(await versions(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/versions/9'
  )));
  assert.equal(missing.status, 404);
});
