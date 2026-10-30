import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
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


const device = { class_token: 'a'.repeat(48) };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }, { name: 'Noah Patel' }] }],
    ['outcomes/out_a', { id: 'out_a', code: 'EN12-1', description: 'Analyses how texts shape meaning, and responds.', short: 'Analysis', group: 'x', subject_id: 's', source: 'nesa', syllabus: 'x', syllabus_version: '1' }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open each paragraph with your argument.', resource: { kind: 'link', url: 'https://example.com/ts', title: 'Topic sentences' } }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava, noah] = roster.students;
  const columns = [1, 2, 3].map((n) => ({ id: `column00${n}`, kind: 'assessment', title: `Paragraph ${n}`, date: `2026-10-0${n}`, weight: 0, piece: { lesson_id: `lesson${n}`, block_id: 'b' }, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [], steps: { secure: 'Shows how techniques shape meaning.' } }] }));
  const marks = Object.fromEntries(columns.map((c) => [c.id, { [ava.id]: { criteria: { crit0001: 6 }, steps: { crit0001: 'building' }, note: 'TEACHER ONLY NOTE' }, [noah.id]: { criteria: { crit0001: 9 }, steps: { crit0001: 'extending' } } }]));
  store.data.set('markbook/class1', { columns, marks, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] });
  for (const n of [1, 2, 3]) {
    store.data.set(`piece_feedback/class1/${ava.id}/w:lesson${n}:b`, { kind: 'written', title: `Paragraph ${n}`, lesson_id: `lesson${n}`, block_id: 'b', column_id: `column00${n}`, tags: [{ id: 't', code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 4, quote: 'Text' }], comment: 'Keep going.', status: n < 3 ? 'returned' : 'draft', returned_at: `2026-10-1${n}T00:00:00Z`, updated_at: 'x' });
  }
  await profileAction(store, 'class1', { action: 'claim', initials: ava.initials, ...device });
  return { store, ava, noah };
}

test('progress shows only returned pieces, with steps and stories and no marks', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'progress', ...device });
  assert.equal(out.pieces.length, 2, 'the draft piece stays hidden');
  const row = out.outcomes[0];
  assert.deepEqual([row.name, row.now, row.story.kind], ['Analysis', 'building', 'few']);
  assert.equal(row.looks, 'Secure looks like: Shows how techniques shape meaning.');
  const text = JSON.stringify(out);
  for (const banned of ['TEACHER ONLY NOTE', '"criteria"', 'Noah', 'extending"']) assert.equal(text.includes(banned), false, banned);
});

test('next steps carry the action sentence and the See how link', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'progress', ...device });
  assert.deepEqual(out.next[0], { code_id: 'ts', code: 'TS', colour: 'peach', positive: false, hit: 2, of: 2, action: 'Open each paragraph with your argument.', resource: { kind: 'link', url: 'https://example.com/ts', title: 'Topic sentences' } });
});

test('returned lists items newest first; seen marks one read', async () => {
  const { store, ava } = await setup();
  const list = await profileAction(store, 'class1', { action: 'returned', ...device });
  assert.deepEqual(list.items.map((i) => [i.title, i.new]), [['Paragraph 2', true], ['Paragraph 1', true]]);
  await profileAction(store, 'class1', { action: 'seen', item: list.items[0].id, ...device });
  assert.ok(store.data.get(`piece_feedback/class1/${ava.id}/w:lesson2:b`).seen_at);
});

test('piece returns the frozen text, tags with code text, comment and per-criterion steps', async () => {
  const { store, ava } = await setup();
  store.data.set(`work_handins/lesson1/b/${ava.id}`, { class_id: 'class1', student_id: ava.id, text: { answers: { q1: 'Text here.' } }, handed_in_at: 'x' });
  const out = await profileAction(store, 'class1', { action: 'piece', item: 'w:lesson1:b', ...device });
  assert.equal(out.text.answers.q1, 'Text here.');
  assert.equal(out.tags[0].label, 'Topic sentence');
  assert.deepEqual(out.criteria, [{ label: 'Analysis', step: 'building', was: null }]);
  await assert.rejects(profileAction(store, 'class1', { action: 'piece', item: 'w:lesson3:b', ...device }), /not_found|isn’t back yet/);
});

test('no claim, no data', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'progress', class_token: 'z'.repeat(48) });
  assert.deepEqual(out, { need: 'initials' });
});
