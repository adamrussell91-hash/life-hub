/**
 * Student profile: done records and the map payload for one claimed student.
 *
 *   profile/{class}/{student}/done/{lesson}   { at, via }   create-only
 *
 * The student is whoever this device has claimed (class-claims.mjs). Nothing here stores a
 * name, and the payload returns only the student's own map and four bar fills.
 */
import { isSafeId } from './class-examples.mjs';
import { claimFor, claimInitials, loadRoster } from './class-claims.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { read, reject } from './question-drop.mjs';
import { deleteKey, draftLessonKey, unitKey } from './teaching-blobs.mjs';
import { markbookAction } from './markbook.mjs';
import { fillsFor, markbookEvidence } from './profile-evidence.mjs';
import { profileItems } from './profile-items.mjs';
import { STUDENT_ID_PATTERN } from './student-initials.mjs';

const doneKey = (classId, studentId, lessonId) => `profile/${classId}/${studentId}/done/${lessonId}`;
const donePrefix = (classId, studentId) => `profile/${classId}/${studentId}/done/`;
const ROLES = new Set(['core', 'support', 'extension', 'optional']);

export async function recordDone(store, classId, studentId, lessonId, via) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  await store.setJSON(doneKey(classId, studentId, lessonId), { at: new Date().toISOString(), via }, { onlyIfNew: true });
}

export async function listDone(store, classId, studentId) {
  const prefix = donePrefix(classId, studentId);
  const out = {};
  await Promise.all(
    (await listBlobKeys(store, prefix)).map(async (key) => {
      const held = await read(store, key);
      if (held) out[key.slice(prefix.length)] = held;
    })
  );
  return out;
}

export async function removeDone(store, classId, studentId, lessonId) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  await deleteKey(store, doneKey(classId, studentId, lessonId));
}

/** The class's current unit, lessons in unit order with their route role. */
async function unitLessons(store, cls) {
  const unitId = cls.current_unit_id || (cls.active_unit_ids ?? [])[0];
  const unit = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
  const lessons = [];
  for (const id of unit?.lesson_ids ?? []) {
    if (!isSafeId(id)) continue;
    const lesson = await read(store, draftLessonKey(id));
    if (lesson && lesson.title && !lesson.deleted_at) lessons.push(lesson);
  }
  return { unit, lessons };
}

export async function profileAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'done', 'claim'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  if (action === 'claim') return profileFor(store, roster, await claimInitials(store, roster, body.class_token, body.initials));
  const student = await claimFor(store, roster, body.class_token);
  if (!student) {
    if (action === 'done') reject(403, 'need_initials', 'Type your initials first.');
    return { need: 'initials' };
  }
  if (action === 'done') await recordDone(store, classId, student.id, body.lesson_id, 'tick');
  return profileFor(store, roster, student);
}

/** Lessons as the map draws them. A submitted quiz counts as done without a tick; `done` is not changed. */
export function mapRows(lessons, view, done, studentId) {
  const submitted = new Set(view.quizzes.filter((q) => q.scores?.[studentId]?.submitted_at).map((q) => q.lesson_id));
  const quizLessons = new Set(view.quizzes.map((q) => q.lesson_id));
  const took = new Set(view.markbook.took?.[studentId] ?? []);
  return lessons.map((l) => {
    const role = ROLES.has(l.route_role) ? l.route_role : 'core';
    return {
      id: l.id,
      title: l.title,
      role,
      kind: quizLessons.has(l.id) ? 'quiz' : 'lesson',
      done: Boolean(done[l.id]) || submitted.has(l.id),
      assigned: role === 'core' || took.has(l.id)
    };
  });
}

async function profileFor(store, roster, student) {
  const classId = roster.cls.id;
  const { lessons } = await unitLessons(store, roster.cls);
  const view = await markbookAction(store, classId, { action: 'load' });
  const done = await listDone(store, classId, student.id);
  const rows = mapRows(lessons, view, done, student.id);
  const next = rows.find((r) => r.role === 'core' && !r.done)?.id ?? null;
  const evidence = markbookEvidence(view, []).evidence.filter((e) => e.student === student.id);
  const items = await profileItems(store, roster, lessons, view);
  return { need: null, initials: student.initials, map: { lessons: rows, next }, fills: fillsFor(items, evidence) };
}

/** Teacher: every student's done records, and removing one. */
export async function teacherProfileAction(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body?.action ?? 'list';
  if (!['list', 'remove'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'remove') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id)) reject(400, 'bad_request', 'Unknown student.');
    await removeDone(store, classId, body.student_id, body.lesson_id);
  }
  const done = {};
  for (const s of roster.students) done[s.id] = await listDone(store, classId, s.id);
  return { done };
}
