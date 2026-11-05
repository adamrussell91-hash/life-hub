import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { addedWritingAction, cleanSettings } from '../../netlify/functions/_shared/added-writing.mjs';
import { pieceFor, returnedFor, studentPieces } from '../../netlify/functions/_shared/profile-feedback.mjs';
import { toMarkQueue } from '../../netlify/functions/_shared/to-mark.mjs';

/* Invented class, unit and writing only: this repository is public. */

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

const words = 'Sport should celebrate what athletes can do. The camera decides what we value.';

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: 'Speaking club', status: 'active', current_unit_id: 'unit1', active_unit_ids: ['unit1'], students: [{ name: 'Pip Quill' }, { name: 'Ren Moss' }] }],
    ['units/unit1', { id: 'unit1', type: 'unit', title: 'Persuasion', deep_understandings: [{ id: 'du_persua', claim: 'A case needs a remedy.', pieces: [{ id: 'kp_remedy', text: 'Name a remedy', tier: 'essential' }], steps: [] }] }],
    ['feedback_codes/library', { codes: [
      { id: 'ev', code: 'E', label: 'Evidence', group: 'composition', criterion: 1, colour: 'blue', descriptor: 'Back it up.' },
      { id: 'fw', code: 'FW', label: 'Filler word', group: 'speaking', criterion: 1, colour: 'red', descriptor: 'Pause instead.' }
    ] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  return { store, roster, pip: roster.students[0], ren: roster.students[1] };
}

const add = (store, student, over = {}) => addedWritingAction(store, 'class1', { action: 'add', student_id: student.id, title: 'Speech draft 1', unit_id: 'unit1', text: words, ...over });

test('context lists the class, its students and its units with the current one first', async () => {
  const { store } = await setup();
  const ctx = await addedWritingAction(store, 'class1', { action: 'context' });
  assert.equal(ctx.students.length, 2);
  assert.deepEqual(ctx.units, [{ id: 'unit1', title: 'Persuasion' }]);
  assert.equal(ctx.current_unit_id, 'unit1');
});

test('added writing sits on the student, not the Markbook, waiting to be marked', async () => {
  const { store, pip } = await setup();
  const { piece, feedback } = await add(store, pip, { text: '  Line one.\r\nLine two.  ' });
  assert.match(piece, /^t:aw_[a-f0-9]{8}$/);
  assert.equal(feedback.status, 'in');
  assert.equal(feedback.text.writing.text, 'Line one.\nLine two.');
  assert.ok(store.data.has(`piece_feedback/class1/${pip.id}/${piece}`));
  assert.equal(store.data.get('markbook/class1'), undefined);
  const { pieces } = await addedWritingAction(store, 'class1', { action: 'list' });
  assert.deepEqual(pieces.map((p) => p.title), ['Speech draft 1']);
});

test('one student can have any number of pieces', async () => {
  const { store, pip, ren } = await setup();
  for (let n = 1; n <= 4; n += 1) await add(store, pip, { title: `Draft ${n}` });
  await add(store, ren);
  const { pieces } = await addedWritingAction(store, 'class1', { action: 'list' });
  assert.equal(pieces.filter((p) => p.student_id === pip.id).length, 4);
  assert.equal(pieces.length, 5);
});

test('adding refuses a missing title, empty text, too much text and an unknown unit or student', async () => {
  const { store, pip } = await setup();
  await assert.rejects(add(store, pip, { title: ' ' }), /title/);
  await assert.rejects(add(store, pip, { text: '   ' }), /Paste/);
  await assert.rejects(add(store, pip, { text: 'x'.repeat(20001) }), /too long/);
  await assert.rejects(add(store, pip, { unit_id: 'nope' }), /unit/);
  await assert.rejects(add(store, { id: 'st_ghost' }), /class list/);
});

test('deep tags keep only what a rubric can read', () => {
  assert.deepEqual(
    cleanSettings({ deep_step: [{ du: 'du_persua', step: '3', checks: [' Names a remedy ', 7] }, { du: 'bad', step: '3' }], deep_targets: ['kp_remedy', 'x'], deep_skills: ['speaking.rhetoric', 'NOPE'], deep_taught: ['kp_remedy'] }),
    { deep_step: [{ du: 'du_persua', step: '3', checks: ['Names a remedy'] }], deep_targets: ['kp_remedy'], deep_skills: ['speaking.rhetoric'] }
  );
});

test('marking keeps written codes on the words, and the rubric feeds the piece’s own unit', async () => {
  const { store, pip } = await setup();
  const { piece } = await add(store, pip, { settings: { deep_targets: ['kp_remedy'] } });
  const loaded = await addedWritingAction(store, 'class1', { action: 'load', student_id: pip.id, piece });
  assert.equal(loaded.feedback, null);
  assert.deepEqual(loaded.codes.map((c) => c.id), ['ev']);
  const { feedback } = await addedWritingAction(store, 'class1', {
    action: 'save', student_id: pip.id, piece, comment: ' Name the remedy sooner. ', today: '2026-11-05',
    tags: [{ code_id: 'ev', part: 'writing', field: 'text', start: 0, end: 5 }, { code_id: 'fw', part: 'writing', field: 'text', start: 0, end: 5 }],
    rubric: { pieces: { kp_remedy: 'used' } }
  });
  assert.equal(feedback.status, 'draft');
  assert.deepEqual(feedback.tags.map((t) => [t.code_id, t.quote]), [['ev', 'Sport']]);
  assert.equal(feedback.comment, 'Name the remedy sooner.');
  const deep = [...store.data.entries()].find(([k]) => k.includes('unit1') && k.includes('class1'));
  assert.ok(deep, 'the unit’s class progress was written');
  assert.deepEqual(deep[1].writing[piece.slice(2)][pip.id].used, ['kp_remedy']);
});

test('return needs marking, then the student sees it in Returned work and can open it', async () => {
  const { store, roster, pip } = await setup();
  const { piece } = await add(store, pip);
  await assert.rejects(addedWritingAction(store, 'class1', { action: 'return', student_id: pip.id, piece }), /Mark this piece/);
  assert.deepEqual((await returnedFor(store, roster, pip)).items, []);
  await addedWritingAction(store, 'class1', { action: 'save', student_id: pip.id, piece, comment: 'Strong close.', tags: [] });
  await addedWritingAction(store, 'class1', { action: 'return', student_id: pip.id, piece });
  const { items } = await returnedFor(store, roster, pip);
  assert.deepEqual(items.map((i) => [i.id, i.kind, i.title]), [[piece, 'written', 'Speech draft 1']]);
  const opened = await pieceFor(store, roster, pip, piece);
  assert.equal(opened.text.writing.text, words);
  assert.equal(opened.comment, 'Strong close.');
  assert.equal((await addedWritingAction(store, 'class1', { action: 'list' })).pieces.length, 0);
});

test('take back hides it from the student again, and delete removes it', async () => {
  const { store, roster, pip } = await setup();
  const { piece } = await add(store, pip);
  await addedWritingAction(store, 'class1', { action: 'save', student_id: pip.id, piece, comment: 'Ok.', tags: [] });
  await addedWritingAction(store, 'class1', { action: 'return', student_id: pip.id, piece });
  const back = await addedWritingAction(store, 'class1', { action: 'take_back', student_id: pip.id, piece });
  assert.equal(back.feedback.status, 'draft');
  assert.equal((await studentPieces(store, 'class1', pip.id)).length, 0);
  await addedWritingAction(store, 'class1', { action: 'delete', student_id: pip.id, piece });
  assert.equal(store.data.has(`piece_feedback/class1/${pip.id}/${piece}`), false);
  await assert.rejects(addedWritingAction(store, 'class1', { action: 'load', student_id: pip.id, piece }), /isn’t here/);
});

test('pieces from another kind of row or a bad id are refused', async () => {
  const { store, pip } = await setup();
  await assert.rejects(addedWritingAction(store, 'class1', { action: 'load', student_id: pip.id, piece: 'w:l1:b1' }), /can’t be found/);
  await assert.rejects(addedWritingAction(store, 'class1', { action: 'nope' }), /Unknown action/);
});

test('To mark shows one Added writing item per class with a row per piece', async () => {
  const { store, pip, ren } = await setup();
  await add(store, pip, { title: 'Draft 1' });
  await add(store, ren, { title: 'Essay plan' });
  const { tasks } = await toMarkQueue(store);
  const added = tasks.filter((t) => t.kind === 'added');
  assert.equal(added.length, 1);
  assert.equal(added[0].waiting, 2);
  assert.deepEqual(added[0].rows.map((r) => r.title).sort(), ['Draft 1', 'Essay plan']);
});
