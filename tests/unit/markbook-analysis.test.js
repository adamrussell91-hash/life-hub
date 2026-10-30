import test from 'node:test';
import assert from 'node:assert/strict';
import { markbookAction } from '../../netlify/functions/_shared/markbook.mjs';
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
    store.data.set(`piece_feedback/class1/${ava.id}/w:lesson${n}:b`, { kind: 'written', title: `Paragraph ${n}`, lesson_id: `lesson${n}`, block_id: 'b', column_id: `column00${n}`, tags: [{ id: 't', code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 4, quote: 'Text' }], comment: 'Keep going.', status: 'returned', returned_at: `2026-10-1${n}T00:00:00Z`, updated_at: 'x' });
  }
  await profileAction(store, 'class1', { action: 'claim', initials: ava.initials, ...device });
  return { store, ava, noah };
}


test('analysis returns the student rows and class patterns, teacher side', async () => {
  const { store, ava } = await setup();
  const out = await markbookAction(store, 'class1', { action: 'analysis', student_id: ava.id });
  assert.equal(out.student.outcomes[0].story.kind, 'holding');
  assert.ok(Array.isArray(out.class_patterns));
  await assert.rejects(markbookAction(store, 'class1', { action: 'analysis', student_id: 'nobody' }), /isn’t on this class list/);
});
