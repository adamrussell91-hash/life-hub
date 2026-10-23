import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonRecord } from '../../netlify/functions/lessons.mjs';
import { draftLessonKey, unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getJSON(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('a follow-up lesson goes straight after its original, with its quiz settings', async () => {
  const store = storeFixture([
    [unitKey('unit1'), { id: 'unit1', lesson_ids: ['la', 'lb'] }],
    [draftLessonKey('la'), { id: 'la', sequence: 1 }],
    [draftLessonKey('lb'), { id: 'lb', sequence: 2 }]
  ]);
  const record = await createLessonRecord(store, {
    title: 'Follow-up: Simile', unit_id: 'unit1', pedagogical_mode: 'quiz', after_lesson_id: 'la',
    quiz: { for_students: ['stu1'], follow_up_of: 'la', follow_up_flag: 'sure_wrong:tech:simile', bogus: 1 }
  });
  assert.equal(record.sequence, 1.5);
  assert.deepEqual(record.quiz, { for_students: ['stu1'], follow_up_of: 'la', follow_up_flag: 'sure_wrong:tech:simile' });
  const unit = await store.get(unitKey('unit1'));
  assert.deepEqual(unit.lesson_ids, ['la', record.id, 'lb']);
});

test('without after_lesson_id it still goes last', async () => {
  const store = storeFixture([[unitKey('unit1'), { id: 'unit1', lesson_ids: ['la'] }], [draftLessonKey('la'), { id: 'la', sequence: 4 }]]);
  const record = await createLessonRecord(store, { title: 'Next', unit_id: 'unit1' });
  assert.equal(record.sequence, 5);
  assert.equal('quiz' in record, false);
});
