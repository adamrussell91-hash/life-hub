/**
 * Lesson reps for WalkThrus: one small record per lesson, class and technique.
 *
 *   walkthru_reps/<tile>/<lesson>~<class|any>   { state, note, lesson_end, goal_id, steps_done, at }
 *
 * A tile is a book technique or a fusion (packages/walkthrus/tiles.mjs).
 *
 * A tap writes (or undoes) one record, so a second device never overwrites a shared counter.
 * Teacher only; no student ever reads these.
 */
import { applyStepTick, applyTap, isSafeRepId, normalizeRep, repStoreKey, TAP_STATES } from '../../../packages/walkthrus/reps.mjs';
import { isTileId } from '../../../packages/walkthrus/tiles.mjs';
import { deleteKey, getJSON, listJSON, setJSON } from './teaching-blobs.mjs';
import { reject } from './question-drop.mjs';

const PREFIX = 'walkthru_reps/';

function readTarget(body) {
  if (!isTileId(body?.technique_id) || !isSafeRepId(body?.lesson_id)) reject(400, 'invalid_field', 'Unknown technique or lesson.');
  const classId = body.class_id == null || body.class_id === '' ? null : body.class_id;
  if (classId !== null && !isSafeRepId(classId)) reject(400, 'invalid_field', 'Unknown class.');
  return { techniqueId: body.technique_id, lessonId: body.lesson_id, classId };
}

/** Every rep, or one technique's. */
export async function listReps(store, techniqueId = null) {
  if (techniqueId !== null && !isTileId(techniqueId)) reject(400, 'invalid_field', 'Unknown technique.');
  const prefix = techniqueId ? `${PREFIX}${techniqueId}/` : PREFIX;
  return (await listJSON(store, prefix, { consistency: 'strong' })).map(normalizeRep).filter(Boolean);
}

/** A timetabled lesson with the technique in its note: a planned rep, never overwriting a logged one. */
export async function planRep(store, body, now = new Date().toISOString()) {
  const { techniqueId, lessonId, classId } = readTarget(body);
  const lessonEnd = typeof body.lesson_end === 'string' ? body.lesson_end : null;
  const key = repStoreKey(techniqueId, lessonId, classId);
  const existing = normalizeRep(await getJSON(store, key, { consistency: 'strong' }));
  const draft = normalizeRep({ technique_id: techniqueId, lesson_id: lessonId, class_id: classId, goal_id: body.goal_id, state: existing?.state ?? 'planned', note: existing?.note ?? '', lesson_end: lessonEnd, at: existing?.at ?? now });
  if (!draft) reject(400, 'invalid_field', 'That lesson time isn’t valid.');
  await setJSON(store, key, draft);
  return draft;
}

/** Ran it, Partly or Didn't get to it. Tap again to undo. */
export async function tapRep(store, body, now = new Date().toISOString()) {
  if (!TAP_STATES.includes(body?.state)) reject(400, 'invalid_field', 'Unknown rep.');
  const { techniqueId, lessonId, classId } = readTarget(body);
  const key = repStoreKey(techniqueId, lessonId, classId);
  const existing = normalizeRep(await getJSON(store, key, { consistency: 'strong' }));
  const fresh = normalizeRep({ technique_id: techniqueId, lesson_id: lessonId, class_id: classId, goal_id: body.goal_id, state: body.state, note: '', lesson_end: typeof body.lesson_end === 'string' ? body.lesson_end : null, at: now });
  const next = applyTap(existing, { state: body.state, note: body.note, fresh }, now);
  if (!next) {
    if (existing) await deleteKey(store, key);
    return null;
  }
  const kept = normalizeRep({ ...next, goal_id: body.goal_id ?? next.goal_id });
  await setJSON(store, key, kept);
  return kept;
}

/** A step ticked (or unticked) in class. Saves at once; the state follows the ticks. */
export async function stepRep(store, body, now = new Date().toISOString()) {
  const step = body?.step;
  const total = body?.steps_total;
  if (!Number.isInteger(step) || step < 1 || step > 9 || typeof body.done !== 'boolean') reject(400, 'invalid_field', 'Unknown step.');
  if (!Number.isInteger(total) || total < step || total > 9) reject(400, 'invalid_field', 'Unknown step count.');
  const { techniqueId, lessonId, classId } = readTarget(body);
  const key = repStoreKey(techniqueId, lessonId, classId);
  const existing = normalizeRep(await getJSON(store, key, { consistency: 'strong' }));
  const fresh = normalizeRep({ technique_id: techniqueId, lesson_id: lessonId, class_id: classId, goal_id: body.goal_id, state: 'planned', note: '', lesson_end: typeof body.lesson_end === 'string' ? body.lesson_end : null, at: now });
  const next = applyStepTick(existing, { step, done: body.done, steps_total: total, fresh }, now);
  if (!next) {
    if (existing) await deleteKey(store, key);
    return null;
  }
  const kept = normalizeRep(next);
  await setJSON(store, key, kept);
  return kept;
}

/** The technique came off the note: remove its planned rep (a logged rep stays). */
export async function unplanRep(store, body) {
  const { techniqueId, lessonId, classId } = readTarget(body);
  const key = repStoreKey(techniqueId, lessonId, classId);
  const existing = normalizeRep(await getJSON(store, key, { consistency: 'strong' }));
  if (existing?.state === 'planned') await deleteKey(store, key);
  return { removed: existing?.state === 'planned' };
}

/**
 * Planned reps whose lesson ended recently, for the push prompt. Empty when the teacher has turned
 * the prompt off (monitor setting `rep_push`). A rep that has been logged is no longer `planned`.
 */
export async function loadPlannedRepsForPush(store, nowMs, windowMs = 30 * 60 * 1000) {
  const { loadSettings } = await import('./walkthru-monitor.mjs');
  if (!(await loadSettings(store)).rep_push) return [];
  return (await listReps(store)).filter((r) => r.state === 'planned' && r.lesson_end && nowMs - Date.parse(r.lesson_end) >= 0 && nowMs - Date.parse(r.lesson_end) <= windowMs);
}
