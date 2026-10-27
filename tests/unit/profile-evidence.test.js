import test from 'node:test';
import assert from 'node:assert/strict';
import { profileItems } from '../../netlify/functions/_shared/profile-items.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const alignment = {
  focus_areas: [{ id: 'human', name: 'Human', points: [{ id: 'U1', kind: 'U', short: 'a', outcomes: [] }, { id: 'R1', kind: 'R', short: 'b', outcomes: [] }] }]
};
const lessons = [
  { id: 'l1', title: 'One', dot_points: ['human:U1'] },
  { id: 'l2', title: 'Two', dot_points: ['human:R1', 'human:U1'] },
  { id: 'q1', title: 'Quiz' }
];
const quizRecord = { version: 'v1', settings: {}, order: ['a'], questions: { a: { question: {}, key: { id: 'a', marks: 1, skills: ['writing.thesis'], techniques: { o1: 'metaphor' } } } } };
const world = (extra = []) => storeFixture([
  ['lessons/q1', { id: 'q1', title: 'Quiz', pedagogical_mode: 'quiz' }],
  ['published/lessons/q1', { id: 'q1' }],
  ['quiz/q1/current', { version: 'v1' }],
  ['quiz/q1/keys/v1', quizRecord],
  ...extra
]);
const view = { markbook: { columns: [{ kind: 'assessment', id: 'c1', criteria: [{ id: 'k1', skill: 'writing.thesis' }, { id: 'k2' }] }, { kind: 'handin', id: 'h' }] } };

test('the universe is the unit’s declared dot points, quiz techniques and skills', async () => {
  const items = await profileItems(world(), null, lessons, view, alignment);
  const sorted = (xs) => xs.map((i) => `${i.group}|${i.tag}`).sort();
  assert.deepEqual(sorted(items), ['concepts|tech:metaphor', 'responding|dp:human:R1', 'skills|skill:writing.thesis', 'understanding|dp:human:U1']);
});

test('without an alignment the dot-point bars are empty, the others still work', async () => {
  const items = await profileItems(world(), null, lessons, view, null);
  assert.deepEqual(items.map((i) => i.group).sort(), ['concepts', 'skills']);
});

test('a quiz that is not published declares nothing', async () => {
  const items = await profileItems(storeFixture(), null, lessons, { markbook: { columns: [] } }, null);
  assert.deepEqual(items, []);
});

test('the profile payload carries only fractions for the bars', async () => {
  const token = '1'.repeat(48);
  const s = world([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', current_unit_id: 'unit1', students: [{ name: 'Bob Brown' }] }],
    ['units/unit1', { id: 'unit1', title: 'U', lesson_ids: ['l1', 'q1'] }],
    ['lessons/l1', { id: 'l1', title: 'One', dot_points: ['human:U1'] }],
    ['syllabus_alignment/english-advanced-12-2024', alignment]
  ]);
  await claimInitials(s, await loadRoster(s, 'class1'), token, 'BB');
  const out = await profileAction(s, 'class1', { class_token: token });
  assert.deepEqual(out.fills.understanding, { mastered: 0, building: 0 });
  assert.deepEqual(Object.keys(out.fills).sort(), ['concepts', 'responding', 'skills', 'understanding']);
});
