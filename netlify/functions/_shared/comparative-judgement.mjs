/**
 * Comparative judgement: students (and the teacher) see two anonymous answers
 * to one written question and pick the stronger. A Bradley–Terry scale is
 * fitted from the choices (cj-maths.mjs). Design:
 * docs/superpowers/specs/2026-11-11-comparative-judgement-design.md (D1–D23).
 *
 *   cj/{lesson}/{block}/{class}/round          { open, salt, started_at, refreshed_at, source, pool: { [itemId]: { text, kind, ref } } }   teacher writes only
 *   cj/{lesson}/{block}/{class}/judges/{key}   { calibration: [{ id, choice }], prediction, judgements: [...], reflection, at }       written by that judge only
 *
 * `key` is `s_{studentId}` or `teacher`. Students only ever receive `{ id, text }`
 * for answers: no names, initials, ids, anchor flags, ranks or marks (D4). The
 * salt never leaves the server. Teacher-only settings come from the draft lesson
 * (D5). No model is called here.
 */
import { createHash, randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { claimFor, claimInitials, classesForLesson, loadRoster } from './class-claims.mjs';
import { read, reject, walkBlocks } from './question-drop.mjs';
import { handinKey, workOwner } from './lesson-work.mjs';
import { addColumnWithMarks, sydneyDay } from './markbook.mjs';
import { newMarkbookId } from './markbook-schema.mjs';
import {
  chipStats, choosePair, contestedPair, fitMarks, markFor, pairKey, thirdOf
} from './cj-maths.mjs';
import { computeScale } from './cj-scale.mjs';

export const BLOCK_TYPE = 'comparative_judgement';
export const CJ_LIMITS = { chips: 8, chip: 40, calibration: 3, anchors: 6, text: 4000, reason: 300, reflection: 500, title: 120 };
const THIRDS = ['top', 'middle', 'bottom'];
const STUDENT_ACTIONS = ['status', 'claim', 'calibrate', 'predict', 'next', 'judge', 'reflect'];
const TEACHER_ACTIONS = ['classes', 'status', 'start', 'refresh', 'close', 'open', 'next', 'judge', 'results', 'display', 'push_marks'];

const base = (lesson, block, classId) => `cj/${lesson}/${block}/${classId}`;
const roundKey = (lesson, block, classId) => `${base(lesson, block, classId)}/round`;
const judgesPrefix = (lesson, block, classId) => `${base(lesson, block, classId)}/judges/`;
const judgeKey = (lesson, block, classId, key) => `${judgesPrefix(lesson, block, classId)}${key}`;
const studentKey = (studentId) => `s_${studentId}`;
const itemId = (salt, kind, ref) => `a${createHash('sha256').update(`${salt}:${kind}:${ref}`).digest('hex').slice(0, 12)}`;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function findBlock(blocks, id, { studentCopy }) {
  for (const b of walkBlocks(blocks)) {
    if (b.id === id && b.block_type === BLOCK_TYPE && !(studentCopy && b.visibility === 'teacher_only')) return b;
  }
  return null;
}

/** Settings as the server uses them, read from the draft block, each within its limits. */
export function blockConfig(block) {
  const c = block?.content ?? {};
  const source = c.source && typeof c.source === 'object' ? c.source : {};
  const chips = (Array.isArray(c.chips) ? c.chips : ['Precise quote', 'Clear argument', 'Analyses effect'])
    .map((chip) => text(chip, CJ_LIMITS.chip)).filter(Boolean).slice(0, CJ_LIMITS.chips);
  const calibration = (Array.isArray(c.calibration) ? c.calibration : [])
    .filter((p) => p && text(p.left, CJ_LIMITS.text) && text(p.right, CJ_LIMITS.text) && (p.better === 'left' || p.better === 'right'))
    .slice(0, CJ_LIMITS.calibration)
    .map((p, i) => ({ id: typeof p.id === 'string' && p.id ? p.id : `cal${i}`, left: text(p.left, CJ_LIMITS.text), right: text(p.right, CJ_LIMITS.text), better: p.better, reason: text(p.reason, CJ_LIMITS.reason) }));
  const anchors = (Array.isArray(c.anchors) ? c.anchors : [])
    .filter((a) => a && typeof a.id === 'string' && a.id && text(a.text, CJ_LIMITS.text))
    .slice(0, CJ_LIMITS.anchors)
    .map((a) => ({ id: a.id, text: text(a.text, CJ_LIMITS.text), mark: typeof a.mark === 'number' && Number.isFinite(a.mark) ? a.mark : null }));
  const perStudent = Number.isInteger(c.per_student) ? Math.min(20, Math.max(4, c.per_student)) : 8;
  const outOf = typeof c.out_of === 'number' && Number.isFinite(c.out_of) ? Math.min(100, Math.max(1, c.out_of)) : 20;
  return {
    source: { lesson_id: typeof source.lesson_id === 'string' ? source.lesson_id : '', block_id: typeof source.block_id === 'string' ? source.block_id : '', question_id: typeof source.question_id === 'string' ? source.question_id : '' },
    chips,
    calibration,
    anchors,
    per_student: perStudent,
    show_third: c.show_third === true,
    teacher_weight: [1, 2, 3].includes(c.teacher_weight) ? c.teacher_weight : 2,
    downweight_misfits: c.downweight_misfits !== false,
    out_of: outOf
  };
}

/** The block must be in the draft and in the published lesson (D5). Returns the settings from the draft. */
async function assertLive(store, lesson, block) {
  if (!isSafeId(lesson) || !isSafeId(block)) reject(404, 'not_found', 'Activity not found.');
  const [draft, published] = await Promise.all([read(store, draftLessonKey(lesson)), read(store, publishedLessonKey(lesson))]);
  const draftBlock = draft && !isDeletedRecord(draft) ? findBlock(draft.blocks, block, { studentCopy: false }) : null;
  const live = draftBlock && published && findBlock(published.blocks, block, { studentCopy: true });
  if (!live) reject(404, 'not_published', 'Publish this lesson and block before judging starts.');
  return blockConfig(draftBlock);
}

/** A student's answer to the source question: the hand-in first, else their saved work (D2). */
async function answerFor(store, classId, source, studentId) {
  const handin = await read(store, handinKey(source.lesson, source.block_id, studentId));
  const handed = handin?.text?.answers?.[source.question_id];
  if (typeof handed === 'string' && handed.trim()) return handed.trim().slice(0, CJ_LIMITS.text);
  const work = await read(store, `work/${source.lesson}/${workOwner(classId, studentId)}`);
  if (!work || work.class_id !== classId || work.student_id !== studentId) return '';
  const saved = work.blocks?.[source.block_id]?.answers?.[source.question_id];
  return typeof saved === 'string' ? saved.trim().slice(0, CJ_LIMITS.text) : '';
}

/** Builds the pool (D1, D3). Items already in `kept` keep their text, so earlier judgements stay about the same piece. */
async function buildPool(store, lesson, roster, config, salt, kept = {}) {
  const source = { ...config.source, lesson: config.source.lesson_id || lesson };
  if (!isSafeId(source.lesson) || !isSafeId(source.block_id) || !source.question_id) reject(400, 'no_source', 'Pick the question whose answers students will judge.');
  const pool = {};
  const answers = await mapBounded(roster.students, 8, async (s) => [s, await answerFor(store, roster.cls.id, source, s.id)]);
  for (const [s, answer] of answers) {
    const id = itemId(salt, 'student', s.id);
    if (kept[id]) pool[id] = kept[id];
    else if (answer) pool[id] = { text: answer, kind: 'student', ref: s.id };
  }
  for (const anchor of config.anchors) {
    const id = itemId(salt, 'anchor', anchor.id);
    pool[id] = kept[id] ?? { text: anchor.text, kind: 'anchor', ref: anchor.id };
  }
  return { pool, source: { lesson_id: source.lesson, block_id: source.block_id, question_id: source.question_id } };
}

const emptyJudge = () => ({ calibration: [], prediction: null, judgements: [], reflection: null, at: null });

function cleanJudge(row) {
  const out = emptyJudge();
  if (!row || typeof row !== 'object') return out;
  if (Array.isArray(row.calibration)) out.calibration = row.calibration;
  if (THIRDS.includes(row.prediction)) out.prediction = row.prediction;
  if (Array.isArray(row.judgements)) out.judgements = row.judgements;
  if (typeof row.reflection === 'string') out.reflection = row.reflection;
  out.at = row.at ?? null;
  return out;
}

async function readJudges(store, lesson, block, classId) {
  const prefix = judgesPrefix(lesson, block, classId);
  const found = (await listBlobKeys(store, prefix)).filter((key) => !key.slice(prefix.length).includes('/'));
  const rows = await mapBounded(found, 8, async (key) => [key.slice(prefix.length), cleanJudge(await read(store, key))]);
  return new Map(rows);
}

// computeScale lives in cj-scale.mjs (pure, so the Battles room bundles the same code); re-exported here.
export { computeScale };

/** Fitted marks for students from anchors with known marks (D20). Null without a usable line. */
function marksFrom(round, config, scale, roster) {
  const points = Object.entries(round.pool)
    .filter(([, item]) => item.kind === 'anchor')
    .map(([id, item]) => ({ theta: scale.fit.theta[id], mark: config.anchors.find((a) => a.id === item.ref)?.mark ?? null }))
    .filter((p) => p.mark !== null);
  const line = fitMarks(points);
  if (!line) return null;
  const onList = new Set(roster.students.map((s) => s.id));
  const by_student = {};
  for (const [id, item] of Object.entries(round.pool)) {
    if (item.kind === 'student' && onList.has(item.ref)) by_student[item.ref] = markFor(line, scale.fit.theta[id], config.out_of);
  }
  return { a: line.a, b: line.b, out_of: config.out_of, by_student };
}

const ownItem = (round, studentId) => (round ? Object.keys(round.pool).find((id) => round.pool[id].kind === 'student' && round.pool[id].ref === studentId) ?? null : null);

/** Pairs this judge could still be offered: every pair of eligible items, less those already judged. */
function targetFor(round, config, own) {
  const m = round ? Object.keys(round.pool).filter((id) => id !== own).length : 0;
  return Math.min(config.per_student, (m * (m - 1)) / 2);
}

const seenPairs = (judge) => new Set(judge.judgements.map((j) => pairKey(j.left, j.right)));

function countsFrom(scale) {
  const counts = {};
  for (const c of scale.comparisons) {
    counts[c.winner] = (counts[c.winner] ?? 0) + 1;
    counts[c.loser] = (counts[c.loser] ?? 0) + 1;
  }
  return counts;
}

function nextPair(round, scale, judge, exclude) {
  const pair = choosePair({ items: scale.ids, theta: scale.fit.theta, counts: countsFrom(scale), seen: seenPairs(judge), exclude });
  if (!pair) return null;
  const [left, right] = pair;
  return { left: { id: left, text: round.pool[left].text }, right: { id: right, text: round.pool[right].text } };
}

/** Checks and appends one judgement. `own` is never judged; no pair twice (D11). */
function addJudgement(round, config, judge, body, own) {
  const { left, right, winner } = body;
  if (typeof left !== 'string' || typeof right !== 'string' || !(left in round.pool) || !(right in round.pool) || left === right) {
    reject(400, 'bad_pair', 'That pair has changed. Ask for a new pair.');
  }
  if (own && (left === own || right === own)) reject(400, 'bad_pair', 'That pair has changed. Ask for a new pair.');
  if (seenPairs(judge).has(pairKey(left, right))) reject(409, 'seen', 'You’ve already judged this pair. Ask for a new pair.');
  if (winner !== left && winner !== right) reject(400, 'bad_winner', 'Pick one of the two answers.');
  const chips = { left: [], right: [] };
  for (const side of ['left', 'right']) {
    const raw = body.chips?.[side] ?? [];
    if (!Array.isArray(raw) || raw.length > CJ_LIMITS.chips || raw.some((i) => !Number.isInteger(i) || i < 0 || i >= config.chips.length)) {
      reject(400, 'bad_chips', 'Those labels have changed. Reload the page.');
    }
    chips[side] = [...new Set(raw)].sort((a, b) => a - b);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > CJ_LIMITS.reason) reject(400, 'too_long', `Keep your reason to ${CJ_LIMITS.reason} characters.`);
  const at = new Date().toISOString();
  return { ...judge, judgements: [...judge.judgements, { left, right, winner, chips, reason, at }], at };
}

/* ---------------------------------------------------------------- students */

function studentPhase(round, config, judge, own, target) {
  if (!round?.open) return 'closed';
  if (judge.calibration.length < config.calibration.length) return 'calibrate';
  if (own && !judge.prediction) return 'predict';
  if (judge.judgements.length < target) return 'judge';
  if (judge.reflection === null) return 'reflect';
  return 'done';
}

async function studentState(ctx, judge) {
  const { round, config, own, student } = ctx;
  const target = targetFor(round, config, own);
  const phase = studentPhase(round, config, judge, own, target);
  const state = { need: null, initials: student.initials, phase, target, done_count: judge.judgements.length, has_answer: !!own };
  if (phase === 'calibrate') {
    const index = judge.calibration.length;
    const pair = config.calibration[index];
    state.calibration = { index, total: config.calibration.length, left: pair.left, right: pair.right };
  }
  if (config.show_third && own && round) {
    const scale = computeScale(round, config, await readJudges(ctx.store, ctx.lesson, ctx.block, ctx.classId));
    if (scale.comparisons.length && scale.reliability.level !== 'keep') state.third = thirdOf(scale.studentOrder.indexOf(own), scale.studentOrder.length);
  }
  return state;
}

/**
 * A student's request. Body `{ class_id, class_token, action, … }`; actions
 * status, claim, calibrate, predict, next, judge, reflect.
 */
export async function cjStudentAction(store, lesson, block, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!STUDENT_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const config = await assertLive(store, lesson, block);
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this lesson from your class page.');
  // A class with no list: nobody can be told apart, so "never your own answer" can't hold (D23).
  if (!roster.students.length) {
    if (action !== 'status') reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
    return { need: null, anonymous: true };
  }
  const student = action === 'claim'
    ? await claimInitials(store, roster, body.class_token, body.initials)
    : await claimFor(store, roster, body.class_token);
  if (!student) {
    if (action !== 'status') reject(403, 'need_initials', 'Type your initials first.');
    return { need: 'initials' };
  }
  const classId = roster.cls.id;
  const round = await read(store, roundKey(lesson, block, classId));
  const key = judgeKey(lesson, block, classId, studentKey(student.id));
  let judge = cleanJudge(await read(store, key));
  const own = ownItem(round, student.id);
  const ctx = { store, lesson, block, classId, round, config, own, student };
  const target = targetFor(round, config, own);
  const phase = studentPhase(round, config, judge, own, target);
  const save = async (next) => {
    judge = { ...next, at: new Date().toISOString() };
    await store.setJSON(key, judge);
  };

  if (action === 'status' || action === 'claim') return studentState(ctx, judge);
  if (action === 'reflect') {
    if (!round || judge.judgements.length < target) reject(409, 'not_yet', 'Judge your pairs first, then reflect.');
    const reflection = typeof body.text === 'string' ? body.text.trim() : '';
    if (!reflection) reject(400, 'empty', 'Write one thing you would change.');
    if (reflection.length > CJ_LIMITS.reflection) reject(400, 'too_long', `Keep it to ${CJ_LIMITS.reflection} characters.`);
    await save({ ...judge, reflection });
    return studentState(ctx, judge);
  }
  if (phase === 'closed') reject(409, 'closed', round ? 'Judging has closed for now.' : 'Your teacher hasn’t opened judging yet.');

  if (action === 'calibrate') {
    const index = body.index;
    if (!Number.isInteger(index) || index < 0 || index >= config.calibration.length) reject(400, 'bad_index', 'That practice pair has changed. Reload the page.');
    if (body.choice !== 'left' && body.choice !== 'right') reject(400, 'bad_choice', 'Pick one of the two answers.');
    if (index > judge.calibration.length) reject(409, 'out_of_order', 'Do the practice pairs in order.');
    if (index === judge.calibration.length) await save({ ...judge, calibration: [...judge.calibration, { id: config.calibration[index].id, choice: body.choice }] });
    const pair = config.calibration[index];
    return { ...(await studentState(ctx, judge)), teacher: pair.better, reason: pair.reason };
  }
  if (phase === 'calibrate') reject(409, 'calibrate_first', 'Try the practice pairs first.');

  if (action === 'predict') {
    if (!own) reject(409, 'no_answer', 'You don’t have an answer in this round, so there’s nothing to predict.');
    if (!THIRDS.includes(body.third)) reject(400, 'bad_third', 'Pick top, middle or bottom.');
    if (!judge.prediction) await save({ ...judge, prediction: body.third });
    return studentState(ctx, judge);
  }
  if (phase === 'predict') reject(409, 'predict_first', 'Make your prediction first.');

  const cap = 2 * target;
  if (action === 'next') {
    let pair = null;
    if (judge.judgements.length < cap) {
      const scale = computeScale(round, config, await readJudges(store, lesson, block, classId));
      pair = nextPair(round, scale, judge, new Set(own ? [own] : []));
    }
    return { pair, done_count: judge.judgements.length, target, phase };
  }

  // judge
  if (judge.judgements.length >= cap) reject(409, 'enough', 'You’ve judged all your pairs. Thank you.');
  await save(addJudgement(round, config, judge, body, own));
  return studentState(ctx, judge);
}

/* ---------------------------------------------------------------- teacher */

async function teacherStatus(store, lesson, block, roster, config, round) {
  const judges = await readJudges(store, lesson, block, roster.cls.id);
  const anchors = round ? Object.values(round.pool).filter((item) => item.kind === 'anchor').length : 0;
  const progress = roster.students.map((s) => {
    const judge = judges.get(studentKey(s.id)) ?? emptyJudge();
    const own = ownItem(round, s.id);
    return {
      student_id: s.id,
      name: s.name,
      initials: s.initials,
      has_answer: !!own,
      judged: judge.judgements.length,
      target: targetFor(round, config, own),
      calibrated: judge.calibration.length >= config.calibration.length,
      predicted: !!judge.prediction,
      reflected: judge.reflection !== null
    };
  });
  return {
    round: round ? { open: !!round.open, started_at: round.started_at, pool_size: Object.keys(round.pool).length, anchors } : null,
    progress
  };
}

function teacherResults(round, config, roster, judges) {
  const scale = computeScale(round, config, judges);
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const wins = {};
  const counts = {};
  for (const c of scale.comparisons) {
    wins[c.winner] = (wins[c.winner] ?? 0) + 1;
    counts[c.winner] = (counts[c.winner] ?? 0) + 1;
    counts[c.loser] = (counts[c.loser] ?? 0) + 1;
  }
  const items = scale.order.map((id, i) => {
    const item = round.pool[id];
    const row = { id, text: item.text, kind: item.kind };
    if (item.kind === 'student') {
      const s = byId.get(item.ref);
      row.name = s?.name ?? 'Former student';
      row.initials = s?.initials ?? '';
    } else {
      row.anchor_mark = config.anchors.find((a) => a.id === item.ref)?.mark ?? null;
    }
    return { ...row, theta: scale.fit.theta[id], se: scale.fit.se[id], wins: wins[id] ?? 0, comparisons: counts[id] ?? 0, rank: i + 1 };
  });
  const judgeRows = [...judges.entries()].map(([key, judge]) => {
    const name = key === 'teacher' ? 'Teacher' : byId.get(key.slice(2))?.name ?? 'Former student';
    return { key, name, judged: judge.judgements.length, infit: scale.infit[key]?.infit ?? null, flagged: scale.flagged.has(key), weight: scale.weights[key] };
  }).sort((a, b) => (a.key === 'teacher' ? -1 : b.key === 'teacher' ? 1 : a.name.localeCompare(b.name)));
  const pair = scale.comparisons.length ? contestedPair(scale.comparisons, scale.fit.theta) : null;
  const card = (id) => ({ id, text: round.pool[id].text });
  const contested = pair ? { left: card(pair.a), right: card(pair.b), split: pair.split } : null;
  const exemplars = scale.comparisons.length ? scale.studentOrder.slice(0, 3).map(card) : [];
  const predictions = [];
  const reflections = [];
  for (const s of roster.students) {
    const judge = judges.get(studentKey(s.id));
    const own = ownItem(round, s.id);
    if (judge?.prediction && own) predictions.push({ name: s.name, predicted: judge.prediction, actual: thirdOf(scale.studentOrder.indexOf(own), scale.studentOrder.length) });
    if (judge?.reflection) reflections.push({ name: s.name, text: judge.reflection });
  }
  return {
    scale,
    out: {
      items,
      reliability: scale.reliability,
      judges: judgeRows,
      chips: chipStats(scale.judgements, config.chips),
      contested,
      exemplars,
      predictions,
      reflections,
      marks: marksFrom(round, config, scale, roster)
    }
  };
}

/**
 * The teacher's request. Body `{ class_id, action, … }`; actions classes, status,
 * start, refresh, close, open, next, judge, results, display, push_marks.
 */
export async function cjTeacherAction(store, lesson, block, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const config = await assertLive(store, lesson, block);
  if (action === 'classes') return { classes: await classesForLesson(store, lesson) };
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  if (!roster.students.length) reject(400, 'no_list', 'Add a class list before judging starts.');
  const classId = roster.cls.id;
  const rKey = roundKey(lesson, block, classId);
  let round = await read(store, rKey);

  if (action === 'start' || action === 'refresh') {
    if (action === 'start' && round) reject(409, 'started', 'Judging has already started for this class. Use Refresh pool to add late answers.');
    if (action === 'refresh' && !round) reject(409, 'no_round', 'Start judging first.');
    const salt = round?.salt ?? randomBytes(16).toString('hex');
    const { pool, source } = await buildPool(store, lesson, roster, config, salt, round?.pool ?? {});
    if (Object.keys(pool).length < 2) reject(400, 'too_few', 'There need to be at least two answers before judging starts.');
    const now = new Date().toISOString();
    round = action === 'start'
      ? { open: true, salt, started_at: now, refreshed_at: null, source, pool }
      : { ...round, source, pool, refreshed_at: now };
    await store.setJSON(rKey, round);
  }
  if (action === 'close' || action === 'open') {
    if (!round) reject(409, 'no_round', 'Start judging first.');
    round = { ...round, open: action === 'open' };
    await store.setJSON(rKey, round);
  }
  if (['status', 'start', 'refresh', 'close', 'open'].includes(action)) return teacherStatus(store, lesson, block, roster, config, round);

  if (!round) reject(409, 'no_round', 'Start judging first.');
  const tKey = judgeKey(lesson, block, classId, 'teacher');
  const judges = await readJudges(store, lesson, block, classId);
  if (action === 'next' || action === 'judge') {
    let judge = judges.get('teacher') ?? emptyJudge();
    if (action === 'judge') {
      judge = addJudgement(round, config, judge, body, null);
      await store.setJSON(tKey, judge);
      judges.set('teacher', judge);
    }
    const pair = action === 'next' ? nextPair(round, computeScale(round, config, judges), judge, new Set()) : null;
    return { ...(action === 'next' ? { pair } : {}), done_count: judge.judgements.length };
  }

  const { out } = teacherResults(round, config, roster, judges);
  if (action === 'results') return out;
  if (action === 'display') return { contested: out.contested ? { left: out.contested.left, right: out.contested.right } : null, exemplars: out.exemplars };

  // push_marks
  if (!out.marks) reject(400, 'no_marks', 'Give at least two anchors different marks before pushing marks.');
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, CJ_LIMITS.title) : 'Comparative judgement';
  const criterion = newMarkbookId();
  const column = {
    id: newMarkbookId(),
    kind: 'assessment',
    title,
    date: sydneyDay(new Date().toISOString()),
    weight: 0,
    criteria: [{ id: criterion, label: 'Overall', max: config.out_of, outcomes: [], concepts: [] }]
  };
  const marks = Object.fromEntries(Object.entries(out.marks.by_student).map(([id, mark]) => [id, { criteria: { [criterion]: mark } }]));
  const count = await addColumnWithMarks(store, classId, column, marks);
  return { column_id: column.id, count };
}
