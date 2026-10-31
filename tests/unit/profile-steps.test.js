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

const device = { class_token: 'b'.repeat(48) };
const codes = [
  { id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with your claim.', skill: 'arguing.thesis', ladder: ['a', 'b', 'c', 'd', 'e'] },
  { id: 'l', code: 'L', label: 'Length', group: 'composition', criterion: 3, colour: 'gold', descriptor: 'Balance detail and focus.' }
];

async function setup({ pieces = true } = {}) {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '11 English', active_unit_ids: [], students: [{ name: 'Mia Torres' }, { name: 'Jack Lee' }] }],
    ['feedback_codes/library', { codes }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [mia] = roster.students;
  const columns = [1, 2].map((n) => ({
    id: `column00${n}`, kind: 'assessment', title: `Paragraph ${n}`, date: `2026-10-0${n}`, weight: 0,
    piece: { lesson_id: `lesson${n}`, block_id: 'b' },
    criteria: [
      { id: 'crit0001', label: 'Argument', max: 10, outcomes: [], concepts: [], skill: 'arguing.thesis' },
      { id: 'crit0002', label: 'Inference', max: 10, outcomes: [], concepts: [], skill: 'reading.inference' }
    ]
  }));
  const marks = {
    column001: { [mia.id]: { criteria: { crit0001: 5, crit0002: 5 }, steps: { crit0001: 'capable', crit0002: 'capable' } } },
    column002: { [mia.id]: { criteria: { crit0001: 7, crit0002: 9 }, steps: { crit0001: 'skilled', crit0002: 'accomplished' } } }
  };
  store.data.set('markbook/class1', { columns, marks, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] });
  if (pieces) {
    for (const n of [1, 2]) {
      store.data.set(`piece_feedback/class1/${mia.id}/w:lesson${n}:b`, {
        kind: 'written', title: `Paragraph ${n}`, lesson_id: `lesson${n}`, block_id: 'b', column_id: `column00${n}`,
        tags: [
          { id: 't1', code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 4, quote: 'Text' },
          { id: 't2', code_id: 'l', positive: false, part: 'answers', field: 'q1', start: 0, end: 4, quote: 'Text' }
        ],
        comment: '', status: 'returned', returned_at: `2026-10-1${n}T00:00:00Z`, updated_at: 'x'
      });
    }
  }
  return { store, mia };
}

test('steps asks for initials when the device has no claim', async () => {
  const { store } = await setup();
  assert.deepEqual(await profileAction(store, 'class1', { action: 'steps', lesson_id: 'lesson1', ...device }), { need: 'initials' });
});

test('steps with a claim and no returned pieces is empty', async () => {
  const { store, mia } = await setup({ pieces: false });
  await profileAction(store, 'class1', { action: 'claim', initials: mia.initials, ...device });
  const out = await profileAction(store, 'class1', { action: 'steps', lesson_id: 'lesson1', ...device });
  assert.deepEqual(out, { need: null, skills: {} });
});

test('steps returns each skill’s rung and its linked repeating code', async () => {
  const { store, mia } = await setup();
  await profileAction(store, 'class1', { action: 'claim', initials: mia.initials, ...device });
  const out = await profileAction(store, 'class1', { action: 'steps', lesson_id: 'lesson1', ...device });
  assert.deepEqual(out, {
    need: null,
    skills: {
      'arguing.thesis': { rung: 'skilled', code: { id: 'ts', code: 'TS', colour: 'lilac', hits: 2 } },
      'reading.inference': { rung: 'accomplished', code: null }
    }
  });
  await assert.rejects(profileAction(store, 'class1', { action: 'steps', lesson_id: '../x', ...device }), (e) => e.status === 400);
});
