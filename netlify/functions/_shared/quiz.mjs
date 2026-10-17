/**
 * Quiz lessons: publish, take, mark and run live.
 *
 *   quiz/{lesson}/current                            { version }
 *   quiz/{lesson}/keys/{version}                     { order, questions: { id: { question, key } }, settings }
 *   quiz/{lesson}/attempts/{device}/{n}              one attempt (server writes only)
 *   quiz/{lesson}/marks/{device}~{n}                 { question id: marks } teacher marking
 *   quiz/{lesson}/release                            { released } when feedback waits for the teacher
 *   quiz/{lesson}/live/active                        live round (teacher writes only)
 *   quiz/{lesson}/live/{session}/players/{device}    { joined_at }
 *   quiz/{lesson}/live/{session}/answers/{i}/{device} create-only answer to question i
 *
 * Answers never reach the published lesson. On publish each question is split
 * into what students see and a key (quiz-core.mjs); keys are stored here by
 * publish version, so a republish never re-marks old attempts against new ids.
 * Every mark is worked out on the server.
 *
 * Students have no accounts. A device keeps a random token and the server
 * keeps a hash of it, which is how attempts and live answers are counted.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { QuizError, deviceHash, listSubmissions, read, reject, reviewSubmission, validToken, walkBlocks } from './question-drop.mjs';
import {
  QuizSettingsSchema,
  afterHint,
  checkQuestion,
  cleanResponse,
  hasAnswer,
  markResponse,
  resolveQuizSettings,
  roundMarks,
  splitQuestion
} from './quiz-core.mjs';

export { QuizError };

const GRACE_MS = 60_000;
const LIVE_HOURS = 6;
const cryptoRandom = () => randomInt(0, 2 ** 31) / 2 ** 31;

const keys = (lesson) => ({
  current: `quiz/${lesson}/current`,
  version: (v) => `quiz/${lesson}/keys/${v}`,
  attempts: (device) => `quiz/${lesson}/attempts/${device}/`,
  attempt: (device, n) => `quiz/${lesson}/attempts/${device}/${n}`,
  marks: (device, n) => `quiz/${lesson}/marks/${device}~${n}`,
  release: `quiz/${lesson}/release`,
  live: `quiz/${lesson}/live/active`,
  player: (session, device) => `quiz/${lesson}/live/${session}/players/${device}`,
  players: (session) => `quiz/${lesson}/live/${session}/players/`,
  answer: (session, i, device) => `quiz/${lesson}/live/${session}/answers/${i}/${device}`,
  answers: (session, i) => `quiz/${lesson}/live/${session}/answers/${i}/`
});

/* ── Publish ───────────────────────────────────────────────────────── */

/** Settings students may see. The rest of the key stays on the server. */
function publicSettings(settings) {
  const s = resolveQuizSettings(settings);
  return {
    ...(s.timer_minutes ? { timer_minutes: s.timer_minutes } : {}),
    ...(s.question_seconds ? { question_seconds: s.question_seconds } : {}),
    timer_hard: !!s.timer_hard,
    shuffle_questions: !!s.shuffle_questions,
    shuffle_options: !!s.shuffle_options,
    attempts: s.attempts,
    feedback: s.feedback,
    hint_cost: s.hint_cost,
    confidence: !!s.confidence,
    ...(s.closes_at ? { closes_at: s.closes_at } : {})
  };
}

function mapTree(blocks, fn) {
  return (Array.isArray(blocks) ? blocks : []).flatMap((block) => {
    const next = fn(block);
    if (!next) return [];
    const c = next.content ?? {};
    if (Array.isArray(c.blocks)) return [{ ...next, content: { ...c, blocks: mapTree(c.blocks, fn) } }];
    if (Array.isArray(c.columns)) return [{ ...next, content: { ...c, columns: c.columns.map((col) => ({ ...col, blocks: mapTree(col.blocks, fn) })) } }];
    if (Array.isArray(c.tabs)) return [{ ...next, content: { ...c, tabs: c.tabs.map((tab) => ({ ...tab, blocks: mapTree(tab.blocks, fn) })) } }];
    return [next];
  });
}

/**
 * Splits every quiz question in the student blocks. Quiz questions outside a
 * quiz lesson are dropped, so an answer can never ship by accident. Returns
 * the blocks to publish and, for a quiz lesson, the key record to store.
 */
export function prepareQuizPublish(draft, studentBlocks, random = cryptoRandom) {
  const isQuiz = draft?.pedagogical_mode === 'quiz';
  const questions = {};
  const order = [];
  const problems = [];
  const blocks = mapTree(studentBlocks, (block) => {
    if (block.block_type !== 'quiz_question') return block;
    if (!isQuiz) return null;
    const checked = checkQuestion({ ...(block.content?.question ?? {}), id: block.id });
    if (!checked.ok) {
      problems.push(checked.message);
      return null;
    }
    const { question, key } = splitQuestion(checked.question, random);
    questions[block.id] = { question, key };
    order.push(block.id);
    return { ...block, content: { question } };
  });
  if (!isQuiz) return { blocks, quiz: null, problems };
  const parsed = QuizSettingsSchema.safeParse(draft.quiz ?? {});
  const settings = parsed.success ? parsed.data : {};
  const version = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  const total = order.reduce((sum, id) => sum + questions[id].key.marks, 0);
  return {
    blocks,
    problems,
    quiz: {
      version,
      record: { version, order, questions, settings, created_at: new Date().toISOString() },
      snapshot: { ...publicSettings(settings), version, question_count: order.length, total_marks: total }
    }
  };
}

export async function storeQuizKey(store, lessonId, quiz) {
  const k = keys(lessonId);
  await store.setJSON(k.version(quiz.version), quiz.record);
  await store.setJSON(k.current, { version: quiz.version });
}

/* ── Loading ───────────────────────────────────────────────────────── */

async function loadQuiz(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Quiz not found.');
  const k = keys(lessonId);
  const [draft, snapshot, current] = await Promise.all([read(store, draftLessonKey(lessonId)), read(store, publishedLessonKey(lessonId)), read(store, k.current)]);
  if (!draft || isDeletedRecord(draft) || !snapshot || draft.pedagogical_mode !== 'quiz' || !current?.version) {
    reject(404, 'not_published', 'Publish this quiz first.');
  }
  const record = await read(store, k.version(current.version));
  if (!record) reject(404, 'not_published', 'Publish this quiz first.');
  return { draft, snapshot, record, settings: resolveQuizSettings(record.settings), k };
}

const versionCache = new Map();
async function recordFor(store, lessonId, version, fallback) {
  if (version === fallback.version) return fallback;
  const cacheKey = `${lessonId}:${version}`;
  if (!versionCache.has(cacheKey)) {
    const found = await read(store, keys(lessonId).version(version));
    if (!found) return fallback;
    versionCache.set(cacheKey, found);
  }
  return versionCache.get(cacheKey);
}

/** Public form of a key's answer, for showing back after marking. */
function shownKey(key) {
  return { id: key.id, kind: key.kind, marks: key.marks, answer: key.answer, ...(key.explanation ? { explanation: key.explanation } : {}) };
}

/* ── Marking an attempt ────────────────────────────────────────────── */

/** Marks every question in an attempt, applying hint costs and any teacher marks. */
function scoreAttempt(record, attempt, teacherMarks, hintCost) {
  const rows = record.order.map((id) => {
    const entry = record.questions[id];
    const given = attempt.responses?.[id] ?? null;
    const mark = attempt.marks?.[id] ?? markResponse(entry.key, given);
    const hinted = !!attempt.hints?.[id];
    const override = teacherMarks?.[id];
    let awarded = mark.score === null ? null : afterHint(mark.score, mark.max, hinted, hintCost);
    if (typeof override === 'number') awarded = Math.max(0, Math.min(mark.max, roundMarks(override)));
    return { id, mark, awarded, hinted, response: given, confidence: attempt.confidence?.[id] ?? null };
  });
  const max = rows.reduce((s, r) => s + r.mark.max, 0);
  const score = rows.reduce((s, r) => s + (r.awarded ?? 0), 0);
  const pending = rows.filter((r) => r.awarded === null).length;
  return { rows, score: roundMarks(score), max, pending };
}

const attemptId = (device, n) => `${device}~${n}`;
const ATTEMPT_ID = /^([a-f0-9]{24})~(\d{1,2})$/;

/* ── Students ──────────────────────────────────────────────────────── */

async function deviceAttempts(store, k, device) {
  const list = await listBlobKeys(store, k.attempts(device));
  const rows = await Promise.all(list.map((key) => read(store, key)));
  return rows.filter(Boolean).sort((a, b) => a.n - b.n);
}

export async function quizAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (action.startsWith('live_')) return liveStudent(store, lessonId, body, action);
  if (!['status', 'start', 'hint', 'check', 'submit'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { record, settings, k } = await loadQuiz(store, lessonId);
  const closesAt = Date.parse(settings.closes_at ?? '');
  const closed = Number.isFinite(closesAt) && closesAt < Date.now();
  const live = await read(store, k.live);
  const shared = {
    version: record.version,
    open: !closed,
    attempts_allowed: settings.attempts,
    live: !!live && live.expires > Date.now() && live.phase !== 'done'
  };
  if (!body.token) {
    if (action !== 'status') reject(400, 'no_device', 'This browser needs to allow saving to take the quiz.');
    return { ...shared, attempts_used: 0, current: null, results: [] };
  }
  if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to take the quiz.');
  const device = deviceHash(body.token);
  const attempts = await deviceAttempts(store, k, device);
  let current = attempts.find((a) => !a.submitted_at) ?? null;
  const now = Date.now();
  let reply = null;

  const save = (attempt) => store.setJSON(k.attempt(device, attempt.n), attempt);
  const needCurrent = () => {
    if (!current) reject(409, 'no_attempt', 'Start the quiz first.');
    if (current.version !== record.version) reject(409, 'republished', 'Your teacher updated this quiz. Start again.');
  };

  if (action === 'start' && !current) {
    if (closed) reject(409, 'closed', 'This quiz has closed.');
    const used = attempts.filter((a) => !a.abandoned).length;
    if (used >= settings.attempts) reject(409, 'no_attempts', settings.attempts === 1 ? 'You’ve already done this quiz.' : 'You’ve used all your attempts.');
    current = {
      n: attempts.reduce((top, a) => Math.max(top, a.n + 1), 0),
      version: record.version,
      started_at: new Date(now).toISOString(),
      deadline: settings.timer_minutes ? new Date(now + settings.timer_minutes * 60_000).toISOString() : null,
      hints: {},
      answers: {}
    };
    const created = await store.setJSON(k.attempt(device, current.n), current, { onlyIfNew: true });
    if (created?.modified === false) current = await read(store, k.attempt(device, current.n));
  }
  if (current && current.version !== record.version && action === 'start') {
    // The quiz changed under an unfinished attempt: close it out so the student can start fresh.
    current = { ...current, submitted_at: new Date(now).toISOString(), abandoned: true };
    await save(current);
    reject(409, 'republished', 'Your teacher updated this quiz. Press Start again.');
  }

  if (action === 'hint') {
    needCurrent();
    const entry = record.questions[body.question_id];
    if (!entry?.key.hint) reject(404, 'no_hint', 'There’s no hint for this question.');
    if (!current.hints[body.question_id]) {
      current = { ...current, hints: { ...current.hints, [body.question_id]: true } };
      await save(current);
    }
    reply = { hint: entry.key.hint };
  }

  if (action === 'check') {
    needCurrent();
    if (settings.feedback !== 'instant') reject(409, 'not_instant', 'Answers are marked at the end of this quiz.');
    const entry = record.questions[body.question_id];
    if (!entry) reject(404, 'not_found', 'Unknown question.');
    if (current.answers[body.question_id]) reject(409, 'answered', 'You’ve already answered this one.');
    const response = cleanResponse(entry.key.kind, body.response);
    const mark = markResponse(entry.key, response);
    current = {
      ...current,
      answers: {
        ...current.answers,
        [body.question_id]: { response, mark, confidence: confidenceOf(body.confidence), at: new Date(now).toISOString() }
      }
    };
    await save(current);
    reply = { mark, key: shownKey(entry.key) };
  }

  if (action === 'submit') {
    needCurrent();
    const responses = {};
    const confidence = {};
    const marks = {};
    const given = body.responses && typeof body.responses === 'object' ? body.responses : {};
    for (const id of record.order) {
      const entry = record.questions[id];
      const instant = current.answers[id];
      if (instant) {
        responses[id] = instant.response;
        marks[id] = instant.mark;
        if (instant.confidence) confidence[id] = instant.confidence;
        continue;
      }
      const response = cleanResponse(entry.key.kind, given[id]);
      if (response && hasAnswer(response)) responses[id] = response;
      marks[id] = markResponse(entry.key, response);
      const c = confidenceOf(body.confidence?.[id]);
      if (c) confidence[id] = c;
    }
    const deadline = Date.parse(current.deadline ?? '');
    current = {
      ...current,
      responses,
      confidence,
      marks,
      submitted_at: new Date(now).toISOString(),
      overtime: Number.isFinite(deadline) && now > deadline + GRACE_MS
    };
    await save(current);
  }

  const released = settings.feedback !== 'released' || !!(await read(store, k.release))?.released;
  const done = (await deviceAttempts(store, k, device)).filter((a) => a.submitted_at && !a.abandoned);
  const results = await Promise.all(
    done.map(async (a) => {
      const rec = await recordFor(store, lessonId, a.version, record);
      const scored = scoreAttempt(rec, a, await read(store, k.marks(device, a.n)), settings.hint_cost);
      const base = { n: a.n, submitted_at: a.submitted_at, released };
      if (!released) return base;
      return {
        ...base,
        score: scored.score,
        max: scored.max,
        pending: scored.pending,
        same_version: a.version === record.version,
        rows: scored.rows.map((r) => ({
          id: r.id,
          mark: r.mark,
          awarded: r.awarded,
          hinted: r.hinted,
          response: r.response,
          key: shownKey(rec.questions[r.id].key)
        }))
      };
    })
  );

  const openAttempt = current && !current.submitted_at && current.version === record.version ? current : null;
  return {
    ...shared,
    ...(reply ?? {}),
    attempts_used: done.length + (openAttempt ? 1 : 0),
    now: new Date(now).toISOString(),
    current: openAttempt
      ? {
          n: openAttempt.n,
          started_at: openAttempt.started_at,
          deadline: openAttempt.deadline,
          hints: Object.fromEntries(Object.keys(openAttempt.hints ?? {}).map((id) => [id, record.questions[id]?.key.hint ?? ''])),
          answers: Object.fromEntries(
            Object.entries(openAttempt.answers ?? {}).map(([id, a]) => [id, { response: a.response, mark: a.mark, key: shownKey(record.questions[id].key) }])
          )
        }
      : null,
    results
  };
}

function confidenceOf(value) {
  return [1, 2, 3].includes(value) ? value : null;
}

/* ── Teacher ───────────────────────────────────────────────────────── */

export async function quizTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Quiz not found.');
  const action = body.action ?? 'submissions';
  if (action === 'submissions') return { submissions: await listSubmissions(store, lessonId) };
  if (action === 'review') {
    await reviewSubmission(store, lessonId, body);
    return { submissions: await listSubmissions(store, lessonId) };
  }
  if (action.startsWith('live_')) return liveTeacher(store, lessonId, body, action);
  if (!['results', 'attempt', 'mark', 'release'].includes(action)) reject(400, 'bad_action', 'Unknown action.');

  let loaded;
  try {
    loaded = await loadQuiz(store, lessonId);
  } catch (error) {
    if (error instanceof QuizError && error.code === 'not_published') return { published: false };
    throw error;
  }
  const { record, settings, k } = loaded;

  if (action === 'release') {
    await store.setJSON(k.release, { released: body.released === true, at: new Date().toISOString() });
  }

  if (action === 'mark') {
    const match = ATTEMPT_ID.exec(String(body.attempt_id ?? ''));
    if (!match) reject(400, 'bad_request', 'Unknown attempt.');
    const attempt = await read(store, k.attempt(match[1], Number(match[2])));
    if (!attempt?.submitted_at) reject(404, 'not_found', 'That attempt is gone.');
    const rec = await recordFor(store, lessonId, attempt.version, record);
    const entry = rec.questions[body.question_id];
    if (!entry) reject(404, 'not_found', 'Unknown question.');
    const existing = (await read(store, k.marks(match[1], Number(match[2])))) ?? {};
    const next = { ...existing };
    if (body.score === null) delete next[body.question_id];
    else {
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > entry.key.marks) reject(400, 'bad_marks', `Give between 0 and ${entry.key.marks} marks.`);
      next[body.question_id] = roundMarks(score);
    }
    await store.setJSON(k.marks(match[1], Number(match[2])), next);
  }

  if (action === 'attempt' || action === 'mark') {
    const match = ATTEMPT_ID.exec(String(body.attempt_id ?? ''));
    if (!match) reject(400, 'bad_request', 'Unknown attempt.');
    const attempt = await read(store, k.attempt(match[1], Number(match[2])));
    if (!attempt?.submitted_at) reject(404, 'not_found', 'That attempt is gone.');
    const rec = await recordFor(store, lessonId, attempt.version, record);
    const scored = scoreAttempt(rec, attempt, await read(store, k.marks(match[1], Number(match[2]))), settings.hint_cost);
    return {
      published: true,
      attempt: {
        id: attemptId(match[1], Number(match[2])),
        device: match[1].slice(0, 6),
        n: attempt.n,
        submitted_at: attempt.submitted_at,
        overtime: !!attempt.overtime,
        score: scored.score,
        max: scored.max,
        pending: scored.pending,
        rows: scored.rows.map((r) => ({ ...r, question: rec.questions[r.id].question, key: rec.questions[r.id].key }))
      }
    };
  }

  // results
  const attemptKeys = await listBlobKeys(store, `quiz/${lessonId}/attempts/`);
  const attempts = (await Promise.all(attemptKeys.map((key) => read(store, key)))).map((a, i) => (a ? { a, key: attemptKeys[i] } : null)).filter(Boolean);
  const stats = new Map(record.order.map((id) => [id, { answered: 0, total: 0, full: 0, pending: 0, hinted: 0, confidence: { 1: [0, 0], 2: [0, 0], 3: [0, 0] }, picks: {} }]));
  const rows = [];
  for (const { a, key } of attempts) {
    if (!a.submitted_at || a.abandoned) continue;
    const device = key.split('/')[3];
    const rec = await recordFor(store, lessonId, a.version, record);
    const scored = scoreAttempt(rec, a, await read(store, k.marks(device, a.n)), settings.hint_cost);
    rows.push({
      id: attemptId(device, a.n),
      device: device.slice(0, 6),
      n: a.n,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
      overtime: !!a.overtime,
      score: scored.score,
      max: scored.max,
      pending: scored.pending,
      current: a.version === record.version
    });
    for (const r of scored.rows) {
      const s = stats.get(r.id);
      if (!s) continue;
      s.total += 1;
      if (r.response) s.answered += 1;
      if (r.awarded === null) s.pending += 1;
      else if (r.awarded >= r.mark.max) s.full += 1;
      if (r.hinted) s.hinted += 1;
      if (r.confidence) {
        s.confidence[r.confidence][0] += 1;
        if (r.awarded !== null && r.awarded >= r.mark.max) s.confidence[r.confidence][1] += 1;
      }
      if (a.version === record.version && r.response?.selected) for (const id of r.response.selected) s.picks[id] = (s.picks[id] ?? 0) + 1;
    }
  }
  rows.sort((x, y) => String(y.submitted_at).localeCompare(String(x.submitted_at)));
  return {
    published: true,
    version: record.version,
    feedback: settings.feedback,
    released: !!(await read(store, k.release))?.released,
    attempts: rows,
    questions: record.order.map((id) => ({ id, question: record.questions[id].question, key: record.questions[id].key, ...stats.get(id) }))
  };
}

/* ── Live ──────────────────────────────────────────────────────────── */

async function liveState(store, k) {
  const live = await read(store, k.live);
  return live && live.expires > Date.now() ? live : null;
}

async function liveTeacher(store, lessonId, body, action) {
  if (!['live_status', 'live_start', 'live_next', 'live_reveal', 'live_end', 'live_back'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  let loaded;
  try {
    loaded = await loadQuiz(store, lessonId);
  } catch (error) {
    if (action === 'live_status' && error instanceof QuizError && error.code === 'not_published') return { live: null, published: false };
    throw error;
  }
  const { record, k } = loaded;
  let live = await liveState(store, k);

  if (action === 'live_start') {
    if (!record.order.length) reject(409, 'empty', 'Add and publish some questions first.');
    live = {
      session: randomBytes(16).toString('hex'),
      code: String(randomInt(100000, 1000000)),
      phase: 'lobby',
      index: -1,
      order: record.order,
      version: record.version,
      expires: Date.now() + LIVE_HOURS * 3600_000
    };
  } else if (action === 'live_end' && live) {
    live = { ...live, phase: 'done', expires: 0 };
  } else if (live && action === 'live_next') {
    live = live.index + 1 >= live.order.length ? { ...live, phase: 'done' } : { ...live, phase: 'question', index: live.index + 1, question_at: new Date().toISOString() };
  } else if (live && action === 'live_back' && live.index > 0) {
    live = { ...live, phase: 'reveal', index: live.index - 1 };
  } else if (live && action === 'live_reveal' && live.phase === 'question') {
    live = { ...live, phase: 'reveal' };
  }
  if (action !== 'live_status' && live) await store.setJSON(k.live, live);
  if (!live || live.expires < Date.now()) return { live: null };

  const rec = await recordFor(store, lessonId, live.version, record);
  const joined = (await listBlobKeys(store, k.players(live.session))).length;
  const out = { session: live.session, code: live.code, phase: live.phase, index: live.index, total: live.order.length, joined };
  if (live.index < 0 || live.phase === 'lobby') return { live: out };
  const id = live.order[live.index];
  const entry = rec.questions[id];
  const answerKeys = await listBlobKeys(store, k.answers(live.session, live.index));
  const answers = (await Promise.all(answerKeys.map((key) => read(store, key)))).filter(Boolean);
  const picks = {};
  let full = 0;
  let marked = 0;
  for (const a of answers) {
    for (const pick of a.response?.selected ?? []) picks[pick] = (picks[pick] ?? 0) + 1;
    if (typeof a.response?.value === 'boolean') picks[String(a.response.value)] = (picks[String(a.response.value)] ?? 0) + 1;
    if (a.mark?.score !== null && a.mark?.score !== undefined) {
      marked += 1;
      if (a.mark.score >= a.mark.max) full += 1;
    }
  }
  return {
    live: {
      ...out,
      question: entry.question,
      key: shownKey(entry.key),
      answered: answers.length,
      right: full,
      marked,
      picks,
      written: entry.key.answer.type === 'manual' || entry.key.answer.type === 'text' ? answers.map((a) => a.response?.text ?? '').filter(Boolean).slice(0, 60) : []
    }
  };
}

async function liveStudent(store, lessonId, body, action) {
  if (!['live_status', 'live_join', 'live_answer'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { record, k } = await loadQuiz(store, lessonId);
  const live = await liveState(store, k);
  if (!live || live.phase === 'done') return { live: null };
  if (body.session && body.session !== live.session) reject(409, 'new_session', 'Your teacher started a new live quiz. Join again.');
  const out = { session: live.session, phase: live.phase, index: live.index, total: live.order.length };
  if (!body.token) return { live: { ...out, joined: false } };
  if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to join.');
  const device = deviceHash(body.token);

  if (action === 'live_join') {
    if (String(body.code ?? '').replace(/\D/g, '') !== live.code) reject(403, 'wrong_code', 'That code didn’t match. Check the board.');
    await store.setJSON(k.player(live.session, device), { joined_at: new Date().toISOString() }, { onlyIfNew: true });
  }
  const joined = !!(await read(store, k.player(live.session, device)));
  if (!joined) return { live: { ...out, joined: false } };
  if (live.index < 0 || live.phase === 'lobby') return { live: { ...out, joined: true } };

  const rec = await recordFor(store, lessonId, live.version, record);
  const id = live.order[live.index];
  const entry = rec.questions[id];
  const answerKey = k.answer(live.session, live.index, device);
  if (action === 'live_answer') {
    if (live.phase !== 'question') reject(409, 'closed', 'Answers are closed for this question.');
    if (Number(body.index) !== live.index) reject(409, 'moved_on', 'Your teacher has moved on.');
    const response = cleanResponse(entry.key.kind, body.response);
    if (!response || !hasAnswer(response)) reject(400, 'empty', 'Choose or write an answer first.');
    const mark = markResponse(entry.key, response);
    await store.setJSON(answerKey, { response, mark, at: new Date().toISOString() }, { onlyIfNew: true });
  }
  const mine = await read(store, answerKey);
  return {
    live: {
      ...out,
      joined: true,
      question: entry.question,
      answered: !!mine,
      response: mine?.response ?? null,
      ...(live.phase === 'reveal' ? { mark: mine?.mark ?? null, key: shownKey(entry.key) } : {})
    }
  };
}
