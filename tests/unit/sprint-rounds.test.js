// tests/unit/sprint-rounds.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, sprintTeacherAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const teach = (store, action, extra = {}) => sprintTeacherAction(store, 'sp1', { action, ...extra });
const entry = (over = {}) => ({ levels: { c1: 3, c2: 2 }, worked: 'The graffiti made it feel real.', next: 'Try naming the source on the panel.', about: 'c1', ...over });

async function ready() {
  setSprintClock(() => Date.parse('2026-11-11T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2, 3, 4]) await act(store, n, 'claim', { initials: INITIALS[n] });
  return store;
}

test('an open round gives everyone outside the presenting group a feedback card', async () => {
  const store = await ready();
  await teach(store, 'run', { group_id: 'g1' });
  await teach(store, 'round', { group_id: 'g1', op: 'open' });
  const ed = await act(store, 3, 'status');
  assert.deepEqual(ed.round, { group_id: 'g1', group_name: 'Kestrel', sent: false });
  const ann = await act(store, 1, 'status');
  assert.equal(ann.round, null);
  await assert.rejects(act(store, 1, 'feedback', { group_id: 'g1', entry: entry() }), { code: 'own_group' });
});

test('feedback is saved once per student, flagged text is held until released', async () => {
  const store = await ready();
  await teach(store, 'round', { group_id: 'g1', op: 'open' });
  const sent = await act(store, 3, 'feedback', { group_id: 'g1', entry: entry() });
  assert.equal(sent.round.sent, true);
  await act(store, 4, 'feedback', { group_id: 'g1', entry: entry({ worked: 'This is shit honestly but ok.' }) });
  await teach(store, 'round', { group_id: 'g1', op: 'close' });
  await assert.rejects(act(store, 3, 'feedback', { group_id: 'g1', entry: entry() }), { code: 'round_closed' });
  await teach(store, 'round', { group_id: 'g1', op: 'release' });
  const ann = await act(store, 1, 'status');
  assert.equal(ann.received.lines.length, 1);
  assert.deepEqual(ann.received.levels.c1, [0, 0, 1]);
  assert.equal(JSON.stringify(ann.received).match(/st_|Ed|Gus/), null);
  const board = await teach(store, 'board', { group_id: 'g1' });
  const held = board.round.entries.find((e) => e.flagged);
  assert.equal(held.name, 'Gus Hale');
  await teach(store, 'moderate', { group_id: 'g1', student_id: 'st_gus', status: 'released' });
  assert.equal((await act(store, 1, 'status')).received.lines.length, 2);
});

test('feedback for a group with no open round is refused', async () => {
  const store = await ready();
  await assert.rejects(act(store, 3, 'feedback', { group_id: 'g1', entry: entry() }), { code: 'round_closed' });
});
