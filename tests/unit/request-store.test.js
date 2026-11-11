import test from 'node:test';
import assert from 'node:assert/strict';
import { requestStore } from '../../netlify/functions/_shared/request-store.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';

function countingStore(entries = []) {
  const data = new Map(entries);
  const gets = new Map();
  let lists = 0;
  return {
    data,
    gets,
    get lists() { return lists; },
    async get(key) { gets.set(key, (gets.get(key) ?? 0) + 1); return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { lists += 1; return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('a key is read once per request, even when asked for at the same moment', async () => {
  const raw = countingStore([['a', { n: 1 }]]);
  const store = requestStore(raw);
  const [x, y] = await Promise.all([store.get('a'), store.get('a')]);
  await store.get('a');
  assert.deepEqual(x, { n: 1 });
  assert.deepEqual(y, { n: 1 });
  assert.equal(raw.gets.get('a'), 1);
});

test('each caller gets its own copy', async () => {
  const store = requestStore(countingStore([['a', { list: [1] }]]));
  const first = await store.get('a');
  first.list.push(2);
  assert.deepEqual(await store.get('a'), { list: [1] });
});

test('a write or delete is read back, and listings that hold the key are fetched again', async () => {
  const raw = countingStore([['p/a', 1]]);
  const store = requestStore(raw);
  assert.equal(await store.get('p/a'), 1);
  assert.equal((await store.list({ prefix: 'p/' })).blobs.length, 1);
  await store.setJSON('p/b', 2);
  assert.equal(await store.get('p/b'), 2);
  assert.equal((await store.list({ prefix: 'p/' })).blobs.length, 2);
  await store.setJSON('p/a', 3);
  assert.equal(await store.get('p/a'), 3);
  await store.delete('p/a');
  assert.equal(await store.get('p/a'), null);
  assert.equal(raw.lists, 2);
});

test('a failed read is tried again by the next caller', async () => {
  let calls = 0;
  const store = requestStore({ async get() { calls += 1; if (calls === 1) throw new Error('blip'); return 'ok'; } });
  await assert.rejects(store.get('a'));
  assert.equal(await store.get('a'), 'ok');
});

test('the progress page reads no blob twice', async () => {
  const lessonIds = ['l1', 'l2', 'l3'];
  const raw = countingStore([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }], homepage: { announcements: [] } }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: lessonIds }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['scheduled_lessons/r1', { id: 'r1', class_id: 'class1', lesson_id: 'l1', date: '2026-11-02' }],
    ...lessonIds.flatMap((id) => [[`lessons/${id}`, { id, title: `Lesson ${id}` }], [`published/lessons/${id}`, { id, title: `Lesson ${id}`, blocks: [] }]])
  ]);
  const roster = await loadRoster(raw, 'class1');
  raw.gets.clear();
  const out = await teacherProfileAction(raw, 'class1', { action: 'progress', student_id: roster.students[0].id });
  assert.deepEqual(out.map.lessons.map((l) => l.id), lessonIds);
  const twice = [...raw.gets].filter(([, n]) => n > 1).map(([key]) => key);
  assert.deepEqual(twice, [], `read more than once: ${twice.join(', ')}`);
});

test('the teacher can ask a progress read where its time went; without asking, nothing is added', async () => {
  const raw = countingStore([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }], homepage: { announcements: [] } }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1'] }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['lessons/l1', { id: 'l1', title: 'Lesson one' }],
    ['published/lessons/l1', { id: 'l1', title: 'Lesson one', blocks: [] }]
  ]);
  const roster = await loadRoster(raw, 'class1');
  const id = roster.students[0].id;
  const plain = await teacherProfileAction(raw, 'class1', { action: 'progress', student_id: id });
  assert.equal('timing' in plain, false);
  const timed = await teacherProfileAction(raw, 'class1', { action: 'progress', student_id: id, timing: true });
  for (const phase of ['roster', 'state', 'unit_lessons', 'markbook_view', 'markbook_book', 'unit', 'quizzes', 'work', 'done', 'feedback', 'map', 'todo']) {
    assert.equal(typeof timed.timing.phases[phase], 'number', phase);
  }
  assert.ok(timed.timing.blobs.get > 0);
  assert.ok(timed.timing.kinds['get lessons'] >= 1, 'reads are counted by kind');
  assert.equal(Object.values(timed.timing.kinds).reduce((a, b) => a + b, 0), timed.timing.blobs.get + timed.timing.blobs.list);
  assert.equal(typeof timed.timing.total_ms, 'number');
  const { timing, ...rest } = timed;
  assert.deepEqual(rest, plain, 'the page itself is the same');
});

test('the progress page looks up quizzes and writing only for its unit, not other lessons on the calendar', async () => {
  const raw = countingStore([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', active_unit_ids: ['unit2'], students: [{ name: 'Ana Ames' }], homepage: { announcements: [] } }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1'] }],
    ['units/unit2', { id: 'unit2', title: 'Drama', lesson_ids: ['d1'] }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['scheduled_lessons/r1', { id: 'r1', class_id: 'class1', lesson_id: 'x1', date: '2026-11-02' }],
    ['lessons/l1', { id: 'l1', title: 'Lesson one' }],
    ['published/lessons/l1', { id: 'l1', title: 'Lesson one', blocks: [] }]
  ]);
  const roster = await loadRoster(raw, 'class1');
  const out = await teacherProfileAction(raw, 'class1', { action: 'progress', student_id: roster.students[0].id });
  assert.deepEqual(out.map.lessons.map((l) => l.id), ['l1']);
  for (const other of ['d1', 'x1']) assert.equal(raw.gets.has(`quiz/${other}/current`), false, `${other} is not on this page`);
});
