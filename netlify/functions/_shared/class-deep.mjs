/**
 * Deep understanding progress for one class and unit: the steps a teacher has
 * passed each student on (Step 1 is worked out from quiz evidence, never
 * stored), and which knowledge pieces each student used or missed in writing.
 *
 *   deep/{class}/{unit}   { steps: { [student]: { [du]: { step, at, hint? } } },
 *                           writing: { [block]: { [student]: { used, missed, at } } } }
 */
import { isSafeId } from './class-examples.mjs';
import { loadRoster } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';

const key = (classId, unitId) => `deep/${classId}/${unitId}`;
const STEPS = new Set(['2a', '2b', '3', '4']);
const DU = /^du_[a-z0-9]{4,16}$/;
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pieces = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && PIECE.test(x)))].slice(0, 24) : []);

async function loadDoc(store, classId, unitId) {
  const doc = await read(store, key(classId, unitId));
  return { steps: doc?.steps ?? {}, writing: doc?.writing ?? {} };
}

export async function classDeepAction(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const unitId = body?.unit_id;
  if (!isSafeId(unitId)) reject(400, 'bad_request', 'Pick a unit.');
  const doc = await loadDoc(store, classId, unitId);
  if (body.action === 'load') return doc;

  const student = roster.students.find((s) => s.id === body.student_id);
  if (!student) reject(400, 'bad_request', 'That student is not in this class.');
  const today = DAY.test(body.today ?? '') ? body.today : new Date().toISOString().slice(0, 10);

  if (body.action === 'set_step') {
    if (!DU.test(body.du_id ?? '')) reject(400, 'bad_request', 'Pick a deep understanding.');
    if (body.step !== null && !STEPS.has(body.step)) reject(400, 'bad_request', 'Pick a step: 2A, 2B, 3 or 4.');
    const mine = { ...(doc.steps[student.id] ?? {}) };
    if (body.step === null) delete mine[body.du_id];
    else mine[body.du_id] = { step: body.step, at: today, ...(body.hint ? { hint: true } : {}) };
    doc.steps[student.id] = mine;
  } else if (body.action === 'set_writing') {
    if (!isSafeId(body.block_id)) reject(400, 'bad_request', 'Pick a writing task.');
    const task = { ...(doc.writing[body.block_id] ?? {}) };
    task[student.id] = { used: pieces(body.used), missed: pieces(body.missed), at: today };
    doc.writing[body.block_id] = task;
  } else {
    reject(400, 'bad_request', 'Unknown action.');
  }
  await store.setJSON(key(classId, unitId), doc);
  return doc;
}
