/**
 * A class markbook, for the teacher only.
 *
 *   markbook/{class}   { columns, hidden_quizzes, marks: { column: { student: mark } }, updated_at }
 *
 * Quiz columns are not stored. They are built on every load from the class's
 * quiz attempts, so a question marked later in Results shows at once. A go not
 * handed in shows as it stands from the answers its page saved. Work columns
 * are built the same way from what students typed (lesson-work.mjs).
 */
import { isSafeId } from './class-examples.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { SCHEDULED_LESSON_PREFIX, unitKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { classQuizScores } from './quiz.mjs';
import { classWork } from './lesson-work.mjs';
import { listClassDone } from './profile-done.mjs';
import { read, reject } from './question-drop.mjs';
import { markWalkthruDirty } from './walkthru-dirty.mjs';
import { progressFor, studentPieces } from './profile-feedback.mjs';
import { classPatterns } from './progress-patterns.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { MARKBOOK_LIMITS, MarkbookSchema, checkColumn, checkMark, pruneMarks } from './markbook-schema.mjs';

const bookKey = (classId) => `markbook/${classId}`;
const SYDNEY_DAY = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD for the Sydney calendar day of an ISO time, the same rule as the client's calc.ts. */
export function sydneyDay(iso) {
  const parts = Object.fromEntries(SYDNEY_DAY.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function readBook(store, classId) {
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

/** This class's live calendar rows. */
async function scheduledRows(store, classId) {
  const rowKeys = (await listBlobKeys(store, SCHEDULED_LESSON_PREFIX)).filter((key) => !key.endsWith('/_index'));
  const rows = await mapBounded(rowKeys, 8, (key) => read(store, key));
  return rows.filter((row) => row && !isDeletedRecord(row) && row.class_id === classId);
}

/**
 * Every lesson a student can answer for this class (see classesForLesson):
 * the active units, the current unit, and lessons on the class calendar from any unit.
 */
export async function classLessonIds(store, roster) {
  const cls = roster.cls;
  const unitIds = [...new Set([...(cls.active_unit_ids ?? []), ...(cls.current_unit_id ? [cls.current_unit_id] : [])])].filter(isSafeId);
  const [units, rows] = await Promise.all([mapBounded(unitIds, 4, (unitId) => read(store, unitKey(unitId))), scheduledRows(store, cls.id)]);
  // Lessons keep the order of the class's units; calendar-only lessons follow.
  const lessonIds = new Set();
  for (const unit of units) {
    if (!unit || isDeletedRecord(unit)) continue;
    for (const id of unit.lesson_ids ?? []) if (isSafeId(id)) lessonIds.add(id);
  }
  for (const row of rows) if (isSafeId(row.lesson_id)) lessonIds.add(row.lesson_id);
  return [...lessonIds];
}

/** Each lesson's written work, saved as students on the list typed it. */
export async function workColumns(store, roster, lessonIds) {
  const ids = roster.students.map((s) => s.id);
  const found = await mapBounded(lessonIds, 4, (lessonId) => classWork(store, lessonId, roster.cls.id, ids));
  return found.filter(Boolean).map((w) => ({
    kind: 'work',
    id: `work:${w.lesson_id}`,
    lesson_id: w.lesson_id,
    title: w.title,
    date: sydneyDay(w.first_at),
    blocks: w.blocks,
    students: w.students
  }));
}

/** Quiz lessons that someone on the list has handed in, or saved answers on. */
export async function quizColumns(store, roster, book, lessonIds) {
  // Quiz cells only cover students on the list. A removed student's attempts
  // stay visible in that quiz's Results, not here.
  const ids = roster.students.map((s) => s.id);
  const found = await mapBounded(lessonIds, 4, (lessonId) => classQuizScores(store, lessonId, roster.cls.id, ids));
  return found
    // A quiz shows once someone handed in, or has answers saved on a go they haven't handed in.
    .filter((q) => q && (Object.keys(q.scores).length || q.saved))
    .map((q) => ({
      kind: 'quiz',
      id: `quiz:${q.lesson_id}`,
      lesson_id: q.lesson_id,
      title: q.title,
      unit_id: q.unit_id,
      date: sydneyDay(q.first_at),
      hidden: book.hidden_quizzes.includes(q.lesson_id),
      confidence: q.confidence,
      timed: q.timed,
      closed: q.closed,
      questions: q.questions,
      scores: q.scores,
      ...(q.started ? { started: q.started } : {}),
      ...(q.saved ? { saved: q.saved } : {}),
      ...(q.sets ? { sets: q.sets } : {}),
      ...(q.groups ? { groups: q.groups } : {})
    }));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The teacher's Sydney day, sent by the browser; the server's when missing or malformed. */
const dayOf = (body) => (typeof body.today === 'string' && DAY.test(body.today) ? body.today : sydneyDay(new Date().toISOString()));
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const eventBase = (group, day) => ({ group: group.id, name: group.name, tags: group.tags, day });

/** Members to add: on the list, once each. */
function cleanMembers(roster, list) {
  const onList = new Set(roster.students.map((s) => s.id));
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m.student !== 'string' || seen.has(m.student)) continue;
    if (!onList.has(m.student)) reject(404, 'not_found', 'That student isn’t on the class list.');
    seen.add(m.student);
    out.push({ student: m.student, why: text(m.why, 200) });
  }
  return out;
}

/** Adds or rejoins members, writing a joined event for each one that changed. */
function joinMembers(book, group, members, day) {
  for (const m of members) {
    const at = group.members.findIndex((x) => x.student === m.student);
    if (at >= 0 && group.members[at].left === null) continue;
    const member = { student: m.student, joined: day, left: null, why_joined: m.why, why_left: null };
    if (at >= 0) group.members[at] = member;
    else group.members.push(member);
    group.retired = null;
    book.history.push({ id: `joined:${group.id}:${m.student}:${day}`, kind: 'joined', ...eventBase(group, day), student: m.student, why: m.why });
  }
}

/** Marks a member as left; retires the group when nobody is left. Ignores one who already left. */
function leaveMember(book, group, student, day, why) {
  const member = group.members.find((m) => m.student === student);
  if (!member || member.left !== null) return;
  member.left = day;
  member.why_left = why;
  book.history.push({ id: `left:${group.id}:${student}:${day}`, kind: 'left', ...eventBase(group, day), student, why });
  if (group.retired === null && group.members.every((m) => m.left !== null)) {
    group.retired = group.members.reduce((top, m) => (m.left > top ? m.left : top), day);
    book.history.push({ id: `retired:${group.id}:${group.retired}`, kind: 'retired', ...eventBase(group, group.retired) });
  }
}

const findGroup = (book, id) => book.groups.find((g) => g.id === id) ?? reject(404, 'not_found', 'That group is gone.');

/** Actions that change what the pattern monitor reads (marks, columns, shown quizzes). */
const EVIDENCE_ACTIONS = new Set(['set_mark', 'save_column', 'delete_column', 'hide_quiz']);

export async function markbookAction(store, classId, body) {
  const result = await markbookActionInner(store, classId, body);
  if (EVIDENCE_ACTIONS.has(body?.action)) await markWalkthruDirty(store);
  return result;
}

async function markbookActionInner(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body.action ?? 'load';

  if (action === 'load') {
    const [{ book }, lessonIds] = await Promise.all([readBook(store, classId), classLessonIds(store, roster)]);
    const [quizzes, work] = await Promise.all([quizColumns(store, roster, book, lessonIds), workColumns(store, roster, lessonIds)]);
    return {
      markbook: book,
      students: roster.students.map(({ id, name, initials }) => ({ id, name, initials })),
      quizzes,
      work,
      // Which lessons each student has marked done, for the gradebook. The student profile skips it.
      ...(body.skip_done ? {} : { done: await listClassDone(store, classId, roster.students.map((s) => s.id)) })
    };
  }

  if (action === 'analysis') {
    const student = roster.students.find((s) => s.id === body.student_id) ?? reject(404, 'no_student', 'That student isn’t on this class list.');
    const library = await readFeedbackCodes(store);
    const progress = await progressFor(store, roster, student);
    const everyone = await mapBounded(roster.students, 4, async (s) => ({ id: s.id, pieces: await studentPieces(store, classId, s.id) }));
    return { student: progress, class_patterns: classPatterns(everyone, library).map((g) => ({ ...g, names: g.students.map((id) => roster.students.find((s) => s.id === id)?.name ?? id) })) };
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

  if (action === 'save_group') {
    const g = body.group ?? {};
    const members = cleanMembers(roster, g.members);
    const tags = Array.isArray(g.tags) ? [...new Set(g.tags.filter((t) => typeof t === 'string' && t.length && t.length <= 120))].slice(0, 8) : [];
    if (!members.length || !tags.length || !text(g.name, 120)) reject(400, 'bad_request', 'A group needs a name, a tag and at least one student.');
    const day = dayOf(body);
    const markbook = await changeBook(store, classId, (book) => {
      if (book.groups.some((x) => x.id === g.id)) reject(409, 'exists', 'That group is already saved.');
      if (book.groups.length >= MARKBOOK_LIMITS.groups) reject(400, 'too_many', 'This markbook has as many groups as it can hold.');
      const group = { id: g.id, name: text(g.name, 120), tags, started: day, retired: null, members: [] };
      book.groups.push(group);
      joinMembers(book, group, members, day);
      return book;
    });
    return { markbook };
  }

  if (action === 'add_members') {
    const members = cleanMembers(roster, body.members);
    const day = dayOf(body);
    const markbook = await changeBook(store, classId, (book) => {
      joinMembers(book, findGroup(book, body.group_id), members, day);
      return book;
    });
    return { markbook };
  }

  if (action === 'remove_member') {
    const day = dayOf(body);
    const markbook = await changeBook(store, classId, (book) => {
      leaveMember(book, findGroup(book, body.group_id), body.student, day, 'Removed by teacher');
      return book;
    });
    return { markbook };
  }

  if (action === 'rename_group') {
    const name = text(body.name, 120);
    if (!name) reject(400, 'bad_request', 'Give the group a name.');
    const markbook = await changeBook(store, classId, (book) => {
      findGroup(book, body.group_id).name = name;
      return book;
    });
    return { markbook };
  }

  if (action === 'record_history') {
    const events = (Array.isArray(body.events) ? body.events : []).slice(0, 500);
    const leaves = (Array.isArray(body.leaves) ? body.leaves : []).slice(0, 200);
    const markbook = await changeBook(store, classId, (book) => {
      const have = new Set(book.history.map((e) => e.id));
      for (const e of events) {
        if (!e || typeof e.id !== 'string' || have.has(e.id) || !['received', 'result'].includes(e.kind)) continue;
        if (!book.groups.some((g) => g.id === e.group)) continue;
        book.history.push(e);
        have.add(e.id);
      }
      for (const l of leaves) {
        const group = book.groups.find((g) => g.id === l?.group_id);
        if (group && typeof l.day === 'string' && DAY.test(l.day)) leaveMember(book, group, l.student, l.day, text(l.why, 200));
      }
      // Oldest first, so the record reads in order.
      book.history.sort((a, b) => a.day.localeCompare(b.day));
      return book;
    });
    return { markbook };
  }

  reject(400, 'bad_action', 'Unknown action.');
}
