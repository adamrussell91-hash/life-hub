import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonTemplateHandler } from '../../netlify/functions/lesson-template.mjs';
import { createLessonTemplatesHandler } from '../../netlify/functions/lesson-templates.mjs';
import { createUnitTemplateHandler } from '../../netlify/functions/unit-template.mjs';
import { createUnitTemplatesHandler } from '../../netlify/functions/unit-templates.mjs';

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

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url,
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('lesson and unit template collections list active summaries and hide trash', async () => {
  const store = memoryStore({
    'templates/lessons/lt_live': {
      id: 'lt_live',
      title: 'Essay plan',
      status: 'active',
      updated_at: '2026-08-01T00:00:00.000Z'
    },
    'templates/lessons/lt_trash': {
      id: 'lt_trash',
      title: 'Old plan',
      status: 'trashed',
      updated_at: '2026-08-01T00:00:00.000Z'
    },
    'templates/units/ut_live': {
      id: 'ut_live',
      title: 'Floating World',
      status: 'active',
      updated_at: '2026-08-01T00:00:00.000Z'
    }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const lessons = await createLessonTemplatesHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/lesson-templates' })
  );
  assert.equal(lessons.status, 200);
  assert.deepEqual((await lessons.json()).data.templates, [
    { id: 'lt_live', title: 'Essay plan', updated_at: '2026-08-01T00:00:00.000Z' }
  ]);

  const units = await createUnitTemplatesHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/unit-templates' })
  );
  assert.equal(units.status, 200);
  assert.deepEqual((await units.json()).data.templates, [
    { id: 'ut_live', title: 'Floating World', updated_at: '2026-08-01T00:00:00.000Z' }
  ]);
});

test('lesson and unit template collections create and fetch a record', async () => {
  const store = memoryStore();
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const createdLesson = await createLessonTemplatesHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/lesson-templates',
      body: { title: 'Memory, Identity and Ono', blocks: [] }
    })
  );
  assert.equal(createdLesson.status, 201);
  const lesson = (await createdLesson.json()).data;
  assert.equal(lesson.title, 'Memory, Identity and Ono');
  assert.equal(lesson.type, 'lesson_template');
  assert.equal(lesson.status, 'active');

  const fetchedLesson = await createLessonTemplateHandler(deps)(
    request({ url: `https://api.adam-russell.com/api/lesson-templates/${lesson.id}` })
  );
  assert.equal(fetchedLesson.status, 200);
  assert.equal((await fetchedLesson.json()).data.id, lesson.id);

  const createdUnit = await createUnitTemplatesHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/unit-templates',
      body: { title: 'Artist of the Floating World' }
    })
  );
  assert.equal(createdUnit.status, 201);
  const unit = (await createdUnit.json()).data;
  assert.equal(unit.type, 'unit_template');

  const fetchedUnit = await createUnitTemplateHandler(deps)(
    request({ url: `https://api.adam-russell.com/api/unit-templates/${unit.id}` })
  );
  assert.equal(fetchedUnit.status, 200);
  assert.equal((await fetchedUnit.json()).data.title, 'Artist of the Floating World');
});
