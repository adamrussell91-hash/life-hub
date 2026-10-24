/**
 * A practice run of a design sprint for the teacher: the real sprint code,
 * run on the Kit as it was when the run started with a pretend group of two and a practice
 * clock that moves only when the teacher skips ahead. Everything lives under
 * sprint/{lesson}~practice/, so the class's records, markbook and map never
 * see it.
 */
import { isSafeId } from './class-examples.mjs';
import { read, reject } from './question-drop.mjs';
import { filterBlocksForStudent, sanitizeBlocksDeep } from './teaching-student.mjs';
import { SprintSettingsSchema } from './sprint-schema.mjs';
import { nextChange, phaseDue, sydneyEpoch } from './sprint-rules.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { prepareSprintPublish, sprintAction, sprintTeacherAction, withSprintScope } from './sprint.mjs';

export const practiceId = (lessonId) => `${lessonId}~practice`;
const clockKey = (lessonId) => `sprint/${practiceId(lessonId)}/clock`;
const draftKey = (lessonId) => `sprint/${practiceId(lessonId)}/draft`;

export const PRACTICE_STUDENTS = [
  { id: 'practice-s1', initials: 'S1', name: 'Student 1' },
  { id: 'practice-s2', initials: 'S2', name: 'Student 2' }
];
const ROSTER = { cls: { id: 'practice' }, students: PRACTICE_STUDENTS };
const AS = { s1: PRACTICE_STUDENTS[0], s2: PRACTICE_STUDENTS[1] };

/** The lesson as students would get it, and the practice config, from the draft the run started with. */
async function practiceSetup(store, lessonId) {
  const draft = await read(store, draftKey(lessonId));
  if (!draft) reject(404, 'not_started', 'Start a practice run first.');
  const parsed = SprintSettingsSchema.safeParse(draft.sprint);
  if (!parsed.success) reject(409, 'bad_kit', `The Kit isn’t valid yet: ${parsed.error.issues[0]?.message ?? 'check the settings'}`);
  const sprint = parsed.data;
  if (sprint.phases.some((p) => phaseDue(p) === null)) reject(409, 'need_closes', 'Set a close time for every phase first.');
  const blocks = sanitizeBlocksDeep(filterBlocksForStudent(draft.blocks ?? [], { keepQuizQuestions: true }));
  const { snapshot, config } = prepareSprintPublish({ ...draft, sprint }, blocks);
  const lesson = {
    lesson_id: lessonId,
    title: draft.title ?? 'Design Sprint',
    unit_id: draft.unit_id,
    blocks: snapshot.blocks,
    published_at: new Date(0).toISOString(),
    schema_version: 1,
    pedagogical_mode: 'design_sprint',
    sprint: snapshot.sprint
  };
  return {
    lesson,
    config: { ...config, class_id: 'practice', groups: [{ id: 'practice', name: 'Practice group', students: PRACTICE_STUDENTS.map((s) => s.id) }] }
  };
}

/** The practice time: 9:00 am on the day Understand closes, until the teacher skips. */
async function practiceNow(store, lessonId, config) {
  const saved = await read(store, clockKey(lessonId));
  if (typeof saved?.at === 'number') return saved.at;
  const u = config.phases[0];
  const due = phaseDue(u);
  const at = Math.min(sydneyEpoch(u.due_date, '09:00') ?? due, due - 3_600_000);
  await store.setJSON(clockKey(lessonId), { at });
  return at;
}

const scoped = (setup, now, who, fn) => withSprintScope({ ...setup, roster: ROSTER, now, who }, fn);
const asStudent = (s) => ({ classId: 'practice', student: s, need: null });

async function practiceState(store, lessonId, setup, now) {
  const pid = practiceId(lessonId);
  const summary = await scoped(setup, now, null, () => sprintTeacherAction(store, pid, { action: 'summary' }));
  const students = {};
  for (const [key, s] of Object.entries(AS)) students[key] = await scoped(setup, now, asStudent(s), () => sprintAction(store, pid, { action: 'status' }));
  const ext = summary.extend?.class ?? {};
  const phases = setup.config.phases.map((p) => ({ ...p, ...(ext[p.key] ?? {}) }));
  const lock = summary.lock ? { until: summary.lock.until } : null;
  return { now, next: nextChange(phases, { ended: summary.ended, lock }, now), lesson: setup.lesson, summary, students };
}

/**
 * ops: start (draft: wipes the last run), state, student (as s1|s2, body),
 * teacher (body), skip.
 * student and teacher answer as the real endpoints do; the others answer
 * with the whole practice state.
 */
export async function sprintPracticeAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Sprint not found.');
  const op = body.op ?? 'state';
  if (op === 'start') {
    const d = body.draft;
    if (!d || typeof d !== 'object' || d.pedagogical_mode !== 'design_sprint' || !d.sprint) reject(400, 'not_sprint', 'Set up the sprint’s Kit first.');
    // Check the Kit before wiping the last run.
    const kit = SprintSettingsSchema.safeParse(d.sprint);
    if (!kit.success) reject(409, 'bad_kit', `The Kit isn’t valid yet: ${kit.error.issues[0]?.message ?? 'check the settings'}`);
    if (d.sprint.phases.some((p) => phaseDue(p) === null)) reject(409, 'need_closes', 'Set a close time for every phase first.');
    for (const key of await listBlobKeys(store, `sprint/${practiceId(lessonId)}/`)) await store.delete(key);
    await store.setJSON(draftKey(lessonId), { title: d.title, unit_id: d.unit_id, pedagogical_mode: 'design_sprint', blocks: Array.isArray(d.blocks) ? d.blocks : [], sprint: d.sprint });
  }
  const setup = await practiceSetup(store, lessonId);
  let now = await practiceNow(store, lessonId, setup.config);
  const pid = practiceId(lessonId);
  if (op === 'student') {
    const s = AS[body.as];
    if (!s) reject(400, 'bad_student', 'Pick Student 1 or Student 2.');
    if (body.body?.action === 'pitch' && body.body?.file_id) reject(409, 'practice', 'Uploads are off in a practice run. Use a link.');
    return scoped(setup, now, asStudent(s), () => sprintAction(store, pid, body.body ?? {}));
  }
  if (op === 'teacher') return scoped(setup, now, null, () => sprintTeacherAction(store, pid, body.body ?? {}));
  if (op === 'skip') {
    const state = await practiceState(store, lessonId, setup, now);
    if (!state.next) reject(409, 'done', 'Nothing else changes on its own. The practice run is finished.');
    now = state.next.at;
    await store.setJSON(clockKey(lessonId), { at: now });
  }
  if (!['start', 'state', 'skip'].includes(op)) reject(400, 'bad_op', 'Unknown practice step.');
  return practiceState(store, lessonId, setup, now);
}
