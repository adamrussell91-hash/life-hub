import test from 'node:test';
import assert from 'node:assert/strict';
import { hingeAction, hingeBackupInput } from '../../netlify/functions/_shared/hinge.mjs';
import { cleanBackupDraft, parseHingeBackupResult } from '../../netlify/functions/_shared/hinge-backup.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const blockWith = (content = {}) => ({
  id: 'hq1', type: 'block', block_type: 'hinge_question', variant: 'medium', visibility: 'student_teacher',
  content: {
    prompt: 'Which force keeps the Moon in orbit?',
    options: [
      { id: 'a', text: 'Gravity', misconception: '' },
      { id: 'b', text: 'Magnetism', misconception: 'Any pull at a distance is magnetic' },
      { id: 'c', text: 'Nothing, it just keeps going', misconception: 'Moving things need no force to curve' }
    ],
    correct_id: 'a', seconds: 60, move_on: 80, reteach: 50, ...content
  },
  created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', schema_version: 1
});
function storeFixture(content, draftContent) {
  const draft = blockWith({ ...content, ...draftContent });
  const published = filterBlocksForStudent([blockWith(content)]);
  const data = new Map([['lessons/lesson1', { blocks: [draft] }], ['published/lessons/lesson1', { blocks: published }]]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}
const teach = (store, body) => hingeAction(store, 'lesson1', 'hq1', body, { teacher: true });
const learn = (store, body) => hingeAction(store, 'lesson1', 'hq1', body);
const tokens = n => Array.from({ length: n }, (_, i) => (i + 1).toString(16).repeat(48).slice(0, 48));
const answer = (store, token, session, pick) => learn(store, { token, session, action: 'answer', pick });

test('publishing strips the right answer, the notes and the marks', () => {
  const [published] = filterBlocksForStudent([blockWith()]);
  const text = JSON.stringify(published);
  for (const secret of ['correct_id', 'move_on', 'reteach', 'misconception', 'magnetic']) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(published.content.options.map(o => o.text), ['Gravity', 'Magnetism', 'Nothing, it just keeps going']);
});

test('students answer, can change their mind while open, and the teacher sees the spread with notes', async () => {
  const store = storeFixture();
  assert.deepEqual(await learn(store, {}), { phase: 'idle' });
  const round = await teach(store, { action: 'ask' });
  assert.equal(round.open, true);
  assert.ok(round.closes_at);
  const [a, b, c] = tokens(3);
  await answer(store, a, round.session, 'a');
  await answer(store, b, round.session, 'b');
  await answer(store, c, round.session, 'b');
  const changed = await answer(store, c, round.session, 'a');
  assert.equal(changed.mine, 'a');
  const t = await teach(store, {});
  assert.deepEqual(t.picks, { a: 2, b: 1, c: 0 });
  assert.equal(t.answered, 3);
  assert.equal(t.correct_id, 'a');
  assert.equal(t.options[1].misconception, 'Any pull at a distance is magnetic');
  assert.equal(t.move_on, 80);
});

test('students never see the spread, and see the right answer only after reveal', async () => {
  const store = storeFixture();
  const round = await teach(store, { action: 'ask' });
  const [a] = tokens(1);
  const before = await answer(store, a, round.session, 'b');
  for (const key of ['picks', 'answered', 'correct_id', 'options', 'move_on']) assert.ok(!(key in before), key);
  await teach(store, { action: 'reveal' });
  const after = await learn(store, { token: a });
  assert.equal(after.revealed, true);
  assert.equal(after.correct_id, 'a');
  assert.equal(after.mine, 'b');
  assert.ok(!('picks' in after));
  await assert.rejects(answer(store, a, round.session, 'a'), /closed/);
});

test('closing stops answers, and asking again starts a clean round', async () => {
  const store = storeFixture();
  const first = await teach(store, { action: 'ask' });
  const [a] = tokens(1);
  await answer(store, a, first.session, 'a');
  await teach(store, { action: 'close' });
  await assert.rejects(answer(store, a, first.session, 'b'), /closed/);
  const second = await teach(store, { action: 'ask' });
  assert.notEqual(second.session, first.session);
  assert.equal(second.answered, 0);
  await assert.rejects(answer(store, a, first.session, 'a'), /asked again/);
  assert.equal((await learn(store, { token: a })).mine, null);
});

test('the timer closes answers, and no time limit stays open', async () => {
  const store = storeFixture({ seconds: 30 });
  const round = await teach(store, { action: 'ask' });
  const active = store.data.get('hinge/lesson1/hq1/active');
  store.data.set('hinge/lesson1/hq1/active', { ...active, closes_at: new Date(Date.now() - 10_000).toISOString() });
  assert.equal((await teach(store, {})).open, false);
  await assert.rejects(answer(store, tokens(1)[0], round.session, 'a'), /closed/);
  const open = storeFixture({ seconds: 0 });
  assert.equal((await teach(open, { action: 'ask' })).closes_at, null);
});

test('bad picks, bad tokens and unpublished blocks are refused', async () => {
  const store = storeFixture();
  const round = await teach(store, { action: 'ask' });
  await assert.rejects(answer(store, tokens(1)[0], round.session, 'z'), /Choose one/);
  await assert.rejects(answer(store, 'nope', round.session, 'a'), /allow saving/);
  store.data.delete('published/lessons/lesson1');
  await assert.rejects(teach(store, {}), /Publish this lesson/);
});

test('finish ends the round, and editing after publishing is flagged as stale', async () => {
  const store = storeFixture({}, { prompt: 'Which force keeps the Moon up?' });
  const idle = await teach(store, {});
  assert.equal(idle.stale, true);
  assert.equal(idle.ready, true);
  await teach(store, { action: 'ask' });
  assert.equal((await teach(store, { action: 'finish' })).phase, 'idle');
  assert.deepEqual(await learn(store, {}), { phase: 'idle' });
});

test('an unfinished question cannot be asked', async () => {
  const store = storeFixture({}, { correct_id: '' });
  assert.equal((await teach(store, {})).ready, false);
  await assert.rejects(teach(store, { action: 'ask' }), /mark the right answer/);
});

const annDraft = {
  prompt: 'Which force keeps a satellite circling the Earth?',
  options: [
    { text: 'Its engines', right: false, misconception: 'Moving things need a push to keep going' },
    { text: 'Gravity', right: true, misconception: '' },
    { text: 'Magnetism', right: false, misconception: 'Any pull at a distance is magnetic' }
  ]
};

test('a back-up question is the teacher\'s alone until a back-up round asks it', async () => {
  const backup = { prompt: 'Which force keeps a satellite up?', options: [{ id: 'x', text: 'Gravity', misconception: '' }, { id: 'y', text: 'Air', misconception: 'Air holds things up' }], correct_id: 'x', source: 'teacher' };
  const [published] = filterBlocksForStudent([blockWith({ backup })]);
  assert.ok(!JSON.stringify(published).includes('satellite'));

  const store = storeFixture({}, { backup });
  const idle = await teach(store, {});
  assert.equal(idle.backup.prompt, 'Which force keeps a satellite up?');
  assert.ok(!('misconception' in idle.backup.options[0]));

  const main = await teach(store, { action: 'ask' });
  assert.equal(main.round, 'main');
  const [a] = tokens(1);
  assert.ok(!('question' in (await learn(store, { token: a }))));

  const round = await teach(store, { action: 'ask', round: 'backup' });
  assert.equal(round.round, 'backup');
  assert.equal(round.prompt, 'Which force keeps a satellite up?');
  assert.equal(round.correct_id, 'x');
  assert.equal(round.stale, false);
  const seen = await learn(store, { token: a });
  assert.deepEqual(seen.question, { prompt: 'Which force keeps a satellite up?', options: [{ id: 'x', text: 'Gravity' }, { id: 'y', text: 'Air' }] });
  assert.ok(!('correct_id' in seen));
  await answer(store, a, round.session, 'x');
  await assert.rejects(answer(store, a, round.session, 'a'), /Choose one of the answers/);
  assert.deepEqual((await teach(store, {})).picks, { x: 1, y: 0 });
  await teach(store, { action: 'reveal' });
  assert.equal((await learn(store, { token: a })).correct_id, 'x');
});

test('asking a back-up round with none saved is refused', async () => {
  const store = storeFixture();
  await assert.rejects(teach(store, { action: 'ask', round: 'backup' }), /no back-up/);
});

test('saving Ann\'s back-up writes it onto the draft block with fresh ids, never the published one', async () => {
  const store = storeFixture();
  const state = await teach(store, { action: 'save_backup', backup: annDraft, source: 'ann' });
  assert.equal(state.backup.source, 'ann');
  const saved = store.data.get('lessons/lesson1').blocks[0].content.backup;
  assert.deepEqual(saved.options.map(o => o.id), ['hq1_bk0', 'hq1_bk1', 'hq1_bk2']);
  assert.equal(saved.correct_id, 'hq1_bk1');
  assert.equal(saved.options[1].misconception, '');
  assert.ok(!JSON.stringify(store.data.get('published/lessons/lesson1')).includes('satellite'));
  await assert.rejects(teach(store, { action: 'save_backup', backup: { prompt: 'x', options: [{ text: 'a', right: true }] } }), /exactly one right answer/);
});

test('Ann\'s input names each answer, its note and its votes from the current round', async () => {
  const store = storeFixture();
  const round = await teach(store, { action: 'ask' });
  const [a, b, c] = tokens(3);
  await answer(store, a, round.session, 'a');
  await answer(store, b, round.session, 'b');
  await answer(store, c, round.session, 'b');
  const text = await hingeBackupInput(store, 'lesson1', 'hq1');
  assert.match(text, /Original question: Which force keeps the Moon in orbit\?/);
  assert.match(text, /Students who answered: 3/);
  assert.match(text, /A\. Gravity \(1 picked it; the right answer\)/);
  assert.match(text, /B\. Magnetism \(2 picked it; teacher's note: Any pull at a distance is magnetic\)/);
});

test('Ann\'s reply must be a full question with exactly one right answer', () => {
  assert.deepEqual(parseHingeBackupResult(`Here you go: ${JSON.stringify(annDraft)}`).options.map(o => o.right), [false, true, false]);
  assert.throws(() => parseHingeBackupResult('{"prompt":"x","options":[{"text":"a","right":true},{"text":"b","right":true}]}'), /could not be read/);
  assert.throws(() => parseHingeBackupResult('no json'), /could not be read/);
  assert.equal(cleanBackupDraft({ prompt: '', options: annDraft.options }), null);
});
