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
 *   quiz/{lesson}/writing/{device}/{n}               { question id: how a written answer was typed (writing.ts) }
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
import { markWalkthruDirty } from './walkthru-dirty.mjs';
import { randomBytes, randomInt } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { claimFor, claimInitials, classesForLesson, loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, listSubmissions, read, reject, reviewSubmission, validToken, walkBlocks } from './question-drop.mjs';
import {
  QuizSettingsSchema,
  WRITTEN_KINDS,
  afterHint,
  checkQuestion,
  cleanResponse,
  cleanWritingLog,
  hasAnswer,
  markResponse,
  resolveQuizSettings,
  roundMarks,
  splitQuestion,
  summariseWriting
} from './quiz-core.mjs';
import { answerEvidence } from './quiz-evidence.mjs';
import { cleanStepPick } from './next-steps.mjs';
import { exitUnlocked } from './tutorial-status.mjs';
import { interleave, isGroupSet, liftGroupSets } from './group-sets.mjs';

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
  draft: (device, n) => `quiz/${lesson}/drafts/${device}/${n}`,
  writing: (device, n) => `quiz/${lesson}/writing/${device}/${n}`,
  cleared: (device) => `quiz/${lesson}/cleared/${device}`,
  swept: `quiz/${lesson}/swept`,
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
    writing_check: s.writing_check,
    ...(s.closes_at ? { closes_at: s.closes_at } : {})
  };
}

/** Typing logs sent with a save or hand-in, for written questions only. Empty when the check is off. */
function cleanWriting(record, sent) {
  const out = {};
  if (resolveQuizSettings(record.settings).writing_check === 'off') return out;
  if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return out;
  for (const id of record.order) {
    if (!Object.hasOwn(sent, id) || !WRITTEN_KINDS.includes(record.questions[id].key.kind)) continue;
    const log = cleanWritingLog(sent[id]);
    if (log) out[id] = log;
  }
  return out;
}

/** Keeps the newest log for each question the request sent; the rest stay as they were. */
async function saveWriting(store, k, device, n, record, sent) {
  const logs = cleanWriting(record, sent);
  if (!Object.keys(logs).length) return;
  const kept = (await read(store, k.writing(device, n))) ?? {};
  await store.setJSON(k.writing(device, n), { ...kept, ...logs });
}

export function mapTree(blocks, fn) {
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
 * Lesson types that play through their own player, which has no place for
 * quiz questions. Every other type runs its quiz questions and group sets
 * inline, like a quiz does.
 */
const PLAYER_MODES = new Set(['lecture', 'design_sprint', 'case_study', 'tutorial']);

/** True when quiz questions in a lesson of this type reach students. */
export function quizRunsIn(mode) {
  return !PLAYER_MODES.has(mode);
}

/**
 * Splits every quiz question in the student blocks. Quiz questions in a lesson
 * type whose player can't show them are dropped, so an answer can never ship
 * by accident. Returns the blocks to publish and, when there are questions
 * (or the lesson is a quiz), the key record to store.
 */
export function prepareQuizPublish(draft, studentBlocks, random = cryptoRandom) {
  const isQuiz = quizRunsIn(draft?.pedagogical_mode);
  const questions = {};
  const order = [];
  const problems = [];
  let dropped = 0;
  // Group sets leave the public blocks; in a lesson type that can't run them they are dropped whole.
  const lifted = isQuiz ? liftGroupSets(studentBlocks) : { blocks: mapTree(studentBlocks, (b) => (isGroupSet(b) ? null : b)), sets: [], problems: [] };
  problems.push(...lifted.problems);
  const split = (block, setId) => {
    const checked = checkQuestion({ ...(block.content?.question ?? {}), id: block.id });
    if (!checked.ok) {
      problems.push(checked.message);
      return null;
    }
    const { question, key } = splitQuestion(checked.question, random);
    questions[block.id] = { question, key: setId ? { ...key, set: setId } : key };
    return question;
  };
  const blocks = mapTree(lifted.blocks, (block) => {
    if (block.block_type !== 'quiz_question') return block;
    if (!isQuiz) {
      dropped += 1;
      return null;
    }
    const question = split(block, null);
    if (!question) return null;
    order.push(block.id);
    return { ...block, content: { question } };
  });
  const sets = {};
  for (const s of lifted.sets) {
    const ids = [];
    mapTree(s.blocks, (block) => {
      if (block.block_type === 'quiz_question' && split(block, s.id)) ids.push(block.id);
      return block;
    });
    const { group_id, class_id, name, tags, students } = s.config;
    sets[s.id] = { group_id, class_id, name, tags: [...(tags ?? [])], students: [...(students ?? [])], questions: ids };
  }
  if (!isQuiz) return { blocks, quiz: null, problems, dropped };
  // An ordinary lesson with no questions has no quiz to store.
  if (draft?.pedagogical_mode !== 'quiz' && order.length === 0 && Object.keys(sets).length === 0) return { blocks, quiz: null, problems, dropped };
  const parsed = QuizSettingsSchema.safeParse(draft.quiz ?? {});
  const settings = parsed.success ? parsed.data : {};
  const version = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  const total = order.reduce((sum, id) => sum + questions[id].key.marks, 0);
  return {
    blocks,
    problems,
    dropped,
    quiz: {
      version,
      record: { version, order, questions, settings, created_at: new Date().toISOString(), ...(Object.keys(sets).length ? { sets } : {}) },
      snapshot: { ...publicSettings(settings), version, question_count: order.length, total_marks: total }
    }
  };
}

export async function storeQuizKey(store, lessonId, quiz) {
  const k = keys(lessonId);
  await store.setJSON(k.version(quiz.version), quiz.record);
  await store.setJSON(k.current, { version: quiz.version });
}

/**
 * A tutorial student moved group: point their exit questions at the new
 * group's. `pick(record)` returns the question ids from the current key.
 * Also adds them to `for_students`. Returns 'updated', 'started' (left alone)
 * or 'none' (no published exit check).
 */
export async function setStudentExitQuestions(store, lessonId, classId, studentId, pick) {
  const k = keys(lessonId);
  const current = await read(store, k.current);
  if (!current?.version) return 'none';
  const record = await read(store, k.version(current.version));
  if (!record?.groups || typeof record.groups !== 'object') return 'none';
  // A go already started is marked against the questions it began with, so
  // changing them now would mis-mark it. That student keeps their old set.
  const device = deviceHash(`student:${classId}:${studentId}`);
  if ((await deviceAttempts(store, k, device, await clearedFrom(store, k, device))).length) return 'started';
  const picked = pick(record);
  const questions = (Array.isArray(picked) ? picked : []).filter((id) => record.order.includes(id));
  const forStudents = Array.isArray(record.settings?.for_students) ? record.settings.for_students : [];
  await store.setJSON(k.version(current.version), {
    ...record,
    groups: { ...record.groups, [studentId]: questions },
    settings: { ...record.settings, for_students: forStudents.includes(studentId) ? forStudents : [...forStudents, studentId] }
  });
  return 'updated';
}

/* ── Loading ───────────────────────────────────────────────────────── */

/** Lesson modes whose quiz questions run on this engine: a quiz, and a tutorial's exit check. */
const QUIZ_MODES = new Set(['quiz', 'tutorial']);

/** A quiz, a tutorial's exit check, or quiz questions inside any lesson that runs them. */
function runsQuiz(mode) {
  return QUIZ_MODES.has(mode) || quizRunsIn(mode);
}

async function loadQuiz(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Quiz not found.');
  const k = keys(lessonId);
  const [draft, snapshot, current] = await Promise.all([read(store, draftLessonKey(lessonId)), read(store, publishedLessonKey(lessonId)), read(store, k.current)]);
  if (!draft || isDeletedRecord(draft) || !snapshot || !runsQuiz(draft.pedagogical_mode) || !current?.version) {
    reject(404, 'not_published', 'Publish this quiz first.');
  }
  const record = await read(store, k.version(current.version));
  if (!record) reject(404, 'not_published', 'Publish this quiz first.');
  return { draft, snapshot, record, settings: resolveQuizSettings(record.settings), k };
}

/**
 * The tags a published quiz's answer keys declare: skills and catalogue techniques.
 * The student profile measures its bars against these, not only what has been marked.
 * An unpublished quiz declares none.
 */
export async function quizDeclaredTags(store, lessonId) {
  let record;
  try {
    ({ record } = await loadQuiz(store, lessonId));
  } catch (error) {
    if (error instanceof QuizError) return [];
    throw error;
  }
  const tags = new Set();
  for (const { key } of Object.values(record.questions ?? {})) {
    for (const skill of key.skills ?? []) tags.add(`skill:${skill}`);
    for (const technique of Object.values(key.techniques ?? {})) tags.add(`tech:${technique}`);
  }
  return [...tags];
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

const INSIGHT_SCHEMA = 5;

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
  // The WalkThrus pattern monitor reads this evidence; it catches up on the next board load.
  await markWalkthruDirty(store);
}

/** Feedback-code ids on one answer: unique, at most 8. */
const cleanCodes = (v) => (Array.isArray(v) ? [...new Set(v.filter((c) => typeof c === 'string' && c.length > 0 && c.length <= 64))].slice(0, 8) : []);

/** Students' copy of a record's questions, in quiz order. */
const publicQuestions = (record) => record.order.map((id) => record.questions[id].question);

/** The quiz's own questions, without a student's practice. */
const sharedIds = (record) => record.order.filter((id) => !record.practice?.[id]);

/**
 * Each student's own questions. A tutorial's exit check holds every group's
 * questions and `groups` maps student id → question ids. A quiz with group
 * sets (`sets`) gives everyone the shared order, and each set's students its
 * questions too, spread through the shared ones; `practice` maps those ids to
 * their set. Questions a student doesn't get are dropped from `questions` too,
 * so a hint or check can't reach them by id. A plain quiz is returned as it is.
 */
export function narrow(record, studentId) {
  if (!record?.groups && !record?.sets) return record;
  // Already narrowed (an attempt on the current version reuses the student's copy): narrowing again would add practice twice.
  if (record.practice) return record;
  let order = record.order;
  if (record.groups) {
    const own = Object.hasOwn(record.groups, studentId ?? '') ? record.groups[studentId] : null;
    const mine = new Set(Array.isArray(own) ? own : []);
    order = order.filter((id) => mine.has(id));
  }
  const practice = {};
  if (record.sets) {
    const mineSets = Object.entries(record.sets).filter(([, s]) => typeof studentId === 'string' && Array.isArray(s.students) && s.students.includes(studentId));
    for (const [setId, s] of mineSets) for (const id of s.questions) if (Object.hasOwn(record.questions, id)) practice[id] = setId;
    order = interleave(order, mineSets.map(([, s]) => s.questions.filter((id) => Object.hasOwn(record.questions, id))));
  }
  return { ...record, order, practice, questions: Object.fromEntries(order.map((id) => [id, record.questions[id]])) };
}

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
  const setOf = (id) => record.practice?.[id] ?? null;
  const shared = rows.filter((r) => !setOf(r.id));
  const max = shared.reduce((s, r) => s + r.mark.max, 0);
  const score = shared.reduce((s, r) => s + (r.awarded ?? 0), 0);
  // Pending counts every row, practice too: a quiz is fully marked only when everything is.
  const pending = rows.filter((r) => r.awarded === null).length;
  const practice = {};
  for (const r of rows) {
    const set = setOf(r.id);
    if (!set) continue;
    const p = (practice[set] ??= { score: 0, max: 0, pending: 0 });
    p.max += r.mark.max;
    p.score = roundMarks(p.score + (r.awarded ?? 0));
    if (r.awarded === null) p.pending += 1;
  }
  return { rows: rows.map((r) => (setOf(r.id) ? { ...r, set: setOf(r.id) } : r)), score: roundMarks(score), max, pending, practice };
}

/** All of a student's practice as one line: "Practice for you: 3/5". Null with none. */
function practiceTotal(practice) {
  const parts = Object.values(practice ?? {});
  if (!parts.length) return null;
  return parts.reduce((t, p) => ({ score: roundMarks(t.score + p.score), max: t.max + p.max, pending: t.pending + p.pending }), { score: 0, max: 0, pending: 0 });
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
  // A deleted go keeps its start as a marker, so its number is never reused.
  const goes = await Promise.all(starts.filter((s) => !s.deleted).map((start) => loadAttempt(store, k, device, start)));
  goes.next = starts.reduce((top, s) => Math.max(top, s.n + 1), from);
  return goes;
}

/**
 * Works out who is answering. With no class the quiz can be looked at but not
 * answered. A class with no list stays anonymous. Otherwise the device must
 * hold claimed initials, and `claim` is how it gets them.
 */
export async function identify(store, body, action) {
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
  if (!['status', 'claim', 'start', 'hint', 'check', 'save', 'submit'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const loaded = await loadQuiz(store, lessonId);
  const { draft, settings, k } = loaded;
  let { record } = loaded;
  const who = await identify(store, body, action);
  // A follow-up quiz is for the students it was made for.
  if (settings.for_students?.length && who.student && !settings.for_students.includes(who.student.id)) {
    reject(403, 'not_for_you', 'This quiz is for a small group.');
  }
  if (!['status', 'claim'].includes(action)) needIdentity(who);
  // Any key with `groups` is narrowed to the student's own questions. Only a
  // tutorial's exit check also waits for the teacher's Done before it starts.
  if (record.groups || record.sets) {
    if (record.groups && !who.student && !['status', 'claim'].includes(action)) reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
    record = narrow(record, who.student?.id);
    if (action === 'start' && !record.order.length) reject(409, 'empty', 'There’s nothing for you to answer here yet.');
    if (action === 'start' && draft.pedagogical_mode === 'tutorial' && !(await exitUnlocked(store, lessonId, who.student.id))) {
      reject(403, 'not_yet', 'Your teacher opens this after you’ve worked together.');
    }
  }
  const now = Date.now();
  const { closed } = await closedState(store, k, settings, now);
  const live = await read(store, k.live);
  const shared = {
    identity: identityOf(who),
    version: record.version,
    open: !closed,
    attempts_allowed: settings.attempts,
    settings: {
      ...publicSettings(record.settings),
      version: record.version,
      question_count: sharedIds(record).length,
      total_marks: sharedIds(record).reduce((sum, id) => sum + record.questions[id].key.marks, 0),
      ...(record.practice && Object.keys(record.practice).length ? { practice_count: Object.keys(record.practice).length } : {})
    },
    questions: publicQuestions(record),
    practice: Object.keys(record.practice ?? {}),
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
  const attemptRecord = current ? narrow(await recordFor(store, lessonId, current.version, record), who.student?.id) : record;
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
      n: attempts.next,
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

  if (action === 'save') {
    needCurrent();
    const kept = await read(store, k.draft(device, current.n));
    const saved = withSteps(attemptRecord, mergeDrafts(kept, cleanDraft(attemptRecord, body.responses, body.confidence), body), body.steps);
    const at = new Date(now).toISOString();
    await Promise.all([store.setJSON(k.draft(device, current.n), { ...saved, at }), saveWriting(store, k, device, current.n, attemptRecord, body.writing)]);
    return { saved: true, at, count: Object.keys(saved.responses).length };
  }

  if (action === 'submit') {
    needCurrent();
    const draft = await read(store, k.draft(device, current.n));
    const merged = withSteps(attemptRecord, mergeDrafts(draft, cleanDraft(attemptRecord, body.responses, body.confidence), body), body.steps);
    await saveWriting(store, k, device, current.n, attemptRecord, body.writing);
    await handIn(store, k, lessonId, device, current, attemptRecord, merged, now, pastDeadline || closed);
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
      const rec = narrow(await recordFor(store, lessonId, a.version, record), who.student?.id);
      const scored = scoreAttempt(rec, a.result, await read(store, k.marks(device, a.n)));
      const base = { n: a.n, submitted_at: a.result.submitted_at, released };
      if (!released) return base;
      return {
        ...base,
        score: scored.score,
        max: scored.max,
        pending: scored.pending,
        practice: practiceTotal(scored.practice),
        same_version: a.version === record.version,
        keys_shown: revealKeys,
        rows: scored.rows.map((r) => ({
          id: r.id,
          practice: !!r.set,
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
  const [kept, typing] = open ? await Promise.all([read(store, k.draft(device, open.n)), read(store, k.writing(device, open.n))]) : [null, null];
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
          practice: Object.keys(attemptRecord.practice ?? {}),
          // The student's own typing logs come back, so a new browser carries on the same replay.
          ...(kept || typing ? { saved: { responses: kept?.responses ?? {}, confidence: kept?.confidence ?? {}, ...(kept?.steps && Object.keys(kept.steps).length ? { steps: kept.steps } : {}), ...(typing ? { writing: typing } : {}), at: kept?.at } } : {}),
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

/** Answers sent with a save or hand-in, cleaned to the question kinds the attempt's key knows. */
function cleanDraft(record, responses, confidence) {
  const given = responses && typeof responses === 'object' && !Array.isArray(responses) ? responses : {};
  const sure = confidence && typeof confidence === 'object' && !Array.isArray(confidence) ? confidence : {};
  const out = { responses: {}, confidence: {} };
  for (const id of record.order) {
    const entry = record.questions[id];
    const response = cleanResponse(entry.key.kind, Object.hasOwn(given, id) ? given[id] : null);
    if (response && hasAnswer(response)) out.responses[id] = response;
    const c = confidenceOf(Object.hasOwn(sure, id) ? sure[id] : null);
    if (c) out.confidence[id] = c;
  }
  return out;
}

/**
 * What the student sent last wins; what the server kept fills any gaps. A
 * question named in the request with no answer left is cleared, so un-ticking
 * sticks, while questions the request leaves out are never lost.
 */
function mergeDrafts(kept, sent, body = null) {
  const merged = { responses: { ...(kept?.responses ?? {}), ...sent.responses }, confidence: { ...(kept?.confidence ?? {}), ...sent.confidence }, steps: { ...(kept?.steps ?? {}) } };
  const named = body?.responses && typeof body.responses === 'object' && !Array.isArray(body.responses) ? Object.keys(body.responses) : [];
  for (const id of named) if (!Object.hasOwn(sent.responses, id)) delete merged.responses[id];
  return merged;
}

/**
 * Next-step picks sent with a save or hand-in, by question id: `{ [id]: pick }`,
 * null clearing one. Kept only on written answers, and only when the pick fits
 * the answer as it now stands; one that doesn't is dropped so the save still lands.
 */
function withSteps(record, draft, sent) {
  const steps = { ...(draft.steps ?? {}) };
  if (sent && typeof sent === 'object' && !Array.isArray(sent)) {
    for (const [id, raw] of Object.entries(sent)) {
      const entry = entryFor(record, id);
      if (!entry || !WRITTEN_KINDS.includes(entry.key.kind)) continue;
      if (raw === null) { delete steps[id]; continue; }
      const pick = cleanStepPick(raw, draft.responses[id]?.text ?? '');
      if (pick) steps[id] = pick;
    }
  }
  // A pick whose answer has gone, or shrunk under it, no longer points anywhere.
  for (const [id, pick] of Object.entries(steps)) if (!pick.skipped && !cleanStepPick(pick, draft.responses[id]?.text ?? '')) delete steps[id];
  return { ...draft, steps };
}

/**
 * Marks an open attempt and writes its hand-in. Answers checked one by one
 * come from the server; the rest from the draft the student sent or saved.
 */
/** An open attempt's answers as they stand, marked: checked answers from the server, the rest from the draft. */
function answersSoFar(current, record, draft) {
  const responses = {};
  const confidence = {};
  const marks = {};
  for (const id of record.order) {
    const entry = record.questions[id];
    const instant = current.answers[id];
    if (instant) {
      responses[id] = instant.response;
      marks[id] = instant.mark;
      if (instant.confidence) confidence[id] = instant.confidence;
      continue;
    }
    const response = draft.responses[id] ?? null;
    if (response && hasAnswer(response)) responses[id] = response;
    marks[id] = markResponse(entry.key, response);
    if (draft.confidence[id]) confidence[id] = draft.confidence[id];
  }
  return { responses, confidence, marks, hints: current.hints };
}

async function handIn(store, k, lessonId, device, current, record, draft, now, overtime, auto = false) {
  const answers = answersSoFar(current, record, draft);
  const writing = await writingSummaries(store, k, device, current.n, record, answers.responses);
  const steps = Object.fromEntries(Object.entries(draft.steps ?? {}).filter(([id]) => entryFor(record, id)));
  const result = {
    ...answers,
    ...(Object.keys(writing).length ? { writing } : {}),
    ...(Object.keys(steps).length ? { steps } : {}),
    submitted_at: new Date(now).toISOString(),
    overtime: !!overtime,
    ...(auto ? { auto: true } : {})
  };
  await store.setJSON(k.result(device, current.n), result, { onlyIfNew: true });
  await markInsightChanged(store, lessonId);
}

/** Each written answer's typing summary, kept on the hand-in so lists read it without the full logs. */
async function writingSummaries(store, k, device, n, record, responses) {
  const check = resolveQuizSettings(record.settings).writing_check;
  if (check === 'off') return {};
  const logs = (await read(store, k.writing(device, n))) ?? {};
  const out = {};
  for (const id of record.order) {
    const log = cleanWritingLog(logs[id]);
    const text = responses[id]?.text;
    if (log && typeof text === 'string' && text.trim()) out[id] = summariseWriting(log, text, check);
  }
  return out;
}

/** How many handed-in answers have something worth a look. */
const flaggedAnswers = (result) => Object.values(result?.writing ?? {}).filter((w) => w?.flags?.length).length;

/** The sweep runs at most once a minute per quiz, however often insight is read. */
const SWEEP_EVERY_MS = 60_000;
async function sweepStale(store, k, lessonId, record, closed, now) {
  const last = Date.parse((await read(store, k.swept))?.at ?? '');
  if (Number.isFinite(last) && now - last < SWEEP_EVERY_MS) return;
  await store.setJSON(k.swept, { at: new Date(now).toISOString() });
  await handInStale(store, k, lessonId, record, closed, now).catch((error) => console.warn('quiz sweep failed', error));
}

/**
 * Hands in open attempts nobody pressed Hand it in on, once their timer has
 * run out or the quiz has closed, using what was saved as the student went.
 * An attempt with nothing saved or checked stays open: there is nothing to mark.
 */
async function handInStale(store, k, lessonId, record, closed, now = Date.now()) {
  const owners = new Set();
  for (const key of await listBlobKeys(store, `quiz/${lessonId}/attempts/`)) owners.add(key.split('/')[3]);
  let changed = false;
  await mapBounded([...owners], 8, async (device) => {
    const from = await clearedFrom(store, k, device);
    const attempts = await deviceAttempts(store, k, device, from);
    const current = attempts.find((a) => !a.result);
    if (!current) return;
    const deadline = Date.parse(current.deadline ?? '');
    const expired = Number.isFinite(deadline) && now > deadline + GRACE_MS;
    if (!closed && !expired) return;
    const rec = narrow(await recordFor(store, lessonId, current.version, record), current.student_id);
    const draft = await read(store, k.draft(device, current.n));
    if (!draft && !Object.keys(current.answers).length) return;
    await handIn(store, k, lessonId, device, current, rec, mergeDrafts(draft, { responses: {}, confidence: {} }), now, true, true);
    changed = true;
  });
  return changed;
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
  const next = goes.next;
  await store.setJSON(k.cleared(device), { from: next, at: new Date().toISOString() });
  const prefixes = ['attempts', 'hints', 'checked', 'results', 'writing'].map((part) => `quiz/${lessonId}/${part}/${device}/`).concat(`quiz/${lessonId}/marks/${device}~`);
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
  if (!['results', 'attempt', 'mark', 'release', 'reset', 'delete_attempt', 'clear_all', 'insight', 'close', 'reopen', 'dismiss_flag'].includes(action)) reject(400, 'bad_action', 'Unknown action.');

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

  // One handed-in go, gone for good: it no longer counts anywhere and the student gets that go back.
  if (action === 'delete_attempt') {
    const match = ATTEMPT_ID.exec(String(body.attempt_id ?? ''));
    if (!match) reject(400, 'bad_request', 'Unknown attempt.');
    const [device, n] = [match[1], Number(match[2])];
    const start = await read(store, k.attempt(device, n));
    if (!start || start.deleted || !(await read(store, k.result(device, n)))) reject(404, 'not_found', 'That attempt is gone.');
    await store.setJSON(k.attempt(device, n), { n, deleted: true, deleted_at: new Date().toISOString(), ...(start.class_id ? { class_id: start.class_id } : {}), ...(start.student_id ? { student_id: start.student_id } : {}) });
    const doomed = (await Promise.all([listBlobKeys(store, k.hints(device, n)), listBlobKeys(store, k.checked(device, n))])).flat();
    await mapBounded([k.result(device, n), k.marks(device, n), k.writing(device, n), ...doomed], 8, (key) => store.delete(key));
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
    return { device, n, start, result, rec: narrow(await recordFor(store, lessonId, start.version, record), start.student_id) };
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
    const [marks, logs] = await Promise.all([read(store, k.marks(device, n)), read(store, k.writing(device, n))]);
    const scored = scoreAttempt(rec, result, marks);
    const typed = (id) => {
      const summary = result.writing?.[id];
      const log = cleanWritingLog(logs?.[id]);
      return summary ? { writing: { ...summary, ...(log ? { log } : {}) } } : {};
    };
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
        practice: scored.practice,
        current: start.version === record.version,
        // A written answer's next-step pick shows on the teacher's marking view; never as a teacher code.
        rows: scored.rows.map((r) => ({ ...r, question: rec.questions[r.id].question, key: rec.questions[r.id].key, ...typed(r.id), ...(result.steps?.[r.id] ? { step: result.steps[r.id] } : {}) }))
      }
    };
  }

  // results
  const resultKeys = await listBlobKeys(store, `quiz/${lessonId}/results/`);
  const stats = new Map([...record.order, ...Object.values(record.sets ?? {}).flatMap((s) => s.questions)].map((id) => [id, { answered: 0, total: 0, full: 0, pending: 0, hinted: 0, confidence: { 1: [0, 0], 2: [0, 0], 3: [0, 0] }, picks: {} }]));
  const rows = [];
  const froms = new Map();
  for (const key of resultKeys) {
    const [, , , device, nText] = key.split('/');
    const n = Number(nText);
    if (!froms.has(device)) froms.set(device, await clearedFrom(store, k, device));
    if (n < froms.get(device)) continue;
    const [start, result] = await Promise.all([read(store, k.attempt(device, n)), read(store, key)]);
    if (!start || !result) continue;
    const rec = narrow(await recordFor(store, lessonId, start.version, record), start.student_id);
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
      practice: scored.practice,
      writing_flags: flaggedAnswers(result),
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
    sets: Object.entries(record.sets ?? {}).map(([id, s]) => ({ id, name: s.name, questions: s.questions.length })),
    questions: record.order.map((id) => ({ id, question: record.questions[id].question, key: record.questions[id].key, ...stats.get(id) }))
  };
}

/* ── Markbook ──────────────────────────────────────────────────────── */

/** A lesson's own outcomes: canonical ids first, else its older outcome codes. */
const lessonOutcomes = (draft) => (draft.outcome_ids?.length ? draft.outcome_ids : draft.syllabus_outcomes ?? []);

/**
 * Each owner's latest handed-in attempt that a teacher hasn't cleared: a
 * second go replaces the first in marks, progress and outcomes. With `owners`
 * (hash → student id) only they are read. The cleared record and the latest
 * go are read together, so most students cost one round trip.
 */
async function latestAttempts(store, k, lessonId, owners) {
  const handedIn = new Map();
  // Listings can lag a just-written hand-in; the next load picks it up, the same as Results.
  for (const key of await listBlobKeys(store, `quiz/${lessonId}/results/`)) {
    const [, , , owner, nText] = key.split('/');
    if (!owners || owners.has(owner)) handedIn.set(owner, [...(handedIn.get(owner) ?? []), Number(nText)]);
  }
  const out = [];
  await mapBounded([...handedIn], 8, async ([owner, ns]) => {
    const sorted = [...ns].sort((a, b) => b - a);
    const readAttempt = (n) => Promise.all([read(store, k.attempt(owner, n)), read(store, k.result(owner, n)), read(store, k.marks(owner, n))]);
    // Most students were never cleared, so their latest go is read alongside the cleared record.
    const [cleared, latestRead] = await Promise.all([read(store, k.cleared(owner)), readAttempt(sorted[0])]);
    const from = cleared?.from ?? 0;
    for (const n of sorted.filter((x) => x >= from)) {
      const [start, result, marks] = n === sorted[0] ? latestRead : await readAttempt(n);
      if (!start || !result) continue;
      out.push({ owner, n, start, result, marks });
      return;
    }
  });
  return out;
}

async function buildInsight(store, k, lessonId, record, fallback, cls, roster) {
  const owners = roster ? new Map(roster.students.map((s) => [deviceHash(`student:${cls}:${s.id}`), s.id])) : null;
  const counted = await latestAttempts(store, k, lessonId, owners);
  const rosters = new Map();
  const students = roster ? roster.students.map(({ id, name, initials }) => ({ id, name, initials })) : [];
  const attempts = [];
  for (const a of counted) {
    const rec = narrow(await recordFor(store, lessonId, a.start.version, record), a.start.student_id);
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
      practice: scored.practice,
      writing_flags: flaggedAnswers(a.result),
      rows: scored.rows.map((r) => {
        const entry = rec.questions[r.id];
        const outcomes = entry.key.outcomes ?? fallback;
        const items = answerEvidence({ question: entry.question, key: entry.key, response: r.response, awarded: r.awarded, codes: r.codes, fallbackOutcomes: fallback });
        return { id: r.id, awarded: r.awarded, max: r.mark.max, confidence: r.confidence, codes: r.codes, outcomes, items, ...(hasAnswer(r.response) ? {} : { unanswered: true }), ...(r.set ? { set: r.set } : {}) };
      })
    });
  }
  attempts.sort((x, y) => String(x.student).localeCompare(String(y.student)));
  return { schema: INSIGHT_SCHEMA, record_version: record.version, listed: !!roster, built_at: new Date().toISOString(), students, attempts };
}

/**
 * Listed students who opened this quiz but have nothing handed in yet, so the
 * markbook can show "In progress" rather than a blank that reads as not done.
 * A teacher's clear is honoured: attempts before it don't count. `saved` is
 * each one's open go marked as it stands, from what the student's page saved
 * as they went, so the teacher sees work that may never be handed in.
 */
async function startedNotHandedIn(k, lessonId, classId, studentIds, scores, store, record) {
  const owners = new Map(studentIds.filter((id) => !scores[id]).map((id) => [deviceHash(`student:${classId}:${id}`), id]));
  if (!owners.size) return { started: [], saved: {} };
  const seen = new Set();
  for (const key of await listBlobKeys(store, `quiz/${lessonId}/attempts/`)) {
    const owner = key.split('/')[3];
    if (owners.has(owner)) seen.add(owner);
  }
  const open = await mapBounded([...seen], 8, async (owner) => {
    const goes = await deviceAttempts(store, k, owner, await clearedFrom(store, k, owner));
    const current = goes.find((a) => !a.result);
    if (!current) return null;
    const rec = narrow(await recordFor(store, lessonId, current.version, record), current.student_id);
    const kept = await read(store, k.draft(owner, current.n));
    const scored = scoreAttempt(rec, answersSoFar(current, rec, mergeDrafts(kept, { responses: {}, confidence: {} })), null);
    const answered = scored.rows.filter((r) => hasAnswer(r.response)).length;
    return [owners.get(owner), {
      started_at: current.started_at,
      saved_at: kept?.at ?? null,
      answered,
      total: rec.order.length,
      score: scored.score,
      max: scored.max,
      pending: scored.pending,
      rows: scored.rows.map((r) => ({ id: r.id, awarded: r.awarded, max: r.mark.max, ...(hasAnswer(r.response) ? {} : { unanswered: true }) }))
    }];
  });
  const found = open.filter(Boolean);
  return { started: found.map(([id]) => id), saved: Object.fromEntries(found.filter(([, s]) => s.answered > 0)) };
}

/** Quiz lessons in the same unit, and the follow-ups made from this one. */
async function unitFamily(store, draft, lessonId) {
  const unit = draft.unit_id && isSafeId(draft.unit_id) ? await read(store, unitKey(draft.unit_id)) : null;
  const ids = (Array.isArray(unit?.lesson_ids) ? unit.lesson_ids : []).filter((id) => id !== lessonId && isSafeId(id));
  const drafts = await mapBounded(ids, 8, (id) => read(store, draftLessonKey(id)));
  const siblings = [];
  const followUps = [];
  drafts.forEach((d, i) => {
    if (!d || isDeletedRecord(d) || !QUIZ_MODES.has(d.pedagogical_mode)) return;
    siblings.push({ lesson_id: ids[i], title: d.title });
    if (d.quiz?.follow_up_of === lessonId) followUps.push({ lesson_id: ids[i], title: d.title, flag: d.quiz.follow_up_flag ?? null });
  });
  return { siblings, followUps };
}

/**
 * One class's insight (every latest attempt when classId is null): each
 * student's latest attempt with its evidence items. A closed quiz with nothing
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
  await sweepStale(store, k, lessonId, record, state.closed, now);
  const stamp = (await read(store, k.stamp))?.at ?? stampRow?.at ?? null;
  // A class with no list stays anonymous, so its insight covers every latest attempt.
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
    // A timer was set: items left blank at the end of the paper show working under time.
    timed: !!settings.timer_minutes,
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
    siblings: kin.siblings,
    // A tutorial's exit check: each student's group name, for the markbook cell.
    tutorial_groups: tutorialGroupNames(draft),
    sets: Object.entries(record.sets ?? {}).map(([id, s]) => ({ id, group_id: s.group_id, name: s.name, students: s.students, questions: s.questions.length }))
  };
}

function tutorialGroupNames(draft) {
  if (draft.pedagogical_mode !== 'tutorial' || !Array.isArray(draft.tutorial?.groups)) return null;
  const names = {};
  for (const g of draft.tutorial.groups) {
    if (!g || typeof g.name !== 'string' || !Array.isArray(g.students)) continue;
    for (const s of g.students) if (typeof s === 'string' && !Object.hasOwn(names, s)) names[s] = g.name;
  }
  return names;
}

/**
 * Each listed student's latest handed-in attempt at this quiz in one class,
 * scored as the Results tab scores it, with evidence items. Null when the
 * lesson isn't a published quiz. Goes before a teacher's clear are skipped.
 */
export async function classQuizScores(store, lessonId, classId, studentIds) {
  if (!studentIds.length) return null;
  let loaded;
  try {
    loaded = await loadQuiz(store, lessonId);
  } catch (error) {
    if (error instanceof QuizError) return null;
    throw error;
  }
  const insight = await classInsight(store, lessonId, classId, loaded, { family: false });
  if (!insight) return null;
  const wanted = new Set(studentIds);
  const scores = {};
  let firstAt = null;
  for (const a of insight.attempts) {
    if (!wanted.has(a.student)) continue;
    scores[a.student] = { attempt_id: a.attempt_id, submitted_at: a.submitted_at, score: a.score, max: a.max, pending: a.pending, practice: a.practice ?? {}, writing_flags: a.writing_flags ?? 0, rows: a.rows };
    if (!firstAt || a.submitted_at < firstAt) firstAt = a.submitted_at;
  }
  const { started, saved } = await startedNotHandedIn(keys(lessonId), lessonId, classId, studentIds, scores, store, loaded.record);
  return {
    lesson_id: lessonId,
    title: insight.title,
    unit_id: insight.unit_id,
    confidence: insight.confidence,
    timed: insight.timed,
    closed: insight.closed,
    // Nobody handed in yet: the column dates from the first go started.
    first_at: firstAt ?? Object.values(saved).reduce((min, x) => (!min || x.started_at < min ? x.started_at : min), null),
    ...(started.length ? { started } : {}),
    ...(Object.keys(saved).length ? { saved } : {}),
    questions: insight.questions.map(({ id, prompt, marks, outcomes }) => ({ id, prompt, marks, outcomes })),
    scores,
    ...(insight.sets.length ? { sets: insight.sets } : {}),
    ...(insight.tutorial_groups ? { groups: Object.fromEntries(Object.entries(insight.tutorial_groups).filter(([id]) => wanted.has(id))) } : {})
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
  if (record.groups && action === 'live_start') reject(409, 'not_live', 'A tutorial’s exit check can’t run live.');
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
  // A grouped key never runs live: students see no live round.
  if (record.groups) return { live: null };
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
