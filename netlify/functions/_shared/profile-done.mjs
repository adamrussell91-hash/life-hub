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
