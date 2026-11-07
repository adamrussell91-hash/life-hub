import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';
import { workOwner, handinKey, draftKey } from '../../netlify/functions/_shared/lesson-work.mjs';
import { pieceKey } from '../../netlify/functions/_shared/piece-feedback.mjs';
import { weekStart } from '../../netlify/functions/_shared/organiser.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  const writes = [];
  return {
    data,
    writes,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value) { writes.push(key); data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { writes.push(`delete:${key}`); data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

async function fixture() {
  const s = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ava Example' }, { name: 'Ben Sample' }] }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: [] }]
  ]);
  const roster = await loadRoster(s, 'class1');
  return { s, ava: roster.students[0], ben: roster.students[1] };
}

// Thursday 12 Nov 2026, early afternoon in Sydney.
const NOW = { now: new Date('2026-11-12T03:00:00Z') };

test('weekStart gives the Monday', () => {
  assert.equal(weekStart('2026-11-12'), '2026-11-09');
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
  assert.equal(weekStart('2026-11-08'), '2026-11-02');
});

test('habits read boxes, redrafts and next steps without writing anything', async () => {
  const { s, ava } = await fixture();
  const owner = workOwner('class1', ava.id);
  s.data.set(`organiser_practice/class1/${owner}`, {
    at: '2026-11-12T02:00:00Z',
    boxes: {
      ol_a: { box: 3, due: '2026-11-19', last: '2026-11-12', h: [{ d: '2026-11-02', ok: true }, { d: '2026-11-10', ok: true }, { d: '2026-11-12', ok: true }] },
      ol_b: { box: 1, due: '2026-11-13', last: '2026-11-11', h: [{ d: '2026-11-03', ok: false }, { d: '2026-11-11', ok: false }] },
      ol_c: { box: 2, due: '2026-11-14', last: '2026-11-11', h: [{ d: '2026-11-11', ok: true }] }
    }
  });
  // A written piece redrafted twice: two frozen drafts, each returned with a next step.
  s.data.set(pieceKey('class1', ava.id, 'w:lesson1:block1'), { kind: 'written', status: 'draft', draft: 3, lesson_id: 'lesson1', block_id: 'block1', rubric: { next_step: { text: 'Embed the quotation.' } } });
  s.data.set(draftKey('lesson1', 'block1', ava.id, 1), { handed_in_at: '2026-10-01T00:00:00Z', returned_at: '2026-10-03T00:00:00Z', rubric: { next_step: { text: 'Name the technique.' } } });
  s.data.set(draftKey('lesson1', 'block1', ava.id, 2), { handed_in_at: '2026-10-05T00:00:00Z', returned_at: '2026-10-07T00:00:00Z', rubric: { next_step: { text: 'Embed the quotation.' } } });
  s.data.set(handinKey('lesson1', 'block1', ava.id), { handed_in_at: '2026-10-09T00:00:00Z', draft: 3 });
  // A later piece returned with a step the student hasn't answered yet.
  s.data.set(pieceKey('class1', ava.id, 'w:lesson2:block9'), { kind: 'written', status: 'returned', returned_at: '2026-10-20T00:00:00Z', lesson_id: 'lesson2', block_id: 'block9', rubric: { next_step: { text: 'Link back to the question.' } }, seen_at: null });
  s.data.set(handinKey('lesson2', 'block9', ava.id), { handed_in_at: '2026-10-15T00:00:00Z' });
  const before = structuredClone([...s.data]);
  s.writes.length = 0;

  const out = await teacherProfileAction(s, 'class1', { action: 'habits', student_id: ava.id }, NOW);
  assert.deepEqual(s.writes, [], 'a read never writes');
  assert.deepEqual([...s.data], before, 'and never sets seen_at');
  assert.deepEqual(out.organiser, {
    streak: 3,
    avg_box: 2,
    weekly: [{ week_start: '2026-11-02', right: 1, seen: 2 }, { week_start: '2026-11-09', right: 3, seen: 4 }]
  });
  assert.equal(out.redrafts, 2);
  assert.deepEqual(out.steps, { set: 3, acted: 2 });
});

test('a streak can end yesterday, and breaks on a missed day', async () => {
  const { s, ava } = await fixture();
  s.data.set(`organiser_practice/class1/${workOwner('class1', ava.id)}`, { boxes: { ol_a: { box: 2, last: '2026-11-11', h: [{ d: '2026-11-08', ok: true }, { d: '2026-11-10', ok: true }, { d: '2026-11-11', ok: false }] } } });
  const out = await teacherProfileAction(s, 'class1', { action: 'habits', student_id: ava.id }, NOW);
  assert.equal(out.organiser.streak, 2);
});

test('a student with nothing gets null and zeros, not an error', async () => {
  const { s, ben } = await fixture();
  const out = await teacherProfileAction(s, 'class1', { action: 'habits', student_id: ben.id }, NOW);
  assert.deepEqual(out, { organiser: null, redrafts: 0, steps: { set: 0, acted: 0 } });
  s.data.set(`organiser_practice/class1/${workOwner('class1', ben.id)}`, { boxes: {} });
  const empty = await teacherProfileAction(s, 'class1', { action: 'habits', student_id: ben.id }, NOW);
  assert.deepEqual(empty.organiser, { streak: 0, avg_box: null, weekly: [] });
});

test('habits need a student on the roster', async () => {
  const { s } = await fixture();
  await assert.rejects(teacherProfileAction(s, 'class1', { action: 'habits', student_id: 'nobody' }), { code: 'bad_request' });
});
