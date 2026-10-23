/**
 * Quiz lessons: publish, take, mark and run live.
 *
 *   quiz/{lesson}/current                            { version }
 *   quiz/{lesson}/keys/{version}                     { order, questions: { id: { question, key } }, settings }
 *   quiz/{lesson}/attempts/{device}/{n}              an attempt's start: version, deadline
 *   quiz/{lesson}/hints/{device}/{n}/{question}      a hint opened (create-only)
 *   quiz/{lesson}/checked/{device}/{n}/{question}    an answer checked in instant mode (create-only)
 *   quiz/{lesson}/results/{device}/{n}               the hand-in (create-only)
 *   quiz/{lesson}/marks/{device}~{n}                 { question id: marks | { marks, codes } } teacher marking
 *   quiz/{lesson}/cleared/{device}                   { from } goes before `from` were cleared by the teacher
 *   quiz/{lesson}/release                            { released } when feedback waits for the teacher
 *   quiz/{lesson}/live/active                        live round (teacher writes only)
 *   quiz/{lesson}/live/{session}/players/{device}    { joined_at }
 *   quiz/{lesson}/live/{session}/answers/{i}/{device} create-only answer to question i
 *   quiz/{lesson}/closed                             { at } the teacher pressed Close now
 *   quiz/{lesson}/flags                              { dismissed } insight flags the teacher dismissed
 *   quiz/{lesson}/evidence/{class|all}               saved insight of a closed, fully marked quiz
 *   quiz/{lesson}/evidence-stamp                     { at } last change to any answer, mark or attempt
 *
 * Students answer from a class page. Once a class has a list, a student
 * claims their initials (class-claims.mjs) and their attempts are kept under
 * the student, not the device, so they follow them to a new device after the
 * teacher releases the old one. A class with no list stays anonymous.
 *
 * Answers never reach the published lesson. On publish each question is split
 * into what students see and a key (quiz-core.mjs); keys are stored here by
 * publish version, so a republish never re-marks old attempts against new ids.
 * Every mark is worked out on the server.
 *
 * Students have no accounts. A device keeps a random token and the server
 * keeps a hash of it. Attempts are counted by that hash, or by the student once initials are claimed.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { claimFor, claimInitials, classesForLesson, loadRoster } from './class-claims.mjs';
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
import { answerEvidence } from './quiz-evidence.mjs';

export { QuizError };

const GRACE_MS = 60_000;
const LIVE_HOURS = 6;
const cryptoRandom = () => randomInt(0, 2 ** 31) / 2 ** 31;

const keys = (lesson) => ({
  current: `quiz/${lesson}/current`,
  version: (v) => `quiz/${lesson}/keys/${v}`,
  attempts: (device) => `quiz/${lesson}/attempts/${device}/`,
  attempt: (device, n) => `quiz/${lesson}/attempts/${device}/${n}`,
  hints: (device, n) => `quiz/${lesson}/hints/${device}/${n}/`,
  hint: (device, n, id) => `quiz/${lesson}/hints/${device}/${n}/${id}`,
  checked: (device, n) => `quiz/${lesson}/checked/${device}/${n}/`,
  check: (device, n, id) => `quiz/${lesson}/checked/${device}/${n}/${id}`,
  result: (device, n) => `quiz/${lesson}/results/${device}/${n}`,
  marks: (device, n) => `quiz/${lesson}/marks/${device}~${n}`,
  cleared: (device) => `quiz/${lesson}/cleared/${device}`,
  release: `quiz/${lesson}/release`,
  live: `quiz/${lesson}/live/active`,
  player: (session, device) => `quiz/${lesson}/live/${session}/players/${device}`,
  players: (session) => `quiz/${lesson}/live/${session}/players/`,
  answer: (session, i, device) => `quiz/${lesson}/live/${session}/answers/${i}/${device}`,
  answers: (session, i) => `quiz/${lesson}/live/${session}/answers/${i}/`,
  closed: `quiz/${lesson}/closed`,
  flags: `quiz/${lesson}/flags`,
  insight: (cls) => `quiz/${lesson}/evidence/${cls}`,
  stamp: `quiz/${lesson}/evidence-stamp`
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

/** A question in a record, ignoring inherited names like `__proto__`. */
function entryFor(record, id) {
  return typeof id === 'string' && Object.hasOwn(record.questions, id) ? record.questions[id] : null;
}

const INSIGHT_SCHEMA = 1;

/** Closed by the teacher's Close now, or by the Closes date. */
async function closedState(store, k, settings, now = Date.now()) {
  if (await read(store, k.closed)) return { closed: true, by: 'button' };
  const closesAt = Date.parse(settings.closes_at ?? '');
  return Number.isFinite(closesAt) && closesAt < now ? { closed: true, by: 'date' } : { closed: false, by: null };
}

/** A saved copy is only saved once nothing has changed for this long. */
const INSIGHT_SETTLE_MS = 60_000;

/**
 * Saved insight goes stale when any answer, mark or attempt changes. One
 * write, no listing: a saved copy carries the stamp it was built with, so an
 * older copy simply stops matching.
 */
async function markInsightChanged(store, lessonId) {
  await store.setJSON(keys(lessonId).stamp, { at: new Date().toISOString() });
}

/** Feedback-code ids on one answer: unique, at most 8. */
const cleanCodes = (v) => (Array.isArray(v) ? [...new Set(v.filter((c) => typeof c === 'string' && c.length > 0 && c.length <= 64))].slice(0, 8) : []);

/** Students' copy of a record's questions, in quiz order. */
const publicQuestions = (record) => record.order.map((id) => record.questions[id].question);

/** Marks every question in a handed-in attempt, applying hint costs and any teacher marks. */
function scoreAttempt(record, result, teacherMarks) {
  const hintCost = resolveQuizSettings(record.settings).hint_cost;
  const rows = record.order.map((id) => {
    const entry = record.questions[id];
    const given = result.responses?.[id] ?? null;
    const mark = result.marks?.[id] ?? markResponse(entry.key, given);
    const hinted = !!result.hints?.[id];
    // A teacher mark is a number, or { marks, codes } once feedback codes were picked.
    const override = teacherMarks?.[id];
    const overrideMarks = typeof override === 'number' ? override : typeof override?.marks === 'number' ? override.marks : null;
    let awarded = mark.score === null ? null : afterHint(mark.score, mark.max, hinted, hintCost);
    if (overrideMarks !== null) awarded = Math.max(0, Math.min(mark.max, roundMarks(overrideMarks)));
    const codes = cleanCodes(override?.codes);
    return { id, mark, awarded, hinted, response: given, confidence: result.confidence?.[id] ?? null, codes };
  });
  const max = rows.reduce((s, r) => s + r.mark.max, 0);
  const score = rows.reduce((s, r) => s + (r.awarded ?? 0), 0);
  const pending = rows.filter((r) => r.awarded === null).length;
  return { rows, score: roundMarks(score), max, pending };
}

const attemptId = (device, n) => `${device}~${n}`;
const ATTEMPT_ID = /^([a-f0-9]{24})~(\d{1,4})$/;

/* ── Students ──────────────────────────────────────────────────────── */

/**
 * One attempt, assembled from create-only pieces so two requests at once can
 * never undo each other: the start, one blob per hint opened, one per
 * checked answer, and the hand-in.
 */
async function loadAttempt(store, k, device, start) {
  const [hintKeys, answerKeys, result] = await Promise.all([
    listBlobKeys(store, k.hints(device, start.n)),
    listBlobKeys(store, k.checked(device, start.n)),
    read(store, k.result(device, start.n))
  ]);
  const answers = {};
  await Promise.all(
    answerKeys.map(async (key) => {
      const a = await read(store, key);
      if (a) answers[key.slice(key.lastIndexOf('/') + 1)] = a;
    })
  );
  const hints = Object.fromEntries(hintKeys.map((key) => [key.slice(key.lastIndexOf('/') + 1), true]));
  return { ...start, hints, answers, result };
}

/** The first go that still counts. Goes before it were cleared by the teacher. */
async function clearedFrom(store, k, device) {
  return (await read(store, k.cleared(device)))?.from ?? 0;
}

async function deviceAttempts(store, k, device, from) {
  const list = await listBlobKeys(store, k.attempts(device));
  const starts = (await Promise.all(list.map((key) => read(store, key)))).filter((s) => s && s.n >= from).sort((a, b) => a.n - b.n);
  // Listings lag behind writes, so a go started moments ago can be missing.
  // Reads by key are current: check the slots after the last listed go.
  for (let n = starts.reduce((top, s) => Math.max(top, s.n + 1), from); n < from + 100; n += 1) {
    const next = await read(store, k.attempt(device, n));
    if (!next) break;
    starts.push(next);
  }
  return Promise.all(starts.map((start) => loadAttempt(store, k, device, start)));
}

/**
 * Works out who is answering. With no class the quiz can be looked at but not
 * answered. A class with no list stays anonymous. Otherwise the device must
 * hold claimed initials, and `claim` is how it gets them.
 */
async function identify(store, body, action) {
  if (!body.class_id) return { classId: null, student: null, need: 'class' };
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this quiz from your class page.');
  if (!roster.students.length) return { classId: roster.cls.id, student: null, need: null };
  const student = action === 'claim'
    ? await claimInitials(store, roster, body.class_token, body.initials)
    : await claimFor(store, roster, body.class_token);
  return { classId: roster.cls.id, student, need: student ? null : 'initials' };
}

function needIdentity(who) {
  if (who.need === 'class') reject(403, 'need_class', 'Open this quiz from your class page.');
  if (who.need === 'initials') reject(403, 'need_initials', 'Type your initials first.');
}

/** Whose attempts these are: the student once known, else this device. Same 24-hex shape either way. */
const ownerOf = (who, token) => (who.student ? deviceHash(`student:${who.classId}:${who.student.id}`) : deviceHash(token));
const identityOf = (who) => ({ need: who.need, initials: who.student?.initials ?? null });
const studentFields = (who) => (who.classId ? { class_id: who.classId, ...(who.student ? { student_id: who.student.id } : {}) } : {});

export async function quizAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (action.startsWith('live_')) return liveStudent(store, lessonId, body, action);
  if (!['status', 'claim', 'start', 'hint', 'check', 'submit'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { record, settings, k } = await loadQuiz(store, lessonId);
  const who = await identify(store, body, action);
  // A follow-up quiz is for the students it was made for.
  if (settings.for_students?.length && who.student && !settings.for_students.includes(who.student.id)) {
    reject(403, 'not_for_you', 'This quiz is for a small group.');
  }
  if (!['status', 'claim'].includes(action)) needIdentity(who);
  const now = Date.now();
  const { closed } = await closedState(store, k, settings, now);
  const live = await read(store, k.live);
  const shared = {
    identity: identityOf(who),
    version: record.version,
    open: !closed,
    attempts_allowed: settings.attempts,
    settings: { ...publicSettings(record.settings), version: record.version, question_count: record.order.length, total_marks: record.order.reduce((sum, id) => sum + record.questions[id].key.marks, 0) },
    questions: publicQuestions(record),
    live: !!live && live.expires > now && live.phase !== 'done'
  };
  // A plain lesson link names no class: offer the lesson's classes so the
  // student can pick theirs (the page picks by itself when there is one).
  if (who.need === 'class' && action === 'status') shared.identity.classes = await classesForLesson(store, lessonId);
  // Until this device is known, it has no history here: the anonymous go it
  // may have made elsewhere is not shown, so nothing vanishes after claiming.
  if (who.need) return { ...shared, attempts_used: 0, current: null, results: [] };
  if (!who.student) {
    if (!body.token) {
      if (!['status', 'claim'].includes(action)) reject(400, 'no_device', 'This browser needs to allow saving to take the quiz.');
      return { ...shared, attempts_used: 0, current: null, results: [] };
    }
    if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to take the quiz.');
  }
  const device = ownerOf(who, body.token);
  const from = await clearedFrom(store, k, device);
  let attempts = await deviceAttempts(store, k, device, from);
  let current = attempts.find((a) => !a.result) ?? null;
  let reply = null;

  // An open attempt is always marked against the version it started on, so a
  // republish mid-quiz never loses or mis-marks anyone's answers.
  const attemptRecord = current ? await recordFor(store, lessonId, current.version, record) : record;
  const attemptSettings = resolveQuizSettings(attemptRecord.settings);
  const deadline = Date.parse(current?.deadline ?? '');
  const pastDeadline = Number.isFinite(deadline) && now > deadline + GRACE_MS;
  const needCurrent = () => {
    if (!current) reject(409, 'no_attempt', 'Start the quiz first.');
  };
  const needTime = () => {
    if (closed) reject(409, 'closed', 'This quiz has closed. Hand in what you have.');
    if (pastDeadline && attemptSettings.timer_hard) reject(409, 'time_up', 'Time’s up. Hand in what you have.');
  };
  const lastAttempt = (a) => a.n - from + 1 >= attemptSettings.attempts;

  if (action === 'start' && !current) {
    if (closed) reject(409, 'closed', 'This quiz has closed.');
    if (attempts.length >= settings.attempts) reject(409, 'no_attempts', settings.attempts === 1 ? 'You’ve already done this quiz.' : 'You’ve used all your attempts.');
    const start = {
      n: attempts.reduce((top, a) => Math.max(top, a.n + 1), from),
      version: record.version,
      started_at: new Date(now).toISOString(),
      deadline: settings.timer_minutes ? new Date(now + settings.timer_minutes * 60_000).toISOString() : null,
      ...studentFields(who)
    };
    await store.setJSON(k.attempt(device, start.n), start, { onlyIfNew: true });
    attempts = await deviceAttempts(store, k, device, from);
    current = attempts.find((a) => !a.result) ?? null;
  }

  if (action === 'hint') {
    needCurrent();
    needTime();
    const entry = entryFor(attemptRecord, body.question_id);
    if (!entry?.key.hint) reject(404, 'no_hint', 'There’s no hint for this question.');
    await store.setJSON(k.hint(device, current.n, body.question_id), { at: new Date(now).toISOString() }, { onlyIfNew: true });
    current.hints[body.question_id] = true;
    reply = { hint: entry.key.hint };
  }

  if (action === 'check') {
    needCurrent();
    needTime();
    if (attemptSettings.feedback !== 'instant') reject(409, 'not_instant', 'Answers are marked at the end of this quiz.');
    const entry = entryFor(attemptRecord, body.question_id);
    if (!entry) reject(404, 'not_found', 'Unknown question.');
    const response = cleanResponse(entry.key.kind, body.response);
    const mark = markResponse(entry.key, response);
    const answer = { response, mark, confidence: confidenceOf(body.confidence), at: new Date(now).toISOString() };
    const written = await store.setJSON(k.check(device, current.n, body.question_id), answer, { onlyIfNew: true });
    if (written?.modified === false || current.answers[body.question_id]) reject(409, 'answered', 'You’ve already answered this one.');
    current.answers[body.question_id] = answer;
    // The right answer only shows on the last go, so it can't be carried into the next attempt.
    reply = { mark, key: lastAttempt(current) ? shownKey(entry.key) : null };
  }

  if (action === 'submit') {
    needCurrent();
    const responses = {};
    const confidence = {};
    const marks = {};
    const given = body.responses && typeof body.responses === 'object' ? body.responses : {};
    for (const id of attemptRecord.order) {
      const entry = attemptRecord.questions[id];
      const instant = current.answers[id];
      if (instant) {
        responses[id] = instant.response;
        marks[id] = instant.mark;
        if (instant.confidence) confidence[id] = instant.confidence;
        continue;
      }
      const response = cleanResponse(entry.key.kind, Object.hasOwn(given, id) ? given[id] : null);
      if (response && hasAnswer(response)) responses[id] = response;
      marks[id] = markResponse(entry.key, response);
      const c = confidenceOf(body.confidence?.[id]);
      if (c) confidence[id] = c;
    }
    const result = {
      responses,
      confidence,
      marks,
      hints: current.hints,
      submitted_at: new Date(now).toISOString(),
      overtime: pastDeadline || closed
    };
    await store.setJSON(k.result(device, current.n), result, { onlyIfNew: true });
    await markInsightChanged(store, lessonId);
    attempts = await deviceAttempts(store, k, device, from);
    current = null;
  }

  const released = settings.feedback !== 'released' || !!(await read(store, k.release))?.released;
  const done = attempts.filter((a) => a.result);
  const used = attempts.length;
  // Right answers wait until no attempts are left or the quiz has closed.
  const revealKeys = closed || used >= settings.attempts;
  const results = await Promise.all(
    done.map(async (a) => {
      const rec = await recordFor(store, lessonId, a.version, record);
      const scored = scoreAttempt(rec, a.result, await read(store, k.marks(device, a.n)));
      const base = { n: a.n, submitted_at: a.result.submitted_at, released };
      if (!released) return base;
      return {
        ...base,
        score: scored.score,
        max: scored.max,
        pending: scored.pending,
        same_version: a.version === record.version,
        keys_shown: revealKeys,
        rows: scored.rows.map((r) => ({
          id: r.id,
          question: rec.questions[r.id].question,
          mark: r.mark,
          awarded: r.awarded,
          hinted: r.hinted,
          response: r.response,
          key: revealKeys ? shownKey(rec.questions[r.id].key) : null
        }))
      };
    })
  );

  const open = current && !current.result ? current : null;
  return {
    ...shared,
    ...(reply ?? {}),
    attempts_used: used,
    now: new Date(now).toISOString(),
    current: open
      ? {
          n: open.n,
          version: open.version,
          started_at: open.started_at,
          deadline: open.deadline,
          settings: { ...publicSettings(attemptRecord.settings), version: attemptRecord.version },
          questions: publicQuestions(attemptRecord),
          hints: Object.fromEntries(Object.keys(open.hints).filter((id) => entryFor(attemptRecord, id)).map((id) => [id, attemptRecord.questions[id].key.hint ?? ''])),
          answers: Object.fromEntries(
            Object.entries(open.answers)
              .filter(([id]) => entryFor(attemptRecord, id))
              .map(([id, a]) => [id, { response: a.response, mark: a.mark, key: lastAttempt(open) ? shownKey(attemptRecord.questions[id].key) : null }])
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

/** The teacher's label for an attempt: initials and name, or null when it was anonymous. */
async function studentLabel(store, start, rosters) {
  if (!start?.class_id || !start.student_id) return null;
  if (!rosters.has(start.class_id)) rosters.set(start.class_id, loadRoster(store, start.class_id));
  const found = (await rosters.get(start.class_id))?.students.find((s) => s.id === start.student_id);
  return found ? { initials: found.initials, name: found.name } : { initials: null, name: null };
}

/**
 * Clears every go one student (or anonymous device) has made, so they can
 * start again. Numbering carries on past the cleared goes, so a new go never
 * lands on an old key or an old draft saved on the device.
 */
async function clearOwner(store, k, lessonId, device) {
  const from = await clearedFrom(store, k, device);
  const goes = await deviceAttempts(store, k, device, from);
  const next = goes.reduce((top, a) => Math.max(top, a.n + 1), from);
  await store.setJSON(k.cleared(device), { from: next, at: new Date().toISOString() });
  const prefixes = ['attempts', 'hints', 'checked', 'results'].map((part) => `quiz/${lessonId}/${part}/${device}/`).concat(`quiz/${lessonId}/marks/${device}~`);
  const doomed = (await Promise.all(prefixes.map((prefix) => listBlobKeys(store, prefix)))).flat();
  await mapBounded(doomed, 8, (key) => store.delete(key));
}

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
  if (action === 'classes') return { classes: await classesForLesson(store, lessonId) };
  if (!['results', 'attempt', 'mark', 'release', 'reset', 'clear_all', 'insight', 'close', 'reopen', 'dismiss_flag'].includes(action)) reject(400, 'bad_action', 'Unknown action.');

  let loaded;
  try {
    loaded = await loadQuiz(store, lessonId);
  } catch (error) {
    if (error instanceof QuizError && error.code === 'not_published') return { published: false };
    throw error;
  }
  const { record, settings, k } = loaded;
  const rosters = new Map();

  if (action === 'insight') return classInsight(store, lessonId, body.class_id ?? null, loaded);

  if (action === 'close' || action === 'reopen') {
    if (action === 'close') await store.setJSON(k.closed, { at: new Date().toISOString() });
    else await store.delete(k.closed);
    return classInsight(store, lessonId, body.class_id ?? null, loaded);
  }

  if (action === 'dismiss_flag') {
    const flag = typeof body.flag_id === 'string' ? body.flag_id.slice(0, 160) : '';
    if (!flag) reject(400, 'bad_request', 'Unknown flag.');
    const was = (await read(store, k.flags))?.dismissed ?? [];
    const dismissed = body.undo === true ? was.filter((f) => f !== flag) : [...new Set([...was, flag])].slice(-200);
    await store.setJSON(k.flags, { dismissed });
    return { dismissed };
  }

  if (action === 'release') {
    await store.setJSON(k.release, { released: body.released === true, at: new Date().toISOString() });
  }

  if (action === 'reset') {
    const match = ATTEMPT_ID.exec(String(body.attempt_id ?? ''));
    if (!match) reject(400, 'bad_request', 'Unknown attempt.');
    await clearOwner(store, k, lessonId, match[1]);
    await markInsightChanged(store, lessonId);
  }

  if (action === 'clear_all') {
    const owners = new Set((await listBlobKeys(store, `quiz/${lessonId}/attempts/`)).map((key) => key.split('/')[3]).filter(Boolean));
    await mapBounded([...owners], 4, (device) => clearOwner(store, k, lessonId, device));
    await markInsightChanged(store, lessonId);
  }

  const handedIn = async () => {
    const match = ATTEMPT_ID.exec(String(body.attempt_id ?? ''));
    if (!match) reject(400, 'bad_request', 'Unknown attempt.');
    const [device, n] = [match[1], Number(match[2])];
    const [start, result] = await Promise.all([read(store, k.attempt(device, n)), read(store, k.result(device, n))]);
    if (!start || !result) reject(404, 'not_found', 'That attempt is gone.');
    return { device, n, start, result, rec: await recordFor(store, lessonId, start.version, record) };
  };

  if (action === 'mark') {
    const { device, n, rec } = await handedIn();
    const entry = entryFor(rec, body.question_id);
    if (!entry) reject(404, 'not_found', 'Unknown question.');
    const existing = (await read(store, k.marks(device, n))) ?? {};
    const next = { ...existing };
    if (body.score === null) delete next[body.question_id];
    else {
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > entry.key.marks) reject(400, 'bad_marks', `Give between 0 and ${entry.key.marks} marks.`);
      const codes = cleanCodes(body.codes);
      next[body.question_id] = codes.length ? { marks: roundMarks(score), codes } : roundMarks(score);
    }
    await store.setJSON(k.marks(device, n), next);
    await markInsightChanged(store, lessonId);
  }

  if (action === 'attempt' || action === 'mark') {
    const { device, n, start, result, rec } = await handedIn();
    const scored = scoreAttempt(rec, result, await read(store, k.marks(device, n)));
    return {
      published: true,
      attempt: {
        id: attemptId(device, n),
        device: device.slice(0, 6),
        student: await studentLabel(store, start, rosters),
        n,
        submitted_at: result.submitted_at,
        overtime: !!result.overtime,
        score: scored.score,
        max: scored.max,
        pending: scored.pending,
        current: start.version === record.version,
        rows: scored.rows.map((r) => ({ ...r, question: rec.questions[r.id].question, key: rec.questions[r.id].key }))
      }
    };
  }

  // results
  const resultKeys = await listBlobKeys(store, `quiz/${lessonId}/results/`);
  const stats = new Map(record.order.map((id) => [id, { answered: 0, total: 0, full: 0, pending: 0, hinted: 0, confidence: { 1: [0, 0], 2: [0, 0], 3: [0, 0] }, picks: {} }]));
  const rows = [];
  const froms = new Map();
  for (const key of resultKeys) {
    const [, , , device, nText] = key.split('/');
    const n = Number(nText);
    if (!froms.has(device)) froms.set(device, await clearedFrom(store, k, device));
    if (n < froms.get(device)) continue;
    const [start, result] = await Promise.all([read(store, k.attempt(device, n)), read(store, key)]);
    if (!start || !result) continue;
    const rec = await recordFor(store, lessonId, start.version, record);
    const scored = scoreAttempt(rec, result, await read(store, k.marks(device, n)));
    rows.push({
      id: attemptId(device, n),
      device: device.slice(0, 6),
      student: await studentLabel(store, start, rosters),
      n,
      go: n - froms.get(device),
      started_at: start.started_at,
      submitted_at: result.submitted_at,
      overtime: !!result.overtime,
      score: scored.score,
      max: scored.max,
      pending: scored.pending,
      current: start.version === record.version
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
      if (start.version === record.version && r.response?.selected) for (const id of r.response.selected) s.picks[id] = (s.picks[id] ?? 0) + 1;
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

/* ── Markbook ──────────────────────────────────────────────────────── */

/** A lesson's own outcomes: canonical ids first, else its older outcome codes. */
const lessonOutcomes = (draft) => (draft.outcome_ids?.length ? draft.outcome_ids : draft.syllabus_outcomes ?? []);

/**
 * Each owner's first handed-in attempt that a teacher hasn't cleared. With
 * `owners` (hash → student id) only they are read. The cleared record and the
 * first go are read together, so most students cost one round trip.
 */
async function firstAttempts(store, k, lessonId, owners) {
  const handedIn = new Map();
  // Listings can lag a just-written hand-in; the next load picks it up, the same as Results.
  for (const key of await listBlobKeys(store, `quiz/${lessonId}/results/`)) {
    const [, , , owner, nText] = key.split('/');
    if (!owners || owners.has(owner)) handedIn.set(owner, [...(handedIn.get(owner) ?? []), Number(nText)]);
  }
  const out = [];
  await mapBounded([...handedIn], 8, async ([owner, ns]) => {
    const sorted = [...ns].sort((a, b) => a - b);
    const readAttempt = (n) => Promise.all([read(store, k.attempt(owner, n)), read(store, k.result(owner, n)), read(store, k.marks(owner, n))]);
    // Most students were never cleared, so their first go is read alongside the cleared record.
    const [cleared, firstRead] = await Promise.all([read(store, k.cleared(owner)), readAttempt(sorted[0])]);
    const from = cleared?.from ?? 0;
    for (const n of sorted.filter((x) => x >= from)) {
      const [start, result, marks] = n === sorted[0] ? firstRead : await readAttempt(n);
      if (!start || !result) continue;
      out.push({ owner, n, start, result, marks });
      return;
    }
  });
  return out;
}

async function buildInsight(store, k, lessonId, record, fallback, cls, roster) {
  const owners = roster ? new Map(roster.students.map((s) => [deviceHash(`student:${cls}:${s.id}`), s.id])) : null;
  const firsts = await firstAttempts(store, k, lessonId, owners);
  const rosters = new Map();
  const students = roster ? roster.students.map(({ id, name, initials }) => ({ id, name, initials })) : [];
  const attempts = [];
  for (const a of firsts) {
    const rec = await recordFor(store, lessonId, a.start.version, record);
    const scored = scoreAttempt(rec, a.result, a.marks);
    const student = owners ? owners.get(a.owner) : a.start.student_id ?? a.owner;
    if (!owners) {
      const label = await studentLabel(store, a.start, rosters);
      students.push({ id: student, name: label?.name ?? `Device ${a.owner.slice(0, 6)}`, initials: label?.initials ?? '–' });
    }
    attempts.push({
      student,
      attempt_id: attemptId(a.owner, a.n),
      submitted_at: a.result.submitted_at,
      score: scored.score,
      max: scored.max,
      pending: scored.pending,
      rows: scored.rows.map((r) => {
        const entry = rec.questions[r.id];
        const outcomes = entry.key.outcomes ?? fallback;
        const items = answerEvidence({ question: entry.question, key: entry.key, response: r.response, awarded: r.awarded, codes: r.codes, fallbackOutcomes: fallback });
        return { id: r.id, awarded: r.awarded, max: r.mark.max, confidence: r.confidence, codes: r.codes, outcomes, items };
      })
    });
  }
  attempts.sort((x, y) => String(x.student).localeCompare(String(y.student)));
  return { schema: INSIGHT_SCHEMA, record_version: record.version, listed: !!roster, built_at: new Date().toISOString(), students, attempts };
}

/** Quiz lessons in the same unit, and the follow-ups made from this one. */
async function unitFamily(store, draft, lessonId) {
  const unit = draft.unit_id && isSafeId(draft.unit_id) ? await read(store, unitKey(draft.unit_id)) : null;
  const ids = (Array.isArray(unit?.lesson_ids) ? unit.lesson_ids : []).filter((id) => id !== lessonId && isSafeId(id));
  const drafts = await mapBounded(ids, 8, (id) => read(store, draftLessonKey(id)));
  const siblings = [];
  const followUps = [];
  drafts.forEach((d, i) => {
    if (!d || isDeletedRecord(d) || d.pedagogical_mode !== 'quiz') return;
    siblings.push({ lesson_id: ids[i], title: d.title });
    if (d.quiz?.follow_up_of === lessonId) followUps.push({ lesson_id: ids[i], title: d.title, flag: d.quiz.follow_up_flag ?? null });
  });
  return { siblings, followUps };
}

/**
 * One class's insight (every first attempt when classId is null): each
 * student's first attempt with its evidence items. A closed quiz with nothing
 * left to mark saves the attempts at quiz/{lesson}/evidence/{class} and reads
 * them back until something changes; a new publish makes the copy stale.
 * `family: false` skips the unit read, for the markbook. Null when the lesson
 * isn't a published quiz.
 */
export async function classInsight(store, lessonId, classId, loaded = null, { family = true, now = Date.now() } = {}) {
  if (!loaded) {
    try {
      loaded = await loadQuiz(store, lessonId);
    } catch (error) {
      if (error instanceof QuizError) return null;
      throw error;
    }
  }
  const { draft, record, settings, k } = loaded;
  const cls = typeof classId === 'string' && isSafeId(classId) ? classId : null;
  const [roster, state, saved, stampRow, flags, kin] = await Promise.all([
    cls ? loadRoster(store, cls) : null,
    closedState(store, k, settings, now),
    read(store, k.insight(cls ?? 'all')),
    read(store, k.stamp),
    family ? read(store, k.flags) : null,
    family ? unitFamily(store, draft, lessonId) : { siblings: [], followUps: [] }
  ]);
  const fallback = lessonOutcomes(draft);
  const stamp = stampRow?.at ?? null;
  // A class with no list stays anonymous, so its insight covers every first attempt.
  const listed = cls && roster?.students.length ? roster : null;
  let body;
  if (saved?.schema === INSIGHT_SCHEMA && saved.record_version === record.version && (saved.stamp ?? null) === stamp && saved.listed === !!listed) {
    body = { ...saved, saved: true };
  } else {
    body = await buildInsight(store, k, lessonId, record, fallback, listed ? cls : null, listed);
    const settled = stamp === null || now - Date.parse(stamp) > INSIGHT_SETTLE_MS;
    const known = cls === null || !!roster;
    if (known && settled && state.closed && body.attempts.every((a) => a.pending === 0)) {
      // A change landing while this was built makes the copy stale before it's saved: skip it.
      const again = (await read(store, k.stamp))?.at ?? null;
      if (again === stamp) {
        // A failed save only costs speed: the next view builds it again.
        await store.setJSON(k.insight(cls ?? 'all'), { ...body, stamp }).catch((error) => console.warn('quiz insight save failed', error));
      }
    }
  }
  // Names and who is on the list are always live: a saved copy never answers for them.
  let students = body.students;
  let attempts = body.attempts;
  if (listed) {
    students = listed.students.map(({ id, name, initials }) => ({ id, name, initials }));
    const onList = new Set(students.map((st) => st.id));
    attempts = attempts.filter((a) => onList.has(a.student));
  }
  return {
    lesson_id: lessonId,
    title: draft.title,
    unit_id: draft.unit_id ?? '',
    record_version: record.version,
    class_id: cls,
    closed: state.closed,
    closed_by: state.by,
    built_at: body.built_at,
    saved: !!body.saved,
    confidence: !!settings.confidence,
    students,
    questions: record.order.map((id) => {
      const { question, key } = record.questions[id];
      return { id, prompt: question.prompt, marks: key.marks, kind: key.kind, outcomes: key.outcomes ?? fallback };
    }),
    attempts,
    compare_with: draft.quiz?.compare_with ?? null,
    follow_up_of: draft.quiz?.follow_up_of ?? null,
    follow_up_flag: draft.quiz?.follow_up_flag ?? null,
    for_students: settings.for_students ?? [],
    dismissed: flags?.dismissed ?? [],
    follow_ups: kin.followUps,
    siblings: kin.siblings
  };
}

/**
 * Each listed student's first handed-in attempt at this quiz in one class,
 * scored as the Results tab scores it, with evidence items. Null when the
 * lesson isn't a published quiz. Goes before a teacher's clear are skipped.
 */
export async function classQuizScores(store, lessonId, classId, studentIds) {
  if (!studentIds.length) return null;
  const insight = await classInsight(store, lessonId, classId, null, { family: false });
  if (!insight) return null;
  const wanted = new Set(studentIds);
  const scores = {};
  let firstAt = null;
  for (const a of insight.attempts) {
    if (!wanted.has(a.student)) continue;
    scores[a.student] = { attempt_id: a.attempt_id, submitted_at: a.submitted_at, score: a.score, max: a.max, pending: a.pending, rows: a.rows };
    if (!firstAt || a.submitted_at < firstAt) firstAt = a.submitted_at;
  }
  return {
    lesson_id: lessonId,
    title: insight.title,
    unit_id: insight.unit_id,
    confidence: insight.confidence,
    closed: insight.closed,
    first_at: firstAt,
    questions: insight.questions.map(({ id, prompt, marks, outcomes }) => ({ id, prompt, marks, outcomes })),
    scores
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
  // The teacher's own move-on mark for focus view's checkpoint; never sent to students.
  const moveOn = Number.isInteger(record.settings?.move_on) ? record.settings.move_on : 80;
  const out = { session: live.session, code: live.code, phase: live.phase, index: live.index, total: live.order.length, joined, move_on: moveOn };
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
  const who = await identify(store, body, action);
  if (action === 'live_answer') needIdentity(who);
  const out = { session: live.session, phase: live.phase, index: live.index, total: live.order.length };
  if (!who.student && !body.token) return { live: { ...out, joined: false } };
  if (!who.student && !validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to join.');
  const device = ownerOf(who, body.token);

  if (action === 'live_join') {
    needIdentity(who);
    if (String(body.code ?? '').replace(/\D/g, '') !== live.code) reject(403, 'wrong_code', 'That code didn’t match. Check the board.');
    await store.setJSON(k.player(live.session, device), { joined_at: new Date().toISOString(), ...studentFields(who) }, { onlyIfNew: true });
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
