/**
 * Student profile: done records and the map payload for one claimed student.
 *
 *   profile/{class}/{student}/done/{lesson}   { at, via }   create-only
 *
 * The student is whoever this device has claimed (class-claims.mjs). Nothing here stores a
 * name, and the payload returns only the student's own map. Feedback and progress come
 * from profile-feedback.mjs, from returned work only.
 */
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { claimFor, claimInitials, loadRoster } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';
import { draftLessonKey, publishedLessonKey, SCHEDULED_LESSON_PREFIX, unitKey } from './teaching-blobs.mjs';
import { unitMapPayload } from './profile-map.mjs';
import { quizColumns, readBook, workColumns } from './markbook.mjs';
import { progressFor, returnedFor, pieceFor, markSeen, stepsFor, unseenFor, skillsFor, vivaHistoryFor, classSkillRungs } from './profile-feedback.mjs';
import { listClassDone, listDone, markDone, recordDone, removeDone, undoTick } from './profile-done.mjs';
import { STUDENT_ID_PATTERN } from './student-initials.mjs';
import { lessonsForStudent, routeRoleOf } from './lesson-assign.mjs';
import { deleteTeacherNote, saveTeacherNote, teacherNotes } from './teacher-notes.mjs';
import { teacherHabits } from './teacher-habits.mjs';
import { todoFor } from './profile-todo.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { requestStore } from './request-store.mjs';

const ROLES = new Set(['core', 'support', 'extension', 'optional']);

/**
 * The class's current unit, lessons in unit order with their route role. A trashed unit is
 * skipped for the next one the class has, even while the class still names it.
 */
async function classUnit(store, cls) {
  for (const unitId of [cls.current_unit_id, ...(cls.active_unit_ids ?? [])]) {
    const found = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
    if (found && !isDeletedRecord(found)) return found;
  }
  return null;
}

/** The unit's safe lesson ids, in unit order. */
const unitLessonIds = (unit) => (unit?.lesson_ids ?? []).filter((id) => isSafeId(id));

/** Reads per step on a progress page: its reads are many and small, and none waits on another. */
const PAGE_READS = 16;

async function unitLessons(store, unit) {
  const lessons = [];
  /** Each lesson's published copy, by id: the To do panel reads its countdowns and question sets. */
  const published = new Map();
  // Read side by side, kept in unit order.
  const ids = unitLessonIds(unit);
  const found = await mapBounded(ids, PAGE_READS, (id) => Promise.all([read(store, draftLessonKey(id)), read(store, publishedLessonKey(id))]));
  /** The unit's assessment lessons, published or not: only id, title and whether published, for the countdown. */
  const assessments = [];
  for (const [i, id] of ids.entries()) {
    const [lesson, copy] = found[i];
    if (lesson && lesson.title && !isDeletedRecord(lesson) && lesson.pedagogical_mode === 'assessment') assessments.push({ id, title: String(lesson.title), published: Boolean(copy) });
    // Students only ever see lessons that are published and not trashed.
    if (!lesson || !copy || !lesson.title || isDeletedRecord(lesson)) continue;
    const role = routeRoleOf(unit, lesson);
    lessons.push(role ? { ...lesson, route_role: role } : lesson);
    published.set(id, copy);
  }
  return { unit, lessons, published, assessments };
}

export async function profileAction(store, classId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'done', 'undone', 'claim', 'progress', 'returned', 'piece', 'seen', 'steps', 'token', 'skills'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  if (action === 'claim') return profileFor(store, roster, await claimInitials(store, roster, body.class_token, body.initials));
  const student = await claimFor(store, roster, body.class_token);
  if (!student) {
    if (action === 'done' || action === 'undone') reject(403, 'need_initials', 'Type your initials first.');
    return { need: 'initials' };
  }
  // The initials token on every lesson page.
  if (action === 'token') return { need: null, initials: student.initials, unseen: await unseenFor(store, roster, student) };
  // The lesson footer: whether this student's own tick (or a teacher's complete mark) is on, nothing else.
  if (action === 'status' && body.quick === true && typeof body.lesson_id === 'string') {
    const record = (await listDone(store, classId, student.id))[body.lesson_id];
    return { need: null, initials: student.initials, ticked: !!record && !record.partial };
  }
  if (action === 'progress') return progressPage(store, roster, student, now);
  if (action === 'returned') return { need: null, ...(await returnedFor(store, roster, student)) };
  // Writing boxes' next steps: every skill at once (a lesson is small), so `lesson_id` only has to be safe.
  if (action === 'steps') {
    if (body.lesson_id !== undefined && !isSafeId(body.lesson_id)) reject(400, 'bad_request', 'Unknown lesson.');
    return stepsFor(store, classId, student.id);
  }
  // A Voice task's "where you are": one strand of this student's own skills.
  if (action === 'skills') {
    if (body.strand !== undefined && (typeof body.strand !== 'string' || !/^[a-z]{3,20}$/.test(body.strand))) reject(400, 'bad_request', 'Unknown strand.');
    const skills = await skillsFor(store, classId, student.id, body.strand ?? null);
    // A viva block also asks for the student's last viva and the pattern across their recent ones.
    if (body.vivas !== true) return skills;
    if (body.lesson_id !== undefined && !isSafeId(body.lesson_id)) reject(400, 'bad_request', 'Unknown lesson.');
    return { ...skills, vivas: await vivaHistoryFor(store, classId, student.id, body.lesson_id ?? null) };
  }
  if (action === 'piece') return pieceFor(store, roster, student, body.item);
  if (action === 'seen') return markSeen(store, roster, student, body.item);
  if (action === 'done') await recordDone(store, classId, student.id, body.lesson_id, 'tick');
  // The lesson footer's tick and untick need no map back.
  if (action === 'undone') await undoTick(store, classId, student.id, body.lesson_id);
  if (body.quick === true && (action === 'done' || action === 'undone')) return { need: null, initials: student.initials };
  return profileFor(store, roster, student);
}

/**
 * Lessons as the map draws them. A submitted quiz counts as done without a tick. A teacher's
 * partial mark is not done. An assessment counts only when the teacher has marked it complete,
 * not when it is handed in or ticked.
 */
export function mapRows(lessons, view, done, studentId) {
  const submitted = new Set(view.quizzes.filter((q) => q.scores?.[studentId]?.submitted_at).map((q) => q.lesson_id));
  const quizLessons = new Set(view.quizzes.map((q) => q.lesson_id));
  return lessons.map((l) => {
    const role = ROLES.has(l.route_role) ? l.route_role : 'core';
    const assessment = l.pedagogical_mode === 'assessment';
    const record = done[l.id];
    const counted = assessment ? record?.via === 'teacher' && !record.partial : Boolean(record) && !record.partial;
    return {
      id: l.id,
      title: l.title,
      role,
      kind: assessment ? 'assessment' : quizLessons.has(l.id) ? 'quiz' : 'lesson',
      done: counted || (!assessment && submitted.has(l.id))
    };
  });
}

/**
 * Where a progress read spends its time. Only the teacher's `progress` with `timing: true` gets
 * one; every other read runs `untimed`, which adds nothing.
 */
const untimed = { time: (_name, fn) => fn(), store: (store) => store };
function phaseTimer() {
  const started = Date.now();
  const phases = {};
  const blobs = { get: 0, get_ms: 0, get_slowest: 0, list: 0, list_ms: 0, list_slowest: 0 };
  const count = (kind, ms) => {
    blobs[kind] += 1;
    blobs[`${kind}_ms`] += ms;
    blobs[`${kind}_slowest`] = Math.max(blobs[`${kind}_slowest`], ms);
  };
  return {
    async time(name, fn) {
      const at = Date.now();
      try {
        return await fn();
      } finally {
        phases[name] = Date.now() - at;
      }
    },
    /** Counts the reads that reach the real store, under the request cache. */
    store: (store) => new Proxy(store, {
      get(target, prop) {
        if (prop !== 'get' && prop !== 'list') {
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (...args) => {
          const at = Date.now();
          try {
            return await target[prop](...args);
          } finally {
            count(prop, Date.now() - at);
          }
        };
      }
    }),
    report: () => ({ total_ms: Date.now() - started, phases, blobs })
  };
}

/**
 * The markbook load as one student's page needs it, for the lessons of their unit only: the
 * page never looks up a quiz or written work outside it. Quiz scores stay class-wide, since a
 * lesson draws as a quiz once anyone in the class has a go; written work is this student's.
 */
async function studentView(store, roster, student, lessonIds, t = untimed) {
  const self = { ...roster, students: roster.students.filter((s) => s.id === student.id) };
  const [{ book }, quizzes, work] = await Promise.all([
    t.time('markbook_book', () => readBook(store, roster.cls.id)),
    // Quiz scores never read the book's columns, so they start at once.
    t.time('quizzes', async () => quizColumns(store, roster, await readBook(store, roster.cls.id).then((r) => r.book), lessonIds, { size: PAGE_READS })),
    t.time('work', () => workColumns(store, self, lessonIds, { size: PAGE_READS }))
  ]);
  return { markbook: book, quizzes, work };
}

/** Starts reading the class calendar, which the map needs later; the request cache hands it on. */
function warmSchedule(store) {
  listBlobKeys(store, SCHEDULED_LESSON_PREFIX).then((keys) => mapBounded(keys, PAGE_READS, (key) => read(store, key))).catch(() => undefined);
}

/** The student's own unit: their lessons, the map's rows, each lesson's published copy and the markbook load. */
async function unitState(store, roster, student, t = untimed) {
  const classId = roster.cls.id;
  // None of the three needs another, so they load side by side.
  const unit = await t.time('unit', () => classUnit(store, roster.cls));
  const [{ lessons: unitList, published, assessments }, view, done] = await Promise.all([
    t.time('unit_lessons', () => unitLessons(store, unit)),
    t.time('markbook_view', () => studentView(store, roster, student, unitLessonIds(unit), t)),
    t.time('done', () => listDone(store, classId, student.id))
  ]);
  // Side lessons only reach the students they are set for; the map never carries the others' titles.
  const lessons = lessonsForStudent(unitList, view, done, student.id, classId);
  return { unit, lessons, published, assessments, view, done, rows: mapRows(lessons, view, done, student.id) };
}

/** The My progress payload: feedback, the map and the To do panel beside it. The teacher's read gets the same. */
async function progressPage(rawStore, roster, student, now, t = untimed) {
  // The page's helpers share the class, markbook, schedule and pieces: each is read once.
  const store = requestStore(t.store(rawStore));
  warmSchedule(store);
  const state = await t.time('state', () => unitState(store, roster, student, t));
  const [progress, map, todo] = await Promise.all([
    t.time('feedback', () => progressFor(store, roster, student)),
    t.time('map', () => mapPayload(store, roster, state)),
    t.time('todo', () => todoFor(store, roster, student, { ...state, now }))
  ]);
  return { need: null, initials: student.initials, ...progress, map, todo };
}

async function mapPayload(store, roster, { unit, lessons, rows }) {
  const next = rows.find((r) => r.role === 'core' && !r.done)?.id ?? null;
  return { lessons: rows, next, unit: await unitMapPayload(store, roster, unit, lessons) };
}

async function profileFor(rawStore, roster, student) {
  const store = requestStore(rawStore);
  warmSchedule(store);
  return { need: null, initials: student.initials, map: await mapPayload(store, roster, await unitState(store, roster, student)) };
}

/**
 * Teacher: every student's done records; marking one complete, partial or clearing it; and one
 * student's progress page exactly as they see it (`progress`, `returned`, `piece`). The teacher's
 * reads never mark a piece seen. Also the teacher-only Over time reads: private notes (`notes`,
 * `note_save`, `note_delete`) and `habits`. None of these is in the student's profileAction.
 */
export async function teacherProfileAction(store, classId, body, { now = new Date() } = {}) {
  const t = body?.action === 'progress' && body.timing === true ? phaseTimer() : null;
  const roster = await (t ?? untimed).time('roster', () => loadRoster(store, classId));
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const action = body?.action ?? 'list';
  if (!['list', 'remove', 'mark', 'progress', 'returned', 'piece', 'skill_rungs', 'notes', 'note_save', 'note_delete', 'habits'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  // Where students sit on the skills continuum: one student (with student_id) or the whole class.
  if (action === 'skill_rungs' && body.student_id === undefined) {
    const rows = await classSkillRungs(store, classId, roster.students.map((s) => s.id));
    const byId = new Map(roster.students.map((s) => [s.id, s]));
    return { students: rows.map((r) => ({ id: r.id, name: byId.get(r.id)?.name ?? '', initials: byId.get(r.id)?.initials ?? '', rungs: r.rungs })) };
  }
  if (action !== 'list') {
    if (typeof body.student_id !== 'string' || !STUDENT_ID_PATTERN.test(body.student_id) || !roster.students.some((s) => s.id === body.student_id)) {
      reject(400, 'bad_request', 'Unknown student.');
    }
    const student = roster.students.find((s) => s.id === body.student_id);
    if (action === 'progress') {
      const page = { name: student.name, ...(await progressPage(store, roster, student, now, t ?? untimed)) };
      return t ? { ...page, timing: t.report() } : page;
    }
    if (action === 'returned') return { need: null, ...(await returnedFor(store, roster, student)) };
    if (action === 'piece') return pieceFor(store, roster, student, body.item);
    if (action === 'skill_rungs') return { rungs: (await classSkillRungs(store, classId, [student.id]))[0]?.rungs ?? {} };
    if (action === 'notes') return teacherNotes(store, roster.cls.id, student.id);
    if (action === 'note_save') return saveTeacherNote(store, roster.cls.id, student.id, body.note, { now });
    if (action === 'note_delete') return deleteTeacherNote(store, roster.cls.id, student.id, body.note_id);
    if (action === 'habits') return teacherHabits(store, roster.cls.id, student.id, { now });
    const state = action === 'remove' ? 'clear' : body.state;
    if (!['complete', 'partial', 'clear'].includes(state)) reject(400, 'bad_request', 'Mark it complete, partial or clear.');
    if (action === 'remove') await removeDone(store, classId, body.student_id, body.lesson_id);
    else await markDone(store, classId, body.student_id, body.lesson_id, state);
    // Only the one student changed, so only their records go back.
    return { done: { [body.student_id]: await listDone(store, classId, body.student_id) } };
  }
  return { done: await listClassDone(store, classId, roster.students.map((s) => s.id)) };
}
