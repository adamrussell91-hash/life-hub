import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction, teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';
import { FEEDBACK_DOC_PREFIX } from '../../netlify/functions/_shared/teaching-feedback.mjs';
import { teacherNotesKey } from '../../netlify/functions/_shared/teacher-notes.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  const writes = [];
  return {
    data,
    writes,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value) { writes.push(key); data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const token = (n) => n.toString(16).repeat(48).slice(0, 48);

async function fixture() {
  const s = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ava Example' }, { name: 'Ben Sample' }] }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: [] }]
  ]);
  const roster = await loadRoster(s, 'class1');
  await claimInitials(s, roster, token(1), 'AE');
  return { s, ava: roster.students[0], ben: roster.students[1] };
}

const at = (iso) => ({ now: new Date(iso) });

test('notes save, edit, delete and list newest first', async () => {
  const { s, ava } = await fixture();
  const call = (body, when) => teacherProfileAction(s, 'class1', { student_id: ava.id, ...body }, when ? at(when) : undefined);
  assert.deepEqual(await call({ action: 'notes' }), { notes: [] });

  await call({ action: 'note_save', note: { text: '  First note  ' } }, '2026-11-01T01:00:00Z');
  const two = await call({ action: 'note_save', note: { text: 'Second, tagged', tag: 'skill:analysis.close-reading' } }, '2026-11-02T01:00:00Z');
  assert.deepEqual(two.notes.map((n) => n.text), ['Second, tagged', 'First note'], 'trimmed and newest first');
  assert.equal(two.notes[0].tag, 'skill:analysis.close-reading');
  assert.equal(two.notes[1].tag, undefined);

  const first = two.notes[1];
  const edited = await call({ action: 'note_save', note: { id: first.id, text: 'First note, edited', tag: 'dp:EN12-1' } }, '2026-11-03T01:00:00Z');
  const kept = edited.notes.find((n) => n.id === first.id);
  assert.equal(kept.text, 'First note, edited');
  assert.equal(kept.at, first.at, 'an edit keeps its date');
  assert.equal(kept.edited_at, '2026-11-03T01:00:00.000Z');
  assert.equal(kept.tag, 'dp:EN12-1');
  assert.deepEqual(edited.notes.map((n) => n.id), [two.notes[0].id, first.id], 'an edit keeps its place');

  const untagged = await call({ action: 'note_save', note: { id: first.id, text: 'No tag now', tag: null } });
  assert.equal(untagged.notes.find((n) => n.id === first.id).tag, undefined);

  const after = await call({ action: 'note_delete', note_id: first.id });
  assert.deepEqual(after.notes.map((n) => n.text), ['Second, tagged']);
  assert.deepEqual((await call({ action: 'notes' })).notes.map((n) => n.text), ['Second, tagged']);
  await assert.rejects(call({ action: 'note_delete', note_id: first.id }), { code: 'not_found', status: 404 });
  await assert.rejects(call({ action: 'note_save', note: { id: 'tn_missing', text: 'x' } }), { code: 'not_found' });
});

test('notes are per student', async () => {
  const { s, ava, ben } = await fixture();
  await teacherProfileAction(s, 'class1', { action: 'note_save', student_id: ava.id, note: { text: 'About Ava' } });
  assert.deepEqual((await teacherProfileAction(s, 'class1', { action: 'notes', student_id: ben.id })).notes, []);
  await assert.rejects(teacherProfileAction(s, 'class1', { action: 'notes', student_id: 'nobody' }), { code: 'bad_request' });
});

test('bad text and bad tags are refused', async () => {
  const { s, ava } = await fixture();
  const save = (note) => teacherProfileAction(s, 'class1', { action: 'note_save', student_id: ava.id, note });
  await assert.rejects(save({ text: '   ' }), { code: 'bad_note', status: 400 });
  await assert.rejects(save({ text: 'x'.repeat(2001) }), { code: 'bad_note' });
  await assert.rejects(save(undefined), { code: 'bad_note' });
  await assert.rejects(save({ text: 'ok', tag: 'con:metaphor' }), { code: 'bad_tag', status: 400 });
  await assert.rejects(save({ text: 'ok', tag: 'dp:' }), { code: 'bad_tag' });
  await assert.rejects(save({ text: 'ok', tag: 42 }), { code: 'bad_tag' });
  assert.equal((await save({ text: 'x'.repeat(2000), tag: 'vocab:ol_1' })).notes.length, 1);
  for (const kind of ['dp', 'out', 'skill', 'fam', 'tech', 'kp', 'du', 'vocab']) {
    await save({ text: `tag ${kind}`, tag: `${kind}:x` });
  }
});

test('notes live under their own prefix, never the feedback docs', async () => {
  const { s, ava } = await fixture();
  s.writes.length = 0;
  await teacherProfileAction(s, 'class1', { action: 'note_save', student_id: ava.id, note: { text: 'Private' } });
  assert.deepEqual(s.writes, [teacherNotesKey('class1', ava.id)]);
  assert.ok(s.writes.every((k) => k.startsWith('teacher-notes/') && !k.startsWith(FEEDBACK_DOC_PREFIX)));
  assert.ok(![...s.data.keys()].some((k) => k.startsWith(FEEDBACK_DOC_PREFIX)));
});

test('the student profile refuses every Over time action', async () => {
  const { s, ava } = await fixture();
  await teacherProfileAction(s, 'class1', { action: 'note_save', student_id: ava.id, note: { text: 'Private' } });
  for (const action of ['notes', 'note_save', 'note_delete', 'habits']) {
    await assert.rejects(
      profileAction(s, 'class1', { action, class_token: token(1), student_id: ava.id, note: { text: 'x' }, note_id: 'x' }),
      { code: 'bad_action' },
      action
    );
  }
});
