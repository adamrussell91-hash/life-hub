import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createClassHandler } from '../../netlify/functions/class.mjs';
import { createCurriculumHandler } from '../../netlify/functions/curriculum.mjs';
import { createLessonHandler } from '../../netlify/functions/lesson.mjs';
import { createScheduledLessonHandler } from '../../netlify/functions/scheduled-lesson.mjs';
import { createSubjectHandler } from '../../netlify/functions/subject.mjs';
import { createUnitHandler } from '../../netlify/functions/unit.mjs';
import { createYearHandler } from '../../netlify/functions/year.mjs';

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

test('teacher record GETs use the Life session and stay read-only', async () => {
  const store = memoryStore({
    'classes/class-1': { id: 'class-1', title: 'English' },
    'units/unit-1': { id: 'unit-1', title: 'Unit' },
    'lessons/lesson-1': { id: 'lesson-1', title: 'Draft' },
    'years/year-1': { id: 'year-1', title: 'Year 12' },
    'subjects/subject-1': { id: 'subject-1', title: 'English Advanced' },
    'scheduled_lessons/sched-1': { id: 'sched-1', class_id: 'class-1', date: '2026-08-12' }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const classRes = await createClassHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/classes/class-1' })
  );
  const unitRes = await createUnitHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/units/unit-1' })
  );
  const lessonRes = await createLessonHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/lessons/lesson-1' })
  );
  const yearRes = await createYearHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/years/year-1' })
  );
  const subjectRes = await createSubjectHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/subjects/subject-1' })
  );
  const scheduledRes = await createScheduledLessonHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/scheduled-lessons/sched-1' })
  );

  assert.equal(classRes.status, 200);
  assert.equal((await classRes.json()).data.title, 'English');
  assert.equal(unitRes.status, 200);
  assert.equal((await unitRes.json()).data.title, 'Unit');
  assert.equal(lessonRes.status, 200);
  assert.equal((await lessonRes.json()).data.title, 'Draft');
  assert.equal(yearRes.status, 200);
  assert.equal((await yearRes.json()).data.title, 'Year 12');
  assert.equal(subjectRes.status, 200);
  assert.equal((await subjectRes.json()).data.title, 'English Advanced');
  assert.equal(scheduledRes.status, 200);
  assert.equal((await scheduledRes.json()).data.date, '2026-08-12');

  const anon = await createLessonHandler(deps)(
    request({ cookie: false, url: 'https://api.adam-russell.com/api/lessons/lesson-1' })
  );
  assert.equal(anon.status, 401);
});
