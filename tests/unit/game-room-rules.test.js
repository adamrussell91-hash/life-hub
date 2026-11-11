// tests/unit/game-room-rules.test.js
// Live game rooms: the plug-in seam for kinds with their own rules (style 'custom', core/room-rules.ts).
// A tiny dummy rules module is registered against the generated bundle (the file the Worker imports) and driven
// through the real reducer: every RulesCtx method, teams, pause and timers, phone kind controls, end → finish → fold.
// Runs in its own process (node --test), so the dummy rules never meet the other room tests.
// Every class, student and question is invented (helpers/game-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_LIMITS, initialState, nextAlarm, publicView, reduce, registerRules, roomStyle, roomTeams, rulesFor } from '../../netlify/functions/_shared/game-room-core.mjs';
import { prepareGamePublish } from '../../netlify/functions/_shared/games.mjs';
import { openRoom } from '../../netlify/functions/_shared/game-rooms.mjs';
import { storeGameKeys } from '../../netlify/functions/_shared/games.mjs';
import { classKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { storeFor } from './helpers/sprint-store.js';
import { GAME_ROSTER, gameLesson, wager } from './helpers/game-fixture.mjs';

const T0 = Date.parse('2026-11-11T01:00:00.000Z');
const KIND = 'wager';
const PUB = prepareGamePublish(gameLesson({}, [wager()]));
assert.deepEqual(PUB.problems, []);
const GAME = PUB.snapshot.games.find((g) => g.id === 'g_wager');
const KEYS = PUB.record.games.g_wager;
const rightId = (item) => KEYS.items[item].key.answer.ids[0];
const ROSTER = { st_a: 'AB', st_b: 'CD', st_c: 'EF', st_d: 'GH', st_e: 'JK' };
const STUDENTS = Object.keys(ROSTER);

/** Calls every RulesCtx method somewhere; the view shows only what each viewer may see. */
const calls = [];
const dummy = {
  kind: KIND,
  teams: { min: 2, max: 4, default: 2 },
  burst: 6,
  init: (ctx) => ({ round: 0, ticks: 0, finished: false, changed: [], dice: ctx.random() }),
  start(ctx, k) {
    k.round = 1;
    k.dice = ctx.random();
    calls.push(['start', ctx.teams(), ctx.seats().length]);
    ctx.setTimer(ctx.now + 10_000);
    ctx.ticker('Round 1 open');
  },
  move(ctx, k, owner, event) {
    const seat = ctx.seat(owner);
    if (event.move === 'bet') {
      ctx.record(owner, { item: event.item, move: 'bet', response: { bet: 5 }, extra: { bet: 5 }, strength: 'live_team' });
      return { item: event.item };
    }
    const out = ctx.mark(owner, event, 'live_solo');
    if (out.error) return out;
    if (out.result.correct) {
      ctx.addScore(owner, 10);
      ctx.addTeamScore(seat.team, 10);
      ctx.ticker('got one', seat.initials);
    }
    ctx.setProgress(owner, { done: 1, total: 5 });
    return out.result;
  },
  control(ctx, k, op, from) {
    calls.push(['control', op.name, from.role]);
    if (op.name === 'next') {
      k.round += 1;
      ctx.setTimer(ctx.now + 10_000);
      return;
    }
    if (op.name === 'whisper') return void ctx.send(from.owner, { t: 'error', code: 'whisper', message: `psst ${ctx.members(ctx.seat(from.owner)?.team ?? 0).length}` });
    if (op.name === 'set') {
      ctx.setScore(op.data.owner, op.data.score);
      return;
    }
    if (op.name === 'stop') return void ctx.end();
    if (op.name === 'boom') throw new Error('kind bug');
    return { error: { code: 'nope', message: 'Not that one.' } };
  },
  tick(ctx, k) {
    k.ticks += 1;
    ctx.ticker('Time');
  },
  finish(ctx, k) {
    k.finished = true;
    for (const t of ctx.teams()) ctx.addTeamScore(t, 1);
    calls.push(['finish', ctx.teamScore(0)]);
  },
  seatChanged(ctx, k, owner) {
    k.changed.push(owner);
  },
  view(ctx, k, role, owner) {
    if (role === 'student') return { round: k.round, mine: ctx.seat(owner)?.score ?? 0 };
    return { round: k.round, ticks: k.ticks, finished: k.finished, teams: ctx.teams() };
  }
};
registerRules(dummy);

function room(over = {}) {
  return initialState({ room: 'room_rules1', code: '654321', lesson_id: 'gl1', class_id: 'class1', game: GAME, keys: KEYS, style: 'custom', roster: ROSTER, fold_url: 'https://example.test/api/games/fold', opened_at: T0, ...over }, T0);
}

function driver(state) {
  const sent = [];
  let now = T0;
  const run = (action, at = now) => {
    now = at;
    const out = reduce(state, action, now);
    for (const fx of out.effects) {
      if (fx.kind === 'send' || fx.kind === 'close') sent.push({ to: fx.owner, msg: fx.msg });
      if (fx.kind === 'fold') sent.push({ to: 'fold', msg: fx.payload });
      if (fx.kind === 'broadcast') {
        for (const [owner, role] of [['teacher', 'teacher'], ['board', 'board'], ...Object.keys(state.seats).map((o) => [o, 'student'])]) sent.push({ to: owner, msg: { t: 'snapshot', view: publicView(state, role, owner, now) } });
      }
    }
    return out.effects;
  };
  const ackOf = (effects) => effects.find((f) => f.kind === 'send' && f.msg.t === 'ack')?.msg;
  return {
    state, sent, run, ackOf,
    get now() { return now; },
    join: (n, at = now) => run({ type: 'connect', owner: `own_${n}`, role: 'student', student_id: STUDENTS[n - 1], initials: ROSTER[STUDENTS[n - 1]], conn: `c${n}` }, at),
    control: (op, at = now, rid) => run({ type: 'msg', owner: 'teacher', role: 'teacher', conn: 'ct', msg: { t: 'control', ...(rid ? { rid } : {}), op } }, at),
    phone: (n, op, at = now) => run({ type: 'msg', owner: `own_${n}`, role: 'student', conn: `c${n}`, msg: { t: 'control', op } }, at),
    move: (n, event, at = now, rid) => run({ type: 'msg', owner: `own_${n}`, role: 'student', conn: `c${n}`, msg: { t: 'move', ...(rid ? { rid } : {}), event } }, at),
    play: (at = now) => {
      run({ type: 'msg', owner: 'teacher', role: 'teacher', conn: 'ct', msg: { t: 'control', op: { op: 'start' } } }, at);
      return run({ type: 'tick' }, at + ROOM_LIMITS.countdownMs);
    }
  };
}

test('a kind with its own rules is style custom; built-in kinds keep theirs; team settings come from the rules', () => {
  assert.equal(roomStyle(KIND), 'custom');
  assert.equal(roomStyle('crossword'), 'race');
  assert.equal(roomStyle('who_said_it'), 'paced');
  assert.equal(rulesFor(KIND), dummy);
  assert.deepEqual(roomTeams(KIND), { min: 2, max: 4, default: 2 });
  assert.equal(roomTeams('crossword'), null);
  const v = publicView(room(), 'board', 'board', T0);
  assert.equal(v.style, 'custom');
  assert.deepEqual(v.kind_view, { round: 0, ticks: 0, finished: false, teams: [] });
});

test('teams: round-robin in the lobby, move_team and shuffle in the lobby only, late joiners to the smallest team', () => {
  const d = driver(room());
  [1, 2, 3].forEach((n) => d.join(n));
  assert.deepEqual([1, 2, 3].map((n) => d.state.seats[`own_${n}`].team), [0, 1, 0]);
  // The board's lobby shows both teams with initials; a student sees only their own team's members.
  const board = publicView(d.state, 'board', 'board', d.now);
  assert.deepEqual(board.teams.map((t) => [t.team, t.members]), [[0, ['AB', 'EF']], [1, ['CD']]]);
  assert.deepEqual(board.leaderboard.map((r) => r.initials), ['Team 1', 'Team 2']);
  const phone = publicView(d.state, 'student', 'own_2', d.now);
  assert.deepEqual(phone.teams.map((t) => t.members), [[], ['CD']]);
  assert.equal(phone.you.seat.team, 1);
  // Teacher moves EF to team 2.
  assert.equal(d.ackOf(d.control({ op: 'move_team', owner: 'own_3', team: 1 })).error, undefined);
  assert.equal(d.state.seats.own_3.team, 1);
  assert.equal(d.ackOf(d.control({ op: 'move_team', owner: 'own_3', team: 7 })).error.code, 'bad_team');
  // Shuffle keeps the teams within one of each other.
  d.join(4);
  assert.equal(d.ackOf(d.control({ op: 'shuffle_teams' })).error, undefined);
  const sizes = [0, 1].map((t) => Object.values(d.state.seats).filter((s) => s.team === t).length);
  assert.deepEqual(sizes, [2, 2]);
  d.play();
  assert.equal(d.state.phase, 'playing');
  assert.deepEqual(calls.find((c) => c[0] === 'start'), ['start', [0, 1], 4]);
  assert.equal(d.ackOf(d.control({ op: 'move_team', owner: 'own_1', team: 1 })).error.code, 'started');
  // A late joiner goes to the smallest team (after a move made one smaller) and the rules hear about it.
  for (const s of Object.values(d.state.seats)) s.team = s.owner === 'own_4' ? 1 : 0;
  d.join(5);
  assert.equal(d.state.seats.own_5.team, 1);
  assert.ok(d.state.custom.changed.includes('own_5'));
  // A drop and a reconnect reach the rules too.
  d.run({ type: 'disconnect', owner: 'own_5', conn: 'c5' });
  assert.equal(d.state.custom.changed.filter((o) => o === 'own_5').length, 2);
});

test('team count: the room config, kept to the rules range; individual kinds have none', () => {
  const d = driver(room({ teams: { count: 9 } }));
  [1, 2, 3, 4, 5].forEach((n) => d.join(n));
  assert.deepEqual(Object.values(d.state.seats).map((s) => s.team), [0, 1, 2, 3, 0]);
  assert.equal(publicView(d.state, 'board', 'board').teams.length, 4);
});

test('every ctx method through the reducer: mark, record, scores, team scores, progress, ticker, send, random, dedupe', () => {
  const d = driver(room());
  [1, 2, 3].forEach((n) => d.join(n));
  d.play();
  assert.equal(d.state.custom.round, 1);
  assert.equal(d.state.ticker[0].text, 'Round 1 open');
  // Seeded per room: the same room id gives the same numbers.
  assert.equal(typeof d.state.custom.dice, 'number');
  const again = driver(room());
  again.join(1);
  again.play();
  assert.equal(again.state.custom.dice, d.state.custom.dice);
  // A right answer: marked by the shared marker, stored with the seat's team, scored for seat and team.
  const right = d.move(1, { item: 'w1', move: 'answer', response: { selected: [rightId('w1')] } }, d.now, 'r1');
  assert.equal(d.ackOf(right).result.correct, true);
  assert.equal(d.state.seats.own_1.score, 10);
  assert.equal(d.state.team_scores[0], 10);
  assert.deepEqual(d.state.seats.own_1.progress, { done: 1, total: 5 });
  assert.deepEqual(d.state.ticker[0], { initials: 'AB', text: 'got one', at: d.now });
  const stored = d.state.history.own_1.at(-1);
  assert.equal(stored.correct, true);
  assert.equal(stored.team, '0');
  assert.equal(stored.strength, 'live_solo');
  // The same request id again: answered from memory, stored once.
  const resent = d.move(1, { item: 'w1', move: 'answer', response: { selected: [rightId('w1')] } }, d.now, 'r1');
  assert.equal(d.ackOf(resent).result.correct, true);
  assert.equal(d.state.history.own_1.length, 1);
  // A wrong answer and an unknown item.
  assert.equal(d.ackOf(d.move(2, { item: 'w1', move: 'answer', response: { selected: ['nope'] } })).result.correct, false);
  assert.equal(d.ackOf(d.move(2, { item: 'zz', move: 'answer', response: {} })).error.code, 'bad_item');
  // record: a move the marker doesn't judge keeps its own strength.
  d.move(3, { item: 'w2', move: 'bet', response: { bet: 5 } });
  const bet = d.state.history.own_3.at(-1);
  assert.equal(bet.move, 'bet');
  assert.equal(bet.strength, 'live_team');
  assert.equal(bet.student_id, 'st_c');
  assert.equal(bet.at, d.now);
  // setScore from a teacher kind control; send goes to one seat only.
  d.control({ op: 'kind', name: 'set', data: { owner: 'own_2', score: 42 } });
  assert.equal(d.state.seats.own_2.score, 42);
  const whisper = d.phone(1, { op: 'kind', name: 'whisper' });
  assert.ok(whisper.some((f) => f.kind === 'send' && f.owner === 'own_1' && f.msg.code === 'whisper' && f.msg.message === 'psst 2'));
  assert.ok(calls.some((c) => c[0] === 'control' && c[1] === 'whisper' && c[2] === 'student'));
  // The rules' own error, a throw, and a student trying a core control.
  assert.equal(d.ackOf(d.control({ op: 'kind', name: 'mystery' })).error.code, 'nope');
  assert.equal(d.ackOf(d.control({ op: 'kind', name: 'boom' })).error.code, 'rules_failed');
  assert.equal(d.ackOf(d.phone(1, { op: 'next' })).error.code, 'not_allowed');
  assert.equal(d.ackOf(d.phone(1, { op: 'kind', name: 'bad name!' })).error.code, 'bad_control');
  // Views: kind_view per role; the leaderboard is the teams.
  const board = publicView(d.state, 'board', 'board', d.now);
  assert.deepEqual(board.kind_view, { round: 1, ticks: 0, finished: false, teams: [0, 1] });
  assert.deepEqual(publicView(d.state, 'student', 'own_2', d.now).kind_view, { round: 1, mine: 42 });
  assert.deepEqual(board.leaderboard.map((r) => [r.initials, r.score, r.rank, r.team]), [['Team 1', 10, 1, 0], ['Team 2', 0, 2, 1]]);
  assert.ok(board.ticker.length > 0);
});

test('rate limit follows the rules burst; phone kind controls wait for play', () => {
  const d = driver(room());
  d.join(1);
  assert.equal(d.ackOf(d.phone(1, { op: 'kind', name: 'whisper' })).error.code, 'not_started');
  // Teacher kind buttons work in the lobby (setting up).
  assert.equal(d.ackOf(d.control({ op: 'kind', name: 'set', data: { owner: 'own_1', score: 1 } })).error, undefined);
  assert.equal(d.ackOf(d.control({ op: 'next' })).error.code, 'not_started');
  d.play();
  const codes = [];
  for (let i = 0; i < 8; i += 1) codes.push(d.ackOf(d.move(1, { item: 'w2', move: 'bet' }, d.now + 1))?.error?.code ?? 'ok');
  assert.equal(codes.filter((c) => c === 'slow_down').length, 8 - (dummy.burst - 1));
});

test('timer: setTimer drives the alarm and tick; pause freezes it; add_time stretches it; next resets it', () => {
  const d = driver(room());
  d.join(1);
  d.play();
  const start = d.now;
  assert.equal(d.state.ends_at, start + 10_000);
  assert.equal(nextAlarm(d.state), start + 10_000);
  // Paused: no timer on the views, the alarm falls back to the room's life, a stray tick does nothing.
  d.control({ op: 'pause' }, start + 4000);
  assert.equal(d.state.paused_left_ms, 6000);
  assert.equal(publicView(d.state, 'board', 'board').ends_at, undefined);
  assert.equal(nextAlarm(d.state), T0 + ROOM_LIMITS.lifeMs);
  d.run({ type: 'tick' }, start + 10_000);
  assert.equal(d.state.custom.ticks, 0);
  assert.equal(d.ackOf(d.control({ op: 'kind', name: 'next' })).error.code, 'paused');
  assert.equal(d.ackOf(d.move(1, { item: 'w1', move: 'bet' })).error.code, 'paused');
  d.control({ op: 'resume' }, start + 20_000);
  assert.equal(d.state.ends_at, start + 26_000);
  d.control({ op: 'add_time', seconds: 15 });
  assert.equal(d.state.ends_at, start + 41_000);
  d.run({ type: 'tick' }, start + 40_000);
  assert.equal(d.state.custom.ticks, 0);
  d.run({ type: 'tick' }, start + 41_000);
  assert.equal(d.state.custom.ticks, 1);
  assert.equal(d.state.ends_at, undefined);
  assert.equal(d.state.ticker[0].text, 'Time');
  // 'next' goes to the rules, which set a fresh timer.
  d.control({ op: 'next' }, start + 50_000);
  assert.equal(d.state.custom.round, 2);
  assert.equal(d.state.ends_at, start + 60_000);
});

test('end: the teacher ends → rules.finish → fold with teams and team scores; the rules ending it skip finish', () => {
  const d = driver(room());
  [1, 2].forEach((n) => d.join(n));
  d.play();
  d.move(1, { item: 'w1', move: 'answer', response: { selected: [rightId('w1')] } });
  const fx = d.control({ op: 'end' });
  const fold = fx.find((f) => f.kind === 'fold').payload;
  assert.equal(d.state.phase, 'ended');
  assert.equal(d.state.custom.finished, true);
  assert.deepEqual(fold.team_scores, { 0: 11, 1: 1 });
  assert.deepEqual(fold.seats.map((s) => [s.initials, s.team, s.score]), [['AB', 0, 10], ['CD', 1, 0]]);
  assert.equal(fold.events[0].team, '0');
  assert.equal(fx.filter((f) => f.kind === 'fold').length, 1);
  // Ended: the kind's controls stop.
  assert.equal(d.ackOf(d.control({ op: 'kind', name: 'next' })).error.code, 'ended');

  const e = driver(room({ room: 'room_rules2' }));
  e.join(1);
  e.play();
  const stopped = e.control({ op: 'kind', name: 'stop' });
  assert.equal(stopped.filter((f) => f.kind === 'fold').length, 1);
  assert.equal(e.state.phase, 'ended');
  assert.equal(e.state.custom.finished, false);
});

test('reconnects get a snapshot with their own kind_view; no message carries a key', () => {
  const d = driver(room());
  [1, 2].forEach((n) => d.join(n));
  d.play();
  d.move(1, { item: 'w1', move: 'answer', response: { selected: [rightId('w1')] } });
  const back = d.join(1);
  const snap = back.find((f) => f.kind === 'send' && f.msg.t === 'snapshot').msg.view;
  assert.deepEqual(snap.kind_view, { round: 1, mine: 10 });
  assert.equal(snap.seats.length, 0);
  d.control({ op: 'end' });
  const ids = Object.keys(KEYS.items).map(rightId);
  for (const { to, msg } of d.sent) {
    if (to === 'fold') continue;
    // The mover's own verdict (ack, and \`you.last\` in its own view) is the marker's, as in solo play: a kind that
    // must hold the answer back until a reveal returns its own result from \`move\` instead of ctx.mark's.
    const text = JSON.stringify(msg.t === 'ack' ? {} : msg.t === 'snapshot' ? { ...msg.view, you: { ...msg.view.you, last: undefined } } : msg);
    for (const id of ids) assert.ok(!text.includes(id), `${to} got a right option id`);
    assert.ok(!/"(keys|answer)":\{/.test(text), `${to} got a key field: ${text.slice(0, 400)}`);
  }
  // Another seat never sees the mover's verdict.
  assert.ok(!d.sent.filter((m) => m.to === 'own_2').some((m) => ids.some((id) => JSON.stringify(m.msg).includes(id))));
});

test('Netlify open: any kind with rules opens as custom; the teacher picks the team count, kept to the rules range', async () => {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '9 English', students: GAME_ROSTER, current_unit_id: 'unit1' });
  store.data.set(publishedLessonKey('gl1'), { lesson_id: 'gl1', pedagogical_mode: 'game', blocks: [], game: PUB.snapshot });
  await storeGameKeys(store, 'gl1', PUB.record);
  const posted = [];
  const fetchImpl = async (url, init) => (posted.push(JSON.parse(init.body)), new Response('{}', { status: 201 }));
  const env = { GAME_ROOM_SECRET: 'netlify-test-secret-0123456789abcdef', GAME_ROOMS_URL: 'https://rooms.example.test/g' };
  const three = await openRoom(store, 'gl1', { game_id: 'g_wager', class_id: 'class1', teams: 3 }, { env, fetchImpl, now: T0 });
  assert.equal(three.style, 'custom');
  assert.equal(three.teams, 3);
  assert.equal(posted[0].style, 'custom');
  assert.deepEqual(posted[0].teams, { count: 3 });
  const many = await openRoom(store, 'gl1', { game_id: 'g_wager', class_id: 'class1', teams: 12 }, { env, fetchImpl, now: T0 });
  assert.equal(many.teams, 4);
  const none = await openRoom(store, 'gl1', { game_id: 'g_wager', class_id: 'class1' }, { env, fetchImpl, now: T0 });
  assert.equal(none.teams, 2);
});
