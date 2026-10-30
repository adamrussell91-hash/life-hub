/**
 * A student's done records, create-only, one per lesson:
 *
 *   profile/{class}/{student}/done/{lesson}   { at, via: 'tick' | 'quiz' }
 */
import { isSafeId } from './class-examples.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { read, reject } from './question-drop.mjs';
import { deleteKey } from './teaching-blobs.mjs';

const doneKey = (classId, studentId, lessonId) => `profile/${classId}/${studentId}/done/${lessonId}`;
const donePrefix = (classId, studentId) => `profile/${classId}/${studentId}/done/`;

export async function recordDone(store, classId, studentId, lessonId, via) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const key = doneKey(classId, studentId, lessonId);
  const record = { at: new Date().toISOString(), via };
  const written = await store.setJSON(key, record, { onlyIfNew: true });
  if (written?.modified !== false) return;
  const held = await read(store, key);
  // A teacher's "partial" mark yields to the student's own tick.
  if (held?.partial) await store.setJSON(key, record);
  // Under a teacher's "complete" override, keep the tick so clearing the override brings it back.
  else if (held?.via === 'teacher' && !held.was) await store.setJSON(key, { ...held, was: record });
}

/**
 * Teacher: mark a lesson complete or partial for a student. The student's own record is kept
 * underneath as `was`, so clearing the teacher's mark returns the cell to what the student did.
 */
export async function markDone(store, classId, studentId, lessonId, state) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const key = doneKey(classId, studentId, lessonId);
  const held = await read(store, key);
  const was = held?.via === 'teacher' ? held.was : held && !held.partial ? held : undefined;
  await store.setJSON(key, { at: new Date().toISOString(), via: 'teacher', ...(state === 'partial' ? { partial: true } : {}), ...(was ? { was } : {}) });
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

/** Teacher: drop their own mark; a student record kept underneath comes back. */
export async function removeDone(store, classId, studentId, lessonId) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const key = doneKey(classId, studentId, lessonId);
  const was = (await read(store, key))?.was;
  if (was) await store.setJSON(key, was);
  else await deleteKey(store, key);
}

const fillsKey = (classId, studentId, unitId) => `profile/${classId}/${studentId}/fills/${unitId}`;
const GROUPS = ['understanding', 'responding', 'concepts', 'skills'];

/**
 * Bars only ever fill: keep the highest fractions this student has reached in this unit, so a
 * corrected mark or a re-marked quiz can never take colour away. Fractions only, no evidence.
 */
export async function highWaterFills(store, classId, studentId, unitId, fills) {
  if (!isSafeId(unitId)) return fills;
  const key = fillsKey(classId, studentId, unitId);
  const held = (await read(store, key)) ?? {};
  const out = {};
  let changed = false;
  for (const group of GROUPS) {
    const now = fills[group] ?? { mastered: 0, building: 0 };
    const was = held[group] ?? { mastered: 0, building: 0 };
    const mastered = Math.max(now.mastered, was.mastered ?? 0);
    // Pale covers building and mastered together, so it can't be shorter than strong.
    const building = Math.max(now.building, was.building ?? 0, 0);
    out[group] = { mastered, building };
    if (mastered !== (was.mastered ?? 0) || building !== (was.building ?? 0)) changed = true;
  }
  if (changed) await store.setJSON(key, out);
  return out;
}
