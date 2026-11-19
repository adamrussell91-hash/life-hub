import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { prepareLabPublish } from '../../netlify/functions/_shared/lab.mjs';
import { workAction } from '../../netlify/functions/_shared/lesson-work.mjs';
import { createLessonRecord } from '../../netlify/functions/lessons.mjs';
import { PAIRS_LAB, ROSTER, SUPPLIED, memoryStore } from './helpers/lab-store.js';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const stamp = '2026-08-01T00:00:00.000Z';
const lesson = (lab, blocks = []) => ({ id: 'lab1', type: 'lesson', title: 'Passive voice lab', unit_id: 'unit_1', pedagogical_mode: 'lab', lab, blocks, status: 'active', created_at: stamp, updated_at: stamp, schema_version: 1 });

async function publish(store) {
  const handler = createLessonPublishHandler({ env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store });
  return handler(new Request('https://api.adam-russell.com/api/lessons/lab1/publish', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', 'content-type': 'application/json' },
    body: JSON.stringify({})
  }));
}

test('prepareLabPublish keeps teacher-only lines out of the snapshot', () => {
  const out = prepareLabPublish(lesson(SUPPLIED));
  assert.deepEqual(out.problems, []);
  assert.equal(out.config.debrief, SUPPLIED.debrief);
  assert.deepEqual(out.config.texts, SUPPLIED.texts);
  assert.ok(out.config.version);
  const shown = JSON.stringify(out.snapshot);
  for (const secret of ['dumped', 'Ask who is missing', 'class1']) assert.ok(!shown.includes(secret), secret);
  assert.deepEqual(out.snapshot.options, ['Active', 'Passive']);
  assert.deepEqual(out.blocks.map((b) => b.id), ['lab_explain']);

  const pairs = prepareLabPublish(lesson(PAIRS_LAB));
  assert.deepEqual(pairs.problems, []);
  const pairsShown = JSON.stringify(pairs.snapshot);
  for (const secret of ['st_01', 'somewhere else', '"pairs":', '"control"']) assert.ok(!pairsShown.includes(secret), secret);
  assert.equal(pairs.config.pairs.length, 8);
});

test('an unfinished card is reported, not published', async () => {
  assert.deepEqual(prepareLabPublish(lesson(undefined)).problems, ['Fill in the Lab card before you publish.']);
  assert.ok(prepareLabPublish(lesson({ ...SUPPLIED, texts: ['Only one.'] })).problems.includes('Paste one text for each option.'));
  const store = memoryStore([['lessons/lab1', lesson({ ...SUPPLIED, question: '' })]]);
  const response = await publish(store);
  assert.equal(response.status, 400);
  assert.equal(store.data.has('published/lessons/lab1'), false);
  assert.equal(store.data.has('lab/lab1/config'), false);
});

test('publishing a lab writes the config apart, a public snapshot, and the Explain block in both', async () => {
  const stray = { id: 'h1', type: 'block', block_type: 'heading', variant: 'medium', visibility: 'student_teacher', content: { text: 'Old notes' }, layout: {}, print: {}, settings: {}, created_at: stamp, updated_at: stamp, schema_version: 1 };
  const store = memoryStore([['lessons/lab1', lesson(SUPPLIED, [stray])]]);
  const response = await publish(store);
  assert.equal(response.status, 200);
  const published = store.data.get('published/lessons/lab1');
  assert.equal(published.pedagogical_mode, 'lab');
  assert.equal(published.lab.question, SUPPLIED.question);
  // Only the Explain block plays in a lab; the draft keeps whatever else was there.
  assert.deepEqual(published.blocks.map((b) => b.id), ['lab_explain']);
  assert.equal(published.blocks[0].block_type, 'question_set');
  assert.equal(published.blocks[0].content.questions[0].prompt, 'Explain the result.');
  const shown = JSON.stringify(published);
  for (const secret of ['dumped', 'Ask who is missing', '"texts"', '"debrief"', '"pairs"', '"control"']) assert.ok(!shown.includes(secret), secret);
  const config = store.data.get('lab/lab1/config');
  assert.deepEqual(config.texts, SUPPLIED.texts);
  assert.equal(config.class_id, 'class1');
  const draft = store.data.get('lessons/lab1');
  assert.deepEqual(draft.blocks.map((b) => b.id), ['h1', 'lab_explain']);
  assert.ok(draft.published_at);
  assert.deepEqual(draft.blocks[1], published.blocks[0]);
});

test('the Explain block takes saved writing and a hand-in like any written question', async () => {
  const store = memoryStore([
    ['lessons/lab1', lesson(SUPPLIED)],
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', students: ROSTER }]
  ]);
  assert.equal((await publish(store)).status, 200);
  const kt = { class_id: 'class1', class_token: 'a'.repeat(48) };
  await workAction(store, 'lab1', { ...kt, action: 'claim', initials: 'KT' });
  const saved = await workAction(store, 'lab1', { ...kt, action: 'save', block_id: 'lab_explain', part: 'answers', fields: { lab_explain_q: 'With the company as the subject there is nowhere else to look.' } });
  assert.equal(saved.saved, true);
  // Until the class's markbook has a column for the piece, there is nothing to hand in to.
  await assert.rejects(workAction(store, 'lab1', { ...kt, action: 'handin', block_id: 'lab_explain' }), (e) => e.code === 'not_marked');
  store.data.set('markbook/class1', {
    columns: [{ id: 'column001', kind: 'assessment', title: 'Lab explanation', date: '2026-11-19', weight: 0, piece: { lesson_id: 'lab1', block_id: 'lab_explain' }, criteria: [{ id: 'crit0001', label: 'Explanation', max: 5, outcomes: [], concepts: [] }] }],
    marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: []
  });
  const status = await workAction(store, 'lab1', { ...kt, action: 'status' });
  assert.deepEqual(status.handin_blocks, ['lab_explain']);
  const handed = await workAction(store, 'lab1', { ...kt, action: 'handin', block_id: 'lab_explain' });
  assert.ok(handed.handed_in_at);
  const kept = store.data.get('work_handins/lab1/lab_explain/st_01');
  assert.equal(kept.text.answers.lab_explain_q, 'With the company as the subject there is nowhere else to look.');
});

test('a new lesson can be created as a lab with its card, and a bad card is refused', async () => {
  const store = memoryStore([['units/unit_1', { id: 'unit_1', lesson_ids: [] }]]);
  const made = await createLessonRecord(store, { title: 'Storm lab', unit_id: 'unit_1', pedagogical_mode: 'lab', lab: SUPPLIED });
  assert.equal(made.lab.question, SUPPLIED.question);
  await assert.rejects(createLessonRecord(store, { title: 'Bad lab', unit_id: 'unit_1', pedagogical_mode: 'lab', lab: { level: 'nope' } }), /lab settings are not valid/);
});
