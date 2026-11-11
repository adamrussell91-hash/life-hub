// tests/unit/game-rooms.test.js
// Live game rooms, the Netlify half: open (teacher), rooms (resume), join (student, by code) and the signed
// fold from the Worker, written like solo play with strength live_solo. The room in between is the real
// reducer (game-room-core.mjs). Every class, student, term and quote is invented (helpers/game-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameKeys, prepareGamePublish, storeGameKeys } from '../../netlify/functions/_shared/games.mjs';
import { foldRoom, joinRoom, listRooms, openRoom } from '../../netlify/functions/_shared/game-rooms.mjs';
import { roomCodeKey } from '../../netlify/functions/_shared/game-store.mjs';
import { SIGNATURE_HEADER, initialState, reduce, signBody, verifyBody, verifyTicket } from '../../netlify/functions/_shared/game-room-core.mjs';
import { createGameFoldHandler } from '../../netlify/functions/games-fold.mjs';
import { organiserKey } from '../../netlify/functions/_shared/organiser.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { classKey, draftLessonKey, publishedLessonKey, unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { gameStudentAction } from '../../netlify/functions/_shared/games.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { GAME_ROSTER, gameLesson } from './helpers/game-fixture.mjs';

const NOW = Date.parse('2026-11-11T01:00:00.000Z');
const SECRET = 'netlify-test-secret-0123456789abcdef';
const ENV = { GAME_ROOM_SECRET: SECRET, GAME_ROOMS_URL: 'https://rooms.example.test/g', URL: 'https://hub.example.test' };

async function setup({ students = GAME_ROSTER } = {}) {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '9 English', students, current_unit_id: 'unit1' });
  store.data.set(classKey('class2'), { id: 'class2', status: 'active', title: '10 English', students: [{ id: 'st_zed', name: 'Zed Young', initials: 'ZY' }] });
  store.data.set(unitKey('unit1'), { id: 'unit1', title: 'Harbour Lights', lesson_ids: ['gl1'] });
  store.data.set(organiserKey('unit1'), { v: 2, sections: [{ id: 'os_vocab', name: 'Vocabulary', kind: 'table', role: 'vocab', columns: [], lines: [{ id: 'ol_simile', cells: ['Simile', 'A comparison using like or as', ''], piece_id: 'kp_sim1', open: true }] }] });
  const draft = gameLesson();
  store.data.set(draftLessonKey('gl1'), draft);
  const pub = prepareGamePublish(draft);
  store.data.set(publishedLessonKey('gl1'), { lesson_id: 'gl1', pedagogical_mode: 'game', blocks: [], game: pub.snapshot });
  await storeGameKeys(store, 'gl1', pub.record);
  return { store, pub };
}

/** A stand-in Worker: keeps each create call and answers 201 (or `status`). */
function worker(status = 201) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: init.body, sig: init.headers[SIGNATURE_HEADER] });
      return new Response('{}', { status });
    }
  };
}

const rejects = (p, code) => assert.rejects(p, (e) => e.code === code);

test('open: a signed room config with the published game, its keys and initials only; tickets for teacher and board', async () => {
  const { store, pub } = await setup();
  const w = worker();
  const opened = await openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW });
  assert.match(opened.room, /^gr[a-f0-9]{20}$/);
  assert.match(opened.code, /^\d{6}$/);
  assert.equal(opened.ws_base, 'wss://rooms.example.test/g');
  assert.equal(opened.http_base, 'https://rooms.example.test/g');
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].url, 'https://rooms.example.test/g/rooms');
  assert.equal(await verifyBody(SECRET, w.calls[0].body, w.calls[0].sig, NOW), true);
  const config = JSON.parse(w.calls[0].body);
  assert.deepEqual(config.roster, { st_ann: 'AB', st_cy: 'CD', st_ed: 'EF' });
  assert.ok(!w.calls[0].body.includes('Ann Bell'), 'no names leave Netlify');
  assert.deepEqual(config.keys, pub.record.games.g_cross);
  assert.deepEqual(config.game, pub.snapshot.games[0]);
  assert.equal(config.style, 'race');
  assert.equal(config.fold_url, 'https://hub.example.test/api/games/fold');
  const t = await verifyTicket(SECRET, opened.teacher_ticket, NOW + 5 * 3600_000, { room: opened.room, roles: ['teacher'] });
  assert.equal(t.ok, true);
  assert.equal((await verifyTicket(SECRET, opened.board_ticket, NOW, { room: opened.room, roles: ['board'] })).ok, true);
  assert.deepEqual(store.data.get(roomCodeKey(opened.code)), { room: opened.room, lesson_id: 'gl1', game_id: 'g_cross', class_id: 'class1', opened_at: NOW, folded: false, code: opened.code });
  assert.equal(store.data.get(gameKeys('gl1').room('g_cross', opened.room)).version, pub.record.version);
  // Who said it plays paced, with its own seconds.
  const paced = await openRoom(store, 'gl1', { game_id: 'g_who', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW });
  assert.equal(JSON.parse(w.calls[1].body).style, 'paced');
  assert.equal(JSON.parse(w.calls[1].body).item_seconds, 20);
  assert.notEqual(paced.code, opened.code);
});

test('open refuses: no secret, not live yet, no class list, unknown game, Worker down (code freed)', async () => {
  const { store } = await setup();
  const w = worker();
  await rejects(openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: {}, fetchImpl: w.fetchImpl, now: NOW }), 'not_configured');
  await rejects(openRoom(store, 'gl1', { game_id: 'g_wager', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW }), 'not_live_yet');
  await rejects(openRoom(store, 'gl1', { game_id: 'nope', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW }), 'bad_game');
  await rejects(openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'nope' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW }), 'not_found');
  const empty = await setup({ students: [] });
  await rejects(openRoom(empty.store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW }), 'no_list');
  const down = worker(500);
  await rejects(openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: down.fetchImpl, now: NOW }), 'room_unavailable');
  assert.ok(![...store.data.keys()].some((k) => k.startsWith('game-rooms/codes/')), 'a room that didn’t open keeps no code');
  await rejects(openRoom(store, 'gl_none', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW }), 'not_published');
});

test('rooms: the open ones with fresh tickets, newest first; folded and 6-hour-old rooms drop off', async () => {
  const { store } = await setup();
  const w = worker();
  const a = await openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW });
  const b = await openRoom(store, 'gl1', { game_id: 'g_wall', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW + 1000 });
  const listed = await listRooms(store, 'gl1', { env: ENV, now: NOW + 2000 });
  assert.deepEqual(listed.rooms.map((r) => [r.room, r.code, r.game_id]), [[b.room, b.code, 'g_wall'], [a.room, a.code, 'g_cross']]);
  assert.equal((await verifyTicket(SECRET, listed.rooms[0].teacher_ticket, NOW + 2000, { room: b.room, roles: ['teacher'] })).ok, true);
  assert.deepEqual((await listRooms(store, 'gl1', { env: ENV, now: NOW + 6 * 3600_000 + 1000 })).rooms, []);
});

test('join: initials first, then the code gives a ticket for the student’s own seat (the solo owner)', async () => {
  const { store } = await setup();
  const opened = await openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: worker().fetchImpl, now: NOW });
  const join = (n, extra = {}) => joinRoom(store, 'gl1', { action: 'join', code: opened.code, ...who(n), ...extra }, { env: ENV, now: NOW });
  await rejects(join(1), 'need_initials');
  await gameStudentAction(store, 'gl1', { action: 'claim', ...who(1), initials: INITIALS[1] }, { now: NOW });
  await rejects(join(1, { code: '000000' === opened.code ? '000001' : '000000' }), 'bad_code');
  await rejects(join(1, { code: '12ab' }), 'bad_code');
  await rejects(join(1, { game_id: 'g_wall' }), 'bad_code');
  await rejects(joinRoom(store, 'gl1', { code: opened.code }, { env: ENV, now: NOW }), 'need_class');
  const joined = await join(1, { code: ` ${opened.code.slice(0, 3)} ${opened.code.slice(3)} ` });
  assert.equal(joined.room, opened.room);
  assert.equal(joined.game_id, 'g_cross');
  assert.equal(joined.initials, 'AB');
  const t = await verifyTicket(SECRET, joined.ticket, NOW + 2 * 3600_000, { room: opened.room, roles: ['student'] });
  assert.equal(t.ok, true);
  assert.equal(t.ticket.owner, workOwner('class1', 'st_ann'));
  assert.equal(t.ticket.student_id, 'st_ann');
  assert.ok(!JSON.stringify(t.ticket).includes('Ann Bell'));
  // Another class's student can't use this class's code.
  await rejects(joinRoom(store, 'gl1', { code: opened.code, class_id: 'class2', class_token: 'a'.repeat(48) }, { env: ENV, now: NOW }), 'need_initials');
  // Six hours on, the code is closed.
  await rejects(joinRoom(store, 'gl1', { action: 'join', code: opened.code, ...who(1) }, { env: ENV, now: NOW + 6 * 3600_000 }), 'bad_code');
});

test('fold: a real room’s results become live plays, live_solo evidence, box 1 and the summary; idempotent', async () => {
  const { store } = await setup();
  const w = worker();
  const opened = await openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW });
  const config = JSON.parse(w.calls[0].body);
  const state = initialState(config, NOW);
  const seat = (id) => ({ owner: workOwner('class1', id), student_id: id });
  const ann = seat('st_ann');
  const cy = seat('st_cy');
  reduce(state, { type: 'connect', role: 'student', ...ann, conn: 'a' }, NOW);
  reduce(state, { type: 'connect', role: 'student', ...cy, conn: 'c' }, NOW);
  reduce(state, { type: 'msg', owner: 'teacher', role: 'teacher', msg: { t: 'control', op: { op: 'start' } } }, NOW);
  reduce(state, { type: 'tick' }, NOW + 3000);
  const move = (s, event, at) => reduce(state, { type: 'msg', owner: s.owner, role: 'student', conn: 'x', msg: { t: 'move', event } }, at);
  move(ann, { item: 't1', move: 'answer', response: { text: 'Metaphor' }, time_ms: 4000 }, NOW + 7000);
  move(ann, { item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' }, time_ms: 5000 }, NOW + 9000);
  move(cy, { item: 't3', move: 'answer', response: { text: 'Alliteration' } }, NOW + 9500);
  const ended = reduce(state, { type: 'msg', owner: 'teacher', role: 'teacher', msg: { t: 'control', op: { op: 'end' } } }, NOW + 60_000);
  const payload = ended.effects.find((f) => f.kind === 'fold').payload;
  // Through the function: unsigned and wrongly signed folds are refused.
  const handler = createGameFoldHandler({ env: ENV, getContentStore: async () => store, now: () => NOW + 61_000 });
  const text = JSON.stringify(payload);
  const post = async (sig) => handler(new Request('https://hub.example.test/api/games/fold', { method: 'POST', body: text, headers: sig ? { [SIGNATURE_HEADER]: sig } : {} }));
  assert.equal((await post(null)).status, 401);
  assert.equal((await post(await signBody('another-secret-0123456789abcdef', text, NOW + 61_000))).status, 401);
  const res = await post(await signBody(SECRET, text, NOW + 61_000));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data, { folded: true, plays: 2 });

  const k = gameKeys('gl1');
  const plays = [...store.data.entries()].filter(([key]) => key.startsWith(k.plays('g_cross'))).map(([, v]) => v);
  assert.equal(plays.length, 2);
  const annPlay = plays.find((p) => p.student_id === 'st_ann');
  assert.equal(annPlay.mode, 'live');
  assert.equal(annPlay.room_id, opened.room);
  assert.match(annPlay.play_id, /^[a-f0-9]{16}$/);
  assert.deepEqual(annPlay.score, { right: 1, answered: 2, total: 6 });
  assert.equal(annPlay.started_at, new Date(NOW + 3000).toISOString());
  const events = store.data.get(k.events('g_cross', annPlay.play_id, ann.owner));
  assert.deepEqual(events.map((e) => [e.seq, e.item, e.correct, e.strength, e.play_id]), [[0, 't1', false, 'live_solo', annPlay.play_id], [1, 't2', true, 'live_solo', annPlay.play_id]]);
  assert.equal(events[0].extra.confused_with, 'Metaphor');
  // Missed simile → box 1, as solo.
  assert.deepEqual(store.data.get(`organiser_practice/class1/${ann.owner}`).boxes, { ol_simile: { box: 1, due: '2026-11-12' } });
  const summary = store.data.get(k.summary('g_cross', 'class1'));
  assert.deepEqual(summary.students.st_ann.evidence.map((e) => [e.item, e.share, e.source, e.strength]), [['t1', 0, 'game', 'live_solo'], ['t2', 1, 'game', 'live_solo']]);
  assert.equal(summary.students.st_cy.latest.right, 1);
  assert.equal(store.data.get(k.room('g_cross', opened.room)).folded, true);
  assert.equal(store.data.get(roomCodeKey(opened.code)), undefined, 'the code is free again');

  // A second fold (a retried post) changes nothing.
  const before = JSON.stringify([...store.data.entries()]);
  const again = await foldRoom(store, payload, { now: NOW + 70_000 });
  assert.deepEqual(again, { folded: true, already: true, plays: 2 });
  assert.equal(JSON.stringify([...store.data.entries()]), before);
  assert.deepEqual((await listRooms(store, 'gl1', { env: ENV, now: NOW + 70_000 })).rooms, []);
});

test('fold refuses seats that aren’t this class’s students, and unknown rooms', async () => {
  const { store } = await setup();
  const w = worker();
  const opened = await openRoom(store, 'gl1', { game_id: 'g_cross', class_id: 'class1' }, { env: ENV, fetchImpl: w.fetchImpl, now: NOW });
  const base = { room: opened.room, lesson_id: 'gl1', class_id: 'class1', game_id: 'g_cross', kind: 'crossword', started_at: NOW, ended_at: NOW + 1, strength: 'live_solo' };
  const forged = { ...base, seats: [{ owner: 'own_fake', student_id: 'st_ann', initials: 'AB', score: 9 }], events: [{ owner: 'own_fake', student_id: 'st_ann', item: 't1', move: 'answer', correct: true, seq: 0, at: NOW, game: 'crossword', play_id: opened.room, strength: 'live_solo' }] };
  assert.deepEqual(await foldRoom(store, forged, { now: NOW }), { folded: true, plays: 0 });
  await rejects(foldRoom(store, { ...base, room: 'gr' + '0'.repeat(20), seats: [], events: [] }, { now: NOW }), 'no_room');
  await rejects(foldRoom(store, { ...base, strength: 'self_paced', seats: [], events: [] }, { now: NOW }), 'bad_fold');
});

test('routes: join is on the public student route; the fold is not a student route', () => {
  assert.ok(isPublicStudentApi('POST', '/api/published/game/gl1'));
  assert.ok(!isPublicStudentApi('POST', '/api/games/fold'));
});
