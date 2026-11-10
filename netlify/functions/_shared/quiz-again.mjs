/**
 * Another go at one typed quiz answer. The teacher asks with a comment; the
 * student rewrites just that answer from their Returned work; it comes back to
 * To mark, and its new mark replaces the old one. The rest of the quiz stays shut.
 *
 *   quiz/{lesson}/marks/{device}~{n}     ['~again'][question] the ask, kept beside the teacher's marks
 *                                         so every reader that scores an attempt sees it:
 *                                         { asked_at, comment, from, earlier, class_id, student_id, response?, sent_at? }
 *   quiz/{lesson}/again-working/{device}/{n}/{question}   { fields, at } the student's words so far
 *   piece_feedback/{class}/{student}/q:{lesson}:{question}  carries `redraft` while asked, so the
 *                                         ask shows in Returned work and the To do panel like a redraft
 *
 * Until the new answer is sent the old mark stands. Sending clears the old
 * teacher and AI marks on that question, so it waits to be marked again.
 */
import { pieceKey } from './piece-feedback.mjs';

export const AGAIN = '~again';
/** Typed answers only: a picked option already showed the right one when it came back. */
export const AGAIN_KINDS = new Set(['short_answer', 'extended_response', 'explain_effect', 'fill_gap']);
export const AGAIN_COMMENT_MAX = 1000;
const FIELD_MAX = 20000;
const GAP_MAX = 200;

export const againWorkingKey = (lesson, device, n, question) => `quiz/${lesson}/again-working/${device}/${n}/${question}`;
export const answerPiece = (lesson, question) => `q:${lesson}:${question}`;
export const answerRowKey = (classId, studentId, lesson, question) => pieceKey(classId, studentId, answerPiece(lesson, question));

/** The ask on one question of an attempt's marks record, or null. */
export function againOf(marks, id) {
  const all = marks?.[AGAIN];
  return all && typeof all === 'object' && typeof id === 'string' && Object.hasOwn(all, id) ? all[id] : null;
}

/** The answer that counts now: the one sent back, if there is one. */
export const sentResponse = (redo) => (redo?.sent_at && redo.response && typeof redo.response === 'object' ? redo.response : null);

/** What a row tells the teacher and student about an ask. */
export function againState(redo) {
  if (!redo) return null;
  return sentResponse(redo)
    ? { state: 'sent', asked_at: redo.asked_at, sent_at: redo.sent_at, comment: redo.comment ?? '', first: redo.from ?? null }
    : { state: 'asked', asked_at: redo.asked_at, comment: redo.comment ?? '' };
}

/** An answer's words as one line, the way To mark and Returned work show them. */
export const answerWords = (r) => (r?.gaps && typeof r.gaps === 'object' ? Object.values(r.gaps).join(' · ') : typeof r?.text === 'string' ? r.text : '');

const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);

/** A gap's label: its number and the words either side, so the student knows which one it is. */
function gapPrompts(parts) {
  const prompts = {};
  let n = 0;
  (Array.isArray(parts) ? parts : []).forEach((part, i) => {
    if (part?.type !== 'gap') return;
    n += 1;
    const before = parts[i - 1]?.type === 'text' ? words(parts[i - 1].text).slice(-6).join(' ') : '';
    const after = parts[i + 1]?.type === 'text' ? words(parts[i + 1].text).slice(0, 4).join(' ') : '';
    prompts[part.id] = `Gap ${n}: ${before ? `…${before} ` : ''}_____${after ? ` ${after}…` : ''}`;
  });
  return prompts;
}

/**
 * The editor's fields for this answer, in the hand-in { part: { field: words } }
 * shape the redraft editor already takes, and a prompt for each field.
 */
export function againFields(entry, response) {
  const { question, key } = entry;
  if (key.kind === 'fill_gap') {
    const ids = Object.keys(key.answer?.gaps ?? {});
    const given = response?.gaps && typeof response.gaps === 'object' ? response.gaps : {};
    const all = gapPrompts(question.parts);
    const prompts = Object.fromEntries(ids.map((id, i) => [id, all[id] ?? `Gap ${i + 1}`]));
    if (question.prompt && ids[0]) prompts[ids[0]] = `${question.prompt}\n${prompts[ids[0]]}`;
    return { text: { answer: Object.fromEntries(ids.map((id) => [id, typeof given[id] === 'string' ? given[id] : ''])) }, prompts };
  }
  return { text: { answer: { text: typeof response?.text === 'string' ? response.text : '' } }, prompts: { text: [question.quote, question.prompt].filter(Boolean).join('\n') || 'Your answer' } };
}

/** Is this one of the fields the student may write? */
export function againFieldOk(entry, part, field) {
  if (part !== 'answer') return false;
  return entry.key.kind === 'fill_gap' ? Object.hasOwn(entry.key.answer?.gaps ?? {}, field) : field === 'text';
}

export const fieldLimit = (entry) => (entry.key.kind === 'fill_gap' ? GAP_MAX : FIELD_MAX);

/** The new response from the words kept so far, over the answer being replaced. */
export function againResponse(entry, from, fields) {
  const mine = fields && typeof fields === 'object' ? fields : {};
  if (entry.key.kind === 'fill_gap') {
    const was = from?.gaps && typeof from.gaps === 'object' ? from.gaps : {};
    const gaps = {};
    for (const id of Object.keys(entry.key.answer?.gaps ?? {})) {
      const v = typeof mine[id] === 'string' ? mine[id] : was[id];
      if (typeof v === 'string') gaps[id] = v.slice(0, GAP_MAX);
    }
    return { gaps };
  }
  const text = typeof mine.text === 'string' ? mine.text : typeof from?.text === 'string' ? from.text : '';
  return { text: text.slice(0, FIELD_MAX) };
}

/**
 * Marks the student's answer row as asked again. The row's comment is the ask's
 * comment, and its words are the answer being replaced.
 */
export async function askOnPiece(store, { classId, studentId, lessonId, questionId, attemptId, title, comment, response, now }) {
  const key = pieceKey(classId, studentId, answerPiece(lessonId, questionId));
  const kept = (await store.get(key, { type: 'json', consistency: 'strong' })) ?? {};
  const { seen_at: _seen, sent: _sent, ...rest } = kept;
  await store.setJSON(key, {
    tags: [],
    ...rest,
    kind: 'answer', title: title || kept.title || 'Quiz answer', lesson_id: lessonId, column_id: null,
    text: { answer: { text: answerWords(response) } },
    comment,
    status: 'returned', returned_at: now, updated_at: now,
    redraft: { scope: 'whole', asked_at: now, attempt_id: attemptId }
  });
}

/** Takes the ask off the answer row; the row stays as it came back. */
export async function unaskOnPiece(store, { classId, studentId, lessonId, questionId }) {
  const key = pieceKey(classId, studentId, answerPiece(lessonId, questionId));
  const kept = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!kept?.redraft) return;
  const { redraft: _asked, ...rest } = kept;
  await store.setJSON(key, { ...rest, updated_at: new Date().toISOString() });
}

/** The new answer is with the teacher: Returned work says so, and the To do panel drops the ask. */
export async function sentOnPiece(store, { classId, studentId, lessonId, questionId, now }) {
  const key = pieceKey(classId, studentId, answerPiece(lessonId, questionId));
  const kept = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!kept) return;
  const { redraft: _asked, ...rest } = kept;
  await store.setJSON(key, { ...rest, sent: true, draft: (kept.draft ?? 1) + 1, sent_at: now, updated_at: now });
}
