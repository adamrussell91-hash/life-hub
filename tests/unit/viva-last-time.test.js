import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { goalText, teacherRecord } from '../../netlify/functions/_shared/voice-submissions.mjs';

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
const code = (id, label) => ({ id, code: id.toUpperCase(), label, group: 'viva', criterion: null, colour: 'peach', descriptor: `${label} step` });

/** Invented class: Ava has five vivas back; Noah has one of his own that must never reach her. */
async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 Sample', active_unit_ids: [], students: [{ name: 'Ava Sample' }, { name: 'Noah Example' }] }],
    ['feedback_codes/library', { codes: [code('ar', 'Analysis – relevance'), code('fw', 'Filler words'), code('ev', 'Evidence')] }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava, noah] = roster.students;
  const viva = (who, lesson, at, tags, extra = {}) => {
    store.data.set(`voice_submissions/${lesson}/blk/s_${who.id}`, { status: 'returned', class_id: 'class1', student_id: who.id, tags, comment: '', submitted_at: at, returned_at: at, ...extra });
    store.data.set(`piece_feedback/class1/${who.id}/v:${lesson}`, { kind: 'viva', title: `Viva ${lesson}`, lesson_id: lesson, column_id: null, tags: [], comment: '', status: 'returned', returned_at: at, updated_at: 'x' });
  };
  const need = (id) => ({ code_id: id, positive: false });
  const good = (id) => ({ code_id: id, positive: true });
  viva(ava, 'l0', '2026-10-01T00:00:00Z', [need('ev')]);
  viva(ava, 'l1', '2026-10-08T00:00:00Z', [need('ar'), need('fw')]);
  viva(ava, 'l2', '2026-10-15T00:00:00Z', [need('ar'), need('fw'), good('ev')]);
  viva(ava, 'l3', '2026-10-22T00:00:00Z', [need('ar'), good('ev'), { ...need('fw'), confirmed: false }]);
  viva(ava, 'l4', '2026-10-29T00:00:00Z', [need('ar'), need('ar'), good('ev')], { comment: '  Push to the effect. ' });
  viva(noah, 'l4', '2026-10-30T00:00:00Z', [need('fw')], { comment: 'Noah only' });
  await profileAction(store, 'class1', { action: 'claim', initials: ava.initials, ...device });
  return { store, ava };
}

test('a viva block gets the last viva and the pattern across the last four, oldest first', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'skills', strand: 'speaking', vivas: true, lesson_id: 'lnew', ...device });
  const { vivas } = out;
  assert.equal(vivas.count, 5);
  assert.equal(vivas.last.lesson_id, 'l4');
  assert.equal(vivas.last.comment, 'Push to the effect.');
  assert.equal(vivas.last.tags.length, 3);
  const rows = Object.fromEntries(vivas.pattern.map((r) => [r.code_id, r.marks]));
  // l0 drops out: only the last four. An unconfirmed tag doesn't count.
  assert.deepEqual(rows.ar, ['need', 'need', 'need', 'need']);
  assert.deepEqual(rows.fw, ['need', 'need', null, null]);
  assert.deepEqual(rows.ev, [null, 'strength', 'strength', 'strength']);
  assert.equal(vivas.pattern[0].code_id, 'ar', 'the code that keeps coming back leads');
  assert.deepEqual(vivas.codes.map((c) => c.id).sort(), ['ar', 'ev', 'fw']);
  assert.equal(JSON.stringify(out).includes('Noah only'), false);
});

test('the lesson the student is in is left out, and the teacher’s chosen next step comes through', async () => {
  const { store } = await setup();
  store.data.get('voice_submissions/l3/blk/s_' + (await loadRoster(store, 'class1')).students[0].id).rubric = { skills: {}, pieces: {}, steps: {}, next_step: { text: 'Name the effect on the reader.' } };
  const out = await profileAction(store, 'class1', { action: 'skills', strand: 'speaking', vivas: true, lesson_id: 'l4', ...device });
  assert.equal(out.vivas.last.lesson_id, 'l3');
  assert.equal(out.vivas.last.next_step, 'Name the effect on the reader.');
  assert.equal(out.vivas.count, 4);
});

test('no vivas back gives no card; without the flag the response is unchanged; a bad lesson is refused', async () => {
  const { store } = await setup();
  for (const key of [...store.data.keys()]) if (key.startsWith('piece_feedback/')) store.data.delete(key);
  const none = await profileAction(store, 'class1', { action: 'skills', strand: 'speaking', vivas: true, ...device });
  assert.deepEqual(none.vivas, { last: null, pattern: [], count: 0 });
  const plain = await profileAction(store, 'class1', { action: 'skills', strand: 'speaking', ...device });
  assert.equal('vivas' in plain, false);
  await assert.rejects(() => profileAction(store, 'class1', { action: 'skills', vivas: true, lesson_id: '../x', ...device }));
});

test('the ticked goal is kept short and reaches the teacher’s marking record', () => {
  assert.equal(goalText('  say   what it does '), 'say what it does');
  assert.equal(goalText(42), '');
  assert.equal(goalText('x'.repeat(400)).length, 300);
  const rec = teacherRecord({ id: 'a', device_hash: 'abcdef123', audio_key: null, goal: 'say what it does' });
  assert.equal(rec.goal, 'say what it does');
});
