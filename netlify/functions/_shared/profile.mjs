/**
 * Student profile: done records and the map payload for one claimed student.
 *
 *   profile/{class}/{student}/done/{lesson}   { at, via }   create-only
 *
 * The student is whoever this device has claimed (class-claims.mjs). Nothing here stores a
 * name, and the payload returns only the student's own map. Feedback and progress come
 * from profile-feedback.mjs, from returned work only.
 */
import { isSafeId } from './class-examples.mjs';
import { claimFor, claimInitials, loadRoster } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import { unitMapPayload } from './profile-map.mjs';
import { markbookAction } from './markbook.mjs';
import { progressFor, returnedFor, pieceFor, markSeen } from './profile-feedback.mjs';
import { listClassDone, listDone, markDone, recordDone, removeDone, undoTick } from './profile-done.mjs';
import { STUDENT_ID_PATTERN } from './student-initials.mjs';

const ROLES = new Set(['core', 'support', 'extension', 'optional']);

/** The class's current unit, lessons in unit order with their route role. */
async function unitLessons(store, cls) {
  const unitId = cls.current_unit_id || (cls.active_unit_ids ?? [])[0];
  const unit = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
  const lessons = [];
  for (const id of unit?.lesson_ids ?? []) {
    if (!isSafeId(id)) continue;
    const [lesson, published] = await Promise.all([read(store, draftLessonKey(id)), read(store, publishedLessonKey(id))]);
    // Students only ever see lessons that are published.
    if (lesson && published && lesson.title && !lesson.deleted_at) lessons.push(lesson);
  }
  return { unit, lessons };
}

export async function profileAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'done', 'undone', 'claim', 'progress', 'returned', 'piece', 'seen'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  if (action === 'claim') return profileFor(store, roster, await claimInitials(store, roster, body.class_token, body.initials));
  const student = await claimFor(store, roster, body.class_token);
  if (!student) {
    if (action === 'done' || action === 'undone') reject(403, 'need_initials', 'Type your initials first.');
    return { need: 'initials' };
  }
  // The lesson footer: whether this student's own tick (or a teacher's complete mark) is on, nothing else.
  if (action === 'status' && body.quick === true && typeof body.lesson_id === 'string') {
    const record = (await listDone(store, classId, student.id))[body.lesson_id];
    return { need: null, initials: student.initials, ticked: !!record && !record.partial };
  }
  if (action === 'progress') return { need: null, initials: student.initials, ...(await progressFor(store, roster, student)), map: (await profileFor(store, roster, student)).map };
  if (action === 'returned') return { need: null, ...(await returnedFor(store, roster, student)) };
  if (action === 'piece') return pieceFor(store, roster, student, body.item);
  if (action === 'seen') return markSeen(store, roster, student, body.item);
  if (action === 'done') await recordDone(store, classId, student.id, body.lesson_id, 'tick');
  // The lesson footer's tick and untick need no map back.
  if (action === 'undone') await undoTick(store, classId, student.id, body.lesson_id);
  if (body.quick === true && (action === 'done' || action === 'undone')) return { need: null, initials: student.initials };
  return profileFor(store, roster, student);
}

/**
 * Lessons as the map draws them. A submitted quiz counts as done without a tick. A teacher's
 * partial mark is not done. An assessment counts only when the teacher has marked it complete,
 * not when it is handed in or ticked.
 */
export function mapRows(lessons, view, done, studentId) {
  const submitted = new Set(view.quizzes.filter((q) => q.scores?.[studentId]?.submitted_at).map((q) => q.lesson_id));
  const quizLessons = new Set(view.quizzes.map((q) => q.lesson_id));
  const took = new Set(view.markbook.took?.[studentId] ?? []);
  return lessons.map((l) => {
    const role = ROLES.has(l.route_role) ? l.route_role : 'core';
    const assessment = l.pedagogical_mode === 'assessment';
    const record = done[l.id];
    const counted = assessment ? record?.via === 'teacher' && !record.partial : Boolean(record) && !record.partial;
    return {
      id: l.id,
      title: l.title,
      role,
      kind: assessment ? 'assessment' : quizLessons.has(l.id) ? 'quiz' : 'lesson',
      done: counted || (!assessment && submitted.has(l.id)),
      assigned: role === 'core' || took.has(l.id)
    };
  });
}

async function profileFor(store, roster, student) {
  const classId = roster.cls.id;
  const { unit, lessons } = await unitLessons(store, roster.cls);
  const view = await markbookAction(store, classId, { action: 'load', skip_done: true });
  const done = await listDone(store, classId, student.id);
  const rows = mapRows(lessons, view, done, student.id);
  const next = rows.find((r) => r.role === 'core' && !r.done)?.id ?? null;
  return { need: null, initials: student.initials, map: { lessons: rows, next, unit: await unitMapPayload(store, roster, unit, lessons) } };
}

/** Teacher: every student's done records; marking one complete, partial or clearing it. */
export async function teacherProfileAction(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body?.action ?? 'list';
  if (!['list', 'remove', 'mark'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action !== 'list') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id) || !roster.students.some((s) => s.id === body.student_id)) {
      reject(400, 'bad_request', 'Unknown student.');
    }
    const state = action === 'remove' ? 'clear' : body.state;
    if (!['complete', 'partial', 'clear'].includes(state)) reject(400, 'bad_request', 'Mark it complete, partial or clear.');
    if (action === 'remove') await removeDone(store, classId, body.student_id, body.lesson_id);
    else await markDone(store, classId, body.student_id, body.lesson_id, state);
    // Only the one student changed, so only their records go back.
    return { done: { [body.student_id]: await listDone(store, classId, body.student_id) } };
  }
  return { done: await listClassDone(store, classId, roster.students.map((s) => s.id)) };
}
