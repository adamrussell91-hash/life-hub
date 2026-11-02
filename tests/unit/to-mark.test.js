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

test('the queue gathers voice takes, hand-ups, sprint reflections and sprint questions waiting on the teacher', async () => {
  const { store, ava } = await setup();
  const { ownerOf } = await import('../../netlify/functions/_shared/sprint.mjs');
  const [, noah] = (await loadRoster(store, 'class1')).students;
  store.data.set('classes/class1', { ...store.data.get('classes/class1'), active_unit_ids: ['unit1'] });
  store.data.set('units/unit1', { id: 'unit1', lesson_ids: ['lesson1', 'sprint1', 'lect1'] });
  store.data.set('published/lessons/lesson1', { id: 'lesson1', title: 'Imagery' });
  store.data.set('published/lessons/lect1', { id: 'lect1', title: 'Road lecture' });
  store.data.set('voice_submissions/lesson1/voice1/s1', { class_id: 'class1', student_id: ava.id, initials: 'AN', status: 'new', submitted_at: '2026-11-01T00:00:00Z' });
  store.data.set('voice_submissions/lesson1/voice1/s2', { class_id: 'class1', student_id: noah.id, initials: 'NP', status: 'returned', submitted_at: '2026-11-01T00:00:00Z' });
  store.data.set('voice_submissions/lesson1/voice1/s3', { class_id: null, initials: 'ZZ', status: 'marked', submitted_at: '2026-11-02T00:00:00Z' });
  store.data.set('lecture/lect1/handups/own1/h1', { status: 'open', class_id: 'class1', student_id: ava.id, at: '2026-11-03T00:00:00Z' });
  store.data.set('lecture/lect1/handups/own1/h2', { status: 'answered', class_id: 'class1', student_id: ava.id, at: '2026-11-03T00:00:00Z' });
  store.data.set('lecture/lect1/progress/own1', { reached: 1, class_id: 'class1' });
  store.data.set('lessons/sprint1', { id: 'sprint1', title: 'Bridge sprint', sprint: { columns: { reflection: 'refl0001' } } });
  store.data.set('sprint/sprint1/config', { class_id: 'class1', groups: [{ id: 'g1', name: 'Group 1', students: [ava.id, noah.id] }] });
  store.data.set(`sprint/sprint1/subs/${ownerOf('class1', ava.id)}/test`, { submitted_at: '2026-11-02T00:00:00Z' });
  store.data.set(`sprint/sprint1/subs/${ownerOf('class1', noah.id)}/test`, { submitted_at: '2026-11-02T00:00:00Z' });
  store.data.set('markbook/class1', { ...store.data.get('markbook/class1'), marks: { refl0001: { [noah.id]: { scores: {} } } } });
  store.data.set('sprint/sprint1/groups/g1', { ask_sent: [{ id: 'q1', text: 'Is it fair?', at: '2026-11-02T01:00:00Z' }, { id: 'q2', text: 'Done?' }], answers: { q2: { text: 'Yes' } } });

  const { tasks } = await toMarkQueue(store, { now: () => Date.parse('2026-11-05T00:00:00Z') });
  const by = Object.fromEntries(tasks.map((t) => [t.kind, t]));
  assert.deepEqual(Object.keys(by).sort(), ['ask', 'handup', 'piece', 'sprint', 'voice']);
  assert.deepEqual([by.voice.waiting, by.voice.who, by.voice.href, by.voice.title], [2, ['AN', 'ZZ'], '/lessons/lesson1#block=voice1', 'Imagery']);
  assert.deepEqual([by.handup.waiting, by.handup.title, by.handup.href], [1, 'Road lecture', '/lessons/lect1']);
  assert.deepEqual([by.sprint.waiting, by.sprint.handed_in, by.sprint.title], [1, 2, 'Bridge sprint']);
  assert.deepEqual([by.ask.waiting, by.ask.who], [1, ['Group 1']]);
  assert.equal(tasks[0].kind, 'piece', 'oldest waiting first');
});
