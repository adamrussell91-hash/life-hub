/**
 * The teacher's read of one student's habits for the Over time tab: organiser practice, redrafts
 * handed in, and personal next steps set and acted on. Reads only; never writes, never marks seen.
 *
 * A personal next step is the `next_step` on a returned rubric (rubric-model.mjs): on a written
 * piece (piece_feedback, and each frozen draft in work_drafts) or on a viva take. It counts as
 * acted on when the student handed in work (any written piece, redraft or viva take) after it came back.
 */
import { read } from './question-drop.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { piecePrefix } from './piece-feedback.mjs';
import { draftKey, handinKey } from './lesson-work.mjs';
import { organiserHabits } from './organiser.mjs';

const WRITTEN = /^w:([^:]+):(.+)$/;
const VIVA = /^v:(.+)$/;
const stepText = (rubric) => (typeof rubric?.next_step?.text === 'string' ? rubric.next_step.text.trim() : '');
const stamp = (iso) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? iso : null);

export async function redraftsAndSteps(store, classId, studentId) {
  const prefix = piecePrefix(classId, studentId);
  const keys = await listBlobKeys(store, prefix);
  const steps = new Map(); // `${piece}|${text}` → earliest returned_at
  const handedIn = [];
  let redrafts = 0;
  const addStep = (piece, rubric, at) => {
    const text = stepText(rubric);
    const when = stamp(at);
    if (!text || !when) return;
    const key = `${piece}|${text}`;
    if (!steps.has(key) || when < steps.get(key)) steps.set(key, when);
  };
  const vivaLessons = new Set();
  await mapBounded(keys, 8, async (key) => {
    const piece = key.slice(prefix.length);
    const row = await read(store, key);
    if (!row) return;
    const written = WRITTEN.exec(piece);
    if (written) {
      const [, lessonId, blockId] = written;
      const n = Number.isInteger(row.draft) && row.draft > 1 ? row.draft : 1;
      redrafts += n - 1;
      if (row.status === 'returned') addStep(piece, row.rubric, row.returned_at);
      const handin = await read(store, handinKey(lessonId, blockId, studentId));
      if (stamp(handin?.handed_in_at)) handedIn.push(handin.handed_in_at);
      for (let d = 1; d < n; d += 1) {
        const frozen = await read(store, draftKey(lessonId, blockId, studentId, d));
        if (!frozen) continue;
        addStep(piece, frozen.rubric, frozen.returned_at);
        if (stamp(frozen.handed_in_at)) handedIn.push(frozen.handed_in_at);
      }
      return;
    }
    const viva = VIVA.exec(piece);
    if (viva) vivaLessons.add(viva[1]);
  });
  for (const lessonId of vivaLessons) {
    const takes = await mapBounded(await listBlobKeys(store, `voice_submissions/${lessonId}/`), 8, (k) => read(store, k));
    for (const t of takes) {
      if (t?.student_id !== studentId) continue;
      if (stamp(t.submitted_at)) handedIn.push(t.submitted_at);
      if (t.status === 'returned') addStep(`v:${lessonId}:${t.id ?? ''}`, t.rubric, t.returned_at ?? t.updated_at);
    }
  }
  const latest = handedIn.sort().at(-1) ?? null;
  const set = steps.size;
  const acted = [...steps.values()].filter((at) => latest && latest > at).length;
  return { redrafts, steps: { set, acted } };
}

/** The `habits` payload for one student in one class. */
export async function teacherHabits(store, classId, studentId, { now = new Date() } = {}) {
  const [organiser, rest] = await Promise.all([organiserHabits(store, classId, studentId, { now }), redraftsAndSteps(store, classId, studentId)]);
  return { organiser, ...rest };
}
