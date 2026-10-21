import test from 'node:test';
import assert from 'node:assert/strict';
import { continuumAction, snapPoints } from '../../netlify/functions/_shared/continuum-line.mjs';
import { createContinuumHandler } from '../../netlify/functions/continuum-line.mjs';
import { createPublishedContinuumHandler } from '../../netlify/functions/published-continuum-line.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const blockWith = (content = {}) => ({
  id: 'cl1', type: 'block', block_type: 'continuum_line', variant: 'medium', visibility: 'student_teacher',
  content: {
    stimulus: { kind: 'text', text: 'Ben stood at the bus stop, sweating, checking his phone.', url: '', alt_text: '' },
    scale: { left: 'Implied', right: 'Not implied', stops: [] },
    statements: [{ id: 's1', text: 'It was a hot day.', snap: false }, { id: 's2', text: 'Ben owns a phone.', snap: true }],
    pace: 'teacher', replace: true, ...content
  },
  created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z', schema_version: 1
});
function storeFixture(content) {
  const block = blockWith(content);
  const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    }
  };
}
const teach = (store, body, opts = {}) => continuumAction(store, 'lesson1', 'cl1', body, { teacher: true, ...opts });
const learn = (store, body) => continuumAction(store, 'lesson1', 'cl1', body);
const tokens = n => Array.from({ length: n }, (_, i) => (i + 1).toString(16).repeat(48).slice(0, 48));
async function startWith(store, n) {
  const round = await teach(store, { action: 'start' });
  const students = tokens(n).map(token => ({ token, session: round.session }));
  for (const s of students) await learn(store, { ...s, action: 'join', code: round.code });
  return { round, students };
}
const place = (store, s, statement, pos, reason = 'Because of the sweat.') => learn(store, { ...s, action: 'place', statement, pos, reason });

test('collecting: the teacher gets symbols only, students get their own placement and no class line', async () => {
  const store = storeFixture();
  const { students: [a, b] } = await startWith(store, 2);
  const mine = await place(store, a, 's1', 0.2);
  assert.ok(mine.symbol, 'a student sees their own symbol');
  assert.deepEqual(mine.statements[0].mine, { pos: 0.2, reason: 'Because of the sweat.' });
  assert.equal(mine.statements[0].class, null);
  await place(store, b, 's1', 0.8, 'Could be nerves.');
  const t = await teach(store, {});
  const s1 = t.statements[0];
  assert.equal(s1.phase, 'collect');
  assert.equal(s1.placed, 2);
  assert.ok(s1.entries.every(e => Object.keys(e).join() === 'symbol'), 'no positions or reasons before the reveal');
  assert.doesNotMatch(JSON.stringify(t), /sweat|nerves|0\.2|0\.8/);
});

test('a reason is required, positions stay on the line, and a student can change their answer until the reveal', async () => {
  const store = storeFixture();
  const { students: [a] } = await startWith(store, 1);
  await assert.rejects(place(store, a, 's1', 0.5, '  '), /Write your reason/);
  await assert.rejects(place(store, a, 's1', 1.5), /on the line/);
  await place(store, a, 's1', 0.3);
  const changed = await place(store, a, 's1', 0.6, 'Changed my mind.');
  assert.deepEqual(changed.statements[0].mine, { pos: 0.6, reason: 'Changed my mind.' });
  await teach(store, { action: 'reveal', statement: 's1' });
  await assert.rejects(place(store, a, 's1', 0.1), /revealed/);
});

test('teacher led: students answer only the statement the teacher is on', async () => {
  const store = storeFixture();
  const { students: [a] } = await startWith(store, 1);
  await assert.rejects(place(store, a, 's2', 0), /moved to another statement/);
  await teach(store, { action: 'go', statement: 's2' });
  assert.equal((await learn(store, a)).current, 1);
  await place(store, a, 's2', 0);
  await assert.rejects(place(store, a, 's1', 0.5), /moved to another statement/);
});

test('student paced: students answer any statement still collecting', async () => {
  const store = storeFixture({ pace: 'student' });
  const { students: [a] } = await startWith(store, 1);
  await place(store, a, 's2', 1);
  await place(store, a, 's1', 0.4);
  const t = await teach(store, {});
  assert.deepEqual(t.statements.map(s => s.placed), [1, 1]);
});

test('snapped statements land on the nearest stop', async () => {
  assert.deepEqual(snapPoints([]), [0, 1]);
  assert.deepEqual(snapPoints(['Some']), [0, 0.5, 1]);
  const store = storeFixture({ pace: 'student', scale: { left: 'All', right: 'None', stops: ['Some'] } });
  const { students: [a, b] } = await startWith(store, 2);
  assert.equal((await place(store, a, 's2', 0.62)).statements[1].mine.pos, 0.5);
  assert.equal((await place(store, b, 's2', 0.2)).statements[1].mine.pos, 0);
});

test('reveal: the teacher gets positions and reasons; students get the class line with no symbols or reasons', async () => {
  const store = storeFixture();
  const { students: [a, b] } = await startWith(store, 2);
  await place(store, a, 's1', 0.2);
  await place(store, b, 's1', 0.8, 'Could be nerves, what a load of sh1t.');
  const t = await teach(store, { action: 'reveal', statement: 's1' });
  const entries = t.statements[0].entries;
  assert.deepEqual(entries.map(e => e.pos).sort(), [0.2, 0.8]);
  assert.ok(entries.every(e => e.symbol && e.reason));
  assert.deepEqual(entries.map(e => e.flagged).sort(), [false, true], 'the word check flags reasons for the teacher');
  const view = (await learn(store, a)).statements[0];
  assert.deepEqual(view.class, [0.2, 0.8]);
  assert.doesNotMatch(JSON.stringify(view.class), /nerves|\d-\d/);
});

test('re-place: moving needs a reason, and moves stay hidden until the teacher shows them', async () => {
  const store = storeFixture();
  const { students: [a, b] } = await startWith(store, 2);
  await place(store, a, 's1', 0.2);
  await teach(store, { action: 'reveal', statement: 's1' });
  await assert.rejects(learn(store, { ...a, action: 'move', statement: 's1', pos: 0.6, why: 'x' }), /isn’t open/);
  await teach(store, { action: 'replace', statement: 's1' });
  await assert.rejects(learn(store, { ...a, action: 'move', statement: 's1', pos: 0.6, why: '' }), /why you moved/);
  await assert.rejects(learn(store, { ...b, action: 'move', statement: 's1', pos: 0.6, why: 'Hmm' }), /didn’t place/);
  const moved = await learn(store, { ...a, action: 'move', statement: 's1', pos: 0.6, why: 'He might have run.' });
  assert.deepEqual(moved.statements[0].mine, { pos: 0.2, reason: 'Because of the sweat.', new_pos: 0.6, why: 'He might have run.' });
  let s1 = (await teach(store, {})).statements[0];
  assert.equal(s1.moved, 1);
  assert.equal(s1.entries[0].new_pos, undefined, 'moves hidden until shown');
  assert.doesNotMatch(JSON.stringify(s1), /might have run/);
  s1 = (await teach(store, { action: 'show_moves', statement: 's1' })).statements[0];
  assert.equal(s1.entries[0].new_pos, 0.6);
  assert.equal(s1.entries[0].why, 'He might have run.');
  assert.deepEqual((await learn(store, a)).statements[0].class, [0.2], 'the class line keeps first positions');
});

test('a block without the re-place round refuses it', async () => {
  const store = storeFixture({ replace: false });
  await startWith(store, 1);
  await teach(store, { action: 'reveal', statement: 's1' });
  await assert.rejects(teach(store, { action: 'replace', statement: 's1' }), /no re-place round/);
});

test('sorting sends reasons and positions by symbol id, skips flagged reasons, and needs a reveal', async () => {
  const store = storeFixture();
  const { students: [a, b, c] } = await startWith(store, 3);
  await place(store, a, 's1', 0.1, 'The sweat says heat.');
  await place(store, b, 's1', 0.9, 'He could have run.');
  await place(store, c, 's1', 0.5, 'what a load of sh1t');
  await assert.rejects(teach(store, { action: 'group', statement: 's1' }, { env: { ANTHROPIC_API_KEY: 'k' } }), /Reveal the line first/);
  await teach(store, { action: 'reveal', statement: 's1' });
  let sent;
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    const ids = JSON.parse(sent.messages[0].content).reasons.map(r => r.id);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ groups: [{ name: 'Read it from the clue', ids: [ids[0]] }, { name: 'Another explanation', ids: [ids[1]] }] }) }] }), { status: 200 });
  };
  const t = await teach(store, { action: 'group', statement: 's1' }, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
  const payload = JSON.parse(sent.messages[0].content);
  assert.equal(payload.statement, 'It was a hot day.');
  assert.match(payload.stimulus, /bus stop/);
  assert.equal(payload.reasons.length, 2);
  assert.doesNotMatch(sent.messages[0].content, /sh1t/);
  assert.deepEqual(t.statements[0].groups.map(g => g.name), ['Read it from the clue', 'Another explanation']);
  await assert.rejects(teach(store, { action: 'group', statement: 's1' }, { env: {} }), /isn’t available/);
});

test('routes: student route is public, teacher route needs the operator session', async () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/continuum/lesson1/cl1'), true);
  assert.equal(isPublicStudentApi('POST', '/api/lessons/lesson1/continuum/cl1'), false);
  const store = storeFixture(); const origin = 'https://life-hub.adam-russell.com';
  const deps = { getContentStore: async () => store, env: { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' }, verifySessionToken: () => ({ valid: true }) };
  const req = () => new Request('https://api.example/api/lessons/lesson1/continuum/cl1', { method: 'POST', headers: { origin, cookie: 'umbrella_session=ok' }, body: JSON.stringify({ action: 'start' }) });
  const started = await createContinuumHandler(deps)(req());
  assert.equal(started.status, 200); assert.match((await started.json()).data.code, /^\d{6}$/);
  assert.equal((await createContinuumHandler({ ...deps, verifySessionToken: () => ({ valid: false }) })(req())).status, 401);
  const pub = createPublishedContinuumHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
  const preq = (body, from = origin) => new Request('https://api.example/api/published/continuum/lesson1/cl1', { method: 'POST', headers: { origin: from }, body });
  const status = await pub(preq('{}'));
  assert.equal(status.status, 200); assert.equal((await status.json()).data.open, true);
  assert.equal((await pub(preq('{}', 'https://evil.example'))).status, 403);
  assert.equal((await pub(preq(JSON.stringify({ action: 'reveal', statement: 's1' })))).status, 400, 'students cannot reveal');
});
