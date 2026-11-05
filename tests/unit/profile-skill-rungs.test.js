import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAction, teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const device = { class_token: 'b'.repeat(48) };

/** Invented class: Ava has two returned vivas placing her on a speaking skill, then a reading one; Noah has nothing back. */
async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 Sample', active_unit_ids: [], students: [{ name: 'Ava Sample' }, { name: 'Noah Example' }] }],
    ['feedback_codes/library', { codes: [] }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava, noah] = roster.students;
  const viva = (lesson, at, skills) => {
    store.data.set(`voice_submissions/${lesson}/blk/s_${lesson}`, { status: 'returned', class_id: 'class1', student_id: ava.id, tags: [], rubric: { skills, pieces: {}, steps: {} }, submitted_at: at, returned_at: at });
    store.data.set(`piece_feedback/class1/${ava.id}/v:${lesson}`, { kind: 'viva', title: `Viva ${lesson}`, lesson_id: lesson, column_id: null, tags: [], comment: '', status: 'returned', returned_at: at, updated_at: 'x' });
  };
  viva('lessonA', '2026-10-01T00:00:00Z', { 'speaking.delivery': 'capable' });
  viva('lessonB', '2026-10-08T00:00:00Z', { 'speaking.delivery': 'skilled', 'reading.technique': 'capable' });
  await profileAction(store, 'class1', { action: 'claim', initials: ava.initials, ...device });
  return { store, ava, noah };
}

test('the teacher sees every student’s latest rung on each skill, for the whole class', async () => {
  const { store, ava, noah } = await setup();
  const out = await teacherProfileAction(store, 'class1', { action: 'skill_rungs' });
  const byId = new Map(out.students.map((s) => [s.id, s]));
  assert.deepEqual(byId.get(ava.id).rungs, { 'speaking.delivery': 'skilled', 'reading.technique': 'capable' });
  assert.deepEqual(byId.get(noah.id).rungs, {}, 'nothing returned, nothing placed');
  assert.equal(byId.get(ava.id).initials, ava.initials);
});

test('the teacher can ask for one student’s rungs, and an unknown student is refused', async () => {
  const { store, ava } = await setup();
  const out = await teacherProfileAction(store, 'class1', { action: 'skill_rungs', student_id: ava.id });
  assert.equal(out.rungs['speaking.delivery'], 'skilled');
  await assert.rejects(() => teacherProfileAction(store, 'class1', { action: 'skill_rungs', student_id: 'nobody' }));
});

test('a student sees only their own speaking rows, with the rung now and the next one', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'skills', strand: 'speaking', ...device });
  assert.equal(out.skills.length, 1);
  assert.equal(out.skills[0].strand_id, 'speaking');
  const [row] = out.skills[0].rows;
  assert.deepEqual([row.key, row.now, row.next_rung], ['skill:speaking.delivery', 'skilled', 'accomplished']);
  assert.equal(JSON.stringify(out).includes('Noah'), false);
});

test('a student with no claim gets nothing, and a bad strand is refused', async () => {
  const { store } = await setup();
  assert.deepEqual(await profileAction(store, 'class1', { action: 'skills', class_token: 'c'.repeat(48) }), { need: 'initials' });
  await assert.rejects(() => profileAction(store, 'class1', { action: 'skills', strand: 'NOT OK', ...device }));
});
