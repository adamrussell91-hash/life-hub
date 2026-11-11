/**
 * Game lessons: publish, solo play, results and the markbook push.
 *
 *   games/{lesson}/current                          { version }
 *   games/{lesson}/keys/{version}                   { version, order, games: { id: GameKeys }, homework_closes_at, created_at }
 *   games/{lesson}/{game}/plays/{play}              { play_id, game_id, kind, mode, class_id, owner, student_id?, version, started_at, ended_at, folded, score }
 *   games/{lesson}/{game}/events/{play}/{owner}     GameEvent[] for that player in that play (solo appends with an etag)
 *   games/{lesson}/{game}/summary/{class}           per-student best, latest and evidence, and per-item stats, rebuilt on finish
 *
 * Answers never reach the published lesson: publish splits each game
 * (game-rules.mjs, splitGame) and keeps the keys here by publish version, so a
 * republish never re-marks an old play. Every answer is checked here.
 *
 * Learning data rules (spec §1.1): one event per student per item; games never
 * write marks unless the teacher pushes a game to the markbook; a missed item
 * whose knowledge piece is on an organiser line sends that line to box 1; a
 * right answer in a game is only ever "right once" (never mastery).
 *
 * Students have no accounts: identity is the class initials claim
 * (quiz.mjs identify), or the device in a class with no list.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject, validToken, walkBlocks } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { addColumnWithMarks, sydneyDay } from './markbook.mjs';
import { organiserKey, sendPiecesToBoxOne } from './organiser.mjs';
import { upgradeOrganiser } from './organiser-model.mjs';
import { newMarkbookId } from './markbook-schema.mjs';
import { gameKeys } from './game-store.mjs';
import { QUIZ_KIND_INFO } from './quiz-core.mjs';
import { GAME_KIND_INFO, GameLessonSchema } from './game-schema.mjs';
import {
  MARKED_MOVES, PLAY_EVENTS_MAX, SOLO_BATCH_MAX, SoloEventInputSchema, eventsToEvidence, gameIssues, gameTotal, markMove,
  missedPieces, playScore, splitGame
} from './game-rules.mjs';

export { QuizError as GameError };
export { gameKeys };

const STRONG = { type: 'json', consistency: 'strong' };
const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const PLAY_ID = /^[a-f0-9]{16}$/;
const ANON = 'all';

async function readWithEtag(store, key) {
  if (typeof store.getWithMetadata !== 'function') return { data: await read(store, key), etag: null };
  const row = await store.getWithMetadata(key, STRONG);
  return { data: row?.data ?? null, etag: row?.etag ?? null };
}

// ---------------------------------------------------------------- publish

const cryptoRandom = () => randomBytes(4).readUInt32BE(0) / 2 ** 32;

/** Why a Game lesson can't publish yet, in the teacher's words. */
export function gamePublishProblems(draft) {
  const parsed = GameLessonSchema.safeParse(draft?.game ?? { games: [] });
  if (!parsed.success) return ['A game has something too long or missing. Check each game.'];
  return gameIssues({ game: parsed.data });
}

/**
 * `{ problems, snapshot, record }`. The snapshot is the published lesson's
 * `game` (no answers); the record holds every game's keys, stored by version.
 */
export function prepareGamePublish(draft, random = cryptoRandom) {
  const problems = gamePublishProblems(draft);
  if (problems.length) return { problems, snapshot: null, record: null };
  const lesson = GameLessonSchema.parse(draft.game);
  const version = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  const games = [];
  const keys = {};
  for (const game of lesson.games) {
    const split = splitGame(game, random);
    games.push(split.public);
    keys[game.id] = split.keys;
  }
  const closes = lesson.homework_closes_at ? { homework_closes_at: lesson.homework_closes_at } : {};
  return {
    problems: [],
    snapshot: { games, version, ...closes },
    record: { version, order: lesson.games.map((g) => g.id), games: keys, ...closes, created_at: new Date().toISOString() }
  };
}

export async function storeGameKeys(store, lessonId, record) {
  const k = gameKeys(lessonId);
  await store.setJSON(k.version(record.version), record);
  await store.setJSON(k.current, { version: record.version });
}

// ---------------------------------------------------------------- loading

async function loadGames(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Game not found.');
  const k = gameKeys(lessonId);
  const [lesson, current] = await Promise.all([read(store, publishedLessonKey(lessonId)), read(store, k.current)]);
  if (!lesson || lesson.pedagogical_mode !== 'game' || !current?.version) reject(404, 'not_published', 'This game isn’t published yet.');
  const record = await read(store, k.version(current.version));
  if (!record) reject(404, 'not_published', 'This game isn’t published yet.');
  return { lesson, record, k };
}

const versionCache = new Map();
/** The keys a play was started against: a republish never re-marks it. */
async function recordFor(store, k, version, fallback) {
  if (version === fallback.version) return fallback;
  const cacheKey = k.version(version);
  if (!versionCache.has(cacheKey)) versionCache.set(cacheKey, await read(store, cacheKey));
  return versionCache.get(cacheKey) ?? fallback;
}

const homeworkClosed = (record, now = Date.now()) => !!record.homework_closes_at && Date.parse(record.homework_closes_at) <= now;

// ---------------------------------------------------------------- events and summaries

async function readEvents(store, k, gameId, playId, owner) {
  return list(await read(store, k.events(gameId, playId, owner)));
}

/**
 * Appends to a play's event log: read, add, write only if nobody wrote in
 * between. A move whose client id (`cid`) is already in the log is a retried
 * batch's move and isn't added again.
 */
async function appendEvents(store, key, add) {
  for (let attempt = 0; ; attempt += 1) {
    const held = await readWithEtag(store, key);
    const events = list(held.data);
    const have = new Set(events.map((e) => e.cid).filter(Boolean));
    const fresh = add.filter((e) => !e.cid || !have.has(e.cid));
    if (!fresh.length) return events;
    if (events.length + fresh.length > PLAY_EVENTS_MAX) reject(409, 'too_many', 'This game has had enough answers. Finish and start again.');
    const seq0 = events.length ? Math.max(...events.map((e) => e.seq)) + 1 : 0;
    const next = [...events, ...fresh.map((e, i) => ({ ...e, seq: seq0 + i }))];
    const options = held.data ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true };
    const written = await store.setJSON(key, next, options);
    if (written?.modified !== false) return next;
    if (attempt >= 3) reject(409, 'retry', 'Please send it again.');
  }
}

const who = (play) => play.student_id ?? play.owner;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
/** What a wrong answer said, for the "common wrong answers" column. Never a student's name. */
function wrongText(key, response) {
  const r = obj(response);
  if (key?.shape === 'term' && typeof r.text === 'string') return r.text.trim().slice(0, 60);
  if (key?.shape === 'quote' && typeof r.speaker === 'string') return r.speaker === 'fake' ? 'Fake' : r.speaker;
  return null;
}

/**
 * Rebuilds one game's summary for one class from its finished plays and writes it.
 * Per student: plays, best and latest score, the latest play's evidence and
 * what they missed. Per item: answered, right, median time and wrong answers,
 * from each student's latest play.
 */
export async function rebuildSummary(store, lessonId, gameId, classId, current) {
  const k = gameKeys(lessonId);
  const keysList = await listBlobKeys(store, k.plays(gameId));
  const plays = (await mapBounded(keysList, 8, (key) => read(store, key))).filter((p) => p && (classId === ANON || p.class_id === classId) && p.ended_at);
  const byStudent = new Map();
  for (const p of plays) byStudent.set(who(p), [...(byStudent.get(who(p)) ?? []), p]);
  const students = {};
  const items = {};
  for (const [id, mine] of byStudent) {
    mine.sort((a, b) => a.ended_at.localeCompare(b.ended_at));
    const latest = mine[mine.length - 1];
    const record = await recordFor(store, k, latest.version, current);
    const keys = record.games?.[gameId];
    const share = (p) => p.score.right / Math.max(1, p.score.total ?? p.score.answered);
    const best = mine.reduce((top, p) => (!top || share(p) > share(top) ? p : top), null);
    const events = await readEvents(store, k, gameId, latest.play_id, latest.owner);
    const evidence = keys ? eventsToEvidence(keys, events) : [];
    const seen = new Set();
    for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
      if (!MARKED_MOVES.has(e.move) || typeof e.correct !== 'boolean' || seen.has(e.item)) continue;
      seen.add(e.item);
      const stat = items[e.item] ?? { answered: 0, right: 0, times: [], wrong: {} };
      stat.answered += 1;
      if (e.correct) stat.right += 1;
      if (typeof e.time_ms === 'number') stat.times.push(e.time_ms);
      const said = e.correct ? null : wrongText(keys?.items?.[e.item], e.response);
      if (said) stat.wrong[said] = (stat.wrong[said] ?? 0) + 1;
      items[e.item] = stat;
    }
    // Out of the same total as the finish card: every item in the game, not just those answered.
    const score = (p) => ({ play_id: p.play_id, right: p.score.right, answered: p.score.answered, total: p.score.total ?? (keys ? gameTotal(keys) : p.score.answered), at: p.ended_at });
    students[id] = {
      owner: latest.owner,
      ...(latest.student_id ? { student_id: latest.student_id } : {}),
      plays: mine.length,
      best: score(best),
      latest: score(latest),
      date: sydneyDay(latest.ended_at),
      evidence
    };
  }
  const summary = {
    game_id: gameId,
    class_id: classId,
    built_at: new Date().toISOString(),
    students,
    items: Object.fromEntries(Object.entries(items).map(([id, s]) => [id, { answered: s.answered, right: s.right, median_ms: median(s.times), wrong: Object.entries(s.wrong).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text, count]) => ({ text, count })) }]))
  };
  await store.setJSON(k.summary(gameId, classId), summary);
  return summary;
}

// ---------------------------------------------------------------- student actions

const ACTIONS = ['load', 'claim', 'solo_start', 'solo_event', 'solo_finish'];

function gameOf(record, gameId) {
  const keys = typeof gameId === 'string' ? record.games?.[gameId] : null;
  if (!keys) reject(400, 'bad_game', 'That game isn’t in this lesson.');
  return keys;
}

/**
 * Student actions on a Game lesson (POST /api/published/game/:lesson):
 *   load         the arcade: games, best and latest per game for this student, homework state
 *   claim        initials, then load
 *   solo_start   { game_id } → { play_id, game }
 *   solo_event   { game_id, play_id, events: SoloEventInput[] (≤ 20) } → { results: [{ item, correct, … }] }
 *   solo_finish  { game_id, play_id } → { score, best, latest, boxed }
 */
export async function gameStudentAction(store, lessonId, body, { now = Date.now() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'load';
  if (!ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { lesson, record, k } = await loadGames(store, lessonId);
  let whoIs;
  try {
    whoIs = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this game from your class page.');
    throw e;
  }
  if (whoIs.need === 'class') reject(403, 'need_class', 'Open this game from your class page.');
  const identity = { need: whoIs.need, initials: whoIs.student?.initials ?? null };
  const closed = homeworkClosed(record, now);
  const arcade = (results = {}) => ({
    identity,
    games: list(lesson.game?.games),
    ...(record.homework_closes_at ? { homework_closes_at: record.homework_closes_at } : {}),
    closed,
    results
  });
  if (whoIs.need === 'initials') {
    if (action !== 'load' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return arcade();
  }
  const token = validToken(body.class_token) ? body.class_token : null;
  if (!token && (action === 'load' || action === 'claim')) return arcade();
  if (!token) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const owner = whoIs.student ? deviceHash(`student:${whoIs.classId}:${whoIs.student.id}`) : deviceHash(token);
  const classKey = whoIs.classId ?? ANON;
  const me = whoIs.student?.id ?? owner;

  if (action === 'load' || action === 'claim') {
    const results = {};
    await Promise.all(record.order.map(async (gameId) => {
      const s = obj(await read(store, k.summary(gameId, classKey)))?.students?.[me];
      if (s) results[gameId] = { best: s.best, latest: s.latest, plays: s.plays };
    }));
    return arcade(results);
  }

  const keys = gameOf(record, body.game_id);
  const kind = keys.kind;
  if (!GAME_KIND_INFO[kind]?.solo) reject(409, 'live_only', 'This game plays live with your teacher.');

  if (action === 'solo_start') {
    if (closed) reject(409, 'closed', 'This game has closed.');
    const playId = randomBytes(8).toString('hex');
    const play = {
      play_id: playId,
      game_id: body.game_id,
      kind,
      mode: 'solo',
      class_id: whoIs.classId,
      owner,
      ...(whoIs.student ? { student_id: whoIs.student.id } : {}),
      version: record.version,
      started_at: new Date(now).toISOString(),
      ended_at: null,
      folded: false
    };
    await store.setJSON(k.play(body.game_id, playId), play, { onlyIfNew: true });
    return { play_id: playId, game: list(lesson.game?.games).find((g) => g.id === body.game_id) ?? null };
  }

  if (typeof body.play_id !== 'string' || !PLAY_ID.test(body.play_id)) reject(400, 'bad_play', 'That game has ended. Start again.');
  const play = await read(store, k.play(body.game_id, body.play_id));
  if (!play || play.owner !== owner) reject(404, 'bad_play', 'That game has ended. Start again.');
  const playRecord = await recordFor(store, k, play.version, record);
  const playKeys = playRecord.games?.[body.game_id] ?? keys;

  if (action === 'solo_event') {
    if (play.ended_at) reject(409, 'ended', 'This game has finished.');
    const raw = list(body.events);
    if (!raw.length) reject(400, 'bad_request', 'Nothing to send.');
    if (raw.length > SOLO_BATCH_MAX) reject(400, 'too_many', `Send up to ${SOLO_BATCH_MAX} moves at a time.`);
    const inputs = raw.map((input) => {
      const parsed = SoloEventInputSchema.safeParse(input);
      if (!parsed.success) reject(400, 'bad_event', 'A move couldn’t be read.');
      return parsed.data;
    });
    const eventsKey = k.events(body.game_id, play.play_id, owner);
    // What this play holds so far: retried moves, hint ladders and words found are read from it.
    const log = await readEvents(store, k, body.game_id, play.play_id, owner);
    const game = list(lesson.game?.games).find((g) => g.id === body.game_id) ?? null;
    const by = { play_id: play.play_id, owner, ...(play.student_id ? { student_id: play.student_id } : {}), strength: 'self_paced' };
    const results = [];
    const add = [];
    for (const e of inputs) {
      // The same marker the live room uses (core/mark.ts): solo and live mark alike.
      const { result, stored, error } = markMove(game, playKeys, [...log, ...add], e, now, by);
      if (error) reject(400, 'bad_item', 'That isn’t in this game.');
      results.push(result);
      if (stored) add.push(stored);
    }
    if (add.length) await appendEvents(store, eventsKey, add);
    return { results };
  }

  // solo_finish: idempotent.
  if (play.ended_at) {
    const s = obj(await read(store, k.summary(body.game_id, classKey)))?.students?.[me];
    return { score: play.score, best: s?.best ?? null, latest: s?.latest ?? null, boxed: play.boxed ?? 0 };
  }
  const events = await readEvents(store, k, body.game_id, play.play_id, owner);
  const evidence = eventsToEvidence(playKeys, events);
  const score = { ...playScore(evidence), total: gameTotal(playKeys) };
  let boxed = 0;
  if (whoIs.student) {
    const roster = await loadRoster(store, whoIs.classId);
    if (roster) boxed = await sendPiecesToBoxOne(store, roster, whoIs.student, missedPieces(evidence), { now: new Date(now) });
  }
  const ended = { ...play, ended_at: new Date(now).toISOString(), folded: true, score, boxed };
  await store.setJSON(k.play(body.game_id, play.play_id), ended);
  const summary = await rebuildSummary(store, lessonId, body.game_id, classKey, record);
  const s = summary.students[me];
  return { score, best: s?.best ?? null, latest: s?.latest ?? null, boxed };
}

// ---------------------------------------------------------------- teacher actions

const TEACHER_ACTIONS = ['results', 'markbook_push', 'sources'];

/** One game's Results for one class: per item, per student (with names, never shown to the board), and plays. */
function gameResults(gameId, keys, summary, roster) {
  const students = obj(summary?.students);
  const itemStats = obj(summary?.items);
  const itemIds = Object.entries(keys.items).flatMap(([id, key]) => (key.shape === 'wall' ? key.groups.map((g) => g.id) : [id]));
  const labelOf = (id) => {
    const key = keys.items[id];
    if (key) return key.label;
    for (const k2 of Object.values(keys.items)) if (k2.shape === 'wall') { const g = k2.groups.find((x) => x.id === id); if (g) return g.label; }
    return id;
  };
  // Connections groups take their stats from each student's evidence.
  const evidenceStat = {};
  for (const s of Object.values(students)) {
    for (const e of list(s.evidence)) {
      const stat = evidenceStat[e.item] ?? { answered: 0, right: 0 };
      stat.answered += 1;
      if (e.share === 1) stat.right += 1;
      evidenceStat[e.item] = stat;
    }
  }
  const items = itemIds.map((id) => {
    const s = itemStats[id] ?? null;
    const ev = evidenceStat[id] ?? { answered: 0, right: 0 };
    const answered = s?.answered ?? ev.answered;
    const right = s?.right ?? ev.right;
    return { id, label: labelOf(id), answered, right, accuracy: answered ? Math.round((right / answered) * 100) / 100 : null, median_ms: s?.median_ms ?? null, wrong: list(s?.wrong) };
  });
  const rows = (roster?.students?.length ? roster.students.map((st) => ({ id: st.id, name: st.name, initials: st.initials, s: students[st.id] })) : Object.entries(students).map(([id, s]) => ({ id, name: null, initials: null, s })))
    .map(({ id, name, initials, s }) => {
      const evidence = list(s?.evidence);
      const right = evidence.filter((e) => e.share === 1).length;
      return {
        id,
        name,
        initials,
        plays: s?.plays ?? 0,
        best: s?.best ?? null,
        latest: s?.latest ?? null,
        answered: evidence.length,
        right,
        accuracy: evidence.length ? Math.round((right / evidence.length) * 100) / 100 : null,
        missed: evidence.filter((e) => e.share === 0).map((e) => labelOf(e.item)),
        strength: [...new Set(evidence.map((e) => e.strength))]
      };
    });
  return { game_id: gameId, title: keys.title, kind: keys.kind, plays: rows.reduce((n, r) => n + r.plays, 0), items, students: rows };
}

const safeItemId = (raw) => String(raw ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40) || 'item';
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const SOURCE_MAX = 200;

/**
 * Build from this unit (spec §2.3): Terms from the unit organiser's Vocabulary
 * and technique lines (the line's piece kept as its `kp` tag), Questions from
 * the unit's lessons (auto-marked kinds), Quotes from quote blocks. Ready-made
 * items with ids from their source, so ticking one twice adds it once. No AI.
 */
async function unitSources(store, draft) {
  const unitId = draft.unit_id;
  const unit = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
  if (!unit || isDeletedRecord(unit)) return { unit_id: unitId ?? null, terms: [], questions: [], quotes: [] };
  const organiser = upgradeOrganiser((await read(store, organiserKey(unitId))) ?? { sections: [] });
  const terms = [];
  for (const section of list(organiser.sections)) {
    const name = String(section.name ?? '');
    if (section.role !== 'vocab' && !/technique/i.test(name)) continue;
    for (const line of list(section.lines)) {
      const cells = list(line.cells).map((c) => (typeof c === 'string' ? c.trim() : ''));
      if (!cells[0]) continue;
      const clues = [
        ...(cells[1] ? [{ kind: 'definition', text: cells[1].slice(0, 300) }] : []),
        ...(cells[2] ? [{ kind: 'example', text: cells[2].slice(0, 300) }] : [])
      ];
      terms.push({
        section: name,
        line_id: line.id,
        item: { id: safeItemId(`t_${line.id}`), shape: 'term', term: cells[0].slice(0, 60), accept: [], clues, banned: [], decoys: [], pieces: PIECE.test(line.piece_id ?? '') ? [line.piece_id] : [], outcomes: [], skills: [], tech: [] }
      });
      if (terms.length >= SOURCE_MAX) break;
    }
  }
  const lessonIds = list(unit.lesson_ids).filter((id) => isSafeId(id));
  const lessons = (await mapBounded(lessonIds, 6, (id) => read(store, draftLessonKey(id)))).filter((l) => l && !isDeletedRecord(l));
  const questions = [];
  const quotes = [];
  for (const l of lessons) {
    for (const b of walkBlocks(l.blocks)) {
      if (b.block_type === 'quiz_question' && questions.length < SOURCE_MAX) {
        const q = obj(b.content?.question);
        if (!QUIZ_KIND_INFO[q.kind] || QUIZ_KIND_INFO[q.kind].manual) continue;
        const id = safeItemId(`q_${b.id}`);
        questions.push({ lesson_id: l.id, lesson_title: l.title ?? '', block_id: b.id, item: { id, shape: 'question', question: { ...q, id }, pieces: [], outcomes: [], skills: [], tech: [] } });
      }
      if (b.block_type === 'quote' && quotes.length < SOURCE_MAX && typeof b.content?.quote === 'string' && b.content.quote.trim()) {
        const source = [b.content.reference, b.content.source].filter((x) => typeof x === 'string' && x.trim()).join(', ').slice(0, 120);
        quotes.push({ lesson_id: l.id, lesson_title: l.title ?? '', block_id: b.id, attribution: typeof b.content.attribution === 'string' ? b.content.attribution.trim() : '', item: { id: safeItemId(`u_${b.id}`), shape: 'quote', text: b.content.quote.trim().slice(0, 600), speaker: '', ...(source ? { source } : {}), accept: [], pieces: [], outcomes: [], skills: [], tech: [] } });
      }
    }
  }
  return { unit_id: unitId, terms, questions, quotes };
}

/**
 * Teacher actions on a Game lesson (POST /api/lessons/:lesson/game, operator gate):
 *   results        { class_id? } → { games: [gameResults] } (rebuilds each summary)
 *   markbook_push  { class_id, game_id, title? } → { column_id, count }: one column, accuracy %
 *   sources        {} → Build from this unit: { unit_id, terms, questions, quotes }
 */
export async function gameTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Game not found.');
  const action = body.action ?? 'results';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const draft = await read(store, draftLessonKey(lessonId));
  if (!draft || isDeletedRecord(draft) || draft.pedagogical_mode !== 'game') reject(404, 'not_found', 'Game not found.');
  if (action === 'sources') return unitSources(store, draft);

  const k = gameKeys(lessonId);
  const current = await read(store, k.current);
  const record = current?.version ? await read(store, k.version(current.version)) : null;
  if (!record) reject(409, 'not_published', 'Publish the game first.');
  const classId = body.class_id ? String(body.class_id) : null;
  const roster = classId ? await loadRoster(store, classId) : null;
  if (classId && !roster) reject(404, 'not_found', 'Class not found.');
  const classKey = classId ?? ANON;

  if (action === 'results') {
    const ids = typeof body.game_id === 'string' ? [gameOf(record, body.game_id) && body.game_id] : record.order;
    const games = [];
    for (const gameId of ids) games.push(gameResults(gameId, record.games[gameId], await rebuildSummary(store, lessonId, gameId, classKey, record), roster));
    return { version: record.version, class_id: classId, games };
  }

  // markbook_push
  if (!roster) reject(400, 'need_class', 'Pick a class first.');
  const keys = gameOf(record, body.game_id);
  const result = gameResults(body.game_id, keys, await rebuildSummary(store, lessonId, body.game_id, classKey, record), roster);
  const criterion = newMarkbookId();
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : `${GAME_KIND_INFO[keys.kind].label}: ${keys.title || 'Game'}`.slice(0, 120);
  const column = {
    id: newMarkbookId(),
    kind: 'assessment',
    title,
    date: sydneyDay(new Date().toISOString()),
    weight: 0,
    criteria: [{ id: criterion, label: 'Accuracy %', max: 100, outcomes: [], concepts: [] }]
  };
  const marks = Object.fromEntries(result.students.filter((s) => s.accuracy !== null).map((s) => [s.id, { criteria: { [criterion]: Math.round(s.accuracy * 100) } }]));
  if (!Object.keys(marks).length) reject(400, 'no_marks', 'Nobody in this class has played this game yet.');
  const count = await addColumnWithMarks(store, classId, column, marks);
  return { column_id: column.id, count };
}
