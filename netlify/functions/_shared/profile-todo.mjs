/**
 * The To do panel beside the unit map on a student's own progress page. Everything here is read
 * from records that already exist; nothing is stored, and nothing is ticked by hand.
 *
 *   countdowns     every countdown block still due in the unit's published lessons, soonest first
 *   announcements  the newest text announcements on the class page
 *   practice       organiser cards left today and cards answered today
 *   back           returned pieces not opened yet, pieces opened today (ticked), redrafts asked for
 *   waiting        handed-in pieces the teacher has not returned yet (a sent redraft too)
 *   started        lessons with saved writing or a quiz go, not yet done, and their activities
 *   todo           the student's other lessons not done yet, in route order, plus any done today (ticked)
 *
 * Something finished stays on the list, ticked, for the rest of that Sydney day, then drops off.
 * Only the student's own records go out. The teacher's read of the page gets the same panel.
 */
import { read } from './question-drop.mjs';
import { handinKey, pieceId } from './lesson-work.mjs';
import { returnedRows } from './profile-feedback.mjs';
import { practiceToday } from './organiser.mjs';
import { sydneyDay } from './organiser-model.mjs';

export const TODO_LIMITS = { countdowns: 3, announcements: 3, text: 280, back: 6, waiting: 6, started: 3, activities: 12, todo: 6 };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Blocks a student can see, nested ones included. A teacher-only block hides everything inside it. */
export function* visibleBlocks(blocks) {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== 'object' || b.visibility === 'teacher_only') continue;
    yield b;
    const nested = [b.content?.blocks, ...(b.content?.columns ?? []).map((c) => c?.blocks), ...(b.content?.tabs ?? []).map((t) => t?.blocks)];
    for (const children of nested) yield* visibleBlocks(children);
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', '#39': '\'' };

/** Rich text as one plain line: tags out, entities decoded, spaces collapsed. */
export function plainText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<(br|\/p|\/li|\/h\d|\/div)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** The class page's text announcements, newest first. Images, boards and links stay on the class page. */
export function announcementsFrom(cls) {
  const out = [];
  for (const b of visibleBlocks(cls?.homepage?.announcements)) {
    const c = b.content ?? {};
    const text = b.block_type === 'rich_text' ? plainText(c.html)
      : b.block_type === 'callout' ? [plainText(c.title), plainText(c.body)].filter(Boolean).join(': ')
        : b.block_type === 'heading' ? plainText(c.text)
          : '';
    if (!text) continue;
    const at = typeof b.updated_at === 'string' ? b.updated_at : typeof b.created_at === 'string' ? b.created_at : null;
    out.push({ id: String(b.id ?? out.length), text: clip(text, TODO_LIMITS.text), at, order: out.length });
  }
  // Dated ones newest first; undated keep the class page's order after them.
  out.sort((a, b) => (a.at && b.at ? b.at.localeCompare(a.at) : a.at ? -1 : b.at ? 1 : a.order - b.order));
  return out.slice(0, TODO_LIMITS.announcements).map(({ order: _order, ...a }) => a);
}

/**
 * Every countdown still due in the unit's published lessons, soonest first: an assessment, a
 * design sprint step, anything the teacher put a countdown on. `today` is a YYYY-MM-DD day; a
 * countdown due today still counts.
 */
export function countdownsFrom(lessons, published, today) {
  const found = [];
  for (const lesson of lessons) {
    for (const b of visibleBlocks(published.get(lesson.id)?.blocks)) {
      if (b.block_type !== 'countdown') continue;
      const c = b.content ?? {};
      if (!DAY.test(c.due_date ?? '') || c.due_date < today) continue;
      const due_time = TIME.test(c.due_time ?? '') ? c.due_time : '';
      const title = typeof c.title === 'string' && c.title.trim() ? c.title.trim() : lesson.title;
      found.push({
        when: `${c.due_date}T${due_time || '23:59'}`,
        item: { title: clip(title, 120), lesson_id: lesson.id, assessment: lesson.pedagogical_mode === 'assessment', due_date: c.due_date, due_time, set_date: DAY.test(c.set_date ?? '') ? c.set_date : '' }
      });
    }
  }
  return found.sort((a, b) => a.when.localeCompare(b.when)).slice(0, TODO_LIMITS.countdowns).map((f) => f.item);
}

const answered = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * The writing activities in a lesson (its question sets) and whether each is finished: every
 * question answered, or for a set worked in a format or lens, anything written there.
 */
export function activitiesOf(lesson, saved) {
  const out = [];
  for (const b of visibleBlocks(lesson?.blocks)) {
    if (b.block_type !== 'question_set' || typeof b.id !== 'string') continue;
    const questions = (Array.isArray(b.content?.questions) ? b.content.questions : []).filter((q) => q && typeof q.id === 'string');
    const parts = saved?.[b.id] ?? {};
    const other = Object.keys(parts).some((p) => p !== 'answers');
    const done = other || (questions.length > 0 && questions.every((q) => answered(parts.answers?.[q.id])));
    const title = typeof b.content?.title === 'string' && b.content.title.trim() ? b.content.title.trim() : `Questions (${questions.length})`;
    out.push({ id: b.id, title: clip(title, 100), done });
  }
  return out;
}

/** Returned pieces still to read, ones opened today (ticked), and redrafts the teacher asked for. */
async function backFor(store, roster, student, today) {
  const rows = await returnedRows(store, roster, student);
  const out = [];
  for (const { item, seen_at } of rows) {
    const state = item.redraft === 'asked' ? 'redraft' : !seen_at ? 'new' : sydneyDay(seen_at) === today ? 'read' : null;
    if (state) out.push({ id: item.id, kind: item.kind, title: item.title, date: item.date, state });
  }
  return out.slice(0, TODO_LIMITS.back);
}

/** Handed-in pieces still with the teacher: no feedback yet, or a sent redraft. */
async function waitingFor(store, classId, student, columns) {
  const out = [];
  for (const column of columns) {
    if (column.kind !== 'assessment' || !column.piece?.lesson_id || !column.piece?.block_id) continue;
    const { lesson_id, block_id } = column.piece;
    const [handin, row] = await Promise.all([
      read(store, handinKey(lesson_id, block_id, student.id)),
      read(store, `piece_feedback/${classId}/${student.id}/${pieceId(lesson_id, block_id)}`)
    ]);
    if (!handin?.handed_in_at || handin.student_id !== student.id) continue;
    // Returned, or a redraft asked for: those show under Back to you instead.
    if (row?.redraft || row?.status === 'returned') continue;
    out.push({ title: clip(String(column.title ?? 'Your work'), 120), lesson_id, at: handin.handed_in_at });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, TODO_LIMITS.waiting);
}

/** When a lesson became done: the done record, else the quiz hand-in. Null when unknown. */
function doneAt(lessonId, done, view, studentId) {
  const record = done?.[lessonId];
  if (record?.at && !record.partial) return record.at;
  return view.quizzes.find((q) => q.lesson_id === lessonId)?.scores?.[studentId]?.submitted_at ?? null;
}

/**
 * The panel for one student. `lessons`, `rows` and `done` are the student's own map and records
 * (lessonsForStudent, mapRows, listDone); `published` maps lesson id to its published copy; `view`
 * is the class's markbook load; `now` the moment of the read.
 */
export async function todoFor(store, roster, student, { lessons, rows, done, published, view, now = new Date() }) {
  const today = sydneyDay(now);
  const titles = new Map(lessons.map((l) => [l.id, l.title]));
  const finished = new Set(rows.filter((r) => r.done).map((r) => r.id));
  const writing = new Map((view.work ?? []).map((w) => [w.lesson_id, w.students?.[student.id]?.blocks ?? null]));

  const started = [];
  for (const row of rows) {
    if (finished.has(row.id) || row.kind === 'assessment') continue;
    const saved = writing.get(row.id);
    const quiz = view.quizzes.find((q) => q.lesson_id === row.id);
    const score = quiz?.scores?.[student.id];
    const quizGo = Boolean(score) || Boolean(quiz?.started?.includes(student.id));
    if (!saved && !quizGo) continue;
    const activities = activitiesOf(published.get(row.id), saved ?? {});
    if (quiz) activities.push({ id: `quiz:${row.id}`, title: 'Quiz', done: Boolean(score?.submitted_at) });
    started.push({ lesson_id: row.id, title: titles.get(row.id) ?? row.title, activities: activities.slice(0, TODO_LIMITS.activities) });
  }
  const startedIds = new Set(started.map((s) => s.lesson_id));
  // Lessons left, plus those finished today, which stay ticked until the day ends.
  const todo = [];
  let left = 0;
  for (const r of rows) {
    if (startedIds.has(r.id)) continue;
    if (finished.has(r.id)) {
      const at = doneAt(r.id, done, view, student.id);
      if (at && sydneyDay(at) === today) todo.push({ id: r.id, title: r.title, kind: r.kind, done: true });
      continue;
    }
    left += 1;
    if (left <= TODO_LIMITS.todo) todo.push({ id: r.id, title: r.title, kind: r.kind, done: false });
  }

  const [back, waiting, practice] = await Promise.all([
    backFor(store, roster, student, today),
    waitingFor(store, roster.cls.id, student, view.markbook?.columns ?? []),
    practiceToday(store, roster, student, { now })
  ]);
  return {
    countdowns: countdownsFrom(lessons, published, today),
    announcements: announcementsFrom(roster.cls),
    practice: practice && (practice.today > 0 || practice.answered > 0) ? practice : null,
    back,
    waiting,
    started: started.slice(0, TODO_LIMITS.started),
    todo,
    more: Math.max(0, left - TODO_LIMITS.todo)
  };
}
