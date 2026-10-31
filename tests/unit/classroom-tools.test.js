import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanClassStudents, createClassHandler } from '../../netlify/functions/class.mjs';
import { buildPublishedClass } from '../../netlify/functions/_shared/teaching-student.mjs';
import { BlockSchema } from '../../netlify/functions/_shared/teaching-block-schema.mjs';
import { PULSE_EXCLUDED_TYPES } from '../../netlify/functions/_shared/block-pulse.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' };

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    }
  };
}

const CLASS = {
  id: 'class_9eng2',
  type: 'class',
  title: '9ENG2',
  slug: '9eng2',
  status: 'active',
  code: '9ENG2',
  academic_year: 2026,
  year_id: 'year_9',
  subject_id: 'english',
  active_unit_ids: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1
};

test('class lists are tidied before they are stored', () => {
  assert.deepEqual(
    cleanClassStudents([
      { name: '  Ava  ' },
      { name: 'ava' },
      { name: '' },
      { name: 'Eli', skip_picker: true },
      { name: 'Mia', skip_picker: 'yes' },
      null
    ]).map(({ name, skip_picker }) => ({ name, skip_picker })),
    [
      { name: 'Ava', skip_picker: false },
      { name: 'Eli', skip_picker: true },
      { name: 'Mia', skip_picker: false }
    ]
  );
  assert.equal(cleanClassStudents(Array.from({ length: 80 }, (_, i) => ({ name: `S${i}` }))).length, 60);
  assert.throws(() => cleanClassStudents('Ava'), /students must be a list/);
});

test('PATCH /api/classes/:id saves the class list', async () => {
  const store = memoryStore({ [`classes/${CLASS.id}`]: CLASS });
  const handler = createClassHandler({ getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env });
  const response = await handler(
    new Request(`https://api.adam-russell.com/api/classes/${CLASS.id}`, {
      method: 'PATCH',
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'life_hub_session=ok' },
      body: JSON.stringify({ students: [{ name: ' Ava ' }, { name: 'Eli', skip_picker: true }] })
    }),
    { params: { id: CLASS.id } }
  );
  assert.equal(response.status, 200);
  const saved = (await response.json()).data;
  assert.deepEqual(saved.students.map(({ name, skip_picker }) => ({ name, skip_picker })), [
    { name: 'Ava', skip_picker: false },
    { name: 'Eli', skip_picker: true }
  ]);
});

test('the published class page never carries the class list', () => {
  const published = buildPublishedClass({
    cls: { ...CLASS, students: [{ name: 'Ava', skip_picker: false }, { name: 'Eli', skip_picker: true }] },
    units: [],
    lessons: [],
    scheduled: [],
    publishedLessonIds: new Set()
  });
  const text = JSON.stringify(published);
  assert.equal(text.includes('Ava'), false);
  assert.equal(text.includes('skip_picker'), false);
});

test('the published class page never names an unpublished lesson', () => {
  const published = buildPublishedClass({
    cls: { ...CLASS, current_scheduled_lesson_id: 'sch_draft' },
    units: [],
    lessons: [{ id: 'lesson_live', title: 'Live lesson' }, { id: 'lesson_draft', title: 'Secret draft' }],
    scheduled: [
      { id: 'sch_live', lesson_id: 'lesson_live', schedule_order: 1, date: '2026-11-02' },
      { id: 'sch_draft', lesson_id: 'lesson_draft', schedule_order: 2, date: '2026-11-03' }
    ],
    publishedLessonIds: new Set(['lesson_live'])
  });
  const text = JSON.stringify(published);
  assert.equal(text.includes('Secret draft'), false);
  assert.equal(text.includes('lesson_draft'), false);
  assert.deepEqual(published.schedule.map(row => row.lesson_id), ['lesson_live']);
  assert.equal(published.current_lesson, undefined);
});

test('server schema knows the new blocks, and old dividers get the gear', () => {
  const stamp = { type: 'block', visibility: 'student_teacher', created_at: CLASS.created_at, updated_at: CLASS.updated_at, schema_version: 1 };
  assert.deepEqual(BlockSchema.parse({ ...stamp, id: 'd', block_type: 'divider', content: {} }).content, { tools: true, timer_stack: [] });
  assert.equal(BlockSchema.parse({ ...stamp, id: 't', block_type: 'classroom_tools', content: {} }).block_type, 'classroom_tools');
  assert.equal(BlockSchema.parse({ ...stamp, id: 'c', block_type: 'countdown', content: { due_date: '2026-10-30' } }).content.due_date, '2026-10-30');
  assert.ok(PULSE_EXCLUDED_TYPES.has('classroom_tools'));
  assert.ok(PULSE_EXCLUDED_TYPES.has('countdown'));
});

test('class lists keep and fill in student ids and initials', () => {
  const out = cleanClassStudents([
    { name: 'Bob Brown' },
    { name: 'Ben Bates', initials: 'bb' },
    { name: 'Tom Tills', id: 'st_tom', initials: 'TT' },
    { name: 'Ava Moss', id: '../bad', initials: 'not valid!' }
  ]);
  assert.deepEqual(out.map(s => s.initials), ['BB2', 'BB', 'TT', 'AM']);
  assert.equal(out[2].id, 'st_tom');
  assert.match(out[0].id, /^st_[a-z0-9]+$/);
  assert.match(out[3].id, /^st_[a-z0-9]+$/, 'an unsafe id is replaced');
  assert.deepEqual(cleanClassStudents(out), out, 'saving again changes nothing');
});
