// tests/unit/fleet-week-week.test.js
// Fleet week, plans 2–4 server: the week clock, signals, the learning-data
// fold, Results insight, balance by accuracy and the edge cases (spec
// 2026-11-19-fleet-week-design §1.2, §1.3, §2, §3.2, §3.5, §4). Every class,
// student and question is invented (helpers/fleet-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameKeys, gameStudentAction } from '../../netlify/functions/_shared/games.mjs';
import { weekCloses, zonedInstant } from '../../netlify/functions/_shared/fleet-week-store.mjs';
import { fleetTeacherAction } from '../../netlify/functions/_shared/fleet-week-teacher.mjs';
import { etagRetry } from '../../netlify/functions/_shared/etag-json.mjs';
import { fleet } from '../../netlify/functions/_shared/game-rules.mjs';
import { fleetLesson, ownerOf, whoFleet } from './helpers/fleet-fixture.mjs';

etagRetry.sleep = async () => {};

const k = gameKeys('gl1');
const H = 3600 * 1000;
const D = 24 * H;
/** Monday 16 November 2026, 9:00 am in Sydney (AEDT, UTC+11). */
const MON_9AM = Date.parse('2026-11-15T22:00:00.000Z');
/** Monday's 8:00 pm cut-off in Sydney. */
const MON_8PM = Date.parse('2026-11-16T09:00:00.000Z');

const teach = (store, action, extra = {}, now = MON_9AM) => fleetTeacherAction(store, 'gl1', { action, game_id: 'fw', class_id: 'class1', ...extra }, { now });
const play = (store, n, action, extra = {}, now = MON_9AM) => gameStudentAction(store, 'gl1', { action, game_id: 'fw', ...whoFleet(n), ...extra }, { now });
const rejectsWith = (p, code) => assert.rejects(p, (e) => e.code === code);
const campaignOf = async (store) => {
  const current = await store.get(k.campaignCurrent('fw', 'class1'));
  return store.get(k.campaign('fw', current.id));
};
const N = [1, 2, 3, 4, 5, 6, 7, 8];
const nOf = (owner) => N.find((n) => ownerOf(n) === owner);
const typed = (question) => {
  const m = /Question (\d+) ([AB])\?/.exec(question?.prompt ?? '');
  return m ? `mast ${m[2].toLowerCase()}${m[1]}` : 'no idea';
};
const writing = { start: 1, base: '', ms: 4000, pastes: 0, away: 0, jumps: 0, steps: [[100, 0, 0, 'x']] };
const iso = (t) => new Date(t).toISOString();

// ---------------------------------------------------------------- 1. week mode: the clock

test('weekCloses: placement on the open day, then a cut-off on each following day', () => {
  const closes = weekCloses(MON_9AM, '20:00', 3, 'Australia/Sydney');
  assert.deepEqual(closes.map(iso), ['2026-11-16T09:00:00.000Z', '2026-11-17T09:00:00.000Z', '2026-11-18T09:00:00.000Z', '2026-11-19T09:00:00.000Z']);
});

test('weekCloses: opened after the cut-off, placement runs to tomorrow’s', () => {
  const closes = weekCloses(MON_8PM + 30 * 60000, '20:00', 3, 'Australia/Sydney');
  assert.equal(iso(closes[0]), '2026-11-17T09:00:00.000Z');
  assert.equal(iso(closes[3]), '2026-11-20T09:00:00.000Z');
  // Exactly at the cut-off counts as after it.
  assert.equal(iso(weekCloses(MON_8PM, '20:00', 1)[0]), '2026-11-17T09:00:00.000Z');
});

test('weekCloses keeps the wall-clock cut-off across the clocks going forward (October)', () => {
  // Friday 2 October 2026, 10:00 am AEST; daylight saving starts on Sunday 4 October.
  const closes = weekCloses(Date.parse('2026-10-02T00:00:00.000Z'), '20:00', 3, 'Australia/Sydney');
  assert.deepEqual(closes.map(iso), ['2026-10-02T10:00:00.000Z', '2026-10-03T10:00:00.000Z', '2026-10-04T09:00:00.000Z', '2026-10-05T09:00:00.000Z']);
});

test('weekCloses keeps the wall-clock cut-off across the clocks going back (April)', () => {
  // Friday 2 April 2027, 12:00 pm AEDT; daylight saving ends on Sunday 4 April.
  const closes = weekCloses(Date.parse('2027-04-02T01:00:00.000Z'), '20:00', 3, 'Australia/Sydney');
  assert.deepEqual(closes.map(iso), ['2027-04-02T09:00:00.000Z', '2027-04-03T09:00:00.000Z', '2027-04-04T10:00:00.000Z', '2027-04-05T10:00:00.000Z']);
});

test('zonedInstant: a skipped wall time lands after the gap; a repeated one takes the first', () => {
  // 2:30 am on 4 October 2026 does not exist in Sydney (2:00 → 3:00).
  assert.equal(iso(zonedInstant('Australia/Sydney', 2026, 10, 4, 2, 30)), '2026-10-03T16:30:00.000Z');
  // 2:30 am on 4 April 2027 happens twice; the first is still daylight time (UTC+11).
  assert.equal(iso(zonedInstant('Australia/Sydney', 2027, 4, 4, 2, 30)), '2027-04-03T15:30:00.000Z');
  // Another zone works the same way.
  assert.equal(iso(zonedInstant('Europe/London', 2026, 7, 1, 20, 0)), '2026-07-01T19:00:00.000Z');
});

// ---------------------------------------------------------------- 1. week mode: the server

test('campaign_open in week mode fixes the schedule at the open', async () => {
  const { store } = await fleetLesson();
  const room = await teach(store, 'campaign_open', { mode: 'week', cutoff: '19:30' });
  const c = await campaignOf(store);
  assert.equal(c.mode, 'week');
  assert.equal(c.settings.rounds, 3);
  assert.equal(c.settings.cutoff, '19:30');
  assert.equal(c.settings.tz, 'Australia/Sydney');
  assert.deepEqual(c.schedule, weekCloses(MON_9AM, '19:30', 3));
  const clock = await store.get(k.campaignClock('fw', c.id));
  assert.equal(clock.closes_at, c.schedule[0]);
  assert.equal(room.mode, 'week');
  assert.deepEqual(room.schedule, c.schedule);
  await rejectsWith(teach(store, 'campaign_open', { mode: 'week', cutoff: '8pm', class_id: 'class1' }), 'bad_cutoff');
});

test('week mode defaults the cut-off to 8 pm', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'week' });
  const c = await campaignOf(store);
  assert.equal(c.settings.cutoff, '20:00');
  assert.equal(c.schedule[0], MON_8PM);
});

test('week mode closes by the clock only: no early close, no Next round', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'week' });
  const c = await campaignOf(store);
  for (const team of c.pairing.teams) {
    const laid = [];
    for (const owner of team.owners) {
      const ships = fleet.autoPlace(fleet.shipsFor(team, owner), laid, laid.flatMap((s) => s.squares), fleet.rng(`wk:${owner}`));
      await play(store, nOf(owner), 'fleet_place', { ships }, MON_9AM + 1000);
      laid.push(...ships);
    }
  }
  // Everyone has placed, but placement runs to the cut-off.
  assert.equal((await play(store, 1, 'fleet_state', {}, MON_9AM + 2000)).phase, 'placement');
  await rejectsWith(teach(store, 'campaign_next', {}, MON_9AM + 3000), 'lesson_only');
  assert.equal((await play(store, 1, 'fleet_state', {}, MON_8PM - 1)).phase, 'placement');
  const view = await play(store, 1, 'fleet_state', {}, MON_8PM);
  assert.equal(view.phase, 'firing');
  assert.equal(view.round, 1);
  assert.equal(view.closes_at, c.schedule[1]);
  // Every firing player done with all four shots: the round still waits for the cut-off.
  for (const n of N) {
    for (let i = 0; i < 4; i++) {
      await play(store, n, 'fleet_commit', { square: i + 10 * (n % 2), sure: false }, MON_8PM + H + n * 10 + i);
      await play(store, n, 'fleet_answer', { answer: 'nope', writing }, MON_8PM + H + n * 10 + i);
    }
  }
  assert.equal((await play(store, 1, 'fleet_state', {}, MON_8PM + 2 * H)).round, 1);
  assert.equal((await play(store, 1, 'fleet_state', {}, c.schedule[1])).round, 2);
});

test('week mode catches up over missed rounds, in order, then opens the reveal by itself', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'week' });
  const c = await campaignOf(store);
  // Student 1 fires once on Tuesday's round, then nobody calls until Thursday afternoon.
  await play(store, 1, 'fleet_state', {}, MON_8PM + H);
  const state0 = await store.get(k.campaignResolved('fw', c.id, 0));
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const rival = fleet.rivalOf(c.pairing, team.id);
  const sq = state0.fleets[rival][3].squares[0];
  const shot = await play(store, 1, 'fleet_commit', { square: sq, sure: false }, MON_8PM + 2 * H);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, MON_8PM + 2 * H + 5000);
  const thursday = c.schedule[2] + 3 * H;
  const view = await play(store, 2, 'fleet_state', {}, thursday);
  assert.equal(view.round, 3);
  assert.equal(view.phase, 'firing');
  const clock = await store.get(k.campaignClock('fw', c.id));
  assert.equal(clock.opened_at, c.schedule[2]);
  assert.equal(clock.closes_at, c.schedule[3]);
  const one = await store.get(k.campaignResolved('fw', c.id, 1));
  const two = await store.get(k.campaignResolved('fw', c.id, 2));
  assert.equal(one.round, 1);
  assert.equal(two.round, 2);
  assert.equal(one.log[0].results[0].outcome, 'hit');
  // The hit's report was owed in round 2; nobody filed, so it stuck at half when round 2 closed.
  assert.equal(two.hits[0].status, 'half');
  // After Thursday's cut-off the reveal opens on the next request.
  const friday = await play(store, 3, 'fleet_state', {}, c.schedule[3] + 12 * H);
  assert.equal(friday.phase, 'reveal');
  assert.ok(friday.reveal.names);
  assert.ok((await campaignOf(store)).revealed_at);
  assert.ok(await store.get(k.campaignResolved('fw', c.id, 'final')));
});
