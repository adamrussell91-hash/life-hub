/**
 * The To do panel beside the unit map on a student's own progress page. Everything here is read
 * from records that already exist; nothing is stored, and nothing is ticked by hand.
 *
 *   countdown      the next assessment's countdown block (the earliest still due) in the unit's published lessons
 *   announcements  the newest text announcements on the class page
 *   back           returned pieces not opened yet, and pieces the teacher asked to redraft
 *   waiting        handed-in pieces the teacher has not returned yet (a sent redraft too)
 *   started        lessons with saved writing or a quiz go, not yet done, and their unfinished activities
 *   todo           the rest of the student's lessons not done yet, in route order
 *
 * Only the student's own records go out. Organiser practice for today comes with the organiser load.
 */
import { read } from './question-drop.mjs';
import { handinKey, pieceId } from './lesson-work.mjs';
import { returnedFor } from './profile-feedback.mjs';

export const TODO_LIMITS = { announcements: 3, text: 280, back: 6, waiting: 6, started: 3, activities: 12, todo: 6 };
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
 * The countdown to the soonest assessment still due, from the countdown blocks in the unit's
 * published lessons. `today` is a YYYY-MM-DD day; a task due today still counts.
 */
export function countdownFrom(lessons, published, today) {
  let best = null;
  for (const lesson of lessons) {
    for (const b of visibleBlocks(published.get(lesson.id)?.blocks)) {
      if (b.block_type !== 'countdown') continue;
      const c = b.content ?? {};
      if (!DAY.test(c.due_date ?? '') || c.due_date < today) continue;
      const due_time = TIME.test(c.due_time ?? '') ? c.due_time : '';
      const when = `${c.due_date}T${due_time || '23:59'}`;
      if (best && best.when <= when) continue;
      const title = typeof c.title === 'string' && c.title.trim() ? c.title.trim() : lesson.title;
      best = { when, item: { title: clip(title, 120), lesson_id: lesson.id, due_date: c.due_date, due_time, set_date: DAY.test(c.set_date ?? '') ? c.set_date : '' } };
    }
  }
  return best?.item ?? null;
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

/** Returned pieces still to read, and redrafts the teacher asked for. */
async function backFor(store, roster, student) {
  const { items } = await returnedFor(store, roster, student);
  return items
    .filter((i) => i.redraft === 'asked' || i.new)
    .map((i) => ({ id: i.id, kind: i.kind, title: i.title, date: i.date, state: i.redraft === 'asked' ? 'redraft' : 'new' }))
    .slice(0, TODO_LIMITS.back);
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

/**
 * The panel for one student. `lessons` and `rows` are the student's own map (lessonsForStudent,
 * mapRows); `published` maps lesson id to its published copy; `view` is the class's markbook load.
 */
export async function todoFor(store, roster, student, { lessons, rows, published, view, today }) {
  const titles = new Map(lessons.map((l) => [l.id, l.title]));
  const done = new Set(rows.filter((r) => r.done).map((r) => r.id));
  const writing = new Map((view.work ?? []).map((w) => [w.lesson_id, w.students?.[student.id]?.blocks ?? null]));

  const started = [];
  for (const row of rows) {
    if (done.has(row.id) || row.kind === 'assessment') continue;
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
  const left = rows.filter((r) => !done.has(r.id) && !startedIds.has(r.id));

  const [back, waiting] = await Promise.all([
    backFor(store, roster, student),
    waitingFor(store, roster.cls.id, student, view.markbook?.columns ?? [])
  ]);
  return {
    countdown: countdownFrom(lessons, published, today),
    announcements: announcementsFrom(roster.cls),
    back,
    waiting,
    started: started.slice(0, TODO_LIMITS.started),
    todo: left.slice(0, TODO_LIMITS.todo).map((r) => ({ id: r.id, title: r.title, kind: r.kind })),
    more: Math.max(0, left.length - TODO_LIMITS.todo)
  };
}
