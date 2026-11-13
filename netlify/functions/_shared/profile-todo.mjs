/**
 * The To do panel beside the unit map on a student's own progress page. Everything here is read
 * from records that already exist; nothing is stored, and nothing is ticked by hand.
 *
 *   viva_practice  links to Viva Voce Practice 1 and 2 while an assessment counts down (vivaPracticeFrom)
 *   countdowns     every countdown block still due in the unit's published lessons, and the unit's
 *                  assessment lessons planned on the calendar for this class (published or not), soonest first
 *   announcements  the newest text announcements on the class page
 *   practice       organiser cards left today and cards answered today
 *   waiting        handed-in pieces the teacher has not returned yet (a sent redraft too)
 *   boxes          four prioritised boxes (boxesFor): Do now, Do next, Extra practice, Challenge. They
 *                  hold the lessons left (started ones with their activities), lessons done today
 *                  (ticked), and returned feedback to read or redo
 *   more           lessons left that did not fit in a box; the map shows them all
 *
 * Something finished stays on the list, ticked, for the rest of that Sydney day, then drops off.
 * Only the student's own records go out. The teacher's read of the page gets the same panel.
 */
import { read } from './question-drop.mjs';
import { handinKey, pieceId } from './lesson-work.mjs';
import { returnedRows } from './profile-feedback.mjs';
import { practiceToday } from './organiser.mjs';
import { sydneyDay } from './organiser-model.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { SCHEDULED_LESSON_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';

export const TODO_LIMITS = { countdowns: 3, announcements: 3, text: 280, back: 6, waiting: 6, activities: 12, box: 12 };
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
 * Every countdown still due, soonest first: an assessment, a design sprint step, anything the
 * teacher put a countdown on in a published lesson. `planned` adds the unit's assessment lessons
 * that sit on the class calendar, published or not ({ lesson_id, title, published, date, start_time }):
 * the date shows before the task page is ready. A lesson with its own countdown block keeps only
 * the block's. `today` is a YYYY-MM-DD day; a countdown due today still counts. The soonest
 * assessment always stays in the list, so the progress page can show it at the top.
 */
export function countdownsFrom(lessons, published, today, planned = []) {
  const found = [];
  const withBlock = new Set();
  for (const lesson of lessons) {
    for (const b of visibleBlocks(published.get(lesson.id)?.blocks)) {
      if (b.block_type !== 'countdown') continue;
      const c = b.content ?? {};
      if (!DAY.test(c.due_date ?? '') || c.due_date < today) continue;
      const due_time = TIME.test(c.due_time ?? '') ? c.due_time : '';
      const title = typeof c.title === 'string' && c.title.trim() ? c.title.trim() : lesson.title;
      withBlock.add(lesson.id);
      found.push({
        when: `${c.due_date}T${due_time || '23:59'}`,
        item: { title: clip(title, 120), lesson_id: lesson.id, assessment: lesson.pedagogical_mode === 'assessment', due_date: c.due_date, due_time, set_date: DAY.test(c.set_date ?? '') ? c.set_date : '', published: true }
      });
    }
  }
  // One entry per planned lesson: its soonest calendar day from today on.
  const soonest = new Map();
  for (const p of planned) {
    if (withBlock.has(p.lesson_id) || !DAY.test(p.date ?? '') || p.date < today) continue;
    const due_time = TIME.test(p.start_time ?? '') ? p.start_time : '';
    const when = `${p.date}T${due_time || '23:59'}`;
    const was = soonest.get(p.lesson_id);
    if (was && was.when <= when) continue;
    soonest.set(p.lesson_id, { when, item: { title: clip(String(p.title ?? 'Assessment task'), 120), lesson_id: p.lesson_id, assessment: true, due_date: p.date, due_time, set_date: '', published: p.published === true } });
  }
  const all = [...found, ...soonest.values()].sort((a, b) => a.when.localeCompare(b.when));
  const kept = all.slice(0, TODO_LIMITS.countdowns);
  const firstAssessment = all.find((f) => f.item.assessment);
  if (firstAssessment && !kept.includes(firstAssessment)) kept[kept.length - 1] = firstAssessment;
  return kept.map((f) => f.item);
}

/**
 * The calendar days of the unit's assessment lessons for this class: not deleted, not skipped.
 * `assessments` are { id, title, published } only; nothing else of an unpublished lesson is read.
 */
export async function plannedAssessments(store, classId, assessments) {
  if (!assessments?.length) return [];
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const rows = await mapBounded(await listBlobKeys(store, SCHEDULED_LESSON_PREFIX), 8, (key) => read(store, key));
  return rows
    .filter((r) => r && !isDeletedRecord(r) && r.class_id === classId && byId.has(r.lesson_id) && r.delivery_status !== 'skipped' && typeof r.date === 'string')
    .map((r) => ({ lesson_id: r.lesson_id, title: byId.get(r.lesson_id).title, published: byId.get(r.lesson_id).published, date: r.date, start_time: typeof r.start_time === 'string' ? r.start_time : '' }));
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
  const pieces = columns.filter((column) => column.kind === 'assessment' && column.piece?.lesson_id && column.piece?.block_id);
  const found = await Promise.all(pieces.map(async (column) => {
    const { lesson_id, block_id } = column.piece;
    const [handin, row] = await Promise.all([
      read(store, handinKey(lesson_id, block_id, student.id)),
      read(store, `piece_feedback/${classId}/${student.id}/${pieceId(lesson_id, block_id)}`)
    ]);
    if (!handin?.handed_in_at || handin.student_id !== student.id) return null;
    // Returned, or a redraft asked for: those show in the Do now box instead.
    if (row?.redraft || row?.status === 'returned') return null;
    return { title: clip(String(column.title ?? 'Your work'), 120), lesson_id, at: handin.handed_in_at };
  }));
  const out = found.filter(Boolean);
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, TODO_LIMITS.waiting);
}

/** When a lesson became done: the done record, else the quiz hand-in. Null when unknown. */
function doneAt(lessonId, done, view, studentId) {
  const record = done?.[lessonId];
  if (record?.at && !record.partial) return record.at;
  return view.quizzes.find((q) => q.lesson_id === lessonId)?.scores?.[studentId]?.submitted_at ?? null;
}

const WEEKDAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' });
const SHORT_DATE = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "today", "tomorrow", "on Fri" within the week, else "on 20 Nov". Both are YYYY-MM-DD days. */
export function dayPhrase(day, today) {
  const at = new Date(`${day}T00:00:00Z`);
  const days = Math.round((at.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days < 7 ? `on ${WEEKDAY.format(at)}` : `on ${SHORT_DATE.format(at)}`;
}

/**
 * The core lesson a support lesson branches from: the one the teacher picked (branch_from, else the
 * side stop on the unit map), else the core lesson before it in unit order. Matches the map's hangSides.
 */
export function anchorOf(unit, lessons, lesson) {
  const core = new Set(lessons.filter((l) => (l.route_role ?? 'core') === 'core').map((l) => l.id));
  const map = (unit?.blocks ?? []).find((b) => b?.block_type === 'curriculum_lines' && b.content?.version === 2);
  const stop = map?.content.rail_stops?.find((s) => s?.lesson_id === lesson.id && typeof s.after_lesson_id === 'string');
  for (const picked of [lesson.branch_from, stop?.after_lesson_id]) if (typeof picked === 'string' && core.has(picked)) return picked;
  let last = null;
  for (const l of lessons) {
    if (l.id === lesson.id) return last;
    if (core.has(l.id)) last = l.id;
  }
  return null;
}

export const BOX_KEYS = ['now', 'next', 'extra', 'challenge'];

/**
 * The four boxes, in order, each kept only when it has something in it.
 *
 *   now        redrafts asked for, feedback to read, started lessons, core lessons before the next
 *              assessment (and that assessment), support lessons once the lesson they branch from is done
 *              (no assessment coming: the first core lesson not done instead)
 *   next       the other core lessons, support lessons still waiting on their lesson
 *   extra      optional lessons
 *   challenge  extension lessons
 *
 * Within a box, started lessons come first. `rows` are the map's rows in unit order; `lessons` the
 * student's lessons (route_role, branch_from); `started` maps lesson id to its activities;
 * `doneToday` the lessons finished today (kept, ticked); `back` the returned pieces (backFor);
 * `countdowns` from countdownsFrom. A box keeps TODO_LIMITS.box rows not done; the rest count in `more`.
 */
export function boxesFor({ unit, lessons, rows, started = new Map(), doneToday = new Set(), back = [], countdowns = [], today }) {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const titles = new Map(rows.map((r) => [r.id, r.title]));
  const finished = new Set(rows.filter((r) => r.done).map((r) => r.id));
  const order = new Map((unit?.lesson_ids ?? lessons.map((l) => l.id)).map((id, i) => [id, i]));
  const test = countdowns.find((c) => c.assessment);
  const cutoff = test && order.has(test.lesson_id) ? order.get(test.lesson_id) : -1;
  const before = test ? `Before the ${test.title} ${dayPhrase(test.due_date, today)}`.trim() : '';
  // rank: 0 started, 1 redraft, 2 feedback, 3 core / assessment, 4 support
  const boxes = { now: [], next: [], extra: [], challenge: [] };
  const put = (key, rank, item) => boxes[key].push({ rank, at: boxes[key].length, item });

  for (const b of back) {
    const state = b.state === 'redraft' ? 'redraft' : b.state === 'read' ? 'read' : 'new';
    const reason = state === 'redraft' ? 'Your teacher asked for another go' : state === 'read' ? 'Feedback read today' : 'Feedback is back. Have a read';
    put('now', state === 'redraft' ? 1 : 2, { id: b.id, title: b.title, kind: 'feedback', done: state === 'read', reason, feedback: { state, kind: b.kind, date: b.date } });
  }

  let firstNext = true;
  for (const r of rows) {
    const done = finished.has(r.id);
    if (done && !doneToday.has(r.id)) continue;
    const base = { id: r.id, title: r.title, kind: r.kind, role: r.role, done };
    const going = !done && started.get(r.id);
    if (r.role === 'optional' || r.role === 'extension') {
      const key = r.role === 'optional' ? 'extra' : 'challenge';
      put(key, going ? 0 : 3, { ...base, reason: going ? 'Pick up where you left off' : r.role === 'optional' ? 'Optional' : 'Challenge lesson', ...(going ? { started: { activities: going } } : {}) });
      continue;
    }
    if (going) {
      put('now', 0, { ...base, reason: 'Pick up where you left off', started: { activities: going } });
      continue;
    }
    if (r.role === 'support') {
      const anchor = anchorOf(unit, lessons, byId.get(r.id) ?? r);
      if (anchor && titles.has(anchor) && !finished.has(anchor)) put('next', 4, { ...base, reason: `After ${titles.get(anchor)}` });
      else put('now', 4, { ...base, reason: 'Your teacher picked this for you' });
      continue;
    }
    const at = order.get(r.id) ?? Infinity;
    if (cutoff >= 0 && at < cutoff) put('now', 3, { ...base, reason: before });
    else if (test && r.id === test.lesson_id) put('now', 3, { ...base, reason: `Due ${dayPhrase(test.due_date, today)}` });
    else if (!test && firstNext) {
      // No assessment coming: the next core lesson is Do now, so Do now is never empty while core
      // lessons remain. One done today before it stays ticked there too.
      put('now', 3, { ...base, reason: 'Next in the unit' });
      if (!done) firstNext = false;
    } else {
      put('next', 3, { ...base, reason: !done && firstNext ? 'Next in the unit' : 'Later in the unit' });
      if (!done) firstNext = false;
    }
  }

  let more = 0;
  const out = [];
  for (const key of BOX_KEYS) {
    const sorted = boxes[key].sort((a, b) => a.rank - b.rank || a.at - b.at).map((e) => e.item);
    let left = 0;
    const items = sorted.filter((item) => {
      if (item.done || item.kind === 'feedback') return true;
      left += 1;
      if (left <= TODO_LIMITS.box) return true;
      more += 1;
      return false;
    });
    if (items.length) out.push({ key, items });
  }
  return { boxes: out, more };
}

const VIVA_PRACTICE = /^\s*viva\s+voce\s+practice\s*([12])\s*$/i;

/**
 * "Do a practice Viva Voce": while an assessment is counting down, the unit's published lessons
 * titled Viva Voce Practice 1 (prepared: plan out a response) and Viva Voce Practice 2
 * (spontaneous: like on the day). Null when there is no assessment coming or neither lesson is there.
 */
export function vivaPracticeFrom(lessons, countdowns) {
  if (!countdowns.some((c) => c.assessment)) return null;
  const out = {};
  for (const l of lessons) {
    const m = VIVA_PRACTICE.exec(String(l.title ?? ''));
    if (!m) continue;
    const key = m[1] === '1' ? 'prepared' : 'spontaneous';
    if (!out[key]) out[key] = { lesson_id: l.id, title: String(l.title).trim() };
  }
  return out.prepared || out.spontaneous ? out : null;
}

/**
 * The panel for one student. `lessons`, `rows` and `done` are the student's own map and records
 * (lessonsForStudent, mapRows, listDone); `published` maps lesson id to its published copy; `view`
 * is the class's markbook load; `unit` the class's unit; `assessments` the unit's assessment
 * lessons, published or not ({ id, title, published }); `now` the moment of the read.
 */
export async function todoFor(store, roster, student, { unit = null, lessons, rows, done, published, view, assessments = [], now = new Date() }) {
  const today = sydneyDay(now);
  const finished = new Set(rows.filter((r) => r.done).map((r) => r.id));
  const writing = new Map((view.work ?? []).map((w) => [w.lesson_id, w.students?.[student.id]?.blocks ?? null]));

  const started = new Map();
  const doneToday = new Set();
  for (const row of rows) {
    if (finished.has(row.id)) {
      // Finished today: stays ticked until the day ends.
      const at = doneAt(row.id, done, view, student.id);
      if (at && sydneyDay(at) === today) doneToday.add(row.id);
      continue;
    }
    if (row.kind === 'assessment') continue;
    const saved = writing.get(row.id);
    const quiz = view.quizzes.find((q) => q.lesson_id === row.id);
    const score = quiz?.scores?.[student.id];
    const quizGo = Boolean(score) || Boolean(quiz?.started?.includes(student.id));
    if (!saved && !quizGo) continue;
    const activities = activitiesOf(published.get(row.id), saved ?? {});
    if (quiz) activities.push({ id: `quiz:${row.id}`, title: 'Quiz', done: Boolean(score?.submitted_at) });
    started.set(row.id, activities.slice(0, TODO_LIMITS.activities));
  }

  const [back, waiting, practice, planned] = await Promise.all([
    backFor(store, roster, student, today),
    waitingFor(store, roster.cls.id, student, view.markbook?.columns ?? []),
    practiceToday(store, roster, student, { now }),
    plannedAssessments(store, roster.cls.id, assessments)
  ]);
  const countdowns = countdownsFrom(lessons, published, today, planned);
  const { boxes, more } = boxesFor({ unit, lessons, rows, started, doneToday, back, countdowns, today });
  return {
    countdowns,
    announcements: announcementsFrom(roster.cls),
    viva_practice: vivaPracticeFrom(lessons, countdowns),
    practice: practice && (practice.today > 0 || practice.answered > 0) ? practice : null,
    waiting,
    boxes,
    more
  };
}
