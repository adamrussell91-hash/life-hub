import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublishedLessonHandler } from '../../netlify/functions/published-lesson.mjs';
import { createPublishedUnitHandler } from '../../netlify/functions/published-unit.mjs';
import { createPublishedClassHandler } from '../../netlify/functions/published-class.mjs';
import { createPublishedNetworkHandler } from '../../netlify/functions/published-network.mjs';
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
    async getWithMetadata(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      const stored = value && typeof value === 'object' && 'data' in value
        ? value : { data: value, metadata: {} };
      if (options.type === 'stream') return { ...stored, data: new Response(stored.data).body };
      if (options.type === 'arrayBuffer') return { ...stored, data: await new Response(stored.data).arrayBuffer() };
      return stored;
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
      'lessons/week-1': { id: 'week-1', title: 'Week 1', status: 'active' },
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
      'lessons/week-1': { id: 'week-1', title: 'Week 1' },
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
      'lessons/lesson-a': { id: 'lesson-a', title: 'A', unit_id: 'unit-1' },
      'lessons/lesson-b': { id: 'lesson-b', title: 'B', unit_id: 'unit-1' },
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

test('trashed or deleted lessons stop resolving for students even with a snapshot left behind', async () => {
  const entries = {
    'units/unit-1': { id: 'unit-1', title: 'Unit 1', lesson_ids: ['live', 'trashed', 'gone'] },
    'lessons/live': { id: 'live', title: 'Live', unit_id: 'unit-1' },
    'lessons/trashed': { id: 'trashed', title: 'Trashed', unit_id: 'unit-1', status: 'trashed', trashed_at: '2026-10-05T00:00:00Z' },
    'published/lessons/live': { lesson_id: 'live', title: 'Live', unit_id: 'unit-1' },
    'published/lessons/trashed': { lesson_id: 'trashed', title: 'Trashed', unit_id: 'unit-1' },
    'published/lessons/gone': { lesson_id: 'gone', title: 'Gone', unit_id: 'unit-1' },
    'classes/class-1': {
      id: 'class-1',
      status: 'active',
      code: '9SCI',
      title: 'Science',
      active_unit_ids: ['unit-1'],
      current_unit_id: 'unit-1',
      homepage: { announcements: [], resources: [], custom: [] }
    },
    'scheduled_lessons/s1': { id: 's1', class_id: 'class-1', lesson_id: 'live', unit_id: 'unit-1', date: '2026-10-12', schedule_order: 1 },
    'scheduled_lessons/s2': { id: 's2', class_id: 'class-1', lesson_id: 'gone', unit_id: 'unit-1', date: '2026-10-16', schedule_order: 2 },
    'scheduled_lessons/s3': { id: 's3', class_id: 'class-1', lesson_id: 'trashed', unit_id: 'unit-1', date: '2026-10-19', schedule_order: 3 }
  };
  const deps = { env, getContentStore: async () => memoryStore(entries) };

  const lesson = createPublishedLessonHandler(deps);
  for (const id of ['trashed', 'gone']) {
    const response = await lesson(jsonRequest(`https://api.adam-russell.com/api/published/lessons/${id}`));
    assert.equal(response.status, 404, id);
  }
  assert.equal(
    (await lesson(jsonRequest('https://api.adam-russell.com/api/published/lessons/live'))).status,
    200
  );

  const unitBody = await (await createPublishedUnitHandler(deps)(
    jsonRequest('https://api.adam-russell.com/api/published/units/unit-1')
  )).json();
  assert.deepEqual(unitBody.data.lessons.map(row => row.lesson_id), ['live']);

  const classBody = await (await createPublishedClassHandler(deps)(
    jsonRequest('https://api.adam-russell.com/api/published/classes/class-1')
  )).json();
  assert.deepEqual(classBody.data.schedule.map(row => row.lesson_id), ['live']);
  assert.deepEqual(classBody.data.current_unit.lessons.map(row => row.id), ['live']);
});

test('published unit is 404 once the unit is trashed', async () => {
  const handler = createPublishedUnitHandler({
    env,
    getContentStore: async () => memoryStore({
      'units/unit-1': { id: 'unit-1', title: 'Unit 1', status: 'trashed', lesson_ids: [] }
    })
  });
  const response = await handler(jsonRequest('https://api.adam-russell.com/api/published/units/unit-1'));
  assert.equal(response.status, 404);
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

test('media file streams large video blobs with the stored content type', async () => {
  const stream = new Response(new Uint8Array([1, 2, 3, 4])).body;
  const requested = [];
  const store = memoryStore({
    'media/vid-1': { id: 'vid-1', status: 'active', mime_type: 'video/mp4' },
    'media_files/vid-1': { data: stream, metadata: { contentType: 'video/mp4' } }
  });
  const getWithMetadata = store.getWithMetadata;
  store.getWithMetadata = async (key, options) => { requested.push(options?.type); return getWithMetadata(key, options); };
  const handler = createMediaFileHandler({ env, getContentStore: async () => store });
  const response = await handler(jsonRequest('https://api.adam-russell.com/api/media/vid-1/file'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(requested, ['stream']);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
});

test('media file serves byte ranges so Safari can play and seek audio', async () => {
  const bytes = new Uint8Array([10, 11, 12, 13, 14, 15]).buffer;
  const handler = createMediaFileHandler({
    env,
    getContentStore: async () => memoryStore({
      'media/voice-1': { id: 'voice-1', status: 'active', mime_type: 'audio/webm' },
      'media_files/voice-1': { data: bytes, metadata: { contentType: 'audio/webm' } }
    })
  });
  const url = 'https://api.adam-russell.com/api/media/voice-1/file';

  const whole = await handler(jsonRequest(url));
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal(whole.headers.get('content-length'), '6');

  const part = await handler(jsonRequest(url, { headers: { range: 'bytes=2-3' } }));
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-3/6');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [12, 13]);

  const open = await handler(jsonRequest(url, { headers: { range: 'bytes=4-' } }));
  assert.equal(open.headers.get('content-range'), 'bytes 4-5/6');

  const tail = await handler(jsonRequest(url, { headers: { range: 'bytes=-2' } }));
  assert.deepEqual([...new Uint8Array(await tail.arrayBuffer())], [14, 15]);

  const beyond = await handler(jsonRequest(url, { headers: { range: 'bytes=9-' } }));
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get('content-range'), 'bytes */6');
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

test('media file responses are nosniff', async () => {
  const handler = createMediaFileHandler({
    env,
    getContentStore: async () => memoryStore({
      'media/f': { id: 'f', status: 'active', mime_type: 'image/png' },
      'media_files/f': { data: new Uint8Array([1]).buffer, metadata: {} }
    })
  });
  const response = await handler(jsonRequest('https://api.adam-russell.com/api/media/f/file'));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('published unit carries the subject lines and published lessons\' line stops only', async () => {
  const handler = createPublishedUnitHandler({
    env,
    getContentStore: async () => memoryStore({
      'subjects/subj-1': { id: 'subj-1', title: 'English', network_lines: [{ id: 'resp', mode: 'train', name: 'Responding', colour: 'wave', secret: 'x' }] },
      'units/unit-1': { title: 'Unit 1', subject_id: 'subj-1', lesson_ids: ['lesson-a', 'lesson-b'] },
      'lessons/lesson-a': { id: 'lesson-a', title: 'A', unit_id: 'unit-1', line_stops: [{ line_id: 'resp', level: 'mastered' }] },
      'lessons/lesson-b': { id: 'lesson-b', title: 'B', unit_id: 'unit-1', line_stops: [{ line_id: 'resp' }] },
      'published/lessons/lesson-a': { lesson_id: 'lesson-a', title: 'A', unit_id: 'unit-1' }
    })
  });
  const body = await (await handler(jsonRequest('https://api.adam-russell.com/api/published/units/unit-1'))).json();
  assert.deepEqual(body.data.network_lines, [{ id: 'resp', mode: 'train', name: 'Responding', colour: 'wave' }]);
  assert.deepEqual(body.data.lessons, [{ lesson_id: 'lesson-a', title: 'A', line_stops: [{ line_id: 'resp', level: 'mastered' }] }]);
});

test('published network lists units with published lessons, in scope order, without lesson titles', async () => {
  const handler = createPublishedNetworkHandler({
    env,
    getContentStore: async () => memoryStore({
      'classes/class-1': { id: 'class-1', status: 'active', subject_id: 'subj-1' },
      'subjects/subj-1': {
        id: 'subj-1', title: 'English', scope_id: 'scope-1',
        network_lines: [{ id: 'resp', mode: 'train', name: 'Responding', colour: 'wave' }, { id: 'oral', mode: 'light_rail', name: 'Oral', colour: 'amber' }],
        network_nudges: { 'unit-2': { dx: 4, dy: 0 }, 'unit-gone': { dx: 1, dy: 1 } }
      },
      'scope_sequences/scope-1': { id: 'scope-1', timeline_items: [
        { kind: 'unit', unit_id: 'unit-2', start_week: 1, order: 0 },
        { kind: 'unit', unit_id: 'unit-1', start_week: 6, order: 1 },
        { kind: 'unit', unit_id: 'unit-3', start_week: 9, order: 2 }
      ] },
      'units/unit-1': { id: 'unit-1', title: 'Later', subject_id: 'subj-1', lesson_ids: ['lesson-a'] },
      'units/unit-2': { id: 'unit-2', title: 'First', subject_id: 'subj-1', lesson_ids: ['lesson-b', 'lesson-c'], blocks: [
        { id: 'm', block_type: 'curriculum_lines', visibility: 'student_teacher', content: { version: 2, rail_stops: [{ id: 'r', line_id: 'oral', kind: 'stop', label: '' }], gates: [], nudges: {}, terminus: { label: 'Task' } } }
      ] },
      'units/unit-3': { id: 'unit-3', title: 'Unpublished', subject_id: 'subj-1', lesson_ids: ['lesson-d'] },
      'lessons/lesson-a': { id: 'lesson-a', title: 'A', line_stops: [{ line_id: 'resp', level: 'introduced' }] },
      'lessons/lesson-b': { id: 'lesson-b', title: 'B', line_stops: [{ line_id: 'resp', level: 'mastered' }] },
      'lessons/lesson-c': { id: 'lesson-c', title: 'C draft only', line_stops: [{ line_id: 'oral' }] },
      'lessons/lesson-d': { id: 'lesson-d', title: 'D' },
      'published/lessons/lesson-a': { lesson_id: 'lesson-a', title: 'A' },
      'published/lessons/lesson-b': { lesson_id: 'lesson-b', title: 'B' }
    })
  });
  const response = await handler(jsonRequest('https://api.adam-russell.com/api/published/networks/class-1'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.units.map(u => u.id), ['unit-2', 'unit-1']);
  assert.deepEqual(body.data.units[0].lessons, [{ id: 'lesson-b', line_stops: [{ line_id: 'resp', level: 'mastered' }] }]);
  assert.deepEqual(body.data.units[0].rail_line_ids, ['oral']);
  assert.deepEqual(body.data.nudges, { 'unit-2': { dx: 4, dy: 0 } });
  assert.equal(JSON.stringify(body.data).includes('C draft only'), false);
});
