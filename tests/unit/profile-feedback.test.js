import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAction, teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';
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

test('a returned viva set shows up as one piece with its confirmed tags', async () => {
  const { store, ava } = await setup();
  store.data.set('voice_submissions/lessonV/blk1/s1', { status: 'returned', class_id: 'class1', student_id: ava.id, tags: [{ code_id: 'ts', positive: false, confirmed: true }], returned_at: '2026-10-20T00:00:00Z' });
  store.data.set('voice_submissions/lessonV/blk2/s2', { status: 'returned', class_id: 'class1', student_id: ava.id, tags: [{ code_id: 'ts', positive: false, confirmed: false }], returned_at: '2026-10-20T00:00:00Z' });
  store.data.set(`piece_feedback/class1/${ava.id}/v:lessonV`, { kind: 'viva', title: 'Viva practice', lesson_id: 'lessonV', column_id: null, tags: [], comment: 'Clear.', status: 'returned', returned_at: '2026-10-20T00:00:00Z', updated_at: 'x' });
  const out = await profileAction(store, 'class1', { action: 'returned', class_token: 'a'.repeat(48) });
  const viva = out.items.find((i) => i.kind === 'viva');
  assert.equal(viva.title, 'Viva practice');
  assert.deepEqual(viva.codes, ['ts'], 'only the confirmed tag counts');
});

test('opening a returned viva sends each take as the lesson shows it, with the codes for its focus', async () => {
  const { store, ava } = await setup();
  const words = ['the', 'river', 'is', 'like', 'a', 'road'].map((word, i) => ({ word, start: i, end: i + 1 }));
  store.data.set('voice_submissions/lessonV/blk1/s1', { status: 'returned', class_id: 'class1', student_id: ava.id, submitted_at: '2026-10-19T00:00:00Z', duration_s: 6, audio_key: 'a'.repeat(36), prompt: 'Why the road?', transcript: { text: 'x', words }, comment: 'Slow down at the start.', tags: [{ code_id: 'ts', positive: false, confirmed: true, t: 1, w: [1, 3], note: 'Name the device.' }, { code_id: 'ts', positive: false, confirmed: false, w: [0, 0] }], returned_at: '2026-10-20T00:00:00Z' });
  store.data.set(`piece_feedback/class1/${ava.id}/v:lessonV`, { kind: 'viva', title: 'Viva practice', lesson_id: 'lessonV', column_id: null, tags: [], comment: '', status: 'returned', returned_at: '2026-10-20T00:00:00Z', updated_at: 'x' });
  const out = await profileAction(store, 'class1', { action: 'piece', item: 'v:lessonV', ...device });
  assert.equal(out.takes.length, 1);
  const take = out.takes[0];
  assert.equal(take.tags.length, 1, 'only the confirmed tag');
  assert.deepEqual(take.tags[0].w, [1, 3]);
  assert.equal(take.tags[0].note, 'Name the device.');
  assert.equal(take.comment, 'Slow down at the start.');
  assert.equal(take.prompt, 'Why the road?');
  assert.ok(take.audio_url.includes('a'.repeat(36)));
  assert.equal(take.transcript.words.length, 6);
  assert.deepEqual(out.codes.map((c) => c.id), ['ts']);
});

test('a feedback document for this student appears as a Note, opens, and is marked seen', async () => {
  const { store, ava } = await setup();
  store.data.set('feedback_docs/doc1', { id: 'doc1', title: 'Before your final draft', body_html: '<p>Hi</p>', class_id: 'class1', student_id: ava.id, returned_at: '2026-10-25T00:00:00Z', created_at: 'x', updated_at: 'x', token_hash: 'SECRET' });
  const out = await profileAction(store, 'class1', { action: 'returned', class_token: 'a'.repeat(48) });
  assert.ok(out.items.some((i) => i.kind === 'note' && i.title === 'Before your final draft'));
  const note = await profileAction(store, 'class1', { action: 'piece', item: 'n:doc1', class_token: 'a'.repeat(48) });
  assert.equal(note.body_html, '<p>Hi</p>');
  assert.equal(JSON.stringify(note).includes('SECRET'), false);
  await profileAction(store, 'class1', { action: 'seen', item: 'n:doc1', class_token: 'a'.repeat(48) });
  assert.ok(store.data.get('feedback_docs/doc1').seen_at);
  await assert.rejects(profileAction(store, 'class1', { action: 'piece', item: 'n:nothere', class_token: 'a'.repeat(48) }), /isn’t here/);
});

test('the token counts new pieces and notes, and asks nothing of an unclaimed device', async () => {
  const { store, ava } = await setup();
  const before = await profileAction(store, 'class1', { action: 'token', ...device });
  assert.deepEqual(before, { need: null, initials: ava.initials, unseen: 2 });
  store.data.set('feedback_docs/doc1', { id: 'doc1', class_id: 'class1', student_id: ava.id, title: 'Before your final draft', returned_at: '2026-10-09T00:00:00Z' });
  const prefix = (await profileAction(store, 'class1', { action: 'token', ...device })).unseen;
  const items = (await profileAction(store, 'class1', { action: 'returned', ...device })).items;
  await profileAction(store, 'class1', { action: 'seen', item: items.find((i) => i.kind !== 'note').id, ...device });
  assert.equal((await profileAction(store, 'class1', { action: 'token', ...device })).unseen, prefix - 1);
  assert.deepEqual(await profileAction(store, 'class1', { action: 'token', class_token: 'b'.repeat(48) }), { need: 'initials' });
});

test('the teacher sees any student’s page as they do, and opening a piece leaves it new', async () => {
  const { store, ava, noah } = await setup();
  const mine = await profileAction(store, 'class1', { action: 'progress', ...device });
  const theirs = await teacherProfileAction(store, 'class1', { action: 'progress', student_id: ava.id });
  assert.equal(theirs.name, 'Ava Nguyen');
  assert.deepEqual(theirs.pieces, mine.pieces);
  assert.deepEqual(theirs.next, mine.next);
  const list = await teacherProfileAction(store, 'class1', { action: 'returned', student_id: ava.id });
  assert.deepEqual(list.items.map((i) => i.title), ['Paragraph 2', 'Paragraph 1']);
  await teacherProfileAction(store, 'class1', { action: 'piece', student_id: ava.id, item: list.items[0].id });
  assert.equal(store.data.get(`piece_feedback/class1/${ava.id}/w:lesson2:b`).seen_at, undefined);
  assert.equal((await teacherProfileAction(store, 'class1', { action: 'progress', student_id: noah.id })).pieces.length, 0);
  await assert.rejects(teacherProfileAction(store, 'class1', { action: 'progress', student_id: 'nobody' }), /Unknown student/);
});
