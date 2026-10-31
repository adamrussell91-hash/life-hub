/**
 * A student's done records, create-only, one per lesson:
 *
 *   profile/{class}/{student}/done/{lesson}   { at, via: 'tick' | 'quiz' }
 *
 * The teacher's own marks sit apart, in one record per class, read strongly in one go:
 *
 *   profile/{class}/teacher-marks   { [student]: { [lesson]: { at, via: 'teacher', partial? } } }
 *
 * A blob listing can lag a fresh write by up to a minute, so a teacher's tick kept under
 * done/ could vanish on the next load. The single record never lags.
 */
import { isSafeId } from './class-examples.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { read, reject } from './question-drop.mjs';
import { deleteKey } from './teaching-blobs.mjs';

const doneKey = (classId, studentId, lessonId) => `profile/${classId}/${studentId}/done/${lessonId}`;
const donePrefix = (classId, studentId) => `profile/${classId}/${studentId}/done/`;
const marksKey = (classId) => `profile/${classId}/teacher-marks`;

/** Every teacher mark in the class, by student then lesson. */
export async function readTeacherMarks(store, classId) {
  return (await read(store, marksKey(classId))) ?? {};
}

/** Swaps one teacher mark in the class record, retrying if another save got there first. */
async function writeTeacherMark(store, classId, studentId, lessonId, record) {
  const key = marksKey(classId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = store.getWithMetadata ? await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }) : null;
    const marks = row?.data ?? (store.getWithMetadata ? {} : await readTeacherMarks(store, classId));
    const mine = { ...(marks[studentId] ?? {}) };
    if (record) mine[lessonId] = record;
    else delete mine[lessonId];
    const next = { ...marks, [studentId]: mine };
    if (!Object.keys(mine).length) delete next[studentId];
    const result = await store.setJSON(key, next, row ? { onlyIfMatch: row.etag } : store.getWithMetadata ? { onlyIfNew: true } : undefined);
    if (result?.modified !== false) return;
  }
  reject(409, 'busy', 'Too many marks at once. Try that one again.');
}

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
 * Student: take back their own tick. A teacher's mark stays; a tick kept under
 * a teacher's override goes, so clearing the override doesn't bring it back.
 */
export async function undoTick(store, classId, studentId, lessonId) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const key = doneKey(classId, studentId, lessonId);
  const held = await read(store, key);
  if (held?.via === 'tick') await deleteKey(store, key);
  else if (held?.via === 'teacher' && held.was) {
    const { was: _was, ...rest } = held;
    await store.setJSON(key, rest);
  }
}

/** Teacher: mark a lesson complete or partial for a student, or clear their mark ('clear'). */
export async function markDone(store, classId, studentId, lessonId, state) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  await writeTeacherMark(store, classId, studentId, lessonId, state === 'clear' ? null : { at: new Date().toISOString(), via: 'teacher', ...(state === 'partial' ? { partial: true } : {}) });
  // An older teacher mark kept under done/ goes too, or it would show through once cleared.
  const key = doneKey(classId, studentId, lessonId);
  const held = await read(store, key);
  if (held?.via === 'teacher') {
    if (held.was) await store.setJSON(key, held.was);
    else await deleteKey(store, key);
  }
}

/**
 * A student's done records with the teacher's marks laid over them. A teacher mark keeps what the
 * student did as `was`; a teacher's partial mark yields to the student's own tick.
 * Pass `marks` from readTeacherMarks when listing a whole class, to read it once.
 */
export async function listDone(store, classId, studentId, marks) {
  const prefix = donePrefix(classId, studentId);
  const out = {};
  await Promise.all(
    (await listBlobKeys(store, prefix)).map(async (key) => {
      const held = await read(store, key);
      if (held) out[key.slice(prefix.length)] = held;
    })
  );
  const mine = (marks ?? (await readTeacherMarks(store, classId)))[studentId] ?? {};
  for (const [lessonId, mark] of Object.entries(mine)) {
    const own = out[lessonId]?.via === 'teacher' ? out[lessonId].was : out[lessonId];
    if (mark.partial && own && !own.partial) continue;
    out[lessonId] = { ...mark, ...(own ? { was: own } : {}) };
  }
  return out;
}

/** Every student's done records in the class, side by side. */
export async function listClassDone(store, classId, studentIds) {
  const marks = await readTeacherMarks(store, classId);
  return Object.fromEntries(await Promise.all(studentIds.map(async (id) => [id, await listDone(store, classId, id, marks)])));
}

/** Teacher: wipe the lesson for a student, their own record and any teacher mark. */
export async function removeDone(store, classId, studentId, lessonId) {
  await markDone(store, classId, studentId, lessonId, 'clear');
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
