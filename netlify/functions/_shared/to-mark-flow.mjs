/**
 * What the To mark flow needs beyond the queue (to-mark.mjs): a class's quiz
 * answers by question, one sprint reflection, and the codes on typed answers.
 *
 * A quiz answer or sprint reflection has no hand-in record, so its feedback
 * keeps its own frozen copy of the student's words, in the same piece_feedback
 * row handed-in writing uses. Returned work and Patterns read it from there.
 *
 *   piece_feedback/{class}/{student}/q:{lesson}:{question}   quiz written answer
 *   piece_feedback/{class}/{student}/r:{lesson}              sprint reflection
 */
import { loadRoster } from './class-claims.mjs';
import { readBook } from './markbook.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { read, reject } from './question-drop.mjs';
import { cleanTags, pieceKey, recentCodes } from './piece-feedback.mjs';
import { quizAnswersToMark } from './quiz.mjs';
import { draftLessonKey } from './teaching-blobs.mjs';
import { sprintKeys } from './sprint-keys.mjs';
import { ownerOf } from './sprint.mjs';

const PIECE_ID = /^[qr]:[A-Za-z0-9_:-]{1,200}$/;
const MAX_TEXT = 20000;
const MAX_COMMENT = 2000;

async function rosterOf(store, classId) {
  const roster = typeof classId === 'string' ? await loadRoster(store, classId) : null;
  return roster ?? reject(404, 'not_found', 'Class not found.');
}

const studentIn = (roster, id) => roster.students.find((s) => s.id === id) ?? reject(404, 'no_student', 'That student isn’t on this class list.');

/** Only text fields, in the same { part: { field: text } } shape as a hand-in. */
function cleanText(raw) {
  const text = {};
  for (const [part, fields] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    for (const [field, value] of Object.entries(fields && typeof fields === 'object' ? fields : {})) {
      if (typeof value === 'string' && value.length <= MAX_TEXT) (text[part] ??= {})[field] = value;
    }
  }
  return text;
}

async function answerContext(store, roster, studentId, piece) {
  const key = pieceKey(roster.cls.id, studentId, piece);
  const [feedback, library, recent] = await Promise.all([read(store, key), readFeedbackCodes(store), recentCodes(store, roster.cls.id, studentId, key)]);
  return {
    feedback: feedback ? { tags: feedback.tags ?? [], comment: feedback.comment ?? '', status: feedback.status } : null,
    codes: library.filter((c) => !c.hidden && c.group === 'composition'),
    recent_codes: recent.map((r) => r.codes)
  };
}

export async function toMarkAction(store, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action;
  if (!['quiz', 'sprint', 'answer_load', 'answer_save'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await rosterOf(store, body.class_id);

  if (action === 'quiz') {
    const found = await quizAnswersToMark(store, String(body.lesson_id ?? ''), roster.cls.id, roster.students);
    return found ?? reject(404, 'not_found', 'Quiz not found.');
  }

  const student = studentIn(roster, body.student_id);

  if (action === 'sprint') {
    const lessonId = String(body.lesson_id ?? '');
    const k = sprintKeys(lessonId);
    const [config, draft, { book }] = await Promise.all([read(store, k.config), read(store, draftLessonKey(lessonId)), readBook(store, roster.cls.id)]);
    if (!config || config.class_id !== roster.cls.id) reject(404, 'not_found', 'Sprint not found.');
    const sub = await read(store, k.sub(ownerOf(config.class_id, student.id), 'test'));
    if (!sub?.submitted_at) reject(409, 'not_in', 'This student hasn’t handed this in yet.');
    const p = sub.payload ?? {};
    const column = draft?.sprint?.columns?.reflection ?? null;
    return {
      title: draft?.title || 'Design sprint',
      column_id: column,
      criteria: (draft?.sprint?.reflection_criteria ?? []).map((c) => ({ id: c.id, text: c.text, self: p.self?.[c.id] ?? null, self_why: p.self_why?.[c.id] ?? '' })),
      reflection: Array.isArray(p.reflection) ? p.reflection.filter((r) => typeof r === 'string') : [],
      quote: typeof p.quote === 'string' ? p.quote : '',
      mark: column ? book.marks?.[column]?.[student.id] ?? null : null,
      ...(await answerContext(store, roster, student.id, `r:${lessonId}`))
    };
  }

  const piece = String(body.piece ?? '');
  if (!PIECE_ID.test(piece)) reject(400, 'bad_piece', 'That piece can’t be found.');
  if (action === 'answer_load') return answerContext(store, roster, student.id, piece);

  const text = cleanText(body.text);
  const library = await readFeedbackCodes(store);
  const key = pieceKey(roster.cls.id, student.id, piece);
  const kept = await read(store, key);
  const now = new Date().toISOString();
  const next = {
    kind: 'answer', title: String(body.title ?? '').slice(0, 200) || 'Answer', lesson_id: String(body.lesson_id ?? ''), column_id: null,
    text, tags: cleanTags(body.tags, text, library), comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '',
    status: 'returned', returned_at: kept?.returned_at ?? now, updated_at: now, ...(kept?.seen_at ? { seen_at: kept.seen_at } : {})
  };
  await store.setJSON(key, next);
  return { feedback: next };
}
