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
  // A teacher's "partial" mark yields to the student's own tick; anything else is left as it was.
  if (written?.modified === false && (await read(store, key))?.partial) await store.setJSON(key, record);
}

/** Teacher: mark a lesson complete or partial for a student, replacing whatever was there. */
export async function markDone(store, classId, studentId, lessonId, state) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  await store.setJSON(doneKey(classId, studentId, lessonId), { at: new Date().toISOString(), via: 'teacher', ...(state === 'partial' ? { partial: true } : {}) });
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
