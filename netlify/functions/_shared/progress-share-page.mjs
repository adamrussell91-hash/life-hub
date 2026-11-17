/**
 * The Progress share page: one student's progress for a signed-in viewer. `profile` is the
 * student's own My progress payload (progressPage), so the viewer sees the page the student
 * sees, with SHARE_DROP taken out: no returned-work list, no quoted words or teacher comments,
 * no sign-in code, initials or unread counts. The top level stays inside SHARE_PAGE_KEYS.
 */
import { read, reject } from './question-drop.mjs';
import { progressPage, unitState } from './profile.mjs';
import { listTickRecords } from './profile-done.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { SCHEDULED_LESSON_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { requestStore } from './request-store.mjs';
import { deviceIn, noteOpened, openShare, signIn, signOut } from './progress-share.mjs';

/** Every key the page may carry outside `profile`, at any depth. The allowlist test holds the page to it. */
export const SHARE_PAGE_KEYS = new Set([
  'need', 'student', 'first_name', 'class_title', 'viewer_initials', 'lesson_ids', 'profile',
  'ticks', 'lesson_id', 'title', 'at', 'via', 'planned', 'record', 'kind',
  'bursts', 'from', 'to', 'count'
]);

/** What the student's own payload carries that a viewer never gets. */
export const SHARE_DROP = ['initials', 'code', 'pointer', 'unseen', 'has_returned'];

/** The student's My progress payload, cut for a viewer. Feedback rows keep their counts, never the words. */
export function shareProfile(full) {
  const profile = { ...full };
  for (const key of SHARE_DROP) delete profile[key];
  if (profile.feedback) profile.feedback = { pieces: profile.feedback.pieces ?? [], rows: (profile.feedback.rows ?? []).map((r) => ({ ...r, hits: [] })) };
  return profile;
}

const BURST_MIN = 3;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const TICK_KINDS = new Set(['tick', 'untick', 'quiz']);

/**
 * Runs of ticks on BURST_MIN or more different lessons inside BURST_WINDOW_MS. Only `tick`
 * events count: quiz submissions and teacher marks are not something a student can pile up.
 */
export function burstsOf(events) {
  const ticks = events.filter((e) => e.kind === 'tick' && !Number.isNaN(Date.parse(e.at))).sort((a, b) => a.at.localeCompare(b.at));
  const out = [];
  let i = 0;
  while (i < ticks.length) {
    const start = Date.parse(ticks[i].at);
    let j = i;
    while (j + 1 < ticks.length && Date.parse(ticks[j + 1].at) - start <= BURST_WINDOW_MS) j += 1;
    const lessons = new Set(ticks.slice(i, j + 1).map((e) => e.lesson_id));
    if (lessons.size >= BURST_MIN) {
      out.push({ from: ticks[i].at, to: ticks[j].at, count: lessons.size });
      i = j + 1;
    } else i += 1;
  }
  return out;
}

/**
 * One row per lesson counted as done, newest first. `at` is the first tick (or submission, or the
 * teacher's mark), so a later re-tick never hides when it was first done. A tick from before the
 * record existed reads as one event from its done record.
 */
export function tickRows({ lessons, doneIds, done, records, submitted, planned }) {
  const rows = [];
  for (const lesson of lessons) {
    if (!doneIds.has(lesson.id)) continue;
    const held = done[lesson.id];
    const own = held?.via === 'teacher' ? held.was : held;
    const record = (records[lesson.id] ?? []).filter((e) => TICK_KINDS.has(e.kind));
    const fallback = own?.at ? [{ at: own.at, kind: own.via === 'quiz' ? 'quiz' : 'tick' }] : submitted[lesson.id] ? [{ at: submitted[lesson.id], kind: 'quiz' }] : [];
    const events = record.length ? record : fallback;
    const first = events.find((e) => e.kind !== 'untick');
    const via = held?.via === 'teacher' && !held.partial ? 'teacher' : first?.kind === 'quiz' ? 'quiz' : 'tick';
    const at = via === 'teacher' && !first ? held.at : first?.at ?? held?.at ?? null;
    if (!at) continue;
    rows.push({ lesson_id: lesson.id, title: String(lesson.title ?? ''), at, via, ...(planned[lesson.id] ? { planned: planned[lesson.id] } : {}), record: events.map((e) => ({ at: e.at, kind: e.kind })) });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** The earliest calendar day each lesson is planned for this class, skipping skipped and deleted rows. */
export async function plannedDates(store, classId, lessonIds) {
  const wanted = new Set(lessonIds);
  const rows = await mapBounded(await listBlobKeys(store, SCHEDULED_LESSON_PREFIX), 8, (key) => read(store, key));
  const out = {};
  for (const r of rows) {
    if (!r || isDeletedRecord(r) || r.class_id !== classId || !wanted.has(r.lesson_id) || r.delivery_status === 'skipped' || typeof r.date !== 'string') continue;
    if (!out[r.lesson_id] || r.date < out[r.lesson_id]) out[r.lesson_id] = r.date;
  }
  return out;
}

/** The page payload for a viewer already let in. */
export async function buildSharePage(rawStore, roster, student, share, { now = new Date() } = {}) {
  const store = requestStore(rawStore);
  const classId = roster.cls.id;
  const state = await unitState(store, roster, student);
  const lessonIds = state.lessons.map((l) => l.id);
  const [full, records, planned] = await Promise.all([
    progressPage(store, roster, student, now),
    listTickRecords(store, classId, student.id),
    plannedDates(store, classId, lessonIds)
  ]);
  const submitted = {};
  for (const q of state.view.quizzes) {
    const at = q.scores?.[student.id]?.submitted_at;
    if (at) submitted[q.lesson_id] = at;
  }
  const doneIds = new Set(state.rows.filter((r) => r.done).map((r) => r.id));
  const unitLessons = new Set(lessonIds);
  const events = Object.entries(records)
    .filter(([lesson_id]) => unitLessons.has(lesson_id))
    .flatMap(([lesson_id, list]) => list.map((e) => ({ lesson_id, at: e.at, kind: e.kind })));
  return {
    student: { first_name: String(student.name ?? '').trim().split(/\s+/)[0] ?? '' },
    class_title: String(roster.cls.display_name || roster.cls.title || ''),
    viewer_initials: share.initials,
    lesson_ids: lessonIds,
    ticks: tickRows({ lessons: state.lessons, doneIds, done: state.done, records, submitted, planned }),
    bursts: burstsOf(events),
    profile: shareProfile(full)
  };
}

/** The public share actions: page, sign_in, sign_out. */
export async function shareAction(store, token, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'page';
  if (!['page', 'sign_in', 'sign_out'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'sign_out') {
    await signOut(store, token, body.device_token);
    return { need: 'sign_in' };
  }
  if (action === 'sign_in') {
    const { share, roster, student } = await signIn(store, token, body, { now });
    return buildSharePage(store, roster, student, share, { now });
  }
  const { share, roster, student } = await openShare(store, token);
  if (!deviceIn(share, body.device_token)) return { need: 'sign_in' };
  await noteOpened(store, token, share, now);
  return buildSharePage(store, roster, student, share, { now });
}
