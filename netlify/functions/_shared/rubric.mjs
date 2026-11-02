/**
 * Saving a marking rubric (rubric-model.mjs has the shape). The rubric itself
 * sits on the feedback record for the work. Saving one also records what it says:
 * piece marks become writing ticks and passes move the student's step, both on
 * the class's deep progress (class-deep.mjs), and the rungs go in a ledger, one
 * blob per class, so reading a markbook never opens every feedback record.
 *
 *   rubric_evidence/{class}   { [student]: { [piece]: { lesson_id, title, at, skills, column_id?, attempt_id? } } }
 */
import { isSafeId } from './class-examples.mjs';
import { classDeepAction } from './class-deep.mjs';
import { read } from './question-drop.mjs';
import { cleanRubric, stepMoves, studentRubric, writingTick } from './rubric-model.mjs';
import { readStoredSkills } from './skills-continuum.mjs';
import { draftLessonKey, unitKey } from './teaching-blobs.mjs';

const ledgerKey = (classId) => `rubric_evidence/${classId}`;

export const readRubricLedger = async (store, classId) => (await read(store, ledgerKey(classId))) ?? {};

/** The rungs on one quiz answer, unless they were for an attempt the student has since replaced. */
export function answerRungs(ledger, studentId, lessonId, questionId, attemptId) {
  const entry = ledger?.[studentId]?.[`q:${lessonId}:${questionId}`];
  if (!entry || (entry.attempt_id && attemptId && entry.attempt_id !== attemptId)) return null;
  return entry.skills;
}

/** The markbook's rows: written work and viva takes. A quiz answer's rungs reach its own evidence items (quiz.mjs). */
export function ledgerRows(ledger, studentIds) {
  const rows = [];
  for (const student of studentIds) {
    for (const [piece, e] of Object.entries(ledger?.[student] ?? {})) {
      if (piece.startsWith('q:')) continue;
      rows.push({ student, piece, lesson_id: e.lesson_id, title: e.title, at: e.at, skills: e.skills, ...(e.column_id ? { column_id: e.column_id } : {}) });
    }
  }
  return rows;
}

async function writeLedger(store, classId, studentId, piece, entry) {
  const ledger = await readRubricLedger(store, classId);
  const mine = { ...(ledger[studentId] ?? {}) };
  if (!entry && !mine[piece]) return;
  if (entry) mine[piece] = entry;
  else delete mine[piece];
  await store.setJSON(ledgerKey(classId), { ...ledger, [studentId]: mine });
}

/** Takes a piece's rungs out of the markbook, when the work itself is deleted. */
export const forgetRubric = (store, classId, studentId, piece) => writeLedger(store, classId, studentId, piece, null);

const sameTick = (a, b) => {
  const key = (t) => JSON.stringify([[...t.used].sort(), [...t.missed].sort()]);
  return key(a) === key(b);
};

/**
 * Cleans a rubric and records what it says. `writing_key` names the work on the
 * deep progress record: a block, a question or a lesson. `prior` is the rubric on
 * the record before this save, so a pass taken off moves back. Returns the rubric
 * to store (a step that couldn't be passed yet stored unpassed), the deep progress
 * if it changed, and the steps blocked by order.
 */
export async function recordRubric(store, { class_id: classId, student_id: studentId, piece, lesson_id: lessonId, title, column_id: columnId, attempt_id: attemptId, writing_key: writingKey, raw, prior, today }) {
  const rubric = cleanRubric(raw);
  const at = new Date().toISOString();
  const skills = rubric?.skills ?? {};
  await writeLedger(store, classId, studentId, piece, Object.keys(skills).length
    ? { lesson_id: lessonId, title, at, skills, ...(columnId ? { column_id: columnId } : {}), ...(typeof attemptId === 'string' && attemptId ? { attempt_id: attemptId } : {}) }
    : null);

  const tick = writingTick(rubric);
  const writes = !sameTick(tick, writingTick(prior)) && isSafeId(writingKey);
  const passes = [rubric, prior].some((r) => Object.values(r?.steps ?? {}).some((s) => s.pass));
  if (!writes && !passes) return { rubric, deep: null, blocked: [] };
  const draft = isSafeId(lessonId) ? await read(store, draftLessonKey(lessonId)) : null;
  const unitId = draft?.unit_id;
  if (!isSafeId(unitId)) return { rubric, deep: null, blocked: [] };

  let deep = null;
  if (writes) deep = await classDeepAction(store, classId, { action: 'set_writing', unit_id: unitId, block_id: writingKey, student_id: studentId, ...tick, today });
  if (!passes) return { rubric, deep, blocked: [] };
  const doc = deep ?? await classDeepAction(store, classId, { action: 'load', unit_id: unitId });
  const passed = Object.fromEntries(Object.entries(doc.steps[studentId] ?? {}).map(([du, row]) => [du, row.step]));
  const { moves, blocked } = stepMoves(rubric, prior, passed);
  for (const move of moves) deep = await classDeepAction(store, classId, { action: 'set_step', unit_id: unitId, student_id: studentId, du_id: move.du, step: move.step, hint: false, today });
  if (!blocked.length) return { rubric, deep, blocked };
  const steps = { ...rubric.steps };
  for (const key of blocked) steps[key] = { ...steps[key], pass: false };
  return { rubric: { ...rubric, steps }, deep, blocked };
}

/** A returned rubric as the student reads it, with names. Pass checks and missed pieces never leave here. */
export async function rubricForStudent(store, rubric, lessonId) {
  const view = studentRubric(rubric);
  if (!view) return null;
  const continuum = Object.keys(view.skills).length ? await readStoredSkills(store).catch(() => null) : null;
  const nameOf = (ref) => {
    const [strandId, subId] = ref.split('.');
    return continuum?.strands.find((s) => s.strand === strandId)?.sub_strands.find((s) => s.id === subId)?.name ?? ref;
  };
  const draft = view.pieces_used.length && isSafeId(lessonId) ? await read(store, draftLessonKey(lessonId)) : null;
  const unit = isSafeId(draft?.unit_id) ? await read(store, unitKey(draft.unit_id)) : null;
  const pieces = (unit?.deep_understandings ?? []).flatMap((d) => d.pieces ?? []);
  return {
    skills: Object.entries(view.skills).map(([ref, rung]) => ({ ref, name: nameOf(ref), rung })),
    pieces_used: view.pieces_used.map((id) => ({ id, text: pieces.find((p) => p.id === id)?.text ?? null })).filter((p) => p.text),
    next_step: view.next_step
  };
}
