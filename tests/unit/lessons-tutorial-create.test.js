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
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; }
  };
}

const NOW = '2026-10-23T00:00:00.000Z';
const shell = (id, block_type, content) => ({
  id, type: 'block', block_type, variant: block_type === 'heading' ? 'section' : 'medium', visibility: 'student_teacher',
  created_at: NOW, updated_at: NOW, schema_version: 1, content
});
// The same shape tutorialSkeleton builds in the browser.
const skeleton = () => [
  shell('t1', 'heading', { text: 'Demo' }),
  shell('t2', 'section', { title: 'Re-tells', tutorial_group: 'ga', blocks: [shell('t3', 'heading', { text: 'Today: the effect' }), shell('t4', 'with_teacher', { talking_points: [] })] }),
  shell('t5', 'section', { title: 'Exit check: Re-tells', tutorial_group: 'ga', tutorial_exit: true, blocks: [] })
];
const tutorial = {
  class_id: 'class1', tag: 'tech:cyclical', source_lesson_id: 'la',
  groups: [{ id: 'ga', name: 'Re-tells', why: 'Re-tells the plot', goal: 'Today: the effect', gap_type: 'knowledge', students: ['st_ann'], evidence: [{ student: 'st_ann', quote: 'Picked “flashback”' }] }]
};
const fixture = () => storeFixture([
  [unitKey('unit1'), { id: 'unit1', lesson_ids: ['la', 'lb'] }],
  [draftLessonKey('la'), { id: 'la', sequence: 1 }],
  [draftLessonKey('lb'), { id: 'lb', sequence: 2 }]
]);

test('a tutorial is created after its quiz with its skeleton and settings', async () => {
  const store = fixture();
  const record = await createLessonRecord(store, {
    title: 'Tutorial: Cyclical structure', unit_id: 'unit1', pedagogical_mode: 'tutorial', after_lesson_id: 'la', blocks: skeleton(), tutorial
  });
  assert.equal(record.pedagogical_mode, 'tutorial');
  assert.equal(record.sequence, 1.5);
  assert.deepEqual(record.blocks.map((b) => b.id), ['t1', 't2', 't5']);
  assert.equal(record.blocks[2].content.tutorial_exit, true);
  assert.deepEqual(record.tutorial, tutorial);
  assert.deepEqual((await store.get(unitKey('unit1'))).lesson_ids, ['la', record.id, 'lb']);
  assert.deepEqual((await store.get(draftLessonKey(record.id))).tutorial, tutorial);
});

test('bad tutorial settings or blocks are refused, and nothing is written', async () => {
  const store = fixture();
  const base = { title: 'Tutorial', unit_id: 'unit1', pedagogical_mode: 'tutorial' };
  await assert.rejects(createLessonRecord(store, { ...base, tutorial: { groups: [] } }), (e) => e.status === 400);
  await assert.rejects(createLessonRecord(store, { ...base, blocks: [{ id: 'x', block_type: 'nope' }] }), (e) => e.status === 400);
  await assert.rejects(createLessonRecord(store, { ...base, blocks: 'nope' }), (e) => e.status === 400);
  assert.equal(store.data.size, 3);
});

test('tutorial settings are ignored on a lesson that is not a tutorial', async () => {
  const record = await createLessonRecord(fixture(), { title: 'Next', unit_id: 'unit1', tutorial });
  assert.equal('tutorial' in record, false);
  assert.deepEqual(record.blocks, []);
});

test('more than 40 starting blocks are refused', async () => {
  const store = fixture();
  const blocks = Array.from({ length: 41 }, (_, i) => shell(`h${i}`, 'heading', { text: `H${i}` }));
  await assert.rejects(createLessonRecord(store, { title: 'Big', unit_id: 'unit1', pedagogical_mode: 'tutorial', blocks }), (e) => e.status === 400);
  assert.equal(store.data.size, 3);
  const ok = await createLessonRecord(store, { title: 'Forty', unit_id: 'unit1', blocks: blocks.slice(0, 40) });
  assert.equal(ok.blocks.length, 40);
});
