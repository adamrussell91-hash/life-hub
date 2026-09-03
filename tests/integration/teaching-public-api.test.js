import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublishedLessonHandler } from '../../netlify/functions/published-lesson.mjs';
import { createPublishedUnitHandler } from '../../netlify/functions/published-unit.mjs';
import { createPublishedClassHandler } from '../../netlify/functions/published-class.mjs';
import { createMediaFileHandler } from '../../netlify/functions/media-file.mjs';
import { createHtmlAppAiHandler } from '../../netlify/functions/html-app-ai.mjs';

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: 's'.repeat(32),
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      if (options.type === 'json') return value;
      return value;
    },
    async getWithMetadata(key) {
      const value = map.get(key);
      if (value == null) return null;
      if (value && typeof value === 'object' && 'data' in value) return value;
      return { data: value, metadata: {} };
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function jsonRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Request(url, {
    method,
    headers: {
      origin: 'https://teaching-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('public student lesson is unauthenticated and 503s when Blobs is unbound', async () => {
  let sessionChecks = 0;
  const handler = createPublishedLessonHandler({
    env,
    getContentStore: async () => {
      throw new Error('MissingBlobsBinding');
    },
    verifySessionToken: () => {
      sessionChecks += 1;
      throw new Error('session gate must not run');
    }
  });

  const response = await handler(jsonRequest('https://api.adam-russell.com/api/published/lessons/week-1'));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'blobs_unbound');
  assert.equal(sessionChecks, 0);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://teaching-hub.adam-russell.com');
});

test('public student lesson returns the published snapshot without a session', async () => {
  const handler = createPublishedLessonHandler({
    env,
    getContentStore: async () => memoryStore({
      'published/lessons/week-1': {
        lesson_id: 'week-1',
        title: 'Week 1',
        outcome_ids: ['out-1']
      },
      'outcomes/out-1': {
        id: 'out-1',
        code: 'EN12-1',
        title: 'Reads',
        description: 'Reads critically',
        group: 'Objectives',
        source: 'NESA',
        teacher_notes: 'secret'
      }
    })
  });

  const response = await handler(jsonRequest('https://api.adam-russell.com/api/published/lessons/week-1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.title, 'Week 1');
  assert.deepEqual(body.data.outcome_ids, ['out-1']);
  assert.deepEqual(body.data.outcomes, [{
    id: 'out-1',
    code: 'EN12-1',
    title: 'Reads',
    description: 'Reads critically',
    group: 'Objectives',
    source: 'NESA'
  }]);
});

test('legacy published-lesson function path stays public', async () => {
  const handler = createPublishedLessonHandler({
    env,
    getContentStore: async () => memoryStore({
      'published/lessons/week-1': { lesson_id: 'week-1', title: 'Week 1' }
    })
  });
  const response = await handler(
    jsonRequest('https://api.adam-russell.com/.netlify/functions/published-lesson/week-1')
  );
  assert.equal(response.status, 200);
});

test('published unit hides teacher-only blocks and orders lessons', async () => {
  const handler = createPublishedUnitHandler({
    env,
    getContentStore: async () => memoryStore({
      'units/unit-1': {
        title: 'Unit 1',
        lesson_ids: ['lesson-b', 'lesson-a'],
        blocks: [
          { id: 't1', block_type: 'rich_text', visibility: 'teacher', content: { html: '<p>Teacher</p>' } },
          { id: 's1', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Student</p>' } }
        ]
      },
      'published/lessons/lesson-a': { lesson_id: 'lesson-a', title: 'A', unit_id: 'unit-1' },
      'published/lessons/lesson-b': { lesson_id: 'lesson-b', title: 'B', unit_id: 'unit-1' }
    })
  });

  const response = await handler(jsonRequest('https://api.adam-russell.com/api/published/units/unit-1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.lessons.map(row => row.lesson_id), ['lesson-b', 'lesson-a']);
  assert.equal(body.data.blocks.length, 1);
  assert.equal(body.data.blocks[0].id, 's1');
});

test('published class is 404 when archived and omits unpublished current lessons', async () => {
  const archived = createPublishedClassHandler({
    env,
    getContentStore: async () => memoryStore({
      'classes/class-1': { id: 'class-1', status: 'archived', title: 'Old', code: 'OLD' }
    })
  });
  assert.equal(
    (await archived(jsonRequest('https://api.adam-russell.com/api/published/classes/class-1'))).status,
    404
  );

  const handler = createPublishedClassHandler({
    env,
    getContentStore: async () => memoryStore({
      'classes/class-1': {
        id: 'class-1',
        status: 'active',
        code: '12ENG',
        title: 'English',
        active_unit_ids: ['unit-1'],
        current_unit_id: 'unit-1',
        homepage: { announcements: [], resources: [], custom: [] }
      },
      'units/unit-1': { id: 'unit-1', title: 'Unit', lesson_ids: ['lesson-1'] },
      'lessons/lesson-1': { id: 'lesson-1', title: 'Draft title' },
      'published/lessons/lesson-1': { lesson_id: 'lesson-1' }
    })
  });
  const response = await handler(jsonRequest('https://api.adam-russell.com/api/published/classes/class-1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.title, 'English');
  assert.deepEqual(body.data.current_unit, {
    id: 'unit-1',
    title: 'Unit',
    lessons: [{ id: 'lesson-1', title: 'Draft title' }]
  });
});

test('media file is public for active media and 404 when archived', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const handler = createMediaFileHandler({
    env,
    getContentStore: async () => memoryStore({
      'media/file-1': { id: 'file-1', status: 'active', mime_type: 'image/png' },
      'media_files/file-1': { data: bytes, metadata: { contentType: 'image/png' } },
      'media/file-2': { id: 'file-2', status: 'archived', mime_type: 'image/png' }
    })
  });

  const ok = await handler(jsonRequest('https://api.adam-russell.com/api/media/file-1/file'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');

  const missing = await handler(jsonRequest('https://api.adam-russell.com/api/media/file-2/file'));
  assert.equal(missing.status, 404);
});

test('html-app-ai stays public, 503s without Blobs, and completes an enabled lane', async () => {
  const unbound = createHtmlAppAiHandler({
    env,
    getContentStore: async () => null
  });
  const unboundResponse = await unbound(jsonRequest('https://api.adam-russell.com/api/html-app-ai', {
    method: 'POST',
    body: { lesson_id: 'week-1', block_id: 'b1', messages: [] }
  }));
  assert.equal(unboundResponse.status, 503);

  let completed = 0;
  const handler = createHtmlAppAiHandler({
    env,
    getContentStore: async () => memoryStore({
      'published/lessons/week-1': {
        blocks: [{
          id: 'b1',
          block_type: 'html_app',
          content: {
            ai: { provider: 'anthropic', model: 'claude-sonnet-4-0', system: 'Help', max_tokens: 200 }
          }
        }]
      }
    }),
    completeWithProvider: async () => {
      completed += 1;
      return 'hello';
    }
  });
  const response = await handler(jsonRequest('https://api.adam-russell.com/api/html-app-ai', {
    method: 'POST',
    body: { lesson_id: 'week-1', block_id: 'b1', messages: [{ role: 'user', content: 'Hi' }] }
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.text, 'hello');
  assert.equal(completed, 1);
});
