import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createClassHandler } from '../../netlify/functions/class.mjs';
import { createClassesHandler } from '../../netlify/functions/classes.mjs';
import { createCurriculumHandler } from '../../netlify/functions/curriculum.mjs';
import { createLessonHandler } from '../../netlify/functions/lesson.mjs';
import { createMediaHandler } from '../../netlify/functions/media.mjs';
import { createMediaItemHandler } from '../../netlify/functions/media-item.mjs';
import { createMediaUploadHandler } from '../../netlify/functions/media-upload.mjs';
import { createScheduleUnitHandler } from '../../netlify/functions/schedule-unit.mjs';
import { createOutcomesHandler } from '../../netlify/functions/outcomes.mjs';
import { createLessonsHandler } from '../../netlify/functions/lessons.mjs';
import { createScheduledLessonHandler } from '../../netlify/functions/scheduled-lesson.mjs';
import { createScheduledLessonsHandler } from '../../netlify/functions/scheduled-lessons.mjs';
import { createSubjectHandler } from '../../netlify/functions/subject.mjs';
import { createSubjectsHandler } from '../../netlify/functions/subjects.mjs';
import { createUnitHandler } from '../../netlify/functions/unit.mjs';
import { createUnitsHandler } from '../../netlify/functions/units.mjs';
import { createYearHandler } from '../../netlify/functions/year.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { createSearchHandler } from '../../netlify/functions/search.mjs';
import { createYearsHandler } from '../../netlify/functions/years.mjs';

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
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        map.set(key, value);
        return;
      }
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

function request({
  cookie = true,
  origin,
  url = 'https://api.adam-russell.com/api/curriculum',
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

test('teacher record GETs use the Life session', async () => {
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

test('teacher record PATCH/DELETE use the Life session and persist to Blobs', async () => {
  const store = memoryStore({
    'classes/class-1': { id: 'class-1', type: 'class', title: 'English' }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };
  const patched = await createClassHandler(deps)(
    request({
      method: 'PATCH',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/classes/class-1',
      body: { title: 'English Advanced', id: 'forged' }
    })
  );
  assert.equal(patched.status, 200);
  const body = await patched.json();
  assert.equal(body.data.id, 'class-1');
  assert.equal(body.data.title, 'English Advanced');
  assert.equal((await store.get('classes/class-1', { type: 'json' })).title, 'English Advanced');
  assert.equal(patched.headers.get('access-control-allow-methods')?.includes('PATCH'), true);

  const removed = await createClassHandler(deps)(
    request({
      method: 'DELETE',
      url: 'https://api.adam-russell.com/api/classes/class-1'
    })
  );
  assert.equal(removed.status, 200);
  assert.equal(await store.get('classes/class-1', { type: 'json' }), null);
});

test('teacher collection POSTs create records behind the Life session', async () => {
  const store = memoryStore({
    'years/year-1': { id: 'year-1', title: 'Year 12', subject_ids: [] },
    'subjects/subject-1': { id: 'subject-1', title: 'English', class_ids: [], unit_ids: [] },
    'units/unit-1': { id: 'unit-1', title: 'Unit', lesson_ids: [] }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const createdClass = await createClassesHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/classes',
      body: {
        title: '12 English',
        code: '12ENG',
        academic_year: 2026,
        year_id: 'year-1',
        subject_id: 'subject-1'
      }
    })
  );
  assert.equal(createdClass.status, 201);
  const classBody = await createdClass.json();
  assert.match(classBody.data.id, /^class_/);
  assert.equal(classBody.data.code, '12ENG');
  assert.equal((await store.get('subjects/subject-1', { type: 'json' })).class_ids[0], classBody.data.id);

  const createdUnit = await createUnitsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/units',
      body: { title: 'Poetry', year_id: 'year-1', subject_id: 'subject-1' }
    })
  );
  assert.equal(createdUnit.status, 201);
  const unitBody = await createdUnit.json();
  assert.match(unitBody.data.id, /^unit_/);

  const createdLesson = await createLessonsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/lessons',
      body: { title: 'Week 1', unit_id: 'unit-1' }
    })
  );
  assert.equal(createdLesson.status, 201);
  const lessonBody = await createdLesson.json();
  assert.match(lessonBody.data.id, /^lesson_/);
  assert.equal(lessonBody.data.sequence, 1);
  assert.equal((await store.get('units/unit-1', { type: 'json' })).lesson_ids[0], lessonBody.data.id);

  const anon = await createClassesHandler(deps)(
    request({
      cookie: false,
      method: 'POST',
      url: 'https://api.adam-russell.com/api/classes',
      body: { title: 'Nope' }
    })
  );
  assert.equal(anon.status, 401);
});

test('year and subject collections list and create behind the Life session', async () => {
  const store = memoryStore();
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const yearRes = await createYearsHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/years',
      body: { title: 'Year 12', year_level: 12 }
    })
  );
  assert.equal(yearRes.status, 201);
  const year = (await yearRes.json()).data;
  assert.match(year.id, /^year_/);
  assert.equal(year.year_level, 12);

  const subjectRes = await createSubjectsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/subjects',
      body: { title: 'English Advanced' }
    })
  );
  assert.equal(subjectRes.status, 201);
  assert.match((await subjectRes.json()).data.id, /^subject_/);

  const listed = await createYearsHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/years' })
  );
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data.years[0].title, 'Year 12');

  const conflict = await createSubjectsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/subjects',
      body: { title: 'english advanced' }
    })
  );
  assert.equal(conflict.status, 409);
});

test('thin search and lesson publish stay behind the Life session', async () => {
  const store = memoryStore({
    'lessons/lesson_1': {
      id: 'lesson_1',
      type: 'lesson',
      title: 'Working memory',
      unit_id: 'unit_1',
      blocks: [
        { id: 't', visibility: 'teacher_only', block_type: 'rich_text', content: { html: 'marking notes' } },
        { id: 's', visibility: 'student_teacher', block_type: 'rich_text', content: { html: '<p>ok</p><script>x</script>' } }
      ]
    },
    'units/unit_1': { id: 'unit_1', type: 'unit', title: 'Cognition' }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const found = await createSearchHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/search?q=memory' })
  );
  assert.equal(found.status, 200);
  const titleHits = (await found.json()).data.hits;
  assert.equal(titleHits[0].id, 'lesson_1');
  assert.equal(titleHits[0].match, 'title');

  const body = await createSearchHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/search?q=marking' })
  );
  assert.equal(body.status, 200);
  assert.equal((await body.json()).data.hits.some(hit => hit.match === 'body' && hit.id === 'lesson_1'), true);

  const published = await createLessonPublishHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/lessons/lesson_1/publish'
    })
  );
  assert.equal(published.status, 200);
  assert.equal((await published.json()).data.student_path, '/s/lessons/lesson_1');

  const snapshot = await store.get('published/lessons/lesson_1', { type: 'json' });
  assert.equal(snapshot.lesson_id, 'lesson_1');
  assert.equal(snapshot.blocks.length, 1);
  assert.equal(snapshot.blocks[0].id, 's');
  assert.doesNotMatch(snapshot.blocks[0].content.html, /script/i);
  assert.equal((await store.get('lessons/lesson_1', { type: 'json' })).published_at, snapshot.published_at);

  const anon = await createSearchHandler(deps)(
    request({ cookie: false, url: 'https://api.adam-russell.com/api/search?q=memory' })
  );
  assert.equal(anon.status, 401);
});

test('outcomes and media collections create behind the Life session', async () => {
  const store = memoryStore({
    'subjects/subject_1': {
      id: 'subject_1',
      type: 'subject',
      title: 'Psychology',
      outcome_ids: []
    }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const createdOutcome = await createOutcomesHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/outcomes',
      body: {
        subject_id: 'subject_1',
        code: 'PSY11-1',
        title: 'Differentiate',
        description: 'Differentiate psychological concepts'
      }
    })
  );
  assert.equal(createdOutcome.status, 201);
  const outcome = (await createdOutcome.json()).data;
  assert.match(outcome.id, /^outcome_/);
  assert.deepEqual((await store.get('subjects/subject_1', { type: 'json' })).outcome_ids, [outcome.id]);

  const conflict = await createOutcomesHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/outcomes',
      body: {
        subject_id: 'subject_1',
        code: 'psy11-1',
        title: 'Again',
        description: 'Duplicate code'
      }
    })
  );
  assert.equal(conflict.status, 409);

  const createdMedia = await createMediaHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/media',
      body: {
        title: 'NESA syllabus',
        provider: 'external',
        media_type: 'link',
        preview_url: 'https://educationstandards.nsw.edu.au'
      }
    })
  );
  assert.equal(createdMedia.status, 201);
  const media = (await createdMedia.json()).data;
  assert.match(media.id, /^media_/);

  const listed = await createMediaHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/media' })
  );
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data.media[0].title, 'NESA syllabus');

  const patched = await createMediaItemHandler(deps)(
    request({
      method: 'PATCH',
      url: `https://api.adam-russell.com/api/media/${media.id}`,
      body: { title: 'Syllabus PDF' }
    })
  );
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).data.title, 'Syllabus PDF');

  const anon = await createOutcomesHandler(deps)(
    request({
      cookie: false,
      method: 'POST',
      url: 'https://api.adam-russell.com/api/outcomes',
      body: { subject_id: 'subject_1', code: 'X', title: 'Nope', description: 'Nope' }
    })
  );
  assert.equal(anon.status, 401);
});

test('scheduled-lesson collection creates a dated row behind the Life session', async () => {
  const store = memoryStore({
    'classes/class_1': { id: 'class_1', type: 'class', title: '11 Psych A' },
    'lessons/lesson_1': { id: 'lesson_1', type: 'lesson', title: 'Working memory', unit_id: 'unit_1' }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };

  const created = await createScheduledLessonsHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/scheduled-lessons',
      body: { class_id: 'class_1', lesson_id: 'lesson_1', date: '2026-08-12' }
    })
  );
  assert.equal(created.status, 201);
  const row = (await created.json()).data;
  assert.match(row.id, /^sched_/);
  assert.equal(row.unit_id, 'unit_1');
  assert.equal(row.schedule_order, 1);
  assert.equal(row.delivery_status, 'planned');

  const listed = await createScheduledLessonsHandler(deps)(
    request({ url: 'https://api.adam-russell.com/api/scheduled-lessons' })
  );
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data.scheduled_lessons[0].date, '2026-08-12');

  const badDate = await createScheduledLessonsHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/scheduled-lessons',
      body: { class_id: 'class_1', lesson_id: 'lesson_1', date: '12 August' }
    })
  );
  assert.equal(badDate.status, 400);

  const anon = await createScheduledLessonsHandler(deps)(
    request({
      cookie: false,
      method: 'POST',
      url: 'https://api.adam-russell.com/api/scheduled-lessons',
      body: { class_id: 'class_1', lesson_id: 'lesson_1', date: '2026-08-12' }
    })
  );
  assert.equal(anon.status, 401);
});

test('schedule-unit expands a unit across meeting days behind the Life session', async () => {
  const store = memoryStore({
    'classes/class_1': {
      id: 'class_1',
      type: 'class',
      title: '11 Psych A',
      subject_id: 'subject_1',
      active_unit_ids: []
    },
    'units/unit_1': {
      id: 'unit_1',
      type: 'unit',
      title: 'Cognition',
      subject_id: 'subject_1',
      lesson_ids: ['lesson_1', 'lesson_2']
    }
  });
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };
  const expanded = await createScheduleUnitHandler(deps)(
    request({
      method: 'POST',
      origin: 'https://teaching-hub.adam-russell.com',
      url: 'https://api.adam-russell.com/api/classes/class_1/schedule-unit',
      body: { unit_id: 'unit_1', start_date: '2026-08-10', meeting_days: [1, 3] }
    })
  );
  assert.equal(expanded.status, 200);
  const payload = (await expanded.json()).data;
  assert.equal(payload.scheduled_lessons.length, 2);
  assert.equal(payload.scheduled_lessons[0].date, '2026-08-10');
  assert.equal(payload.class.active_unit_ids[0], 'unit_1');

  const again = await createScheduleUnitHandler(deps)(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/classes/class_1/schedule-unit',
      body: { unit_id: 'unit_1', start_date: '2026-08-10', meeting_days: [1, 3] }
    })
  );
  assert.equal(again.status, 400);
});

test('media upload writes a public file behind the Life session', async () => {
  const store = memoryStore();
  const deps = {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  };
  const form = new FormData();
  form.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
  form.set('title', 'Lesson notes');
  const uploaded = await createMediaUploadHandler(deps)(new Request(
    'https://api.adam-russell.com/api/media/upload',
    {
      method: 'POST',
      headers: {
        cookie: `life_hub_session=${session}`,
        origin: 'https://teaching-hub.adam-russell.com'
      },
      body: form
    }
  ));
  assert.equal(uploaded.status, 201);
  const media = (await uploaded.json()).data;
  assert.match(media.id, /^media_/);
  assert.equal(media.provider, 'direct');
  assert.ok(await store.get(`media_files/${media.id}`));
});
