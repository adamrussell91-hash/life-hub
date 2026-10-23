import test from 'node:test';
import assert from 'node:assert/strict';
import { continuumAction } from '../../netlify/functions/_shared/continuum-line.mjs';
import { peerAction } from '../../netlify/functions/_shared/peer-feedback.mjs';
import { brainstormAction } from '../../netlify/functions/_shared/brainstorm.mjs';
import { hingeAction } from '../../netlify/functions/_shared/hinge.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const meta = { type: 'block', variant: 'medium', visibility: 'student_teacher', created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', schema_version: 1 };
const blocks = [
  { ...meta, id: 'cl1', block_type: 'continuum_line', content: { stimulus: { kind: 'text', text: 'Finn ran.', url: '', alt_text: '' }, scale: { left: 'Implied', right: 'Not implied', stops: [] }, statements: [{ id: 's1', text: 'Finn was late.', snap: false }], pace: 'teacher', replace: true } },
  { ...meta, id: 'peer1', block_type: 'peer_feedback', content: { prompt: 'Explain your reasoning.' } },
  { ...meta, id: 'bs1', block_type: 'brainstorm', content: { prompt: 'Why do stories end?' } },
  { ...meta, id: 'hq1', block_type: 'hinge_question', content: { prompt: 'Which force?', options: [{ id: 'a', text: 'Gravity', misconception: '' }, { id: 'b', text: 'Magnetism', misconception: '' }], correct_id: 'a', seconds: 0, move_on: 80, reteach: 50 } }
];

/** A Blobs store that lists like Netlify's: with `directories`, one level at a time. */
function storeFixture() {
  const data = new Map([['lessons/lesson1', { blocks }], ['published/lessons/lesson1', { blocks: filterBlocksForStudent(blocks) }]]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async list({ prefix, directories }) {
      const under = [...data.keys()].filter(k => k.startsWith(prefix));
      if (!directories) return { blobs: under.map(key => ({ key })) };
      const rest = under.map(k => k.slice(prefix.length));
      return {
        blobs: rest.filter(r => !r.includes('/')).map(r => ({ key: prefix + r })),
        directories: [...new Set(rest.filter(r => r.includes('/')).map(r => prefix + r.split('/')[0]))]
      };
    }
  };
}
const tokens = n => Array.from({ length: n }, (_, i) => (i + 1).toString(16).repeat(48).slice(0, 48));
/** Twelve hours on: the live round has gone idle. */
const expire = (store, key) => store.data.set(key, { ...store.data.get(key), expires: Date.now() - 1 });

test('continuum: a round that went idle is listed and comes back with every placement and reveal', async () => {
  const store = storeFixture();
  const teach = body => continuumAction(store, 'lesson1', 'cl1', body, { teacher: true });
  const learn = body => continuumAction(store, 'lesson1', 'cl1', body);
  const round = await teach({ action: 'start' });
  const [a, b] = tokens(2).map(token => ({ token, session: round.session }));
  for (const s of [a, b]) await learn({ ...s, action: 'join', code: round.code });
  await learn({ ...a, action: 'place', statement: 's1', pos: 0.2, reason: 'He was running.' });
  await learn({ ...b, action: 'place', statement: 's1', pos: 0.9, reason: 'Could be exercise.' });
  await teach({ action: 'reveal', statement: 's1' });
  expire(store, 'continuum/lesson1/cl1/active');

  assert.equal((await teach({})).phase, 'idle');
  const { rounds } = await teach({ action: 'rounds' });
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].session, round.session);
  assert.equal(rounds[0].students, 2);
  assert.equal(rounds[0].live, false);
  assert.ok(rounds[0].started_at);

  const back = await teach({ action: 'resume', session: round.session });
  assert.equal(back.session, round.session);
  assert.equal(back.code, round.code, 'students keep the same join code');
  assert.equal(back.statements[0].phase, 'revealed');
  assert.deepEqual(back.statements[0].entries.map(e => e.reason).sort(), ['Could be exercise.', 'He was running.']);
  const mine = await learn(a);
  assert.deepEqual(mine.statements[0].mine, { pos: 0.2, reason: 'He was running.' }, 'a student who joined before is still in');
  assert.equal((await teach({ action: 'rounds' })).rounds[0].live, true);
});

test('continuum: an older round whose state was replaced by a new Start still comes back from its saved work', async () => {
  const store = storeFixture();
  const teach = body => continuumAction(store, 'lesson1', 'cl1', body, { teacher: true });
  const learn = body => continuumAction(store, 'lesson1', 'cl1', body);
  const old = await teach({ action: 'start' });
  const [a] = tokens(1).map(token => ({ token, session: old.session }));
  await learn({ ...a, action: 'join', code: old.code });
  await learn({ ...a, action: 'place', statement: 's1', pos: 0.4, reason: 'He was late.' });
  // Before past rounds existed, only the live round kept its state.
  store.data.delete(`continuum/lesson1/cl1/${old.session}/round`);
  const now = await teach({ action: 'start' });
  store.data.delete(`continuum/lesson1/cl1/${now.session}/round`);

  const listed = (await teach({ action: 'rounds' })).rounds;
  assert.deepEqual(listed.map(r => r.session), [now.session, old.session], 'the live round first, the undated one last');
  assert.equal(listed[0].live, true);
  assert.equal(listed[1].students, 1);
  assert.equal(listed.find(r => r.session === old.session).started_at, null, 'the old round kept no start time');

  const back = await teach({ action: 'resume', session: old.session });
  assert.equal(back.session, old.session);
  assert.equal(back.statements[0].placed, 1);
  await teach({ action: 'reveal', statement: 's1' });
  assert.equal((await teach({})).statements[0].entries[0].reason, 'He was late.');
});

test('a round that never existed cannot be brought back', async () => {
  const store = storeFixture();
  const teach = body => continuumAction(store, 'lesson1', 'cl1', body, { teacher: true });
  await assert.rejects(teach({ action: 'resume', session: 'f'.repeat(32) }), /nothing saved/);
  await assert.rejects(teach({ action: 'resume', session: '../active' }), /nothing saved/);
  const student = continuumAction(store, 'lesson1', 'cl1', { action: 'rounds' });
  assert.equal((await student).phase, 'idle', 'students cannot list rounds');
});

test('peer feedback: an ended round with half the class written comes back in the writing phase', async () => {
  const store = storeFixture();
  const teach = body => peerAction(store, 'lesson1', 'peer1', body, true);
  const learn = body => peerAction(store, 'lesson1', 'peer1', body);
  const round = await teach({ action: 'start' });
  const [a, b] = tokens(2).map(token => ({ token, session: round.session }));
  for (const s of [a, b]) await learn({ ...s, action: 'join', code: round.code });
  await learn({ ...a, action: 'submit', text: 'My first draft.' });
  await teach({ action: 'end' });
  assert.equal((await teach({})).phase, 'idle');

  const { rounds } = await teach({ action: 'rounds' });
  assert.equal(rounds[0].students, 2);
  const back = await teach({ action: 'resume', session: round.session });
  assert.equal(back.phase, 'write');
  assert.equal(back.rows.find(r => r.text).text, 'My first draft.');
  await learn({ ...b, action: 'submit', text: 'Finished after the bell.' });
  assert.equal((await teach({})).rows.filter(r => r.text).length, 2, 'the class carries on where it stopped');
});

test('brainstorm: a past round comes back open for answers', async () => {
  const store = storeFixture();
  const teach = body => brainstormAction(store, 'lesson1', 'bs1', body, { teacher: true });
  const learn = body => brainstormAction(store, 'lesson1', 'bs1', body);
  const round = await teach({ action: 'start' });
  const [a] = tokens(1).map(token => ({ token, session: round.session }));
  await learn({ ...a, action: 'join', code: round.code });
  await teach({ action: 'end' });
  expire(store, 'brainstorm/lesson1/bs1/active');
  const back = await teach({ action: 'resume', session: round.session });
  assert.equal(back.open, true);
  assert.equal(back.session, round.session);
});

test('hinge: a past round comes back closed, with its spread', async () => {
  const store = storeFixture();
  const teach = body => hingeAction(store, 'lesson1', 'hq1', body, { teacher: true });
  const round = await teach({ action: 'ask' });
  await hingeAction(store, 'lesson1', 'hq1', { token: tokens(1)[0], session: round.session, action: 'answer', pick: 'b' });
  await teach({ action: 'finish' });
  const { rounds } = await teach({ action: 'rounds' });
  assert.equal(rounds[0].students, 1);
  assert.ok(rounds[0].started_at, 'dated from when it was asked');
  const back = await teach({ action: 'resume', session: round.session });
  assert.equal(back.open, false);
  assert.equal(back.answered, 1);
  assert.equal(back.picks.b, 1);
});
