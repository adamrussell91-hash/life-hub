/**
 * Who is answering a quiz. A student claims their initials from the class list
 * once, on their own device, and that device keeps them for every quiz in the
 * class until the teacher releases them.
 *
 *   class-claims/{class}/students/{student}   { device, claimed_at }  create-only, the truth
 *   class-claims/{class}/devices/{device}     { student_id, claimed_at }  lookup from a device
 *
 * `device` is a hash of a class-scoped token (deviceHash), never the token.
 */
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { classKey, deleteKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { deviceHash, read, reject, validToken } from './question-drop.mjs';
import { assignInitials, normaliseInitials, STUDENT_ID_PATTERN } from './student-initials.mjs';

const keys = (classId) => ({
  student: (id) => `class-claims/${classId}/students/${id}`,
  students: `class-claims/${classId}/students/`,
  device: (device) => `class-claims/${classId}/devices/${device}`
});

/** The class and its list with ids and initials filled in. Null when the class is gone. */
export async function loadRoster(store, classId) {
  if (!isSafeId(classId)) return null;
  const cls = await read(store, classKey(classId));
  if (!cls || isDeletedRecord(cls)) return null;
  return { cls, students: assignInitials(Array.isArray(cls.students) ? cls.students : []) };
}

/** The student this device holds in the class, or null. */
export async function claimFor(store, roster, token) {
  if (!validToken(token)) return null;
  const k = keys(roster.cls.id);
  const device = deviceHash(token);
  const mine = await read(store, k.device(device));
  const student = mine && roster.students.find((s) => s.id === mine.student_id);
  if (!student) return null;
  // A release removes the student's record; a lookup left behind means nothing.
  const held = await read(store, k.student(student.id));
  return held?.device === device ? student : null;
}

export async function claimInitials(store, roster, token, typed) {
  if (!validToken(token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const existing = await claimFor(store, roster, token);
  if (existing) return existing;
  const initials = normaliseInitials(typed);
  const student = initials ? roster.students.find((s) => s.initials === initials) : null;
  if (!student) reject(404, 'not_in_class', `${initials || 'Those initials'} isn’t in this class. Check with your teacher.`);
  const k = keys(roster.cls.id);
  const device = deviceHash(token);
  const claimed_at = new Date().toISOString();
  const written = await store.setJSON(k.student(student.id), { device, claimed_at }, { onlyIfNew: true });
  if (written?.modified === false) {
    const held = await read(store, k.student(student.id));
    if (held?.device !== device) reject(409, 'taken', `${initials} is already taken. See your teacher.`);
  }
  await store.setJSON(k.device(device), { student_id: student.id, claimed_at });
  return student;
}

/** Teacher: when each student's initials were claimed, by student id. */
export async function listClaims(store, classId) {
  const found = await listBlobKeys(store, keys(classId).students);
  const out = {};
  await Promise.all(
    found.map(async (key) => {
      const held = await read(store, key);
      if (held) out[key.slice(key.lastIndexOf('/') + 1)] = held.claimed_at;
    })
  );
  return out;
}

export async function releaseClaim(store, classId, studentId) {
  const k = keys(classId);
  const held = await read(store, k.student(studentId));
  if (!held) return;
  await deleteKey(store, k.student(studentId));
  await deleteKey(store, k.device(held.device));
}

export async function classClaimsAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!(await loadRoster(store, classId))) reject(404, 'not_found', 'Class not found.');
  const action = body.action ?? 'list';
  if (!['list', 'release'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'release') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id)) reject(400, 'bad_request', 'Unknown student.');
    await releaseClaim(store, classId, body.student_id);
  }
  return { claims: await listClaims(store, classId) };
}
