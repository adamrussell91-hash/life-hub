// tests/unit/fleet-week.test.js
// Fleet week campaign server (plan 2026-11-19-fleet-week-1-engine, Tasks 4–6):
// storage and lazy resolution, student actions, teacher actions. Every class,
// student and question is invented (helpers/fleet-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameKeys } from '../../netlify/functions/_shared/game-store.mjs';
import { ensureResolved, hashFor, roundClosed } from '../../netlify/functions/_shared/fleet-week-store.mjs';
import { fleetTeacherAction } from '../../netlify/functions/_shared/fleet-week-teacher.mjs';
import { fleet } from '../../netlify/functions/_shared/game-rules.mjs';
import { fleetLesson, ownerOf } from './helpers/fleet-fixture.mjs';

const T0 = Date.parse('2026-11-19T01:00:00.000Z');
const k = gameKeys('gl1');
const teach = (store, action, extra = {}, now = T0) => fleetTeacherAction(store, 'gl1', { action, game_id: 'fw', class_id: 'class1', ...extra }, { now });
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code);
const campaignOf = async (store) => {
  const current = await store.get(k.campaignCurrent('fw', 'class1'));
  return store.get(k.campaign('fw', current.id));
};

// ---------------------------------------------------------------- Task 4: storage and lazy resolution

test('campaign_open creates config, pairing and clock', async () => {
  const { store } = await fleetLesson();
  const opened = await teach(store, 'campaign_open', { mode: 'lesson', balance: 'random' });
  const c = await campaignOf(store);
  assert.equal(opened.campaign_id, c.id);
  assert.match(c.id, /^[a-f0-9]{16}$/);
  assert.match(c.secret, /^[a-f0-9]{32}$/);
  assert.equal(c.mode, 'lesson');
  assert.equal(c.class_id, 'class1');
  assert.deepEqual(c.settings, { rounds: 3, round_cap_ms: 240000, placement_cap_ms: 120000, answer_ms: 60000 });
  assert.deepEqual([...c.joined].sort(), [1, 2, 3, 4, 5, 6, 7, 8].map(ownerOf).sort());
  assert.equal(c.students[ownerOf(3)], 'st_03');
  assert.equal(c.pairing.teams.length, 4);
  assert.equal(c.pairing.matches.length, 2);
  assert.ok(c.pairing.teams.every((t) => t.owners.length === 2));
  assert.equal(c.revealed_at, null);
  const clock = await store.get(k.campaignClock('fw', c.id));
  assert.deepEqual(clock, { round: 0, opened_at: T0, closes_at: T0 + 120000, seen: {}, fired: {}, done: {} });
});

test('opening twice for one class returns the existing campaign', async () => {
  const { store } = await fleetLesson();
  const a = await teach(store, 'campaign_open', { mode: 'lesson' });
  const b = await teach(store, 'campaign_open', { mode: 'lesson' });
  assert.equal(a.campaign_id, b.campaign_id);
  assert.equal(store.writes.filter((key) => /campaigns\/[a-f0-9]{16}$/.test(key)).length, 1);
});

test('the teacher can set rounds and the round cap', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson', rounds: 2, round_cap_s: 90 });
  const c = await campaignOf(store);
  assert.equal(c.settings.rounds, 2);
  assert.equal(c.settings.round_cap_ms, 90000);
});

test('round 0 closes at the placement cap', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  const clock = await store.get(k.campaignClock('fw', c.id));
  assert.equal(roundClosed(c, clock, T0 + 119999), false);
  assert.equal(roundClosed(c, clock, T0 + 120000), true);
  const before = await ensureResolved(store, k, c, T0 + 1000);
  assert.equal(before.clock.round, 0);
  assert.equal(before.state.round, -1);
  const after = await ensureResolved(store, k, c, T0 + 120000);
  assert.equal(after.clock.round, 1);
  assert.equal(after.clock.closes_at, T0 + 120000 + 240000);
  assert.equal(after.state.round, 0);
});

test('ensureResolved racing twice writes resolved/0 exactly once', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  const [a, b] = await Promise.all([ensureResolved(store, k, c, T0 + 130000), ensureResolved(store, k, c, T0 + 130000)]);
  assert.equal(store.writes.filter((key) => key === k.campaignResolved('fw', c.id, 0)).length, 1);
  assert.deepEqual(a.state, b.state);
  assert.equal(a.clock.round, 1);
  assert.equal(b.clock.round, 1);
  assert.equal(store.writes.filter((key) => key === k.campaignResolved('fw', c.id, 1)).length, 0);
});

test('after the cap every fleet exists, auto-placed where missing', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  const { state } = await ensureResolved(store, k, c, T0 + 120000);
  for (const team of c.pairing.teams) {
    const ships = state.fleets[team.id];
    assert.deepEqual(ships.map((s) => s.id), ['s0', 's1', 's2', 's3']);
    assert.deepEqual(ships.map((s) => s.squares.length), [3, 2, 2, 1]);
  }
});

test('missed rounds resolve one at a time, in order, never skipping', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  await ensureResolved(store, k, c, T0 + 120000); // placement
  const one = await ensureResolved(store, k, c, T0 + 120000 + 240000); // round 1, no shots
  assert.equal(one.state.round, 1);
  assert.deepEqual(one.state.log, [{ round: 1, results: [] }]);
  assert.equal(one.clock.round, 2);
});

test('hashFor is a stable 32-bit HMAC', () => {
  const h = hashFor('0123456789abcdef0123456789abcdef');
  assert.equal(h('a|b'), h('a|b'));
  assert.ok(h('a|b') >= 0 && h('a|b') < 2 ** 32);
  assert.notEqual(h('a|b'), hashFor('f'.repeat(32))('a|b'));
  assert.equal(typeof fleet.callSigns, 'function');
});

test('week mode and classes with no list refuse to open', async () => {
  const { store } = await fleetLesson();
  await rejects(teach(store, 'campaign_open', { mode: 'week' }), 'week_mode_later');
  await rejects(teach(store, 'campaign_open', { mode: 'lesson', class_id: 'class0' }), 'need_roster');
});
