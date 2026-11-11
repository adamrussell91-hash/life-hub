/**
 * Live game rooms, the Netlify half (spec §3.3). Netlify stays the source of
 * truth: it opens a room on the game-rooms Worker with the published game,
 * its keys and the class list; hands out signed tickets; and takes the room's
 * results back (the fold) into the same plays, events and summaries solo
 * play writes, with strength `live_solo`.
 *
 *   open    teacher (operator gate)  { game_id, class_id } → { room, code, teacher_ticket, board_ticket, ws_base, http_base }
 *   rooms   teacher (operator gate)  {} → { rooms: [ … with fresh teacher and board tickets ] }  (resume from any device)
 *   join    student (public)         { game_id?, code, class_id, class_token } → { room, ticket, game_id, initials, ws_base, http_base }
 *   fold    Worker → POST /api/games/fold, signed (x-game-room-signature), idempotent by room
 *
 * Codes live here (`game-rooms/codes/{code}`), not on the Worker: a code is
 * only ever used together with the student's class identity at join.
 *
 * Env: GAME_ROOM_SECRET (shared with the Worker; HMAC for tickets and bodies),
 * GAME_ROOMS_URL (default https://class.adam-russell.com/g), GAME_FOLD_URL
 * (optional; default {URL}/api/games/fold).
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { sendPiecesToBoxOne } from './organiser.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { gameKeys, roomCodeKey } from './game-store.mjs';
import { rebuildSummary } from './games.mjs';
import { eventsToEvidence, gameTotal, missedPieces, playScore } from './game-rules.mjs';
import { ROOM_LIMITS, SIGNATURE_HEADER, roomStyle, signBody, signTicket } from './game-room-core.mjs';

export const DEFAULT_GAME_ROOMS_URL = 'https://class.adam-russell.com/g';
const DEFAULT_SITE_URL = 'https://life-hub.adam-russell.com';
const CODE = /^\d{6}$/;
const ROOM = /^gr[a-f0-9]{20}$/;
const list = (v) => (Array.isArray(v) ? v : []);

export function roomUrls(env = {}) {
  const http = String(env.GAME_ROOMS_URL || DEFAULT_GAME_ROOMS_URL).replace(/\/+$/, '');
  return { http_base: http, ws_base: http.replace(/^http/, 'ws') };
}

function secretOf(env) {
  const secret = env.GAME_ROOM_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) reject(503, 'not_configured', 'Live games aren’t set up yet.');
  return secret;
}

const foldUrl = (env) => env.GAME_FOLD_URL || `${String(env.URL || DEFAULT_SITE_URL).replace(/\/+$/, '')}/api/games/fold`;
const expired = (opened, now) => typeof opened !== 'number' || opened + ROOM_LIMITS.lifeMs <= now;

async function loadPublishedGames(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Game not found.');
  const k = gameKeys(lessonId);
  const [lesson, current] = await Promise.all([read(store, publishedLessonKey(lessonId)), read(store, k.current)]);
  if (!lesson || lesson.pedagogical_mode !== 'game' || !current?.version) reject(409, 'not_published', 'Publish the game first.');
  const record = await read(store, k.version(current.version));
  if (!record) reject(409, 'not_published', 'Publish the game first.');
  return { lesson, record, k };
}

async function teacherTickets(secret, room, now) {
  return {
    teacher_ticket: await signTicket(secret, { room, role: 'teacher', owner: 'teacher' }, now),
    board_ticket: await signTicket(secret, { room, role: 'board', owner: 'board' }, now)
  };
}

/** A free 6-digit code, reserved for this room (create-only, or over a code whose room is done). */
async function reserveCode(store, entry, now) {
  for (let i = 0; i < 25; i += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const key = roomCodeKey(code);
    const held = await read(store, key);
    if (held && !held.folded && !expired(held.opened_at, now)) continue;
    const written = await store.setJSON(key, { ...entry, code }, held ? {} : { onlyIfNew: true });
    if (written?.modified === false) continue;
    return code;
  }
  reject(503, 'busy', 'Couldn’t find a free code. Try again.');
}

/**
 * Teacher: open a live room for one published game and one class. The room
 * gets the public game, its keys and the class list as initials only (no
 * names). Live games need a class list (spec §8).
 */
export async function openRoom(store, lessonId, body, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const secret = secretOf(env);
  const { lesson, record, k } = await loadPublishedGames(store, lessonId);
  const gameId = typeof body?.game_id === 'string' ? body.game_id : null;
  const keys = gameId ? record.games?.[gameId] : null;
  const game = list(lesson.game?.games).find((g) => g.id === gameId);
  if (!keys || !game) reject(400, 'bad_game', 'That game isn’t in this lesson.');
  const style = roomStyle(keys.kind);
  if (!style) reject(409, 'not_live_yet', 'This game can’t be played live yet.');
  const roster = await loadRoster(store, body?.class_id);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const seats = Object.fromEntries(roster.students.filter((s) => isSafeId(s.id) && s.initials).map((s) => [s.id, s.initials]));
  if (!Object.keys(seats).length) reject(409, 'no_list', 'Live games need a class list. Add the class first.');
  const classId = roster.cls.id;
  const room = `gr${randomBytes(10).toString('hex')}`;
  const code = await reserveCode(store, { room, lesson_id: lessonId, game_id: gameId, class_id: classId, opened_at: now, folded: false }, now);
  const config = {
    room, code, lesson_id: lessonId, class_id: classId, game, keys, style, roster: seats,
    ...(style === 'paced' && Number(game.settings?.seconds) > 0 ? { item_seconds: Number(game.settings.seconds) } : {}),
    fold_url: foldUrl(env),
    opened_at: now
  };
  const urls = roomUrls(env);
  const text = JSON.stringify(config);
  let res;
  try {
    res = await fetchImpl(`${urls.http_base}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: await signBody(secret, text, now) }, body: text });
  } catch {
    res = null;
  }
  if (!res?.ok) {
    await store.delete(roomCodeKey(code));
    reject(502, 'room_unavailable', 'The game room didn’t open. Try again in a moment.');
  }
  await store.setJSON(k.room(gameId, room), { room, code, game_id: gameId, class_id: classId, version: record.version, opened_at: now, folded: false });
  return { room, code, game_id: gameId, class_id: classId, kind: keys.kind, style, opened_at: now, ...(await teacherTickets(secret, room, now)), ...urls };
}

/** Teacher: this lesson's rooms still open (not folded, under 6 h), each with fresh tickets so any device can resume. */
export async function listRooms(store, lessonId, { env = process.env, now = Date.now() } = {}) {
  const secret = secretOf(env);
  const { record, k } = await loadPublishedGames(store, lessonId);
  const rooms = [];
  for (const gameId of list(record.order)) {
    const keys = await listBlobKeys(store, k.rooms(gameId));
    const rows = (await mapBounded(keys, 6, (key) => read(store, key))).filter((r) => r && !r.folded && !expired(r.opened_at, now));
    for (const r of rows) rooms.push({ room: r.room, code: r.code, game_id: gameId, class_id: r.class_id, opened_at: r.opened_at, ...(await teacherTickets(secret, r.room, now)) });
  }
  rooms.sort((a, b) => b.opened_at - a.opened_at);
  return { rooms, ...roomUrls(env) };
}

/**
 * Student: the code on the board → a ticket for their own seat. Identity is
 * the class initials claim, exactly as solo play; the seat is the same owner
 * solo play uses, so live and homework results sit together.
 */
export async function joinRoom(store, lessonId, body, { env = process.env, now = Date.now() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const secret = secretOf(env);
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Game not found.');
  const code = String(body.code ?? '').replace(/\s+/g, '');
  if (!CODE.test(code)) reject(400, 'bad_code', 'Type the 6 numbers on the board.');
  let whoIs;
  try {
    whoIs = await identify(store, body, 'join');
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this game from your class page.');
    throw e;
  }
  if (whoIs.need === 'class') reject(403, 'need_class', 'Open this game from your class page.');
  if (!whoIs.student) reject(403, whoIs.need === 'initials' ? 'need_initials' : 'no_list', whoIs.need === 'initials' ? 'Type your initials first.' : 'Live games need a class list. Ask your teacher.');
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const entry = await read(store, roomCodeKey(code));
  const open = entry && !entry.folded && !expired(entry.opened_at, now) && entry.lesson_id === lessonId && entry.class_id === whoIs.classId && (!body.game_id || body.game_id === entry.game_id);
  if (!open) reject(404, 'bad_code', 'That code isn’t open. Check the board.');
  const owner = deviceHash(`student:${whoIs.classId}:${whoIs.student.id}`);
  const ticket = await signTicket(secret, { room: entry.room, role: 'student', owner, student_id: whoIs.student.id, initials: whoIs.student.initials }, now);
  return { room: entry.room, ticket, game_id: entry.game_id, initials: whoIs.student.initials, ...roomUrls(env) };
}

const playIdFor = (room, owner) => createHash('sha256').update(`${room}:${owner}`).digest('hex').slice(0, 16);
const iso = (ms) => new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();

/**
 * The room's results, written exactly as solo_finish writes them: one play
 * per seat that moved (mode 'live'), its events (strength from the room),
 * missed knowledge pieces to box 1, and the class summary rebuilt. Idempotent
 * by room: a second fold of the same room changes nothing. The signature is
 * checked by the function before this runs.
 */
export async function foldRoom(store, payload, { now = Date.now() } = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (!ROOM.test(p.room ?? '') || !isSafeId(p.lesson_id) || !isSafeId(p.game_id) || !isSafeId(p.class_id)) reject(400, 'bad_fold', 'Invalid fold.');
  if (!['live_solo', 'live_team'].includes(p.strength)) reject(400, 'bad_fold', 'Invalid fold.');
  const k = gameKeys(p.lesson_id);
  const roomKey = k.room(p.game_id, p.room);
  const room = await read(store, roomKey);
  if (!room || room.class_id !== p.class_id) reject(404, 'no_room', 'Unknown room.');
  if (room.folded) return { folded: true, already: true, plays: room.plays ?? 0 };
  const record = await read(store, k.version(room.version));
  const keys = record?.games?.[p.game_id];
  if (!keys) reject(409, 'no_keys', 'The game’s keys are gone.');
  const roster = await loadRoster(store, p.class_id);
  const seats = new Map(list(p.seats).filter((s) => s && typeof s.owner === 'string').map((s) => [s.owner, s]));
  const byOwner = new Map();
  for (const e of list(p.events)) {
    if (!e || typeof e.owner !== 'string' || typeof e.item !== 'string') continue;
    byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e]);
  }
  let plays = 0;
  for (const [owner, raw] of byOwner) {
    const seat = seats.get(owner);
    const studentId = seat?.student_id ?? raw.find((e) => typeof e.student_id === 'string')?.student_id;
    const student = roster?.students.find((s) => s.id === studentId) ?? null;
    // Only seats that are this class's students, under the owner solo play would give them.
    if (!student || owner !== deviceHash(`student:${p.class_id}:${student.id}`)) continue;
    const playId = playIdFor(p.room, owner);
    const events = raw
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .map(({ reply: _reply, ...e }, i) => ({ ...e, seq: i, play_id: playId, owner, student_id: student.id, game: keys.kind, strength: p.strength }));
    await store.setJSON(k.events(p.game_id, playId, owner), events);
    const evidence = eventsToEvidence(keys, events);
    const score = { ...playScore(evidence), total: gameTotal(keys) };
    const boxed = roster ? await sendPiecesToBoxOne(store, roster, student, missedPieces(evidence), { now: new Date(now) }) : 0;
    await store.setJSON(k.play(p.game_id, playId), {
      play_id: playId, game_id: p.game_id, kind: keys.kind, mode: 'live', room_id: p.room, class_id: p.class_id, owner, student_id: student.id, version: room.version,
      started_at: iso(p.started_at), ended_at: iso(p.ended_at), folded: true, score, boxed, ...(seat && Number.isFinite(seat.score) ? { live_score: seat.score } : {})
    });
    plays += 1;
  }
  const current = await read(store, k.current);
  const currentRecord = current?.version && current.version !== room.version ? (await read(store, k.version(current.version))) ?? record : record;
  await rebuildSummary(store, p.lesson_id, p.game_id, p.class_id, currentRecord);
  await store.setJSON(roomKey, { ...room, folded: true, folded_at: now, plays });
  // Free the code, unless it has since been handed to another room.
  const held = await read(store, roomCodeKey(room.code));
  if (held?.room === p.room) await store.delete(roomCodeKey(room.code));
  return { folded: true, plays };
}
