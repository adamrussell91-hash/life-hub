/**
 * A practice run of a case study for the teacher: the real case rules, run on the
 * editor's draft as one pretend student. Everything lives under case/{lesson}~practice/,
 * so the class's stations, parts, Outcome reveal, board, spread and work never see it.
 *
 *   case/{lesson}~practice/config   the case settings, as publish would store them
 *   case/{lesson}~practice/lesson   the lesson as a student gets it, plus the draft's signature
 *   case/{lesson}~practice/state    the practice class moves (teacher pace)
 *   case/{lesson}~practice/work/me  the pretend student's work
 */
import { createHash } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { read, reject } from './question-drop.mjs';
import { filterBlocksForStudent, sanitizeBlocksDeep } from './teaching-student.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { caseClassMove, caseStudentCore, prepareCasePublish } from './case-study.mjs';

export const practiceId = (lessonId) => `${lessonId}~practice`;
const prefix = (lessonId) => `case/${practiceId(lessonId)}/`;
const lessonKey = (lessonId) => `${prefix(lessonId)}lesson`;
const configKey = (lessonId) => `${prefix(lessonId)}config`;

export const PRACTICE_STUDENT = { id: 'practice', initials: 'You', name: 'You (practice)' };
const CLASS_MOVES = ['open', 'release_part', 'reveal'];

const signature = (draft) => createHash('sha256').update(JSON.stringify({ blocks: draft.blocks ?? [], case: draft.case ?? null })).digest('hex').slice(0, 16);

/** Wipe the last run and set one up from this draft. Refuses a draft that wouldn't publish. */
async function startRun(store, lessonId, draft) {
  if (!draft || typeof draft !== 'object' || draft.pedagogical_mode !== 'case_study' || !draft.case) reject(400, 'not_case', 'Set up the case first.');
  const study = prepareCasePublish(draft);
  if (study.problems.length > 0) reject(409, 'not_ready', `Finish the case first: ${study.problems[0]}`);
  // Nothing is held back in a practice run, and any class may try it.
  const { class_id, ...rest } = study.config;
  const config = { ...rest, outcome: { text: rest.outcome.text, source: rest.outcome.source } };
  for (const key of await listBlobKeys(store, prefix(lessonId))) await store.delete(key);
  const blocks = sanitizeBlocksDeep(filterBlocksForStudent(Array.isArray(draft.blocks) ? draft.blocks : [], { keepQuizQuestions: true }));
  // The lesson id is the practice id, so an activity block inside the case can't write to the real lesson.
  const lesson = {
    lesson_id: practiceId(lessonId),
    title: typeof draft.title === 'string' && draft.title ? draft.title : 'Case study',
    unit_id: draft.unit_id,
    blocks,
    published_at: new Date(0).toISOString(),
    schema_version: 1,
    pedagogical_mode: 'case_study',
    case: study.snapshot
  };
  await store.setJSON(configKey(lessonId), config);
  await store.setJSON(lessonKey(lessonId), { sig: signature(draft), lesson });
}

async function loadRun(store, lessonId) {
  const run = await read(store, lessonKey(lessonId));
  const config = await read(store, configKey(lessonId));
  if (!run?.lesson || !config) reject(404, 'not_started', 'Start a practice run first.');
  return { run, config };
}

const student = (lessonId, config) => ({
  caseId: practiceId(lessonId),
  config,
  identity: { need: null, initials: PRACTICE_STUDENT.initials },
  classId: 'practice',
  student: PRACTICE_STUDENT,
  owner: 'me'
});

async function practiceState(store, lessonId) {
  const { run, config } = await loadRun(store, lessonId);
  const state = await caseClassMove(store, practiceId(lessonId), config, {});
  const status = await caseStudentCore(store, student(lessonId, config), { action: 'status' });
  const total = Array.isArray(config.parts) ? config.parts.length : 0;
  return {
    lesson: run.lesson,
    status,
    class: {
      pace: config.pace === 'own' ? 'own' : 'teacher',
      open_to: state.open_to,
      last: config.rules_off ? 3 : 4,
      parts_open: Math.max(1, Math.min(total, Number(state.parts_open) || 1)),
      parts_total: total,
      outcome_revealed: !!state.outcome_revealed
    }
  };
}

/**
 * ops:
 *   open (draft)   carry on the run if the case hasn't changed since it started, else start again
 *   start (draft)  wipe the last run and start again
 *   state          the lesson, the student's status and the practice class moves
 *   student (body) as the pretend student; answers as the real student endpoint does
 *   teacher (body) a class move: open, release_part or reveal; answers with the whole state
 */
export async function casePracticeAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Case not found.');
  const op = body.op ?? 'state';
  if (op === 'start') await startRun(store, lessonId, body.draft);
  else if (op === 'open') {
    const run = await read(store, lessonKey(lessonId));
    if (!run || run.sig !== signature(body.draft ?? {})) await startRun(store, lessonId, body.draft);
  } else if (op === 'student') {
    const { config } = await loadRun(store, lessonId);
    return caseStudentCore(store, student(lessonId, config), body.body && typeof body.body === 'object' ? body.body : {});
  } else if (op === 'teacher') {
    const { config } = await loadRun(store, lessonId);
    const action = body.body?.action;
    if (!CLASS_MOVES.includes(action)) reject(400, 'bad_action', 'Unknown class step.');
    if (config.pace === 'own') reject(409, 'own_pace', 'This case runs at the student’s own pace.');
    await caseClassMove(store, practiceId(lessonId), config, body.body);
  } else if (op !== 'state') reject(400, 'bad_op', 'Unknown practice step.');
  return practiceState(store, lessonId);
}
