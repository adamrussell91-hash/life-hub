import test from 'node:test';
import assert from 'node:assert/strict';
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

const column = { id: 'column001', kind: 'assessment', title: 'Imagery paragraph', date: '2026-10-27', weight: 0, piece: { lesson_id: 'lesson1', block_id: 'qset1', short: 'Imagery' }, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [] }] };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }, { name: 'Noah Patel' }] }],
    ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open with your argument.' }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava] = roster.students;
  store.data.set(`work_handins/lesson1/qset1/${ava.id}`, { class_id: 'class1', student_id: ava.id, text: { answers: { q1: 'In the poem the poet uses imagery.' } }, handed_in_at: '2026-10-28T00:00:00Z' });
  return { store, ava };
}

import { toMarkQueue } from '../../netlify/functions/_shared/to-mark.mjs';

test('the queue lists linked tasks with waiting pieces, oldest first, and flags 7+ days', async () => {
  const { store } = await setup();
  const out = await toMarkQueue(store, { now: () => Date.parse('2026-11-05T00:00:00Z') });
  assert.equal(out.tasks.length, 1);
  const t = out.tasks[0];
  assert.deepEqual([t.class_id, t.column_id, t.title, t.waiting, t.handed_in, t.roster], ['class1', 'column001', 'Imagery paragraph', 1, 1, 2]);
  assert.equal(t.oldest_at, '2026-10-28T00:00:00Z');
  assert.equal(t.late, true);
});
