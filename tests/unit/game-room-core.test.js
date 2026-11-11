// tests/unit/game-room-core.test.js
// Live game rooms (phase 4): the pure reducer the Durable Object wraps, and the tickets both sides sign.
// Runs the generated bundle (netlify/functions/_shared/game-room-core.mjs), the same file the Worker imports.
// Every class, student, term, character and quote is invented (helpers/game-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_LIMITS, classWall, foldPayload, initialState, nextAlarm, publicView, reduce, seatRestore, signBody, signTicket, ticketFromAuthorization, verifyBody, verifyTicket, viewDelta
} from '../../netlify/functions/_shared/game-room-core.mjs';
import { gameStudentAction, prepareGamePublish, storeGameKeys } from '../../netlify/functions/_shared/games.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { GAME_ROSTER, connections, crossword, gameLesson, term, whoSaidIt } from './helpers/game-fixture.mjs';

const T0 = Date.parse('2026-11-11T01:00:00.000Z');
const SECRET = 'test-secret-for-game-rooms-0123456789';

const findAWord = () => ({
  id: 'g_find',
  title: 'Lantern House find-a-word',
  kind: 'find_a_word',
  items: [
    term('f1', 'Simile', 'The fog crept in like a slow grey tide.', { decoys: ['Metaphor'] }),
    term('f2', 'Hyperbole', 'The frost had sat on that roof for a thousand years.'),
    term('f3', 'Oxymoron', 'He smiled with a gentle cruelty.', { decoys: ['Paradox'] }),
    term('f4', 'Motif', 'Moths gather at the glass in every chapter.'),
    term('f5', 'Irony', 'She lights every lamp yet cannot find her way home.'),
    term('f6', 'Gothic', 'A locked wing, a stair that groans at night.')
  ],
  settings: { seed: 4, directions: 'all', hints: true }
});

const PUB = prepareGamePublish(gameLesson({}, [crossword(), whoSaidIt(), connections(), findAWord()]));
assert.deepEqual(PUB.problems, []);
const publicGame = (id) => PUB.snapshot.games.find((g) => g.id === id);
const keysOf = (id) => PUB.record.games[id];
const ROSTER = Object.fromEntries(GAME_ROSTER.map((s) => [s.id, s.initials]));

function room(gameId, over = {}) {
  const game = publicGame(gameId);
  return initialState({
    room: 'room_test1', code: '123456', lesson_id: 'gl1', class_id: 'class1', game, keys: keysOf(gameId),
    style: gameId === 'g_who' ? 'paced' : 'race', roster: ROSTER, fold_url: 'https://example.test/api/games/fold', opened_at: T0, ...over
  }, T0);
}

/** Drives a room and keeps every message it sends, for the no-keys check. */
function driver(state) {
  const sent = [];
  let now = T0;
  const run = (action, at = now) => {
    now = at;
    const out = reduce(state, action, now);
    for (const fx of out.effects) {
      if (fx.kind === 'send' || fx.kind === 'close') sent.push({ to: fx.owner, conn: fx.conn, msg: fx.msg });
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
    join: (n, conn = `c${n}`, at = now) => run({ type: 'connect', owner: `own_${n}`, role: 'student', student_id: GAME_ROSTER[n - 1].id, initials: GAME_ROSTER[n - 1].initials, conn }, at),
    teacher: (conn = 'ct') => run({ type: 'connect', owner: 'teacher', role: 'teacher', conn }),
    control: (op, at = now, rid) => run({ type: 'msg', owner: 'teacher', role: 'teacher', conn: 'ct', msg: { t: 'control', ...(rid ? { rid } : {}), op } }, at),
    move: (n, event, at = now, rid) => run({ type: 'msg', owner: `own_${n}`, role: 'student', conn: `c${n}`, msg: { t: 'move', ...(rid ? { rid } : {}), event } }, at),
    play: (at = now) => { run({ type: 'msg', owner: 'teacher', role: 'teacher', conn: 'ct', msg: { t: 'control', op: { op: 'start' } } }, at); return run({ type: 'tick' }, at + ROOM_LIMITS.countdownMs); }
  };
}

/** Every answer string in a game's keys: none may appear in a message before the player earned it. */
function secretsOf(keys) {
  const out = new Set();
  for (const key of Object.values(keys.items)) {
    if (key.shape === 'term') key.answers.forEach((a) => out.add(a));
    if (key.shape === 'wall') key.groups.forEach((g) => { out.add(g.label); out.add(g.why); });
    if (key.shape === 'quote') { if (key.source) out.add(key.source); if (key.why_fake) out.add(key.why_fake); }
  }
  if (keys.grid?.kind === 'crossword') keys.grid.entries.forEach((e) => out.add(e.word));
  if (keys.grid?.kind === 'wordsearch') keys.grid.placements.forEach((p) => out.add(JSON.stringify([p.x, p.y]).slice(1, -1) + '"'));
  return [...out].filter((s) => s.length > 3);
}
const noKeyFields = (text) => !/"(answers|placements|entries"[^\]]*"word|keys|choices|tiles":\{)/.test(text);

// ─────────────────────────────────────────────────────────────── seats

test('roster seats only; reconnect takes the same seat with a snapshot; newest socket wins', () => {
  const d = driver(room('g_cross'));
  d.teacher();
  const joined = d.join(1);
  assert.ok(joined.some((f) => f.kind === 'send' && f.conn === 'c1' && f.msg.t === 'snapshot'));
  assert.ok(joined.some((f) => f.kind === 'broadcast'));
  assert.equal(d.state.seats.own_1.initials, 'AB');
  // Someone not on the list (a forged roster id) is turned away.
  const stranger = d.run({ type: 'connect', owner: 'own_x', role: 'student', student_id: 'st_nobody', conn: 'cx' });
  assert.deepEqual(stranger.map((f) => [f.kind, f.msg?.code]), [['close', 'not_on_list']]);
  assert.equal(d.state.seats.own_x, undefined);
  // Second device: the first is replaced and closed; the seat is the same seat.
  const again = d.join(1, 'c1b');
  assert.deepEqual(again.filter((f) => f.kind === 'close').map((f) => [f.conn, f.msg.t]), [['c1', 'replaced']]);
  assert.ok(again.some((f) => f.conn === 'c1b' && f.msg?.t === 'snapshot'));
  assert.equal(Object.keys(d.state.seats).length, 1);
  // The replaced socket closing late doesn't take the seat offline.
  assert.deepEqual(d.run({ type: 'disconnect', owner: 'own_1', conn: 'c1' }), []);
  assert.equal(d.state.seats.own_1.connected, true);
  d.run({ type: 'disconnect', owner: 'own_1', conn: 'c1b' });
  assert.equal(d.state.seats.own_1.connected, false);
  d.join(1, 'c1c');
  assert.equal(d.state.seats.own_1.connected, true);
});

test('late joiners are welcome; kick removes a seat for good; the room holds 40', () => {
  const d = driver(room('g_cross'));
  d.teacher();
  d.join(1);
  d.play();
  assert.equal(d.state.phase, 'playing');
  d.join(2);
  assert.equal(d.state.seats.own_2.score, 0);
  const kicked = d.control({ op: 'kick', owner: 'own_2' });
  assert.ok(kicked.some((f) => f.kind === 'close' && f.owner === 'own_2' && f.msg.t === 'kicked'));
  assert.equal(d.state.seats.own_2, undefined);
  assert.deepEqual(d.join(2).map((f) => f.msg?.t), ['kicked'], 'a kicked seat can’t come back');
  const full = room('g_cross', { roster: Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`s${i}`, `A${i}`])) });
  for (let i = 0; i < 40; i += 1) reduce(full, { type: 'connect', owner: `o${i}`, role: 'student', student_id: `s${i}`, conn: `k${i}` }, T0);
  const over = reduce(full, { type: 'connect', owner: 'o41', role: 'student', student_id: 's41', conn: 'k41' }, T0).effects;
  assert.equal(over[0].msg.code, 'room_full');
});

test('students can’t control; moves wait for the start', () => {
  const d = driver(room('g_cross'));
  d.join(1);
  const sneaky = d.run({ type: 'msg', owner: 'own_1', role: 'student', conn: 'c1', msg: { t: 'control', rid: 'r1', op: { op: 'end' } } });
  assert.equal(d.ackOf(sneaky).error.code, 'not_allowed');
  assert.equal(d.ackOf(d.move(1, { item: 't1', move: 'answer', response: { text: 'Simile' } })).error.code, 'not_started');
  const teacherMove = d.run({ type: 'msg', owner: 'teacher', role: 'teacher', conn: 'ct', msg: { t: 'move', event: { item: 't1', move: 'answer' } } });
  assert.equal(d.ackOf(teacherMove).error.code, 'not_a_player');
});

// ─────────────────────────────────────────────────────────────── clock

test('countdown, pause freezes the clock, add_time, resume, end folds once', () => {
  const d = driver(room('g_who'));
  d.teacher();
  d.join(1);
  const start = d.control({ op: 'start' });
  assert.equal(d.state.phase, 'countdown');
  assert.deepEqual(start.find((f) => f.kind === 'alarm'), { kind: 'alarm', at: T0 + ROOM_LIMITS.countdownMs });
  d.run({ type: 'tick' }, T0 + 1000);
  assert.equal(d.state.phase, 'countdown', 'an early tick changes nothing');
  d.run({ type: 'tick' }, T0 + 3000);
  assert.equal(d.state.phase, 'playing');
  assert.equal(d.state.item.item, 'q1');
  assert.equal(d.state.item.ends_at, T0 + 3000 + 20_000);
  d.control({ op: 'pause' }, T0 + 8000);
  assert.equal(d.state.phase, 'paused');
  assert.equal(d.state.paused_left_ms, 15_000);
  const paused = publicView(d.state, 'board', 'board', T0 + 9000);
  assert.equal(paused.ends_at, undefined);
  assert.equal(paused.paused_left_ms, 15_000);
  assert.equal(nextAlarm(d.state), T0 + ROOM_LIMITS.lifeMs, 'no item alarm while paused');
  assert.equal(d.ackOf(d.move(1, { item: 'q1', move: 'answer', response: { speaker: 'c_keeper' } }, T0 + 9000)).error.code, 'paused');
  d.control({ op: 'add_time', seconds: 15 }, T0 + 10_000);
  assert.equal(d.state.paused_left_ms, 30_000);
  d.control({ op: 'resume' }, T0 + 60_000);
  assert.equal(d.state.ends_at, T0 + 90_000);
  assert.equal(d.state.item.ends_at, T0 + 90_000);
  assert.equal(d.state.item.opened_at, T0 + 3000 + 52_000 + 15_000 - 15_000, 'opened_at moves on by the time paused');
  const end = d.control({ op: 'end' }, T0 + 100_000);
  assert.equal(d.state.phase, 'ended');
  assert.equal(end.filter((f) => f.kind === 'fold').length, 1);
  assert.equal(d.ackOf(d.control({ op: 'end' })).error.code, 'ended');
  assert.equal(nextAlarm(d.state), null);
  d.run({ type: 'folded' });
  assert.equal(d.state.phase, 'folded');
});

test('the 6 hour limit ends and folds the room', () => {
  const d = driver(room('g_cross'));
  d.join(1);
  assert.equal(nextAlarm(d.state), T0 + ROOM_LIMITS.lifeMs);
  const fx = d.run({ type: 'tick' }, T0 + ROOM_LIMITS.lifeMs);
  assert.equal(d.state.phase, 'ended');
  assert.ok(fx.some((f) => f.kind === 'fold'));
});

// ─────────────────────────────────────────────────────────────── race marking = solo marking

async function soloStore(games) {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '9 English', students: GAME_ROSTER });
  const draft = gameLesson({}, games);
  store.data.set(draftLessonKey('gl1'), draft);
  // Reuse the room's publish so both sides mark against the same keys.
  store.data.set(publishedLessonKey('gl1'), { lesson_id: 'gl1', pedagogical_mode: 'game', blocks: [], game: PUB.snapshot });
  await storeGameKeys(store, 'gl1', PUB.record);
  return store;
}

async function soloVsLive(gameId, moves) {
  const store = await soloStore();
  await gameStudentAction(store, 'gl1', { action: 'claim', ...who(1), initials: INITIALS[1] }, { now: T0 });
  const { play_id } = await gameStudentAction(store, 'gl1', { action: 'solo_start', ...who(1), game_id: gameId }, { now: T0 });
  const solo = [];
  for (const m of moves) solo.push(...(await gameStudentAction(store, 'gl1', { action: 'solo_event', ...who(1), game_id: gameId, play_id, events: [m] }, { now: T0 })).results);
  const d = driver(room(gameId));
  d.join(1);
  d.play();
  const live = moves.map((m, i) => d.ackOf(d.move(1, m, T0 + 4000, `r${i}`)).result);
  assert.deepEqual(live, solo);
  const strip = (e) => [e.item, e.move, e.correct ?? null, JSON.stringify(e.response ?? null), JSON.stringify(e.extra ?? {})];
  const soloEvents = [...store.data.entries()].find(([k]) => k.includes(`/events/${play_id}/`))?.[1] ?? [];
  assert.deepEqual(d.state.history.own_1.map(strip), soloEvents.map(strip));
  assert.ok(d.state.history.own_1.every((e) => e.strength === 'live_solo' && e.play_id === 'room_test1'));
  return d;
}

test('race crossword marks exactly as solo: right, decoy, hint ladder', async () => {
  const d = await soloVsLive('g_cross', [
    { item: 't1', move: 'answer', response: { text: 'metaphor' } },
    { item: 't2', move: 'answer', response: { text: 'pathetic fallacy' } },
    { item: 't3', move: 'hint', response: { letters: '' } },
    { item: 't3', move: 'hint', response: { letters: 'A' } },
    { item: 't3', move: 'answer', response: { text: 'alliteration' } }
  ]);
  assert.deepEqual(d.state.seats.own_1.progress, { done: 2, total: 6 });
  assert.equal(d.state.seats.own_1.score, 2);
});

test('race find-a-word marks exactly as solo: selections, decoys, Any clue, found again', async () => {
  const grid = keysOf('g_find').grid;
  const place = (word) => grid.placements.find((p) => p.word === word);
  const ends = (p) => ({ from: [p.x, p.y], to: [p.x + p.dx * (p.word.length - 1), p.y + p.dy * (p.word.length - 1)] });
  await soloVsLive('g_find', [
    { item: 'f1', move: 'answer', response: ends(place('SIMILE')) },
    { item: 'f3', move: 'answer', response: ends(place('PARADOX')) },
    { item: 'f4', move: 'answer', response: { from: [0, 0], to: [0, 1] } },
    { item: 'any', move: 'answer', response: ends(place('MOTIF')) },
    { item: 'f1', move: 'answer', response: ends(place('SIMILE')) },
    { item: 'f2', move: 'hint' }
  ]);
});

test('race Connections marks exactly as solo: group, one away, mistakes, out-of-mistakes reveal', async () => {
  const game = publicGame('g_wall');
  const tiles = Object.fromEntries(game.walls[0].tiles.map((t) => [t.text, t.id]));
  const guess = (words) => ({ item: 'w1', move: 'guess', response: { tiles: words.map((w) => tiles[w]) } });
  const d = await soloVsLive('g_wall', [
    guess(['Persona', 'Tone', 'Register', 'Dialect']),
    guess(['Sibilance', 'Assonance', 'Onomatopoeia', 'Simile']),
    { item: 'w1', move: 'pass' },
    guess(['Simile', 'Metaphor', 'Enjambment', 'Caesura']),
    guess(['Volta', 'Refrain', 'Analogy', 'Plosives']),
    guess(['Simile', 'Metaphor', 'Analogy', 'Volta']),
    { item: 'w1', move: 'pass' }
  ]);
  const seat = d.state.seats.own_1;
  assert.deepEqual(seat.progress, { done: 1, total: 4, mistakes: 4, mistakes_max: 4, groups: [4] });
  assert.equal(seat.finished, true, 'out of mistakes on every wall');
  // The board's Class wall: pairs from different groups, anonymous, tile text only.
  const wall = classWall(d.state);
  assert.ok(wall.length > 0 && wall.length <= 8);
  assert.deepEqual(wall.find((p) => p.a === 'Analogy' && p.b === 'Volta'), { a: 'Analogy', b: 'Volta', count: 2 });
  assert.ok(!wall.some((p) => (p.a === 'Analogy' && p.b === 'Simile') || (p.a === 'Metaphor' && p.b === 'Simile')), 'same-group pairs aren’t confusions');
  assert.equal(publicView(d.state, 'board', 'board').class_wall, undefined, 'board shows it only when switched');
  d.control({ op: 'board_view', view: 'class_wall' });
  assert.deepEqual(publicView(d.state, 'board', 'board').class_wall, wall);
  assert.equal(publicView(d.state, 'board', 'board').board_view, 'class_wall');
  assert.equal(publicView(d.state, 'student', 'own_1').class_wall, undefined);
});

// ─────────────────────────────────────────────────────────────── restore after a reload

/** The snapshot a seat gets when it connects again (a reloaded phone). */
const reconnectView = (d, n, conn) => d.join(n, conn).find((f) => f.kind === 'send' && f.conn === conn && f.msg.t === 'snapshot').msg.view;

test('restore (crossword): a reconnecting seat gets only its own solved words, letters and hints; no keys, not in deltas', () => {
  const d = driver(room('g_cross'));
  d.teacher();
  d.join(1);
  d.join(2);
  d.play();
  const at = T0 + 4000;
  d.move(1, { item: 't1', move: 'answer', response: { text: 'SIMILE' } }, at);
  d.move(1, { item: 't2', move: 'answer', response: { text: 'metaphor' } }, at);
  d.move(1, { item: 't3', move: 'hint', response: { letters: '' } }, at);
  d.move(1, { item: 't5', move: 'hint', response: { letters: '' } }, at);
  d.move(1, { item: 't5', move: 'hint', response: { letters: '' } }, at);
  d.move(1, { item: 't5', move: 'hint', response: { letters: '' } }, at);
  d.move(1, { item: 't5', move: 'answer', response: { text: 'HYPERBOLE' }, extra: { hints: 3 } }, at);
  d.move(2, { item: 't4', move: 'answer', response: { text: 'SIBILANCE' } }, at);
  const view = reconnectView(d, 1, 'c1r');
  assert.deepEqual(view.you.restore, {
    solved: [{ item: 't1', hints: 0, text: 'SIMILE' }, { item: 't5', hints: 3, text: 'HYPERBOLE' }],
    hints: { t3: { step: 1 } }
  });
  const text = JSON.stringify(view.you.restore);
  for (const word of ['SIBILANCE', 'Sibilance', 'ALLITERATION', 'Alliteration', 'PATHETIC', 'Oxymoron', 'OXYMORON']) assert.ok(!text.includes(word), `${word} isn’t this seat’s`);
  assert.ok(!text.includes('t4'), 'another seat’s word stays out');
  assert.deepEqual(reconnectView(d, 2, 'c2r').you.restore, { solved: [{ item: 't4', hints: 0, text: 'SIBILANCE' }] });
  // Only in the connect (and hello) snapshot: broadcast views and the board never carry it.
  assert.equal(publicView(d.state, 'student', 'own_1').you.restore, undefined);
  assert.equal(publicView(d.state, 'board', 'board').you.restore, undefined);
  const hello = d.run({ type: 'msg', owner: 'own_1', role: 'student', conn: 'c1r', msg: { t: 'hello' } });
  assert.deepEqual(hello.find((f) => f.msg?.t === 'snapshot').msg.view.you.restore, view.you.restore);
  // A seat with no moves yet, and paced games, restore nothing.
  assert.equal(reconnectView(d, 3, 'c3r').you.restore, undefined);
  const p = driver(room('g_who'));
  p.join(1);
  p.play();
  p.move(1, { item: p.state.item.item, move: 'answer', response: { speaker: 'c_keeper' } }, T0 + 4000);
  assert.equal(seatRestore(p.state, 'own_1'), undefined);
});

test('restore (find-a-word): own found lines and the hints they showed; the message only once every word is found', () => {
  const grid = keysOf('g_find').grid;
  const place = (word) => grid.placements.find((p) => p.word === word && !p.decoy);
  const ends = (p) => ({ from: [p.x, p.y], to: [p.x + p.dx * (p.word.length - 1), p.y + p.dy * (p.word.length - 1)] });
  const d = driver(room('g_find'));
  d.join(1);
  d.join(2);
  d.play();
  const at = T0 + 4000;
  d.move(1, { item: 'f1', move: 'answer', response: ends(place('SIMILE')) }, at);
  d.move(1, { item: 'f2', move: 'hint' }, at);
  d.move(1, { item: 'f2', move: 'hint' }, at);
  d.move(1, { item: 'f3', move: 'answer', response: ends(grid.placements.find((p) => p.word === 'PARADOX')) }, at);
  d.move(2, { item: 'f4', move: 'answer', response: ends(place('MOTIF')) }, at);
  const r = reconnectView(d, 1, 'c1r').you.restore;
  assert.deepEqual(r.solved, [{ item: 'f1', hints: 0, text: 'SIMILE', ...ends(place('SIMILE')) }]);
  const hp = place('HYPERBOLE');
  assert.deepEqual(r.hints, { f2: { step: 2, first: 'H', length: hp.word.length } }, 'the hints this seat used, no line before step 3');
  assert.equal(r.message, undefined);
  assert.ok(!JSON.stringify(r).includes('MOTIF') && !JSON.stringify(r).includes('OXYMORON'));
  // Every word found: the hidden message came back with the last one, so it comes back on reload too.
  for (const [id, w] of [['f2', 'HYPERBOLE'], ['f3', 'OXYMORON'], ['f4', 'MOTIF'], ['f5', 'IRONY'], ['f6', 'GOTHIC']]) d.move(1, { item: id, move: 'answer', response: ends(place(w)) }, at);
  const all = seatRestore(d.state, 'own_1');
  assert.equal(all.solved.length, 6);
  assert.deepEqual(all.message, grid.message ?? undefined);
});

test('restore (Connections): own groups found, guesses and mistakes; the rest only once out of mistakes', () => {
  const game = publicGame('g_wall');
  const tiles = Object.fromEntries(game.walls[0].tiles.map((t) => [t.text, t.id]));
  const guess = (words) => ({ item: 'w1', move: 'guess', response: { tiles: words.map((w) => tiles[w]) } });
  const d = driver(room('g_wall'));
  d.join(1);
  d.join(2);
  d.play();
  const at = T0 + 4000;
  d.move(1, guess(['Persona', 'Tone', 'Register', 'Dialect']), at);
  d.move(1, guess(['Sibilance', 'Assonance', 'Onomatopoeia', 'Simile']), at);
  d.move(2, guess(['Enjambment', 'Caesura', 'Volta', 'Refrain']), at);
  const r = reconnectView(d, 1, 'c1r').you.restore;
  assert.deepEqual(r, {
    walls: [{
      wall: 'w1',
      groups: [{ id: 'grp_voice', label: 'Voice', why: 'They are all voice.', difficulty: 4, tiles: keysOf('g_wall').items.w1.groups.find((x) => x.id === 'grp_voice').tiles, found: true }],
      guesses: [{ tiles: ['Persona', 'Tone', 'Register', 'Dialect'].map((w) => tiles[w]), correct: true }, { tiles: ['Sibilance', 'Assonance', 'Onomatopoeia', 'Simile'].map((w) => tiles[w]), correct: false }],
      mistakes: 1,
      out: false
    }]
  });
  const text = JSON.stringify(r);
  for (const label of ['Structure', 'Sound devices', 'Comparisons']) assert.ok(!text.includes(label), `${label} isn’t found yet`);
  // Out of mistakes: the groups not found come back, as the pass shows them.
  for (const w of [['Simile', 'Metaphor', 'Enjambment', 'Caesura'], ['Volta', 'Refrain', 'Analogy', 'Plosives'], ['Simile', 'Metaphor', 'Analogy', 'Volta']]) d.move(1, guess(w), at);
  const out = seatRestore(d.state, 'own_1').walls[0];
  assert.equal(out.out, true);
  assert.equal(out.mistakes, 4);
  assert.deepEqual(out.groups.map((g) => [g.id, g.found]), [['grp_voice', true], ['grp_sound', false], ['grp_comp', false], ['grp_struct', false]]);
});

// ─────────────────────────────────────────────────────────────── race board

test('race board: progress per seat, first-to-solve ticker without answers, top 5', () => {
  const roster = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`s${i}`, `S${i}`]));
  const s = room('g_wall', { roster });
  const tiles = Object.fromEntries(publicGame('g_wall').walls[0].tiles.map((t) => [t.text, t.id]));
  const g = (words) => ({ item: 'w1', move: 'guess', response: { tiles: words.map((w) => tiles[w]) } });
  for (let i = 0; i < 7; i += 1) reduce(s, { type: 'connect', owner: `o${i}`, role: 'student', student_id: `s${i}`, conn: `k${i}` }, T0);
  reduce(s, { type: 'msg', owner: 'teacher', role: 'teacher', msg: { t: 'control', op: { op: 'start' } } }, T0);
  reduce(s, { type: 'tick' }, T0 + 3000);
  const mv = (i, ev, at) => reduce(s, { type: 'msg', owner: `o${i}`, role: 'student', conn: `k${i}`, msg: { t: 'move', event: ev } }, at);
  mv(3, g(['Persona', 'Tone', 'Register', 'Dialect']), T0 + 5000);
  mv(1, g(['Persona', 'Tone', 'Register', 'Dialect']), T0 + 6000);
  mv(1, g(['Sibilance', 'Assonance', 'Onomatopoeia', 'Plosives']), T0 + 7000);
  const board = publicView(s, 'board', 'board', T0 + 8000);
  assert.deepEqual(board.ticker.map((x) => [x.initials, x.text]), [['S1', 'found the gold group'], ['S3', 'found the purple group']]);
  assert.deepEqual(board.leaderboard.slice(0, 2), [{ initials: 'S1', score: 2, rank: 1 }, { initials: 'S3', score: 1, rank: 2 }]);
  assert.equal(board.leaderboard.length, 5, 'top 5 only');
  assert.equal(board.seats.length, 7, 'board sees every seat');
  assert.deepEqual(board.seats[0].progress.groups, [4, 1]);
  const phone = publicView(s, 'student', 'o3', T0 + 8000);
  assert.deepEqual(phone.seats, [], 'a phone sees only its own seat');
  assert.equal(phone.you.rank, 2);
  assert.equal(phone.you.seat.score, 1);
  assert.equal(phone.you.last.reveal.group.label, 'Voice', 'its own found group, as in solo');
  const crossBoard = driver(room('g_cross'));
  crossBoard.join(1);
  crossBoard.play();
  crossBoard.move(1, { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' } });
  const entry = publicGame('g_cross').grid.entries.find((x) => x.item === 't2');
  assert.deepEqual(crossBoard.state.ticker.map((x) => x.text), [`solved ${entry.number} ${entry.dir}`]);
});

// ─────────────────────────────────────────────────────────────── paced

test('paced Who said it: one answer each, no verdict until the reveal, counts, speed points, fake doubled', () => {
  const d = driver(room('g_who'));
  d.teacher();
  d.join(1);
  d.join(2);
  d.join(3);
  d.play(T0);
  const open = T0 + 3000;
  assert.equal(d.state.item.item, 'q1');
  // q1 is the Keeper's. Ann right at once, Cy right at 10 s, Ed wrong.
  const a1 = d.ackOf(d.move(1, { item: 'q1', move: 'answer', response: { speaker: 'c_keeper' }, time_ms: 1 }, open, 'r1'));
  assert.deepEqual(a1.result, { item: 'q1' }, 'received, not marked');
  assert.equal(d.ackOf(d.move(1, { item: 'q1', move: 'answer', response: { speaker: 'c_gull' } }, open + 100, 'r2')).error.code, 'answered');
  assert.deepEqual(d.ackOf(d.move(1, { item: 'q1', move: 'answer', response: { speaker: 'c_keeper' } }, open + 200, 'r1')).result, { item: 'q1' }, 'a resent rid is answered from memory');
  assert.equal(d.ackOf(d.move(2, { item: 'q2', move: 'answer', response: { speaker: 'c_gull' } }, open)).error.code, 'not_open');
  d.move(2, { item: 'q1', move: 'answer', response: { speaker: 'c_keeper' } }, open + 10_000);
  assert.deepEqual(publicView(d.state, 'board', 'board').item.answered, ['own_1', 'own_2']);
  assert.equal(publicView(d.state, 'board', 'board').item.revealed, undefined);
  d.move(3, { item: 'q1', move: 'answer', response: { speaker: 'c_gull' } }, open + 12_000);
  // Everyone in has answered: the reveal comes at once.
  const item = publicView(d.state, 'board', 'board').item;
  assert.deepEqual(item.revealed.counts, { c_keeper: 2, c_gull: 1 });
  assert.deepEqual(item.revealed.reveal, { speaker: 'c_keeper', source: 'Chapter 1' });
  assert.equal(d.state.seats.own_1.score, 200);
  assert.equal(d.state.seats.own_2.score, 150);
  assert.equal(d.state.seats.own_3.score, 0);
  assert.deepEqual(publicView(d.state, 'student', 'own_3').you.last, { item: 'q1', correct: false, reveal: { speaker: 'c_keeper', source: 'Chapter 1' } });
  // On to the fake (q5): next, next, next, next.
  for (let i = 0; i < 4; i += 1) d.control({ op: 'next' }, open + 20_000 + i);
  assert.equal(d.state.item.item, 'q5');
  const o5 = d.state.item.opened_at;
  d.move(1, { item: 'q5', move: 'answer', response: { speaker: 'fake' } }, o5 + 5000);
  d.move(2, { item: 'q5', move: 'answer', response: { speaker: 'c_gull' } }, o5 + 5000);
  d.control({ op: 'reveal' }, o5 + 6000);
  assert.equal(d.state.seats.own_1.score, 200 + (100 + 80) * 2, 'caught fake: doubled, with speed');
  assert.deepEqual(d.state.item.revealed.counts, { fake: 1, c_gull: 1 });
  assert.match(d.state.item.revealed.reveal.why_fake, /never leaves/);
  // The item timer: unanswered seats get the reveal too.
  d.control({ op: 'next' }, o5 + 7000);
  d.run({ type: 'tick' }, d.state.item.ends_at);
  assert.ok(d.state.item.revealed);
  assert.deepEqual(Object.keys(d.state.item.revealed.counts), []);
  // Past the last item: the game ends and folds.
  d.control({ op: 'next' });
  d.control({ op: 'next' });
  const last = d.control({ op: 'next' });
  assert.equal(d.state.phase, 'ended');
  assert.ok(last.some((f) => f.kind === 'fold'));
});

test('paced: a paused item doesn’t count against speed', () => {
  const d = driver(room('g_who'));
  d.join(1);
  d.join(2);
  d.play(T0);
  const open = T0 + 3000;
  d.control({ op: 'pause' }, open + 2000);
  d.control({ op: 'resume' }, open + 60_000);
  d.move(1, { item: 'q1', move: 'answer', response: { speaker: 'c_keeper' } }, open + 60_000);
  d.control({ op: 'reveal' }, open + 61_000);
  assert.equal(d.state.seats.own_1.score, 190, 'answered 2 s in, not 60 s');
});

// ─────────────────────────────────────────────────────────────── dedupe, rate limit, fold

test('a resent move (same rid or cid) is stored once and answered the same', () => {
  const d = driver(room('g_cross'));
  d.join(1);
  d.play();
  const first = d.ackOf(d.move(1, { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' }, cid: 'cid_000001' }, T0 + 4000, 'rid1'));
  const byRid = d.ackOf(d.move(1, { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' }, cid: 'cid_000001' }, T0 + 4100, 'rid1'));
  const byCid = d.ackOf(d.move(1, { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' }, cid: 'cid_000001' }, T0 + 4200, 'rid2'));
  assert.deepEqual(byRid, first);
  assert.deepEqual(byCid.result, first.result);
  assert.equal(d.state.history.own_1.length, 1);
});

test('rate limit: past the burst a seat’s messages are dropped until the window turns', () => {
  const d = driver(room('g_cross'));
  d.join(1);
  d.play();
  let dropped = 0;
  for (let i = 0; i < ROOM_LIMITS.burst + 5; i += 1) {
    const a = d.ackOf(d.move(1, { item: 't3', move: 'answer', response: { text: `guess${i}` } }, T0 + 4000));
    if (a.error?.code === 'slow_down') dropped += 1;
  }
  assert.equal(dropped, 5);
  assert.equal(d.state.history.own_1.length, ROOM_LIMITS.burst);
  assert.equal(d.ackOf(d.move(1, { item: 't3', move: 'answer', response: { text: 'x' } }, T0 + 14_001)).error, undefined);
  // A bad move shape is refused, not stored.
  assert.equal(d.ackOf(d.move(1, { item: '../x', move: 'answer' }, T0 + 14_002)).error.code, 'bad_event');
  assert.equal(d.ackOf(d.move(1, { item: 'zz', move: 'answer' }, T0 + 14_003)).error.code, 'bad_item');
});

test('fold payload: every seat (kicked ones too) and every move, live_solo, no replies or keys', () => {
  const d = driver(room('g_cross'));
  d.teacher();
  d.join(1);
  d.join(2);
  d.play(T0);
  d.move(1, { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' }, cid: 'cid_abcdef' }, T0 + 5000);
  d.move(2, { item: 't1', move: 'answer', response: { text: 'Simile' } }, T0 + 6000);
  d.control({ op: 'kick', owner: 'own_2' }, T0 + 7000);
  const fx = d.control({ op: 'end' }, T0 + 9000);
  const fold = fx.find((f) => f.kind === 'fold').payload;
  assert.deepEqual(foldPayload(d.state), fold);
  assert.deepEqual({ ...fold, seats: undefined, events: undefined }, { room: 'room_test1', lesson_id: 'gl1', class_id: 'class1', game_id: 'g_cross', kind: 'crossword', started_at: T0 + 3000, ended_at: T0 + 9000, strength: 'live_solo', seats: undefined, events: undefined });
  assert.deepEqual(fold.seats.sort((a, b) => a.initials.localeCompare(b.initials)), [{ owner: 'own_1', student_id: 'st_ann', initials: 'AB', score: 1 }, { owner: 'own_2', student_id: 'st_cy', initials: 'CD', score: 1 }]);
  assert.deepEqual(fold.events.map((e) => [e.owner, e.item, e.correct, e.strength, e.seq]), [['own_1', 't2', true, 'live_solo', 0], ['own_2', 't1', true, 'live_solo', 0]]);
  assert.ok(fold.events.every((e) => !('reply' in e)));
  assert.equal(d.ackOf(d.move(1, { item: 't3', move: 'answer' })).error.code, 'ended');
});

test('no key ever leaves the room: every message to every viewer, before anyone earns an answer', () => {
  for (const gameId of ['g_cross', 'g_find', 'g_wall', 'g_who']) {
    const d = driver(room(gameId));
    d.teacher();
    d.run({ type: 'connect', owner: 'board', role: 'board', conn: 'cb' });
    d.join(1);
    d.join(2);
    d.play();
    d.run({ type: 'msg', owner: 'own_1', role: 'student', conn: 'c1', msg: { t: 'hello' } });
    d.run({ type: 'msg', owner: 'own_1', role: 'student', conn: 'c1', msg: { t: 'ping', sent: 5 } });
    // Wrong moves only: nothing earned, so nothing may be shown.
    const wrong = gameId === 'g_wall'
      ? { item: 'w1', move: 'guess', response: { tiles: publicGame('g_wall').walls[0].tiles.slice(0, 4).map((t) => t.id) } }
      : gameId === 'g_who' ? { item: 'q1', move: 'answer', response: { speaker: 'c_gull' } }
        : gameId === 'g_find' ? { item: 'f1', move: 'answer', response: { from: [0, 0], to: [0, 2] } }
          : { item: 't3', move: 'answer', response: { text: 'nothing like it' } };
    d.move(1, wrong);
    d.control({ op: 'board_view', view: 'class_wall' });
    d.control({ op: 'pause' });
    d.control({ op: 'resume' });
    d.control({ op: 'add_time', seconds: 10 });
    d.run({ type: 'msg', owner: 'own_2', role: 'student', conn: 'c2', msg: { t: 'finish' } });
    d.control({ op: 'kick', owner: 'own_2' });
    const types = new Set(d.sent.map((m) => m.msg.t));
    for (const t of ['snapshot', 'pong', 'ack', 'replaced', 'kicked'].filter((x) => x !== 'replaced')) assert.ok(types.has(t), `${gameId}: ${t} sent`);
    d.join(1, 'c1-new');
    assert.ok(d.sent.some((m) => m.msg.t === 'replaced'));
    for (const m of d.sent) {
      const text = JSON.stringify(m.msg);
      assert.ok(noKeyFields(text), `${gameId} ${m.msg.t}: key-shaped field`);
      for (const secret of secretsOf(keysOf(gameId))) {
        // A wrong guess on the wall can echo tile texts in the class wall (public tiles), never a group label or why.
        assert.ok(!text.includes(secret), `${gameId} ${m.msg.t} to ${m.to}: "${secret}"`);
      }
    }
    // Deltas carry only view fields.
    const before = publicView(d.state, 'board', 'board', d.now);
    d.join(3);
    const patch = viewDelta(before, publicView(d.state, 'board', 'board', d.now + 1));
    assert.ok(patch && 'seats' in patch && !('now' in patch));
  }
});

test('viewDelta: changed fields only; a removed field asks for a snapshot', () => {
  const a = { room: 'r', phase: 'playing', seats: [], seq: 1, now: 1, ends_at: 5 };
  assert.deepEqual(viewDelta(a, { ...a, seq: 2, now: 2, phase: 'paused', ends_at: 5 }), { phase: 'paused' });
  const { ends_at: _e, ...b } = a;
  assert.equal(viewDelta(a, b), null);
});

// ─────────────────────────────────────────────────────────────── tickets and signed bodies

test('tickets: sign, verify, expiry, tamper, wrong room or role', async () => {
  const t = await signTicket(SECRET, { room: 'room_a', role: 'student', owner: 'own_1', student_id: 'st_ann', initials: 'AB' }, T0);
  const ok = await verifyTicket(SECRET, t, T0 + 1000, { room: 'room_a', roles: ['student'] });
  assert.equal(ok.ok, true);
  assert.equal(ok.ticket.exp, T0 + 3 * 60 * 60 * 1000);
  assert.equal((await verifyTicket(SECRET, t, T0 + 3 * 60 * 60 * 1000)).code, 'expired');
  assert.equal((await verifyTicket(SECRET, t, T0, { room: 'room_b' })).code, 'wrong_room');
  assert.equal((await verifyTicket(SECRET, t, T0, { roles: ['teacher', 'board'] })).code, 'wrong_role');
  assert.equal((await verifyTicket('another-secret-0123456789abcdef', t, T0)).code, 'bad_ticket');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), role: 'teacher' })).toString('base64url');
  assert.equal((await verifyTicket(SECRET, `${forged}.${sig}`, T0)).code, 'bad_ticket');
  assert.equal((await verifyTicket(SECRET, `${body}.${sig}x`, T0)).code, 'bad_ticket');
  assert.equal((await verifyTicket(SECRET, 'nonsense', T0)).code, 'bad_ticket');
  assert.equal((await verifyTicket(SECRET, null, T0)).code, 'bad_ticket');
  const teacher = await verifyTicket(SECRET, await signTicket(SECRET, { room: 'room_a', role: 'teacher', owner: 'teacher' }, T0), T0 + 5 * 60 * 60 * 1000);
  assert.equal(teacher.ok, true, 'teacher tickets last 6 h');
  assert.equal(ticketFromAuthorization(`Ticket ${t}`), t);
  assert.equal(ticketFromAuthorization('Bearer x'), null);
  await assert.rejects(signTicket('short', { room: 'r', role: 'board', owner: 'board' }, T0));
});

test('signed bodies: right secret and body within five minutes only', async () => {
  const body = JSON.stringify({ room: 'room_a' });
  const sig = await signBody(SECRET, body, T0);
  assert.equal(await verifyBody(SECRET, body, sig, T0 + 60_000), true);
  assert.equal(await verifyBody(SECRET, body, sig, T0 + 6 * 60_000), false);
  assert.equal(await verifyBody(SECRET, `${body} `, sig, T0), false);
  assert.equal(await verifyBody('another-secret-0123456789abcdef', body, sig, T0), false);
  assert.equal(await verifyBody(SECRET, body, null, T0), false);
});
