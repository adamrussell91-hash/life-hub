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

// ---------------------------------------------------------------- 2. signals

/** A lesson-mode game with everyone placed; returns the store, campaign and the round-0 state. Round 1 opens at T. */
async function lessonGame(opts = {}) {
  const { store } = await fleetLesson(opts);
  await teach(store, 'campaign_open', { mode: 'lesson', ...(opts.open ?? {}) });
  const c = await campaignOf(store);
  for (const team of c.pairing.teams) {
    const laid = [];
    for (const owner of team.owners) {
      const ships = fleet.autoPlace(fleet.shipsFor(team, owner), laid, laid.flatMap((s) => s.squares), fleet.rng(`sig:${owner}`));
      await play(store, nOf(owner), 'fleet_place', { ships }, MON_9AM + 10);
      laid.push(...ships);
    }
  }
  const T = MON_9AM + 1000;
  await play(store, 1, 'fleet_state', {}, T);
  return { store, c: await campaignOf(store), state: await store.get(k.campaignResolved('fw', c.id, 0)), T };
}
const kinds = (r) => r.events.map((e) => e.kind).sort();

test('signals: round open, then the dawn report, a hit and an owed report, each once', async () => {
  const { store, c, state, T } = await lessonGame();
  const first = await play(store, 1, 'signals', {}, T + 5);
  assert.deepEqual(first.events, [{ id: `${c.id}:round_open:1`, kind: 'round_open', line: 'Four shells ready.', game_id: 'fw', lesson_id: 'gl1' }]);
  assert.deepEqual(await play(store, 1, 'signals_seen', { ids: [first.events[0].id] }, T + 6), { ok: true });
  assert.deepEqual((await play(store, 1, 'signals', {}, T + 7)).events, []);
  // Student 1 sinks a rival's one-square ship.
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const rival = c.pairing.teams.find((t) => t.id === fleet.rivalOf(c.pairing, team.id));
  const sq = state.fleets[rival.id][3].squares[0];
  const shot = await play(store, 1, 'fleet_commit', { square: sq, sure: false }, T + 10);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T + 11);
  await teach(store, 'campaign_next', {}, T + 12);
  const partner = nOf(team.owners.find((o) => o !== ownerOf(1)));
  const victim = nOf(rival.owners[0]);
  assert.deepEqual(kinds(await play(store, 1, 'signals', {}, T + 13)), ['report_ready', 'round_open']);
  assert.deepEqual(kinds(await play(store, partner, 'signals', {}, T + 13)), ['report_owed', 'report_ready', 'round_open']);
  const hit = await play(store, victim, 'signals', {}, T + 13);
  assert.deepEqual(kinds(hit), ['hit', 'report_ready', 'round_open']);
  assert.equal(hit.events.find((e) => e.kind === 'hit').line, "You've been hit.");
  assert.equal(hit.events.find((e) => e.kind === 'report_ready').line, 'Dawn report is in.');
  const owed = (await play(store, partner, 'signals', {}, T + 13)).events.find((e) => e.kind === 'report_owed');
  assert.equal(owed.line, 'Your partner hit something. Confirm it.');
  assert.equal(owed.id, `${c.id}:report_owed:1`);
  await play(store, victim, 'signals_seen', { ids: hit.events.map((e) => e.id) }, T + 14);
  assert.deepEqual((await play(store, victim, 'signals', {}, T + 15)).events, []);
  // The reveal.
  await teach(store, 'campaign_reveal', {}, T + 20);
  const fog = await play(store, victim, 'signals', {}, T + 21);
  assert.deepEqual(fog.events.map((e) => [e.kind, e.line, e.id]), [['reveal', 'The fog is lifting.', `${c.id}:reveal:final`]]);
});

test('signals reach any student page with no lesson id, through the class profile endpoint', async () => {
  const { profileAction } = await import('../../netlify/functions/_shared/profile.mjs');
  const { store, c, T } = await lessonGame();
  const ask = (action, extra = {}) => profileAction(store, 'class1', { action, class_token: whoFleet(1).class_token, ...extra }, { now: new Date(T + 5) });
  const got = await ask('fleet_signals');
  assert.deepEqual(got.events.map((e) => e.id), [`${c.id}:round_open:1`]);
  assert.equal(got.events[0].lesson_id, 'gl1');
  assert.deepEqual(await ask('fleet_signals_seen', { ids: [got.events[0].id, 'nonsense'] }), { ok: true });
  assert.deepEqual((await ask('fleet_signals')).events, []);
  // Seen through one door, seen through the other.
  assert.deepEqual((await play(store, 1, 'signals', {}, T + 6)).events, []);
  // Closing the campaign takes it off the class index.
  await teach(store, 'campaign_close', {}, T + 7);
  assert.deepEqual((await store.get('game-campaigns/class1')).campaigns, []);
  assert.deepEqual((await ask('fleet_signals')).events, []);
});

test('seen ids are capped at 200 per player, oldest first out', async () => {
  const { store, c, T } = await lessonGame();
  const seenKey = k.campaignSeen('fw', c.id, ownerOf(1));
  store.data.set(seenKey, { ids: Array.from({ length: 200 }, (_, i) => `${c.id}:hit:${i % 99}x${i}`) });
  await play(store, 1, 'signals_seen', { ids: [`${c.id}:round_open:1`] }, T + 5);
  const ids = (await store.get(seenKey)).ids;
  assert.equal(ids.length, 200);
  assert.equal(ids[199], `${c.id}:round_open:1`);
  assert.equal(ids[0], `${c.id}:hit:1x1`);
  await rejectsWith(play(store, 1, 'signals_seen', { ids: [] }, T + 6), 'bad_ids');
});

// ---------------------------------------------------------------- 3. learning data

import { foldRound, fleetPlayId } from '../../netlify/functions/_shared/fleet-week-fold.mjs';
import { classKey, unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { organiserKey } from '../../netlify/functions/_shared/organiser.mjs';
import { FLEET_ROSTER, fleetGame } from './helpers/fleet-fixture.mjs';

/** The fixture game with every question tagged with one knowledge piece that sits on an organiser line. */
async function taggedGame(open = { mode: 'lesson' }) {
  const game = fleetGame();
  for (const sq of game.squares) for (const v of sq.variants) v.pieces = ['kp_sim1'];
  const made = await lessonGame({ game, open });
  made.store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '8 English', students: FLEET_ROSTER, current_unit_id: 'unit1' });
  made.store.data.set(unitKey('unit1'), { id: 'unit1', title: 'Harbour', lesson_ids: ['gl1'] });
  made.store.data.set(organiserKey('unit1'), {
    v: 2,
    sections: [{ id: 'os_vocab', name: 'Vocabulary', kind: 'table', role: 'vocab', columns: [], lines: [{ id: 'ol_simile', cells: ['Simile', 'A comparison', ''], piece_id: 'kp_sim1', open: true }] }]
  });
  return made;
}

test('a resolved round folds its shots into game events, a play, box 1 and the summary', async () => {
  const { store, c, state, T } = await taggedGame();
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const rivalShips = state.fleets[fleet.rivalOf(c.pairing, team.id)];
  const ship = rivalShips[3].squares[0];
  const sea = [...Array(25).keys()].find((x) => !rivalShips.some((s) => s.squares.includes(x)));
  const a = await play(store, 1, 'fleet_commit', { square: ship, sure: true }, T + 1000);
  await play(store, 1, 'fleet_answer', { answer: typed(a.question), writing }, T + 4000);
  await play(store, 1, 'fleet_commit', { square: sea, sure: false }, T + 5000);
  await play(store, 1, 'fleet_answer', { answer: 'a guess', writing }, T + 6000);
  // Student 2's one shot is voided by the teacher.
  await play(store, 2, 'fleet_commit', { square: 0, sure: false }, T + 7000);
  await play(store, 2, 'fleet_answer', { answer: 'whatever', writing }, T + 7500);
  const [two] = await store.get(k.campaignShots('fw', c.id, 1, ownerOf(2)));
  await teach(store, 'void_shot', { round: 1, owner: ownerOf(2), seq: two.seq }, T + 8000);
  await teach(store, 'campaign_next', {}, T + 9000);
  await play(store, 3, 'fleet_state', {}, T + 9001);

  const playId = fleetPlayId(c, ownerOf(1));
  const events = await store.get(k.events('fw', playId, ownerOf(1)));
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.seq), [0, 1]);
  const [hit, dud] = events;
  assert.equal(hit.game, 'fleet_week');
  assert.equal(hit.move, 'answer');
  assert.equal(hit.play_id, playId);
  assert.equal(hit.student_id, 'st_01');
  assert.equal(hit.strength, 'live_solo');
  assert.match(hit.item, new RegExp(`^q${ship}[ab]$`));
  assert.equal(hit.response, typed(a.question));
  assert.equal(hit.correct, true);
  assert.equal(hit.time_ms, 3000);
  assert.deepEqual(hit.extra, { sure: true, returning: false, on_ship: true, voided: false, square: ship, round: 1, outcome: 'hit' });
  assert.equal(dud.correct, false);
  assert.equal(dud.extra.on_ship, false);
  const voided = (await store.get(k.events('fw', fleetPlayId(c, ownerOf(2)), ownerOf(2))))[0];
  assert.equal(voided.correct, null);
  assert.equal(voided.extra.voided, true);

  const record = await store.get(k.play('fw', playId));
  assert.equal(record.mode, 'live');
  assert.equal(record.kind, 'fleet_week');
  assert.equal(record.campaign_id, c.id);
  assert.deepEqual([record.score.right, record.score.answered], [1, 2]);
  assert.equal(record.boxed, 1);
  const boxes = store.data.get([...store.data.keys()].find((key) => key.startsWith('organiser_practice/class1/')));
  assert.equal(boxes.boxes.ol_simile.box, 1);

  const summary = await store.get(k.summary('fw', 'class1'));
  assert.deepEqual(summary.students.st_01.evidence.map((e) => [e.share, e.strength]).sort(), [[0, 'live_solo'], [1, 'live_solo']]);
  assert.deepEqual(summary.students.st_02.evidence, []); // a voided shot is in the log but is not evidence

  // A second fold of the same round changes nothing.
  const resolved = await store.get(k.campaignResolved('fw', c.id, 1));
  const stored = [];
  for (const n of N) stored.push(...((await store.get(k.campaignShots('fw', c.id, 1, ownerOf(n)))) ?? []));
  await foldRound(store, k, c, resolved, 1, stored, { now: T + 9100 });
  assert.deepEqual(await store.get(k.events('fw', playId, ownerOf(1))), events);
  assert.equal((await store.get(k.play('fw', playId))).boxed, 1);
});

test('the fold runs once per round, from the request that wrote it', async () => {
  const { store, c, T } = await lessonGame();
  const shot = await play(store, 1, 'fleet_commit', { square: 3, sure: false }, T + 10);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T + 20);
  store.writes.length = 0;
  await Promise.all([teach(store, 'campaign_next', {}, T + 30), play(store, 1, 'fleet_state', {}, T + 40), play(store, 2, 'fleet_state', {}, T + 40), teach(store, 'campaign_state', {}, T + 40)]);
  const playId = fleetPlayId(c, ownerOf(1));
  assert.equal(store.writes.filter((key) => key === k.campaignResolved('fw', c.id, 1)).length, 1);
  assert.equal(store.writes.filter((key) => key === k.play('fw', playId)).length, 1);
});

test('week mode folds as self-paced campaign play', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'week' });
  const c = await campaignOf(store);
  await play(store, 1, 'fleet_state', {}, MON_8PM + H);
  const shot = await play(store, 1, 'fleet_commit', { square: 3, sure: false }, MON_8PM + 2 * H);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, MON_8PM + 2 * H + 1000);
  await play(store, 1, 'fleet_state', {}, c.schedule[1] + 1);
  const playId = fleetPlayId(c, ownerOf(1));
  assert.equal((await store.get(k.play('fw', playId))).mode, 'campaign');
  assert.equal((await store.get(k.events('fw', playId, ownerOf(1))))[0].strength, 'self_paced');
});

test('damage reports and recall lines reach the control room as written answers with their logs', async () => {
  const { store, c, state, T } = await lessonGame();
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const partner = nOf(team.owners.find((o) => o !== ownerOf(1)));
  const sq = state.fleets[fleet.rivalOf(c.pairing, team.id)][3].squares[0];
  const shot = await play(store, 1, 'fleet_commit', { square: sq, sure: false }, T + 10);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T + 20);
  await teach(store, 'campaign_next', {}, T + 30);
  const owed = (await play(store, partner, 'fleet_state', {}, T + 40)).owed[0];
  await play(store, partner, 'fleet_report', { hit: owed.hit, text: 'It names the feeling.', writing: { ...writing, pastes: 1 } }, T + 50);
  await play(store, 1, 'fleet_recall', { ship_key: 's3', answer: 'line 3', writing }, T + 60);
  const room = await teach(store, 'campaign_state', {}, T + 70);
  const report = room.written.find((w) => w.kind === 'report');
  assert.equal(report.name, FLEET_ROSTER[partner - 1].name);
  assert.equal(report.shooter, 'Ivo Penn');
  assert.equal(report.text, 'It names the feeling.');
  assert.equal(report.prompt, shot.question.prompt);
  assert.equal(report.answer, typed(shot.question));
  assert.equal(report.writing.pastes, 1);
  assert.ok(report.writing.flags.length);
  assert.ok(Array.isArray(report.writing.log.steps));
  const recall = room.written.find((w) => w.kind === 'recall');
  assert.deepEqual([recall.name, recall.ship, recall.prompt, recall.text, recall.correct], ['Ivo Penn', 's3', 'Recall line 3?', 'line 3', true]);
  assert.ok(recall.writing.log);
});

// ---------------------------------------------------------------- 4. Results insight

test('campaign_insight: heat map, first try v returning, calibration, confident errors, hardest squares', async () => {
  const { store, c, state, T } = await lessonGame();
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const rivalShips = state.fleets[fleet.rivalOf(c.pairing, team.id)].flatMap((s) => s.squares);
  const sea = [...Array(25).keys()].filter((x) => !rivalShips.includes(x));
  // Round 1: student 1 is sure and wrong on sea[0], sure and right on sea[1]; student 3 unsure and wrong on 24.
  let shot = await play(store, 1, 'fleet_commit', { square: sea[0], sure: true }, T + 10);
  await play(store, 1, 'fleet_answer', { answer: 'the sea', writing }, T + 11);
  shot = await play(store, 1, 'fleet_commit', { square: sea[1], sure: true }, T + 12);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T + 13);
  await play(store, 3, 'fleet_commit', { square: 24, sure: false }, T + 14);
  await play(store, 3, 'fleet_answer', { answer: 'no idea', writing }, T + 15);
  await teach(store, 'campaign_next', {}, T + 20);
  await teach(store, 'campaign_next', {}, T + 30); // round 2 passes empty
  // Round 3: sea[0] returns to student 1 with the other variant; right this time.
  shot = await play(store, 1, 'fleet_commit', { square: sea[0], sure: false }, T + 40);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T + 41);
  await teach(store, 'campaign_next', {}, T + 50);
  const insight = await teach(store, 'campaign_insight', {}, T + 60);
  assert.equal(insight.grid.length, 25);
  const cell = insight.grid[sea[0]];
  assert.deepEqual([cell.answered, cell.right, cell.first.answered, cell.first.right, cell.returning.answered, cell.returning.right], [2, 1, 1, 0, 1, 1]);
  assert.match(cell.label, /^[A-E][1-5]$/);
  assert.equal(cell.row, ['Fear', 'Pride', 'Home', 'Loss', 'Hope'][Math.floor(sea[0] / 5)]);
  const ivo = insight.calibration.find((r) => r.name === 'Ivo Penn');
  assert.deepEqual([ivo.sure_right, ivo.sure_total, ivo.unsure_right, ivo.unsure_total], [1, 2, 1, 1]);
  assert.equal(ivo.calibration, 0.5);
  assert.equal(insight.calibration.length, 8);
  assert.equal(insight.confident_errors.length, 1);
  const err = insight.confident_errors[0];
  assert.deepEqual([err.name, err.square, err.answer, err.round], ['Ivo Penn', sea[0], 'the sea', 1]);
  assert.match(err.prompt, new RegExp(`^Question ${sea[0]} [AB]\\?$`));
  assert.ok(insight.hardest.some((h) => h.square === 24 && h.accuracy === 0));
  assert.ok(insight.hardest.every((h, i, all) => i === 0 || all[i - 1].accuracy <= h.accuracy));
  // The board, once revealed: per-square accuracy and hardest squares, no answers.
  const room = await teach(store, 'campaign_reveal', {}, T + 70);
  assert.equal(room.board.squares.length, 25);
  assert.ok(room.board.hardest.length >= 1);
  const view = await play(store, 5, 'fleet_state', {}, T + 80);
  assert.deepEqual(view.reveal.class, room.board);
  const text = JSON.stringify(view.reveal.class);
  assert.ok(!/the sea|no idea|mast|Mast|Ivo/.test(text));
});

// ---------------------------------------------------------------- 5. balance by accuracy

/** Summary rows as rebuildSummary writes them: latest right / answered per student. */
const summaryWith = (gameId, acc) => ({
  game_id: gameId, class_id: 'class1',
  students: Object.fromEntries(Object.entries(acc).map(([sid, [right, answered]]) => [sid, { latest: { right, answered, total: 10 } }]))
});
/** Owners as student numbers, team by team, each sorted. */
const teamsByNumber = (c) => c.pairing.teams.filter((t) => !t.ghost).map((t) => t.owners.map(nOf).sort((a, b) => a - b).join('+')).sort();

test('balance mixed pairs high accuracy with low, from this game’s summary', async () => {
  const { store } = await fleetLesson();
  // Students 1…8 got 8, 7, …, 1 of 10 right last time.
  store.data.set(k.summary('fw', 'class1'), summaryWith('fw', Object.fromEntries(N.map((n) => [`st_0${n}`, [9 - n, 10]]))));
  await teach(store, 'campaign_open', { mode: 'lesson', balance: 'mixed' });
  const c = await campaignOf(store);
  assert.equal(c.balance, 'mixed');
  assert.deepEqual(teamsByNumber(c), ['1+8', '2+7', '3+6', '4+5']);
  await rejectsWith(teach(store, 'campaign_open', { mode: 'lesson', balance: 'by_height' }), 'bad_balance');
});

test('balance mixed falls back to the lesson’s other games when this one has no plays', async () => {
  const { store } = await fleetLesson();
  const current = await store.get(k.current);
  const record = await store.get(k.version(current.version));
  store.data.set(k.version(current.version), { ...record, order: [...record.order, 'g2', 'g3'] });
  // Pooled over g2 and g3: student 1 strongest, student 8 weakest; the others in between.
  store.data.set(k.summary('g2', 'class1'), summaryWith('g2', Object.fromEntries(N.map((n) => [`st_0${n}`, [9 - n, 10]]))));
  store.data.set(k.summary('g3', 'class1'), summaryWith('g3', { st_01: [5, 5], st_08: [0, 5] }));
  await teach(store, 'campaign_open', { mode: 'lesson', balance: 'mixed' });
  assert.deepEqual(teamsByNumber(await campaignOf(store)), ['1+8', '2+7', '3+6', '4+5']);
});

test('balance random is the default and stays seeded from the secret', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  assert.equal(c.balance, 'random');
  assert.equal(c.pairing.teams.length, 4);
});

// ---------------------------------------------------------------- phone view extras

test('the view lists my team’s fired squares this round and its duds still unknown', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  const T = MON_9AM + 120000;
  await play(store, 1, 'fleet_state', {}, T);
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const partner = nOf(team.owners.find((o) => o !== ownerOf(1)));
  const state0 = await store.get(k.campaignResolved('fw', c.id, 0));
  const rivalShips = state0.fleets[fleet.rivalOf(c.pairing, team.id)].flatMap((s) => s.squares);
  const [a, b] = [...Array(25).keys()].filter((x) => !rivalShips.includes(x));
  const s1 = await play(store, 1, 'fleet_commit', { square: a, sure: false }, T + 10);
  await play(store, 1, 'fleet_answer', { answer: 'wrong', writing }, T + 20);
  const s2 = await play(store, partner, 'fleet_commit', { square: b, sure: false }, T + 30);
  await play(store, partner, 'fleet_answer', { answer: typed(s2.question), writing }, T + 40);
  assert.ok(s1.question);
  const during = await play(store, 1, 'fleet_state', {}, T + 50);
  assert.deepEqual(during.shots.fired, [a, b].sort((x, y) => x - y));
  assert.deepEqual(during.rival.duds, []);
  await teach(store, 'campaign_next', {}, T + 60);
  const after = await play(store, partner, 'fleet_state', {}, T + 70);
  assert.equal(after.round, 2);
  assert.deepEqual(after.shots.fired, []);
  // a was a dud (wrong answer) and is still unknown; b was a right miss, so it is on the chart, not a dud.
  assert.deepEqual(after.rival.duds, [a]);
  assert.equal(after.rival.chart[b], 'miss');
});

// ---------------------------------------------------------------- control room extras

test('campaign_state carries the server time and every shot in the open round, with no answer text', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const T = MON_9AM + 120000;
  await play(store, 1, 'fleet_state', {}, T);
  const shot = await play(store, 1, 'fleet_commit', { square: 7, sure: true }, T + 10);
  await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T + 20);
  await play(store, 2, 'fleet_commit', { square: 0, sure: false }, T + 30);
  const room = await teach(store, 'campaign_state', {}, T + 40);
  assert.equal(room.now, T + 40);
  assert.equal(room.shots.length, 2);
  const one = room.shots.find((s) => s.owner === ownerOf(1));
  assert.deepEqual({ ...one, seq: 0 }, { round: 1, owner: ownerOf(1), owner_name: 'Ivo Penn', seq: 0, square: 7, square_label: 'B3', sure: true, answered: true });
  assert.equal(room.shots.find((s) => s.owner === ownerOf(2)).answered, false);
  assert.ok(!JSON.stringify(room.shots).includes('mast'));
});
