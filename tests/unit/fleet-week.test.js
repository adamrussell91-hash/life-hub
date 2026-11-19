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

// ---------------------------------------------------------------- Task 5: student actions

import { gameStudentAction } from '../../netlify/functions/_shared/games.mjs';
import { ACCEPTED, FLEET_ROSTER, whoFleet } from './helpers/fleet-fixture.mjs';

/** Every student reply and refusal, for the leak sweep. */
const sent = [];
const play = async (store, n, action, extra = {}, now = T0) => {
  try {
    const reply = await gameStudentAction(store, 'gl1', { action, game_id: 'fw', ...whoFleet(n), ...extra }, { now });
    sent.push({ n, reply });
    return reply;
  } catch (e) {
    sent.push({ n, reply: { code: e.code, message: e.message } });
    throw e;
  }
};
const N = [1, 2, 3, 4, 5, 6, 7, 8];
const nOf = (owner) => N.find((n) => ownerOf(n) === owner);
/** "Question 12 A?" → "mast a12": the right answer, typed in lower case. */
const typed = (question) => {
  const m = /Question (\d+) ([AB])\?/.exec(question?.prompt ?? '');
  return m ? `mast ${m[2].toLowerCase()}${m[1]}` : 'no idea';
};
const writing = { start: 1, base: '', ms: 4000, pastes: 0, away: 0, jumps: 0, steps: [[100, 0, 0, 'x']] };

/** Who plays whom: for student n, their team, partner numbers, rival team and rival numbers. */
function sides(c, n) {
  const team = fleet.teamOf(c.pairing, ownerOf(n));
  const rival = c.pairing.teams.find((t) => t.id === fleet.rivalOf(c.pairing, team.id));
  return { team, rival, partners: team.owners.filter((o) => o !== ownerOf(n)).map(nOf), rivals: rival.owners.map(nOf) };
}

/** Opens a campaign; everyone looks, then places a valid layout; placement closes early. Returns campaign and fleets. */
async function startGame({ place = true } = {}) {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  for (const n of N) await play(store, n, 'fleet_state');
  if (place) {
    for (const team of c.pairing.teams) {
      const laid = [];
      for (const owner of team.owners) {
        const ships = fleet.autoPlace(fleet.shipsFor(team, owner), laid, laid.flatMap((s) => s.squares), fleet.rng(`test:${owner}`));
        await play(store, nOf(owner), 'fleet_place', { ships });
        laid.push(...ships);
      }
    }
  }
  const view = await play(store, 1, 'fleet_state', {}, T0 + 1000);
  const state = await store.get(k.campaignResolved('fw', c.id, 0));
  return { store, c, state, view };
}
const T1 = T0 + 1000;
/** Round 1 opens at T1; its cap runs out at CAP. */
const CAP = T1 + 240000;
const rejectsWith = (p, code, re) => assert.rejects(p, (e) => e.code === code && (!re || re.test(e.message)));

test('placement closes early once every active player has placed', async () => {
  const { view, state } = await startGame();
  assert.equal(view.phase, 'firing');
  assert.equal(view.round, 1);
  assert.equal(state.round, 0);
});

test('placement validation messages surface', async () => {
  const { store } = await fleetLesson();
  await teach(store, 'campaign_open', { mode: 'lesson' });
  const c = await campaignOf(store);
  const team = fleet.teamOf(c.pairing, ownerOf(1));
  const ids = fleet.shipsFor(team, ownerOf(1));
  const bent = ids.map((id) => ({ id, squares: id === 's0' ? [0, 1, 6] : id === 's3' ? [24] : id === 's1' ? [10, 16] : [20, 21] }));
  await rejectsWith(play(store, 1, 'fleet_place', { ships: bent }), 'bad_place', /straight line/);
  await rejectsWith(play(store, 1, 'fleet_place', { ships: [] }), 'bad_place', /Place each of your ships/);
  const good = fleet.autoPlace(ids, [], [], fleet.rng('good'));
  await play(store, 1, 'fleet_place', { ships: good });
  await rejectsWith(play(store, 1, 'fleet_place', { ships: good }), 'placed', /already at sea/);
});

test('commit, then commit again: the same question and deadline', async () => {
  const { store } = await startGame();
  const a = await play(store, 1, 'fleet_commit', { square: 12, sure: true }, T1 + 10);
  const b = await play(store, 1, 'fleet_commit', { square: 3, sure: false }, T1 + 5000);
  assert.deepEqual(b, a);
  assert.match(a.question.prompt, /^Question 12 [AB]\?$/);
  assert.equal(a.deadline, T1 + 10 + 60000);
  const view = await play(store, 1, 'fleet_state', {}, T1 + 6000);
  assert.deepEqual(view.shots.open, { square: 12, sure: true, question: a.question, deadline: a.deadline });
  assert.equal(view.shots.left, 3);
});

test('an answer after the deadline is late and stored as no answer', async () => {
  const { store, c } = await startGame();
  const shot = await play(store, 1, 'fleet_commit', { square: 12, sure: false }, T1);
  await rejectsWith(play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, shot.deadline + 2001), 'late');
  const stored = await store.get(k.campaignShots('fw', c.id, 1, ownerOf(1)));
  assert.equal(stored[0].correct, null);
  assert.equal(stored[0].answer, undefined);
});

test('the answer reply never says right or wrong', async () => {
  const { store, c } = await startGame();
  const shot = await play(store, 1, 'fleet_commit', { square: 12, sure: false }, T1);
  assert.deepEqual(await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T1 + 100), { ok: true });
  await play(store, 1, 'fleet_commit', { square: 13, sure: false }, T1 + 200);
  assert.deepEqual(await play(store, 1, 'fleet_answer', { answer: 'wrong', writing }, T1 + 300), { ok: true });
  const stored = await store.get(k.campaignShots('fw', c.id, 1, ownerOf(1)));
  assert.deepEqual(stored.map((s) => s.correct), [true, false]);
  assert.equal(stored[0].writing.ms, 4000);
});

test('a fifth commit is refused, and so is a square the team already knows', async () => {
  const { store, c, state } = await startGame();
  const { rival } = sides(c, 1);
  const empty = [...Array(25).keys()].filter((sq) => !state.fleets[rival.id].some((s) => s.squares.includes(sq)));
  for (const sq of empty.slice(0, 4)) {
    const shot = await play(store, 1, 'fleet_commit', { square: sq, sure: false }, T1);
    await play(store, 1, 'fleet_answer', { answer: typed(shot.question), writing }, T1);
  }
  await rejectsWith(play(store, 1, 'fleet_commit', { square: empty[5], sure: false }, T1), 'no_shots');
  // Next round (at the cap): the misses are on the chart.
  const view = await play(store, 1, 'fleet_state', {}, CAP + 10);
  assert.equal(view.round, 2);
  assert.equal(view.rival.chart[empty[0]], 'miss');
  await rejectsWith(play(store, 1, 'fleet_commit', { square: empty[0], sure: false }, CAP + 20), 'known');
  const partner = sides(c, 1).partners[0];
  await rejectsWith(play(store, partner, 'fleet_commit', { square: empty[0], sure: false }, CAP + 20), 'known');
});

test('a round closes early once every active player is done', async () => {
  const { store } = await startGame();
  for (const n of N) {
    for (let i = 0; i < 4; i++) {
      await play(store, n, 'fleet_commit', { square: i + 10 * (n % 2), sure: false }, T1 + n * 10 + i);
      await play(store, n, 'fleet_answer', { answer: 'nope', writing }, T1 + n * 10 + i);
    }
  }
  const view = await play(store, 1, 'fleet_state', {}, T1 + 500);
  assert.equal(view.round, 2);
  assert.equal(view.report.round, 1);
  assert.ok(view.report.lines.length >= 4);
});

/** Student n fires at a rival ship square and answers right; returns the square. */
async function hitOnce(store, c, state, n, now, sure = false, pick = (ships) => ships.find((s) => s.id === 's3')) {
  const { rival } = sides(c, n);
  const sq = pick(state.fleets[rival.id]).squares[0];
  const shot = await play(store, n, 'fleet_commit', { square: sq, sure }, now);
  await play(store, n, 'fleet_answer', { answer: typed(shot.question), writing }, now);
  return { sq, shot };
}

test('the owed report shows the exact variant and the partner’s typed answer; the shooter can’t file it', async () => {
  const { store, c, state } = await startGame();
  const { partners } = sides(c, 1);
  const { sq, shot } = await hitOnce(store, c, state, 1, T1);
  const mine = await play(store, 1, 'fleet_state', {}, CAP + 10);
  assert.deepEqual(mine.owed, []);
  assert.equal(mine.report.lines[0].outcome, 'hit');
  const theirs = await play(store, partners[0], 'fleet_state', {}, CAP + 10);
  assert.equal(theirs.owed.length, 1);
  const owed = theirs.owed[0];
  assert.equal(owed.square, sq);
  assert.deepEqual(owed.question, shot.question);
  assert.equal(owed.answer, typed(shot.question));
  assert.equal(owed.by, Object.values(theirs.team.signs)[0]);
  await rejectsWith(play(store, 1, 'fleet_report', { hit: owed.hit, text: 'Because it is.', writing }, CAP + 20), 'own_hit');
  await rejectsWith(play(store, partners[0], 'fleet_report', { hit: owed.hit, text: '  ', writing }, CAP + 20), 'bad_text');
  assert.deepEqual(await play(store, partners[0], 'fleet_report', { hit: owed.hit, text: 'It names the feeling.', writing }, CAP + 20), { ok: true });
  await rejectsWith(play(store, partners[0], 'fleet_report', { hit: owed.hit, text: 'Again.', writing }, CAP + 20), 'filed');
  assert.deepEqual((await play(store, partners[0], 'fleet_state', {}, CAP + 30)).owed, []);
});

test('the sinker gets the recall line once', async () => {
  const { store, c, state } = await startGame();
  await hitOnce(store, c, state, 1, T1);
  const view = await play(store, 1, 'fleet_state', {}, CAP + 10);
  assert.equal(view.recall.ship_key, 's3');
  assert.equal(view.recall.prompt.prompt, 'Recall line 3?');
  assert.deepEqual(view.rival.sunk, ['s3']);
  assert.deepEqual(await play(store, 1, 'fleet_recall', { ship_key: 's3', answer: 'line 3', writing }, CAP + 20), { ok: true });
  await rejectsWith(play(store, 1, 'fleet_recall', { ship_key: 's3', answer: 'line 3', writing }, CAP + 30), 'answered');
  assert.equal((await play(store, 1, 'fleet_state', {}, CAP + 40)).recall, undefined);
  await rejectsWith(play(store, sides(c, 1).partners[0], 'fleet_recall', { ship_key: 's3', answer: 'line 3' }, CAP + 40), 'no_recall');
});

test('a class with no list can’t play Fleet week', async () => {
  const { store } = await fleetLesson();
  await rejectsWith(gameStudentAction(store, 'gl1', { action: 'fleet_state', game_id: 'fw', class_id: 'class0', class_token: 'ab'.repeat(24) }, { now: T0 }), 'need_roster');
});

test('leak sweep: no answer, secret, name, id, owner or rival fleet reaches a student before the reveal', async () => {
  sent.length = 0;
  const { store, c, state } = await startGame();
  let now = T1;
  const fired = {};
  // Round 1: everyone fires four shots: a hit, a sure hit, a miss and a wrong answer.
  for (const n of N) {
    const { rival } = sides(c, n);
    const ships = state.fleets[rival.id];
    const shipSquares = ships.flatMap((s) => s.squares);
    const used = new Set();
    const pick = (want) => {
      const sq = [...Array(25).keys()].find((x) => !used.has(x) && want(x));
      used.add(sq);
      return sq;
    };
    const plan = [
      [pick((x) => x === ships[3].squares[0]), true, true],
      [pick((x) => shipSquares.includes(x)), false, true],
      [pick((x) => !shipSquares.includes(x)), false, true],
      [pick((x) => !shipSquares.includes(x)), true, false]
    ];
    fired[n] = plan.map(([square]) => square);
    for (const [square, sure, right] of plan) {
      const shot = await play(store, n, 'fleet_commit', { square, sure }, (now += 7));
      await play(store, n, 'fleet_answer', { answer: right ? typed(shot.question) : 'a guess', writing }, (now += 7));
    }
  }
  // Everyone done: round 1 resolves. Reports are owed, recall lines wait.
  const views = {};
  for (const n of N) views[n] = await play(store, n, 'fleet_state', {}, (now += 7));
  assert.equal(views[1].round, 2);
  const filer = N.find((n) => views[n].owed.length);
  await play(store, filer, 'fleet_report', { hit: views[filer].owed[0].hit, text: 'It fits the speaker’s fear.', writing }, (now += 7));
  const sinker = N.find((n) => views[n].recall);
  await play(store, sinker, 'fleet_recall', { ship_key: views[sinker].recall.ship_key, answer: 'line 3', writing }, (now += 7));
  // Round 2: a couple of shots each, then the cap.
  for (const n of N) {
    const free = [...Array(25).keys()].filter((x) => !views[n].rival.chart[x] && !fired[n].includes(x));
    const shot = await play(store, n, 'fleet_commit', { square: free[0], sure: n % 2 === 0 }, (now += 7));
    await play(store, n, 'fleet_answer', { answer: typed(shot.question), writing }, (now += 7));
  }
  await rejectsWith(play(store, 1, 'fleet_report', { hit: 'nope', text: 'x' }, (now += 7)), 'bad_hit');
  now += 240000;
  for (const n of N) views[n] = await play(store, n, 'fleet_state', {}, (now += 7));
  assert.equal(views[1].round, 3);

  const text = JSON.stringify(sent.map((x) => x.reply));
  const needles = [
    ...ACCEPTED,
    c.secret,
    ...FLEET_ROSTER.flatMap((s) => [s.name, s.name.split(' ')[0], s.id]),
    'st_0',
    ...N.map(ownerOf),
    ...state.hits.map((h) => h.id)
  ].filter(Boolean);
  for (const needle of needles) assert.ok(!text.includes(needle), `leaked: ${needle}`);
  assert.ok(!/"fleets"|"secret"|"students"|"joined"|"pairing"|"owner"|"student_id"|"accepted"|"log"|"item"|"variant"|"t\d"|"ghost"/.test(text));
  // Ship squares appear only in the player's own team fleet, and that is exactly their team's, never the rival's.
  const viewsSent = sent.filter((x) => x.reply?.phase);
  assert.ok(viewsSent.length > 20);
  for (const { n, reply: v } of viewsSent) {
    const { team, ...rest } = v;
    assert.ok(!JSON.stringify(rest).includes('"squares"'), 'ship squares outside team.fleet');
    const { fleet: teamFleet, ...teamRest } = team;
    assert.ok(!JSON.stringify(teamRest).includes('"squares"'));
    const own = sides(c, n).team;
    if (v.round >= 1) assert.deepEqual(teamFleet, state.fleets[own.id]);
    else for (const ship of teamFleet) assert.ok(state.fleets[own.id].some((s) => s.id === ship.id), 'placement shows own team ships only');
  }
  // The report shows this player's side only, as call signs.
  for (const n of N) {
    const { rival } = sides(c, n);
    for (const line of views[n].report.lines) assert.match(line.by, /^(Captain|Commander|Admiral|Ensign|Bosun) \w+$/);
    assert.ok(views[n].report.lines.every((l) => l.side === 'us' || l.side === 'them'));
    assert.equal(views[n].rival.signs.length, rival.owners.length);
  }
});
