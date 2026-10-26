/**
 * A class markbook, for the teacher only.
 *
 *   markbook/{class}   { columns, hidden_quizzes, marks: { column: { student: mark } }, updated_at }
 *
 * Quiz columns are not stored. They are built on every load from the class's
 * quiz attempts, so a question marked later in Results shows at once.
 */
import { isSafeId } from './class-examples.mjs';
import { mapBounded } from './blobs-list.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { unitKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { classQuizScores } from './quiz.mjs';
import { read, reject } from './question-drop.mjs';
import { MARKBOOK_LIMITS, MarkbookSchema, checkColumn, checkMark, pruneMarks } from './markbook-schema.mjs';

const bookKey = (classId) => `markbook/${classId}`;
const SYDNEY_DAY = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD for the Sydney calendar day of an ISO time, the same rule as the client's calc.ts. */
export function sydneyDay(iso) {
  const parts = Object.fromEntries(SYDNEY_DAY.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function readBook(store, classId) {
  const row = await store.getWithMetadata(bookKey(classId), { type: 'json', consistency: 'strong' });
  const parsed = MarkbookSchema.safeParse(row?.data ?? {});
  if (!parsed.success) reject(500, 'corrupt', 'This markbook couldn’t be read. Nothing was changed.');
  return { book: parsed.data, etag: row?.etag ?? null };
}

/** Read, change, write only if nobody wrote in between. One retry, then a 409. */
async function changeBook(store, classId, fn) {
  for (let i = 0; i < 2; i += 1) {
    const { book, etag } = await readBook(store, classId);
    const changed = fn(book);
    changed.updated_at = new Date().toISOString();
    // Never write a record the next read would refuse.
    const parsed = MarkbookSchema.safeParse(changed);
    if (!parsed.success) reject(400, 'bad_request', 'That change can’t be saved.');
    const next = parsed.data;
    const written = await store.setJSON(bookKey(classId), next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (written?.modified !== false) return next;
  }
  reject(409, 'changed', 'The markbook changed in another tab. Reload to see it.');
}

/** Quiz lessons in the class's active units that someone on the list has handed in. */
export async function quizColumns(store, roster, book) {
  const unitIds = (roster.cls.active_unit_ids ?? []).filter(isSafeId);
  const units = await mapBounded(unitIds, 4, (unitId) => read(store, unitKey(unitId)));
  // Lessons keep the order of the class's units.
  const lessonIds = new Set();
  for (const unit of units) {
    if (!unit || isDeletedRecord(unit)) continue;
    for (const id of unit.lesson_ids ?? []) if (isSafeId(id)) lessonIds.add(id);
  }
  // Quiz cells only cover students on the list. A removed student's attempts
  // stay visible in that quiz's Results, not here.
  const ids = roster.students.map((s) => s.id);
  const found = await mapBounded([...lessonIds], 4, (lessonId) => classQuizScores(store, lessonId, roster.cls.id, ids));
  return found
    .filter((q) => q && Object.keys(q.scores).length)
    .map((q) => ({
      kind: 'quiz',
      id: `quiz:${q.lesson_id}`,
      lesson_id: q.lesson_id,
      title: q.title,
      unit_id: q.unit_id,
      date: sydneyDay(q.first_at),
      hidden: book.hidden_quizzes.includes(q.lesson_id),
      confidence: q.confidence,
      closed: q.closed,
      questions: q.questions,
      scores: q.scores,
      ...(q.started ? { started: q.started } : {}),
      ...(q.groups ? { groups: q.groups } : {})
    }));
}

export async function markbookAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body.action ?? 'load';

  if (action === 'load') {
    const { book } = await readBook(store, classId);
    return {
      markbook: book,
      students: roster.students.map(({ id, name, initials }) => ({ id, name, initials })),
      quizzes: await quizColumns(store, roster, book)
    };
  }

  if (action === 'save_column') {
    const checked = checkColumn(body.column);
    if ('problem' in checked) reject(400, 'bad_column', checked.problem);
    const column = checked.column;
    const markbook = await changeBook(store, classId, (book) => {
      const at = book.columns.findIndex((c) => c.id === column.id);
      if (at === -1) {
        if (book.columns.length >= MARKBOOK_LIMITS.columns) reject(400, 'too_many', 'This markbook is full.');
        book.columns.push(column);
      } else {
        if (book.columns[at].kind !== column.kind) reject(400, 'bad_column', 'A column can’t change kind.');
        book.columns[at] = column;
        book.marks[column.id] = pruneMarks(column, book.marks[column.id]);
      }
      return book;
    });
    return { markbook };
  }

  if (action === 'delete_column') {
    const markbook = await changeBook(store, classId, (book) => {
      if (!book.columns.some((c) => c.id === body.column_id)) reject(404, 'not_found', 'That column is gone.');
      book.columns = book.columns.filter((c) => c.id !== body.column_id);
      delete book.marks[body.column_id];
      return book;
    });
    return { markbook };
  }

  if (action === 'set_mark') {
    if (!roster.students.some((s) => s.id === body.student_id)) reject(404, 'not_found', 'That student isn’t on the class list.');
    const markbook = await changeBook(store, classId, (book) => {
      const column = book.columns.find((c) => c.id === body.column_id);
      if (!column) reject(404, 'not_found', 'That column is gone.');
      const marks = { ...(book.marks[column.id] ?? {}) };
      if (body.mark === null) delete marks[body.student_id];
      else {
        const checked = checkMark(column, body.mark);
        if ('problem' in checked) reject(400, 'bad_mark', checked.problem);
        marks[body.student_id] = checked.mark;
      }
      book.marks[column.id] = marks;
      return book;
    });
    return { markbook };
  }

  if (action === 'hide_quiz') {
    if (!isSafeId(body.lesson_id)) reject(400, 'bad_request', 'Unknown quiz.');
    const markbook = await changeBook(store, classId, (book) => {
      const already = book.hidden_quizzes.includes(body.lesson_id);
      if (body.hidden === true) {
        // Only a quiz not yet hidden is added; the schema caps the list.
        if (!already) book.hidden_quizzes = [...book.hidden_quizzes, body.lesson_id];
      } else {
        book.hidden_quizzes = book.hidden_quizzes.filter((id) => id !== body.lesson_id);
      }
      return book;
    });
    return { markbook };
  }

  if (action === 'set_took') {
    if (!roster.students.some((s) => s.id === body.student_id)) reject(404, 'not_found', 'That student isn’t on the class list.');
    const lessonIds = Array.isArray(body.lesson_ids) ? [...new Set(body.lesson_ids.filter((t) => typeof t === 'string' && t.length > 0 && t.length <= 64))].slice(0, 200) : [];
    const markbook = await changeBook(store, classId, (book) => {
      const took = { ...(book.took ?? {}) };
      if (!lessonIds.length) delete took[body.student_id];
      else took[body.student_id] = lessonIds;
      book.took = took;
      return book;
    });
    return { markbook };
  }

  if (action === 'set_focus') {
    if (!roster.students.some((s) => s.id === body.student_id)) reject(404, 'not_found', 'That student isn’t on the class list.');
    const list = (v, max) => (Array.isArray(v) ? [...new Set(v.filter((t) => typeof t === 'string' && t.length > 0 && t.length <= 120))].slice(0, max) : []);
    const pinned = list(body.pinned, 12);
    const dismissed = list(body.dismissed, 40);
    const markbook = await changeBook(store, classId, (book) => {
      const focus = { ...(book.focus ?? {}) };
      if (!pinned.length && !dismissed.length) delete focus[body.student_id];
      else focus[body.student_id] = { pinned, dismissed };
      book.focus = focus;
      return book;
    });
    return { markbook };
  }

  reject(400, 'bad_action', 'Unknown action.');
}
