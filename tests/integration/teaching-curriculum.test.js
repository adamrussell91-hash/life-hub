import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createCurriculumHandler } from '../../netlify/functions/curriculum.mjs';

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
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request({ cookie = true, origin, url = 'https://api.adam-russell.com/api/curriculum' } = {}) {
  return new Request(url, {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {})
    }
  });
}

test('curriculum requires the Life session before touching Blobs', async () => {
  let storeLoads = 0;
  const handler = createCurriculumHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      storeLoads += 1;
      throw new Error('store must not load');
    }
  });
  const response = await handler(request({ cookie: false }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(storeLoads, 0);
});

test('curriculum is 503 when Blobs is unbound after a valid session', async () => {
  const handler = createCurriculumHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      throw new Error('MissingBlobsBinding');
    }
  });
  const response = await handler(request({ origin: 'https://teaching-hub.adam-russell.com' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'blobs_unbound');
});

test('curriculum lists teacher classes and marks published lessons', async () => {
  const handler = createCurriculumHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore({
      'classes/class-1': { id: 'class-1', title: 'English', code: '12ENG', status: 'active' },
      'lessons/lesson-1': { id: 'lesson-1', title: 'Draft', unit_id: 'unit-1' },
      'published/lessons/lesson-1': { lesson_id: 'lesson-1' },
      'media/file-1': { id: 'file-1', status: 'archived' },
      'media/file-2': { id: 'file-2', status: 'active', mime_type: 'image/png' }
    })
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.classes[0].title, 'English');
  assert.deepEqual(body.data.lessons, [{
    id: 'lesson-1',
    title: 'Draft',
    unit_id: 'unit-1',
    published: true
  }]);
  assert.deepEqual(body.data.media.map(item => item.id), ['file-2']);
  assert.equal(body.data.schedule_anchor_date, '2026-08-12');
});
