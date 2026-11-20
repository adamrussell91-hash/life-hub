import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brainstormAction } from '../../netlify/functions/_shared/brainstorm.mjs';
import { continuumAction } from '../../netlify/functions/_shared/continuum-line.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { hasLessonPass, lessonDay, usePassCode } from '../../netlify/functions/_shared/lesson-pass.mjs';

const brainstorm = { id: 'bs1', type: 'block', block_type: 'brainstorm', visibility: 'student_teacher', content: { question: 'What does the road stand for?', safety: 'instant' } };
const continuum = (id) => ({
  id, type: 'block', block_type: 'continuum_line', visibility: 'student_teacher',
  content: { stimulus: { kind: 'text', text: 'A short poem.' }, scale: { left: 'Agree', right: 'Disagree', stops: [] }, statements: [{ id: 's1', text: 'The road is hope.' }], pace: 'teacher', replace: true }
});

function storeFixture() {
  const blocks = [brainstorm, continuum('cl1'), continuum('cl2')];
  const data = new Map([
    ['lessons/lesson1', { blocks }],
    ['published/lessons/lesson1', { blocks }],
    ['classes/class1', { id: 'class1', type: 'class', title: 'Year 9', status: 'active', students: [{ name: 'Ava Brook' }, { name: 'Cal Dunn' }] }]
  ]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const token = (n) => n.toString(16).repeat(48).slice(0, 48);
const hash = (t) => createHash('sha256').update(t).digest('hex');
const teachCl = (store, block, body) => continuumAction(store, 'lesson1', block, body, { teacher: true });
const learnCl = (store, block, body) => continuumAction(store, 'lesson1', block, body);
const teachBs = (store, body) => brainstormAction(store, 'lesson1', 'bs1', body, { teacher: true });
const learnBs = (store, body) => brainstormAction(store, 'lesson1', 'bs1', body);

test('every round in a lesson today shows the same code', async () => {
  const store = storeFixture();
  const a = await teachCl(store, 'cl1', { action: 'start' });
  const b = await teachCl(store, 'cl2', { action: 'start' });
  const c = await teachBs(store, { action: 'start' });
  assert.match(a.code, /^\d{6}$/);
  assert.equal(b.code, a.code);
  assert.equal(c.code, a.code);
  assert.notEqual(a.session, b.session, 'each block still has its own round');
});

test('one code typed once joins every later round in the lesson that day', async () => {
  const store = storeFixture();
  const first = await teachCl(store, 'cl1', { action: 'start' });
  const t = token(1);
  await assert.rejects(learnCl(store, 'cl1', { token: t, session: first.session, action: 'join' }), (e) => e.code === 'need_code');
  await assert.rejects(learnCl(store, 'cl1', { token: t, session: first.session, action: 'join', code: '000000' }), (e) => e.code === 'wrong_code');
  const joined = await learnCl(store, 'cl1', { token: t, session: first.session, action: 'join', code: first.code });
  assert.equal(joined.joined, true);

  const second = await teachCl(store, 'cl2', { action: 'start' });
  const bs = await teachBs(store, { action: 'start' });
  assert.equal((await learnCl(store, 'cl2', { token: t, session: second.session, action: 'join' })).joined, true, 'no code the second time');
  assert.equal((await learnBs(store, { token: t, session: bs.session, action: 'join' })).joined, true, 'brainstorm takes the same pass');
  // A new round of the same block joins on its own too.
  const again = await teachCl(store, 'cl1', { action: 'start' });
  assert.equal((await learnCl(store, 'cl1', { token: t, session: again.session, action: 'join' })).joined, true);
  // Another device has no pass.
  await assert.rejects(learnCl(store, 'cl2', { token: token(2), session: second.session, action: 'join' }), (e) => e.code === 'need_code');
});

test('a pass is for one Sydney calendar day', async () => {
  const store = storeFixture();
  await teachCl(store, 'cl1', { action: 'start' });
  const code = store.data.get(`lesson-pass/lesson1/${lessonDay()}`).code;
  const h = hash(token(1));
  assert.equal(await usePassCode(store, 'lesson1', code, h), true);
  assert.equal(await hasLessonPass(store, 'lesson1', h), true);
  assert.equal(await hasLessonPass(store, 'lesson1', h, Date.now() + 36 * 3600_000), false, 'gone tomorrow');
  assert.equal(lessonDay(Date.parse('2026-11-19T13:30:00Z')), '2026-11-20', 'Sydney date, not UTC');
});

async function claim(store, t, initials) {
  const roster = await loadRoster(store, 'class1');
  await claimInitials(store, roster, t, initials);
}

test('the teacher sees initials only when asked; students never do', async () => {
  const store = storeFixture();
  const t = token(1);
  await claim(store, t, 'AB');
  const round = await teachCl(store, 'cl1', { action: 'start' });
  const mine = await learnCl(store, 'cl1', { token: t, session: round.session, action: 'join', code: round.code, class_id: 'class1', class_token: t });
  assert.doesNotMatch(JSON.stringify(mine), /"AB"|initials/);
  const plain = await teachCl(store, 'cl1', {});
  assert.equal(plain.initials, undefined, 'Display view does not ask, so gets none');
  const withNames = await teachCl(store, 'cl1', { initials: true });
  assert.deepEqual(Object.values(withNames.initials), ['AB']);
  assert.equal(Object.keys(withNames.initials)[0], mine.symbol);
  // A student asking for initials gets a student reply.
  const sneaky = await learnCl(store, 'cl1', { token: t, session: round.session, action: 'status', initials: true });
  assert.equal(sneaky.initials, undefined);

  const bs = await teachBs(store, { action: 'start' });
  await learnBs(store, { token: t, session: bs.session, action: 'join', class_id: 'class1', class_token: t });
  assert.deepEqual(Object.values((await teachBs(store, { initials: true })).initials), ['AB']);
  assert.equal((await teachBs(store, {})).initials, undefined);
});

test('a student with no initials yet joins anyway and is named once they link', async () => {
  const store = storeFixture();
  const t = token(1);
  const round = await teachBs(store, { action: 'start' });
  await learnBs(store, { token: t, session: round.session, action: 'join', code: round.code, class_id: 'class1', class_token: t });
  assert.deepEqual((await teachBs(store, { initials: true })).initials, {});
  assert.deepEqual(await learnBs(store, { action: 'link', token: t, session: round.session, class_id: 'class1', class_token: t }), { linked: false });
  await claim(store, t, 'CD');
  assert.deepEqual(await learnBs(store, { action: 'link', token: t, session: round.session, class_id: 'class1', class_token: t }), { linked: true });
  assert.deepEqual(Object.values((await teachBs(store, { initials: true })).initials), ['CD']);
});

test('a past round, run before initials were kept, picks them up from the token the device kept', async () => {
  const store = storeFixture();
  const t = token(1);
  const old = await teachCl(store, 'cl1', { action: 'start' });
  await learnCl(store, 'cl1', { token: t, session: old.session, action: 'join', code: old.code });
  await teachCl(store, 'cl1', { action: 'start' }); // a later round replaces it
  await claim(store, t, 'AB');
  const linked = await learnCl(store, 'cl1', { action: 'link', token: t, session: old.session, class_id: 'class1', class_token: t });
  assert.deepEqual(linked, { linked: true });
  const back = await teachCl(store, 'cl1', { action: 'resume', session: old.session, initials: true });
  assert.deepEqual(Object.values(back.initials), ['AB']);
  // A token that never joined that round links nothing.
  assert.deepEqual(await learnCl(store, 'cl1', { action: 'link', token: token(2), session: old.session, class_id: 'class1', class_token: t }), { linked: false });
});
