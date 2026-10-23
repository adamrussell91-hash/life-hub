import test from 'node:test';
import assert from 'node:assert/strict';
import { markbookAction, sydneyDay } from '../../netlify/functions/_shared/markbook.mjs';
import { createMarkbookHandler } from '../../netlify/functions/markbook.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { prepareQuizPublish, storeQuizKey, quizAction } from '../../netlify/functions/_shared/quiz.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  const etags = new Map();
  let n = 0;
  const bump = (key) => etags.set(key, `e${++n}`);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      if (options?.onlyIfMatch && (etags.get(key) ?? 'e0') !== options.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value)); bump(key); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const stamp = { created_at: '2026-10-17T00:00:00.000Z', updated_at: '2026-10-17T00:00:00.000Z', schema_version: 1 };
const sa = { id: 'qs', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] };
const quizDraft = { id: 'quiz1', title: 'Week 4 review', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: {}, blocks: [{ id: 'qs', type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher', content: { question: sa }, ...stamp }] };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: ['unit1'], students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }] }],
    ['units/unit1', { id: 'unit1', lesson_ids: ['quiz1', 'lesson2'] }],
    ['lessons/quiz1', quizDraft],
    ['lessons/lesson2', { id: 'lesson2', title: 'Monday', unit_id: 'unit1', blocks: [] }]
  ]);
  const prepared = prepareQuizPublish(quizDraft, quizDraft.blocks);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  await store.setJSON('published/lessons/quiz1', { blocks: prepared.blocks, pedagogical_mode: 'quiz', quiz: prepared.quiz.snapshot });
  const roster = await loadRoster(store, 'class1');
  return { store, bob: roster.students[0], tom: roster.students[1] };
}

const essay = { id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40, criteria: [{ id: 'crit000001', label: 'Analysis', max: 15, outcomes: [] }, { id: 'crit000002', label: 'Expression', max: 10, outcomes: [] }] };
const call = (store, body) => markbookAction(store, 'class1', body);

test('load: an empty markbook, the list, and quiz columns built from attempts', async () => {
  const { store, bob } = await setup();
  const empty = await call(store, { action: 'load' });
  assert.deepEqual(empty.markbook.columns, []);
  assert.deepEqual(empty.students.map(s => s.initials), ['BB', 'TT']);
  assert.deepEqual(empty.quizzes, [], 'no one has handed in yet');

  const device = { token: 'a'.repeat(48), class_id: 'class1', class_token: 'b'.repeat(48) };
  await quizAction(store, 'quiz1', { ...device, action: 'claim', initials: 'BB' });
  await quizAction(store, 'quiz1', { ...device, action: 'start' });
  await quizAction(store, 'quiz1', { ...device, action: 'submit', responses: { qs: { text: 'Romeo' } } });
  const loaded = await call(store, { action: 'load' });
  assert.equal(loaded.quizzes.length, 1);
  const [quiz] = loaded.quizzes;
  assert.equal(quiz.id, 'quiz:quiz1');
  assert.equal(quiz.title, 'Week 4 review');
  assert.equal(quiz.unit_id, 'unit1');
  assert.match(quiz.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(quiz.hidden, false);
  assert.equal(quiz.scores[bob.id].score, 1);

  await call(store, { action: 'hide_quiz', lesson_id: 'quiz1', hidden: true });
  assert.equal((await call(store, { action: 'load' })).quizzes[0].hidden, true);
  await call(store, { action: 'hide_quiz', lesson_id: 'quiz1', hidden: false });
  assert.equal((await call(store, { action: 'load' })).quizzes[0].hidden, false);
});

test('columns: add, edit with pruning, refuse bad ones, delete', async () => {
  const { store, bob } = await setup();
  await call(store, { action: 'save_column', column: essay });
  await call(store, { action: 'set_mark', column_id: essay.id, student_id: bob.id, mark: { criteria: { crit000001: 12, crit000002: 8 } } });
  const edited = await call(store, { action: 'save_column', column: { ...essay, criteria: [essay.criteria[0]] } });
  assert.deepEqual(edited.markbook.marks[essay.id][bob.id], { criteria: { crit000001: 12 } }, 'a deleted criterion takes its mark with it');

  await assert.rejects(call(store, { action: 'save_column', column: { ...essay, title: '' } }), /Give it a title/);
  await assert.rejects(call(store, { action: 'save_column', column: { id: essay.id, kind: 'handin', title: 'Essay', due: '2026-11-03' } }), /can’t change kind/);

  const gone = await call(store, { action: 'delete_column', column_id: essay.id });
  assert.deepEqual(gone.markbook.columns, []);
  assert.equal(gone.markbook.marks[essay.id], undefined);
  await assert.rejects(call(store, { action: 'delete_column', column_id: essay.id }), /That column is gone/);
});

test('marks: checked against the column and the list, cleared with null', async () => {
  const { store, bob } = await setup();
  await call(store, { action: 'save_column', column: essay });
  await call(store, { action: 'save_column', column: { id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-25' } });
  await assert.rejects(call(store, { action: 'set_mark', column_id: essay.id, student_id: bob.id, mark: { criteria: { crit000001: 16 } } }), /between 0 and 15 for Analysis/);
  await assert.rejects(call(store, { action: 'set_mark', column_id: essay.id, student_id: 'st_nobody', mark: { criteria: {} } }), /isn’t on the class list/);
  await assert.rejects(call(store, { action: 'set_mark', column_id: 'nope00001', student_id: bob.id, mark: true }), /That column is gone/);

  const set = await call(store, { action: 'set_mark', column_id: 'hand00001', student_id: bob.id, mark: { status: 'late', at: '2026-10-26' } });
  assert.deepEqual(set.markbook.marks.hand00001[bob.id], { status: 'late', at: '2026-10-26' });
  const cleared = await call(store, { action: 'set_mark', column_id: 'hand00001', student_id: bob.id, mark: null });
  assert.equal(cleared.markbook.marks.hand00001[bob.id], undefined);
});

test('a write that keeps losing the race says the markbook changed', async () => {
  const { store, bob } = await setup();
  await call(store, { action: 'save_column', column: essay });
  const realSet = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => (key.startsWith('markbook/') && options?.onlyIfMatch ? { modified: false } : realSet(key, value, options));
  await assert.rejects(call(store, { action: 'set_mark', column_id: essay.id, student_id: bob.id, mark: { criteria: {} } }), (e) => e.status === 409 && /changed in another tab/.test(e.message));
});

test('unknown classes and actions are refused', async () => {
  const { store } = await setup();
  await assert.rejects(markbookAction(store, 'nope', { action: 'load' }), /Class not found/);
  await assert.rejects(call(store, { action: 'drop_tables' }), /Unknown action/);
  await assert.rejects(call(store, []), /Invalid request/);
});

test('quiz dates are the Sydney day', () => {
  assert.equal(sydneyDay('2026-10-21T14:30:00.000Z'), '2026-10-22', 'after midnight in Sydney (AEDT)');
  assert.equal(sydneyDay('2026-10-21T12:00:00.000Z'), '2026-10-21');
  assert.equal(sydneyDay('2026-06-30T14:30:00.000Z'), '2026-07-01', 'AEST in winter');
});

test('the endpoint is teacher only', async () => {
  assert.equal(isPublicStudentApi('POST', '/api/classes/class1/markbook'), false);
  const { store } = await setup();
  const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const request = () => new Request('https://example.test/api/classes/class1/markbook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'load' }) });
  const signedOut = createMarkbookHandler({ env, getContentStore: async () => store, verifySessionToken: () => ({ valid: false }) });
  assert.equal((await signedOut(request())).status, 401);
  const signedIn = createMarkbookHandler({ env, getContentStore: async () => store, verifySessionToken: () => ({ valid: true }) });
  const ok = await signedIn(request());
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data.students.map((s) => s.initials), ['BB', 'TT']);
  const bad = await signedIn(new Request('https://example.test/api/classes/class1/markbook', { method: 'POST', body: '{' }));
  assert.equal(bad.status, 400);
});

async function handIn(store) {
  const device = { token: 'a'.repeat(48), class_id: 'class1', class_token: 'b'.repeat(48) };
  await quizAction(store, 'quiz1', { ...device, action: 'claim', initials: 'BB' });
  await quizAction(store, 'quiz1', { ...device, action: 'start' });
  await quizAction(store, 'quiz1', { ...device, action: 'submit', responses: { qs: { text: 'Romeo' } } });
}

test('hide_quiz takes any safe id, and a full list is refused without breaking load', async () => {
  const { store } = await setup();
  const long = 'q'.repeat(100);
  await call(store, { action: 'hide_quiz', lesson_id: long, hidden: true });
  await call(store, { action: 'hide_quiz', lesson_id: long, hidden: true });
  assert.deepEqual((await call(store, { action: 'load' })).markbook.hidden_quizzes, [long], 'hiding twice keeps one entry');

  const full = Array.from({ length: 200 }, (_, i) => `quiz${i}`);
  await store.setJSON('markbook/class1', { columns: [], hidden_quizzes: full, marks: {}, updated_at: '' });
  await assert.rejects(call(store, { action: 'hide_quiz', lesson_id: 'one_more', hidden: true }), (e) => e.status === 400 && /can’t be saved/.test(e.message));
  assert.equal((await call(store, { action: 'load' })).markbook.hidden_quizzes.length, 200);
});

test('a corrupt record gives a clear error', async () => {
  const { store } = await setup();
  await store.setJSON('markbook/class1', { columns: 'junk', marks: [] });
  await assert.rejects(call(store, { action: 'load' }), (e) => e.status === 500 && e.message === 'This markbook couldn’t be read. Nothing was changed.');
  await assert.rejects(call(store, { action: 'save_column', column: essay }), /couldn’t be read/);
});

test('a refused change writes nothing', async () => {
  const { store, bob } = await setup();
  await call(store, { action: 'save_column', column: essay });
  let writes = 0;
  const realSet = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => { if (key.startsWith('markbook/')) writes += 1; return realSet(key, value, options); };
  await assert.rejects(call(store, { action: 'set_mark', column_id: essay.id, student_id: bob.id, mark: { criteria: { crit000001: 99 } } }), /between 0 and 15/);
  assert.equal(writes, 0);
});

test('__proto__ is just a missing column', async () => {
  const { store, bob } = await setup();
  await call(store, { action: 'save_column', column: essay });
  const before = Object.getOwnPropertyNames(Object.prototype).sort();
  await assert.rejects(call(store, { action: 'delete_column', column_id: '__proto__' }), /That column is gone/);
  await assert.rejects(call(store, { action: 'set_mark', column_id: '__proto__', student_id: bob.id, mark: true }), /That column is gone/);
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before);
  assert.equal(({}).criteria, undefined);
  assert.equal((await call(store, { action: 'load' })).markbook.columns.length, 1);
});

test('a deleted unit is skipped and a lesson in two units gives one column', async () => {
  const { store } = await setup();
  await handIn(store);
  await store.setJSON('units/unit2', { id: 'unit2', lesson_ids: ['quiz1'], status: 'trashed', trashed_at: '2026-10-18T00:00:00.000Z' });
  await store.setJSON('units/unit3', { id: 'unit3', lesson_ids: ['quiz1', 'lesson2'] });
  const cls = await store.get('classes/class1');
  await store.setJSON('classes/class1', { ...cls, active_unit_ids: ['unit1', 'unit2', 'unit3', 'gone_unit'] });
  const { quizzes } = await call(store, { action: 'load' });
  assert.deepEqual(quizzes.map((q) => q.id), ['quiz:quiz1']);
});

test('load reads the class’s units together', async () => {
  const { store } = await setup();
  const cls = store.data.get('classes/class1');
  store.data.set('classes/class1', { ...cls, active_unit_ids: ['unit1', 'unit2', 'unit3'] });
  store.data.set('units/unit2', { id: 'unit2', lesson_ids: [] });
  store.data.set('units/unit3', { id: 'unit3', lesson_ids: [] });
  const started = new Map();
  let finished = 0;
  const get = store.get.bind(store);
  store.get = async (key) => {
    started.set(key, finished);
    await new Promise((r) => setTimeout(r, 1));
    finished += 1;
    return get(key);
  };
  await call(store, { action: 'load' });
  const waves = ['units/unit1', 'units/unit2', 'units/unit3'].map((key) => started.get(key));
  assert.equal(new Set(waves).size, 1, 'the three units go out together');
});

test('set_focus pins and dismisses tags per student', async () => {
  const { store, bob } = await setup();
  const { markbook } = await call(store, { action: 'set_focus', student_id: bob.id, pinned: ['tech:simile', 'tech:simile'], dismissed: ['tech:motif'] });
  assert.deepEqual(markbook.focus[bob.id], { pinned: ['tech:simile'], dismissed: ['tech:motif'] });
  const cleared = await call(store, { action: 'set_focus', student_id: bob.id, pinned: [], dismissed: [] });
  assert.equal(bob.id in cleared.markbook.focus, false);
  await assert.rejects(call(store, { action: 'set_focus', student_id: 'nobody', pinned: [] }), /class list/);
});
