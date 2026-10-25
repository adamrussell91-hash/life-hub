import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublishedLessonHandler } from '../../netlify/functions/published-lesson.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';

function storeOf(seed) {
  const data = new Map(Object.entries(seed));
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON() {},
    async delete() {},
    async list({ prefix } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix ?? '')).map((key) => ({ key })) }; }
  };
}

async function load(store, id) {
  const handler = createPublishedLessonHandler({
    getContentStore: async () => store,
    env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' }
  });
  const res = await handler(new Request(`https://api.adam-russell.com/api/published/lessons/${id}`, { headers: { origin: ORIGIN } }), {});
  assert.equal(res.status, 200);
  return (await res.json()).data;
}

const classRow = (id, title) => [`classes/${id}`, { id, title, status: 'active' }];

test('a tutorial link carries the one class it was planned for, scheduled or not', async () => {
  const store = storeOf(Object.fromEntries([
    ['lessons/tut1', { id: 'tut1', unit_id: 'u1', pedagogical_mode: 'tutorial', tutorial: { class_id: 'c1' } }],
    ['published/lessons/tut1', { lesson_id: 'tut1', blocks: [], pedagogical_mode: 'tutorial' }],
    classRow('c1', '9 English'),
    classRow('c2', '10 History')
  ]));
  assert.deepEqual((await load(store, 'tut1')).classes, [{ id: 'c1', title: '9 English' }]);
});

test('a lecture link lists the classes it is scheduled in; a quiz link adds nothing', async () => {
  const store = storeOf(Object.fromEntries([
    ['lessons/lec1', { id: 'lec1', unit_id: 'u1' }],
    ['published/lessons/lec1', { lesson_id: 'lec1', blocks: [], pedagogical_mode: 'lecture' }],
    ['lessons/q1', { id: 'q1', unit_id: 'u1' }],
    ['published/lessons/q1', { lesson_id: 'q1', blocks: [], pedagogical_mode: 'quiz' }],
    ['scheduled_lessons/s1', { id: 's1', class_id: 'c2', lesson_id: 'lec1' }],
    classRow('c1', '9 English'),
    classRow('c2', '10 History')
  ]));
  assert.deepEqual((await load(store, 'lec1')).classes, [{ id: 'c2', title: '10 History' }]);
  assert.equal((await load(store, 'q1')).classes, undefined);
});
