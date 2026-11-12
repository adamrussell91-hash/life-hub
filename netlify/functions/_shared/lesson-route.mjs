/**
 * "Why this matters" on a student's lesson page: where this lesson sits on the unit's route,
 * the next assessment after it, and the big idea (deep understanding) its focus pieces build.
 *
 *   POST /api/published/profile/:classId  { action: 'lesson_route', lesson_id, class_token }
 *   → { route: { before, done, here_index, remaining, assessment } | null, reason, big_idea }
 *
 * Everything is read from records that already exist; nothing is stored. Only lessons this
 * student can see are counted. Without a claim the route counts core lessons and nothing is
 * done. With no upcoming assessment and no big idea there is no reason, and the page shows
 * no button: a reason is never invented.
 */
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { claimFor } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from './teaching-blobs.mjs';
import { readBook, workColumns } from './markbook.mjs';
import { studentQuizFacts } from './quiz.mjs';
import { listDone } from './profile-done.mjs';
import { lessonsForStudent, routeRoleOf } from './lesson-assign.mjs';
import { countdownsFrom, plannedAssessments } from './profile-todo.mjs';
import { mapRows } from './profile.mjs';
import { sydneyDay } from './organiser-model.mjs';
import { mapBounded } from './blobs-list.mjs';
import { requestStore } from './request-store.mjs';

const READS = 16;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The class's current unit, skipping a trashed one (as profile.mjs does). */
async function classUnit(store, cls) {
  for (const unitId of [cls.current_unit_id, ...(cls.active_unit_ids ?? [])]) {
    const found = isSafeId(unitId) ? await read(store, unitKey(unitId)) : null;
    if (found && !isDeletedRecord(found)) return found;
  }
  return null;
}

/** The student's own quiz and work facts for the unit, in the shape lessonsForStudent and mapRows read. */
async function studentView(store, roster, student, lessonIds) {
  if (!student) return { markbook: { took: {} }, quizzes: [], work: [] };
  const self = { ...roster, students: roster.students.filter((s) => s.id === student.id) };
  const [{ book }, facts, work] = await Promise.all([
    readBook(store, roster.cls.id),
    mapBounded(lessonIds, READS, (id) => studentQuizFacts(store, id, roster.cls.id, student.id)),
    workColumns(store, self, lessonIds, { size: READS })
  ]);
  const quizzes = facts.filter(Boolean).map((f) => ({
    lesson_id: f.lesson_id,
    scores: f.submitted_at ? { [student.id]: { submitted_at: f.submitted_at } } : {},
    started: f.started ? [student.id] : []
  }));
  return { markbook: book, quizzes, work };
}

/** "Monthly Review" stays; a long title keeps its last word, for the gold square's label. */
export function shortTitle(title) {
  const text = String(title ?? '').trim();
  if (text.length <= 16) return text;
  const last = text.split(/\s+/).pop() ?? text;
  return last.length <= 16 ? last : `${last.slice(0, 15)}…`;
}

/** "today", "tomorrow", "on Friday", or "on Friday 27 November" a week or more away. */
export function whenPhrase(dueDate, today) {
  const due = new Date(`${dueDate}T00:00:00Z`);
  const days = Math.round((due.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  const weekday = WEEKDAYS[due.getUTCDay()];
  if (days < 7) return `on ${weekday}`;
  return `on ${weekday} ${due.getUTCDate()} ${MONTHS[due.getUTCMonth()]}`;
}

const withThe = (title) => (/^(the|a|an|your)\s/i.test(title) ? title : `the ${title}`);
const sentenceEnd = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The one plain sentence a student reads. Null when there is nothing true to say. */
export function reasonSentence(assessment, bigIdea, today) {
  const parts = [];
  if (assessment) parts.push(`You'll need this for ${withThe(assessment.title)} ${whenPhrase(assessment.due_date, today)}.`);
  if (bigIdea) parts.push(assessment ? `It builds this big idea: ${sentenceEnd(bigIdea)}` : `This builds a big idea: ${sentenceEnd(bigIdea)}`);
  return parts.length ? parts.join(' ') : null;
}

/** The lesson's knowledge pieces: its focus picks and any kp: tags. */
function lessonPieces(lesson) {
  const ids = new Set(Array.isArray(lesson?.focus_pieces) ? lesson.focus_pieces.filter((p) => typeof p === 'string') : []);
  for (const tag of Array.isArray(lesson?.tags) ? lesson.tags : []) {
    const m = typeof tag === 'string' ? /^kp:(kp_[a-z0-9]{4,16})$/.exec(tag) : null;
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** The first deep understanding (unit order) resting on one of the lesson's pieces, own or shared. */
export function bigIdeaFor(unit, lesson) {
  const pieces = lessonPieces(lesson);
  if (!pieces.size) return null;
  for (const du of Array.isArray(unit?.deep_understandings) ? unit.deep_understandings : []) {
    const claim = typeof du?.claim === 'string' ? du.claim.trim() : '';
    if (!claim) continue;
    const own = (du.pieces ?? []).map((p) => p?.id);
    const shared = du.shared_piece_ids ?? [];
    if ([...own, ...shared].some((id) => pieces.has(id))) return claim.length > 400 ? `${claim.slice(0, 399)}…` : claim;
  }
  return null;
}

/**
 * The route for one lesson, from loaded records. `unitIds` are the unit's lesson ids in order,
 * `visible` the student's lessons (unit order), `rows` their map rows (done flags),
 * `assessmentLessons` the unit's published assessment lessons, `planned` their calendar days.
 */
export function routeFor({ lessonId, unitIds, visible, rows, assessmentLessons, published, planned, today }) {
  const order = new Map(unitIds.map((id, i) => [id, i]));
  const here = order.get(lessonId);
  if (here === undefined || !visible.some((l) => l.id === lessonId)) return null;
  // The next assessment after this lesson in unit order, soonest due first.
  const after = (id) => (order.get(id) ?? -1) > here;
  const due = countdownsFrom(assessmentLessons.filter((l) => after(l.id)), published, today, planned.filter((p) => after(p.lesson_id)))
    .filter((c) => c.assessment);
  const next = due[0] ?? null;
  const stop = next ? order.get(next.lesson_id) : Infinity;
  const doneById = new Map(rows.map((r) => [r.id, r.done]));
  const earlier = visible.filter((l) => order.get(l.id) < here);
  const remaining = visible.filter((l) => order.get(l.id) > here && order.get(l.id) < stop && l.pedagogical_mode !== 'assessment').length;
  return {
    before: earlier.length,
    done: earlier.filter((l) => doneById.get(l.id)).length,
    here_index: earlier.length,
    remaining,
    assessment: next ? { title: next.title, short: shortTitle(next.title), due_date: next.due_date, due_time: next.due_time } : null
  };
}

export async function lessonRouteAction(rawStore, roster, body, { now = new Date() } = {}) {
  const lessonId = body?.lesson_id;
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const store = requestStore(rawStore);
  const student = await claimFor(store, roster, body.class_token);
  const none = { route: null, reason: null, big_idea: null };
  const unit = await classUnit(store, roster.cls);
  const unitIds = (unit?.lesson_ids ?? []).filter((id) => isSafeId(id));
  if (!unitIds.includes(lessonId)) return none;

  const [found, view, done] = await Promise.all([
    mapBounded(unitIds, READS, (id) => Promise.all([read(store, draftLessonKey(id)), read(store, publishedLessonKey(id))])),
    studentView(store, roster, student, unitIds),
    student ? listDone(store, roster.cls.id, student.id) : {}
  ]);
  const lessons = [];
  const published = new Map();
  const assessments = [];
  let thisLesson = null;
  for (const [i, id] of unitIds.entries()) {
    const [lesson, copy] = found[i];
    if (!lesson || !lesson.title || isDeletedRecord(lesson)) continue;
    if (lesson.pedagogical_mode === 'assessment') assessments.push({ id, title: String(lesson.title), published: Boolean(copy) });
    if (!copy) continue;
    if (id === lessonId) thisLesson = lesson;
    const role = routeRoleOf(unit, lesson);
    lessons.push(role ? { ...lesson, route_role: role } : lesson);
    published.set(id, copy);
  }
  if (!thisLesson) return none;
  const visible = lessonsForStudent(lessons, view, done, student?.id ?? '', roster.cls.id);
  const rows = student ? mapRows(visible, view, done, student.id) : visible.map((l) => ({ id: l.id, done: false }));
  const today = sydneyDay(now);
  const route = routeFor({
    lessonId,
    unitIds,
    visible,
    rows,
    assessmentLessons: lessons.filter((l) => l.pedagogical_mode === 'assessment'),
    published,
    planned: await plannedAssessments(store, roster.cls.id, assessments),
    today
  });
  if (!route) return none;
  const bigIdea = bigIdeaFor(unit, thisLesson);
  return { route, reason: reasonSentence(route.assessment, bigIdea, today), big_idea: bigIdea };
}
