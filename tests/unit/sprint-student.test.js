// tests/unit/sprint-student.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { sprintKeys } from '../../netlify/functions/_shared/sprint-keys.mjs';
import { storeFor, who, INITIALS, CONFIG } from './helpers/sprint-store.js';

const at = (iso) => () => Date.parse(iso);
const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const claim = (store, n) => act(store, n, 'claim', { initials: INITIALS[n] });
const notes = (...n) => ({ notes: n, star: '', stretch: '' });

test('a student claims, sees their group and only Understand open', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  assert.equal((await act(store, 1, 'status')).identity.need, 'initials');
  const s = await claim(store, 1);
  assert.equal(s.group.name, 'Kestrel');
  assert.deepEqual(s.group.mates, ['CD']);
  assert.deepEqual(s.phases.filter((p) => p.open).map((p) => p.key), ['understand']);
  assert.equal(JSON.stringify(s).includes('st_cy'), false);
});

test('saving keeps a draft; submitting counts toward the group', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await claim(store, 1);
  await act(store, 1, 'open', { phase: 'understand' });
  const saved = await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we make it close?') });
  assert.equal(saved.phases[0].state, 'draft');
  assert.equal(saved.notes.length, 1);
  assert.equal(saved.notes[0].mine, true);
  const star = saved.notes[0].id;
  const sent = await act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we make it close?'), star } });
  assert.equal(sent.phases[0].state, 'in');
  assert.equal(sent.phases[0].count_in, 1);
  await assert.rejects(act(store, 1, 'save', { phase: 'sketch', payload: { cards: [] } }), { code: 'not_open' });
});

test('submitting Understand needs a star on one of the group’s notes', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await claim(store, 1);
  await assert.rejects(act(store, 1, 'submit', { phase: 'understand', payload: notes('How might we start?') }), { code: 'need_star' });
  await assert.rejects(act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we start?'), star: 'zzzzzzzzzzzz' } }), { code: 'need_star' });
});

test('the next phase opens when the whole group is in', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2]) await claim(store, n);
  const a = await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we a?') });
  const star = a.notes[0].id;
  await act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we a?'), star } });
  await act(store, 2, 'submit', { phase: 'understand', payload: { ...notes('How might we b?'), star } });
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.phases.filter((p) => p.open).map((p) => p.key), ['understand', 'sketch']);
  assert.equal(s.question.text, 'How might we a?');
});

test('ending the class part freezes work, locks the sprint and opens the next phase after the lock', async () => {
  const config = { ...CONFIG(), phases: CONFIG().phases.map((p) => (p.key === 'understand' ? { ...p, ends_at: '2026-11-02T11:00' } : p)) };
  const store = storeFor(config);
  setSprintClock(at('2026-11-01T22:00:00Z')); // 9 am Sydney, 2 Nov
  await claim(store, 1);
  await act(store, 1, 'open', { phase: 'understand' });
  await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we keep it?') });
  setSprintClock(at('2026-11-02T01:00:00Z')); // noon: ended at 11 am, locked until 1 pm
  const locked = await act(store, 1, 'status');
  assert.equal(locked.lock.until, '2026-11-02T02:00:00.000Z');
  assert.equal(locked.phases[0].state, 'in');
  assert.equal(locked.phases[0].frozen, true);
  assert.deepEqual(locked.phases.filter((p) => p.open).map((p) => p.key), ['understand']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: notes('More') }), { code: 'locked' });
  setSprintClock(at('2026-11-02T02:30:00Z'));
  const after = await act(store, 1, 'status');
  assert.equal(after.lock, null);
  assert.deepEqual(after.phases.filter((p) => p.open).map((p) => p.key), ['understand', 'sketch']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: notes('More') }), { code: 'frozen' });
});

test('an absent student catches up on the class part after the lock', async () => {
  const config = { ...CONFIG(), phases: CONFIG().phases.map((p) => (p.key === 'understand' ? { ...p, ends_at: '2026-11-02T11:00' } : p)) };
  const store = storeFor(config);
  setSprintClock(at('2026-11-02T03:00:00Z'));
  await claim(store, 2);
  const s = await act(store, 2, 'save', { phase: 'understand', payload: notes('How might we catch up?') });
  assert.equal(s.phases[0].frozen, false);
  assert.equal(s.phases[0].state, 'draft');
});

test('a student in no group is told so', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor({ ...CONFIG(), groups: [{ id: 'g1', name: 'Kestrel', students: ['st_cy'] }] });
  const s = await claim(store, 1);
  assert.equal(s.not_for_you, true);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: notes('x') }), { code: 'not_for_you' });
});

test('late work is marked late', async () => {
  setSprintClock(at('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await claim(store, 1);
  const s = await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we a?') });
  await act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we a?'), star: s.notes[0].id } });
  const sub = [...store.data.entries()].find(([k]) => k.includes('/subs/') && k.endsWith('/understand'))[1];
  assert.equal(sub.late, true);
});
