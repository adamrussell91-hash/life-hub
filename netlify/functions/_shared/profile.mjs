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
import { isDeletedRecord } from './record-liveness.mjs';
import { claimFor, claimInitials, loadRoster } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import { unitMapPayload } from './profile-map.mjs';
import { markbookAction } from './markbook.mjs';
import { progressFor, returnedFor, pieceFor, markSeen, stepsFor, unseenFor, skillsFor, classSkillRungs } from './profile-feedback.mjs';
import { listClassDone, listDone, markDone, recordDone, removeDone, undoTick } from './profile-done.mjs';
import { STUDENT_ID_PATTERN } from './student-initials.mjs';
import { lessonsForStudent, routeRoleOf } from './lesson-assign.mjs';
import { deleteTeacherNote, saveTeacherNote, teacherNotes } from './teacher-notes.mjs';
import { teacherHabits } from './teacher-habits.mjs';

const ROLES = new Set(['core', 'support', 'extension', 'optional']);

/**
 * The class's current unit, lessons in unit order with their route role. A trashed unit is
 * skipped for the next one the class has, even while the class still names it.
 */
async function unitLessons(store, cls) {
  let unit = null;
  for (const unitId of [cls.current_unit_id, ...(cls.active_unit_ids ?? [])]) {
    const found = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
    if (found && !isDeletedRecord(found)) { unit = found; break; }
  }
  const lessons = [];
  for (const id of unit?.lesson_ids ?? []) {
    if (!isSafeId(id)) continue;
    const [lesson, published] = await Promise.all([read(store, draftLessonKey(id)), read(store, publishedLessonKey(id))]);
    // Students only ever see lessons that are published and not trashed.
    if (!lesson || !published || !lesson.title || isDeletedRecord(lesson)) continue;
    const role = routeRoleOf(unit, lesson);
    lessons.push(role ? { ...lesson, route_role: role } : lesson);
  }
  return { unit, lessons };
}

export async function profileAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'done', 'undone', 'claim', 'progress', 'returned', 'piece', 'seen', 'steps', 'token', 'skills'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  if (action === 'claim') return profileFor(store, roster, await claimInitials(store, roster, body.class_token, body.initials));
  const student = await claimFor(store, roster, body.class_token);
  if (!student) {
    if (action === 'done' || action === 'undone') reject(403, 'need_initials', 'Type your initials first.');
    return { need: 'initials' };
  }
  // The initials token on every lesson page.
  if (action === 'token') return { need: null, initials: student.initials, unseen: await unseenFor(store, roster, student) };
  // The lesson footer: whether this student's own tick (or a teacher's complete mark) is on, nothing else.
  if (action === 'status' && body.quick === true && typeof body.lesson_id === 'string') {
    const record = (await listDone(store, classId, student.id))[body.lesson_id];
    return { need: null, initials: student.initials, ticked: !!record && !record.partial };
  }
  if (action === 'progress') return { need: null, initials: student.initials, ...(await progressFor(store, roster, student)), map: (await profileFor(store, roster, student)).map };
  if (action === 'returned') return { need: null, ...(await returnedFor(store, roster, student)) };
  // Writing boxes' next steps: every skill at once (a lesson is small), so `lesson_id` only has to be safe.
  if (action === 'steps') {
    if (body.lesson_id !== undefined && !isSafeId(body.lesson_id)) reject(400, 'bad_request', 'Unknown lesson.');
    return stepsFor(store, classId, student.id);
  }
  // A Voice task's "where you are": one strand of this student's own skills.
  if (action === 'skills') {
    if (body.strand !== undefined && (typeof body.strand !== 'string' || !/^[a-z]{3,20}$/.test(body.strand))) reject(400, 'bad_request', 'Unknown strand.');
    return skillsFor(store, classId, student.id, body.strand ?? null);
  }
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
      done: counted || (!assessment && submitted.has(l.id))
    };
  });
}

async function profileFor(store, roster, student) {
  const classId = roster.cls.id;
  const { unit, lessons: unitList } = await unitLessons(store, roster.cls);
  const view = await markbookAction(store, classId, { action: 'load', skip_done: true });
  const done = await listDone(store, classId, student.id);
  // Side lessons only reach the students they are set for; the map never carries the others' titles.
  const lessons = lessonsForStudent(unitList, view, done, student.id, classId);
  const rows = mapRows(lessons, view, done, student.id);
  const next = rows.find((r) => r.role === 'core' && !r.done)?.id ?? null;
  return { need: null, initials: student.initials, map: { lessons: rows, next, unit: await unitMapPayload(store, roster, unit, lessons) } };
}

/**
 * Teacher: every student's done records; marking one complete, partial or clearing it; and one
 * student's progress page exactly as they see it (`progress`, `returned`, `piece`). The teacher's
 * reads never mark a piece seen. Also the teacher-only Over time reads: private notes (`notes`,
 * `note_save`, `note_delete`) and `habits`. None of these is in the student's profileAction.
 */
export async function teacherProfileAction(store, classId, body, { now = new Date() } = {}) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body?.action ?? 'list';
  if (!['list', 'remove', 'mark', 'progress', 'returned', 'piece', 'skill_rungs', 'notes', 'note_save', 'note_delete', 'habits'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  // Where students sit on the skills continuum: one student (with student_id) or the whole class.
  if (action === 'skill_rungs' && body.student_id === undefined) {
    const rows = await classSkillRungs(store, classId, roster.students.map((s) => s.id));
    const byId = new Map(roster.students.map((s) => [s.id, s]));
    return { students: rows.map((r) => ({ id: r.id, name: byId.get(r.id)?.name ?? '', initials: byId.get(r.id)?.initials ?? '', rungs: r.rungs })) };
  }
  if (action !== 'list') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id) || !roster.students.some((s) => s.id === body.student_id)) {
      reject(400, 'bad_request', 'Unknown student.');
    }
    const student = roster.students.find((s) => s.id === body.student_id);
    if (action === 'progress') return { need: null, name: student.name, initials: student.initials, ...(await progressFor(store, roster, student)), map: (await profileFor(store, roster, student)).map };
    if (action === 'returned') return { need: null, ...(await returnedFor(store, roster, student)) };
    if (action === 'piece') return pieceFor(store, roster, student, body.item);
    if (action === 'skill_rungs') return { rungs: (await classSkillRungs(store, classId, [student.id]))[0]?.rungs ?? {} };
    if (action === 'notes') return teacherNotes(store, roster.cls.id, student.id);
    if (action === 'note_save') return saveTeacherNote(store, roster.cls.id, student.id, body.note, { now });
    if (action === 'note_delete') return deleteTeacherNote(store, roster.cls.id, student.id, body.note_id);
    if (action === 'habits') return teacherHabits(store, roster.cls.id, student.id, { now });
    const state = action === 'remove' ? 'clear' : body.state;
    if (!['complete', 'partial', 'clear'].includes(state)) reject(400, 'bad_request', 'Mark it complete, partial or clear.');
    if (action === 'remove') await removeDone(store, classId, body.student_id, body.lesson_id);
    else await markDone(store, classId, body.student_id, body.lesson_id, state);
    // Only the one student changed, so only their records go back.
    return { done: { [body.student_id]: await listDone(store, classId, body.student_id) } };
  }
  return { done: await listClassDone(store, classId, roster.students.map((s) => s.id)) };
}
