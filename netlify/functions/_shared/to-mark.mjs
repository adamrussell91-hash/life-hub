/**
 * Everything waiting on the teacher, across every class:
 *
 *   piece    Markbook task linked to a lesson block (handed-in writing)
 *   quiz     quiz go with written answers still to mark (tutorial exit checks too)
 *   voice    Voice block recording not yet returned
 *   sprint   design sprint reflection handed in, no reflection mark yet
 *   handup   lecture or tutorial hand-up with no reply
 *   ask      sprint group question with no answer
 *
 * Each item says how many are waiting, who, since when, and where to go to
 * deal with it. Waiting items come first, oldest first; linked Markbook tasks
 * with nothing waiting follow as "coming in".
 */
import { piecesAction } from './piece-feedback.mjs';
import { readBook, classLessonIds } from './markbook.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { CLASS_PREFIX, draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { classQuizScores } from './quiz.mjs';
import { sprintKeys } from './sprint-keys.mjs';
import { ownerOf } from './sprint.mjs';

export const LATE_DAYS = 7;
const STRONG = { type: 'json', consistency: 'strong' };
const read = (store, key) => store.get(key, STRONG);

async function listClassIds(store) {
  const keys = await listBlobKeys(store, CLASS_PREFIX);
  return keys.map((key) => key.slice(CLASS_PREFIX.length)).filter((id) => id && !id.includes('/'));
}

const lessonPath = (lessonId, blockId) => `/lessons/${encodeURIComponent(lessonId)}${blockId ? `#block=${encodeURIComponent(blockId)}` : ''}`;
const oldest = (stamps) => stamps.filter(Boolean).sort()[0] ?? null;

/** Records under one global prefix, grouped by lesson id (the segment after the prefix). */
async function recordsByLesson(store, prefix, keep) {
  const keys = (await listBlobKeys(store, prefix)).filter(keep);
  const rows = await mapBounded(keys, 8, async (key) => ({ key, record: await read(store, key) }));
  const out = new Map();
  for (const { key, record } of rows) {
    if (!record) continue;
    const parts = key.slice(prefix.length).split('/');
    if (!out.has(parts[0])) out.set(parts[0], []);
    out.get(parts[0]).push({ parts, record });
  }
  return out;
}

async function lessonTitle(store, lessonId) {
  const lesson = (await read(store, publishedLessonKey(lessonId))) ?? (await read(store, draftLessonKey(lessonId)));
  return lesson?.title || 'Lesson';
}

/** Markbook tasks linked to a lesson block: the original queue. */
async function pieceItems(store, classId, book, base) {
  const items = [];
  for (const column of book.columns.filter((c) => c.kind === 'assessment' && c.piece)) {
    const { students } = await piecesAction(store, classId, { action: 'list', column_id: column.id });
    const waiting = students.filter((s) => s.status === 'waiting' || s.status === 'marking');
    const handed = students.filter((s) => s.handed_in_at);
    if (!handed.length) continue;
    items.push({
      ...base, kind: 'piece', what: 'Handed-in work', column_id: column.id, title: column.title, lesson_id: column.piece.lesson_id, block_id: column.piece.block_id,
      href: `/mark/${encodeURIComponent(classId)}/${encodeURIComponent(column.id)}`,
      waiting: waiting.length, handed_in: handed.length, who: waiting.map((s) => s.initials).filter(Boolean),
      oldest_at: oldest(waiting.map((s) => s.handed_in_at))
    });
  }
  return items;
}

/** Quiz goes with written answers nobody (person or AI) has marked yet. */
async function quizItems(store, roster, lessonIds, base) {
  const ids = roster.students.map((s) => s.id);
  const initials = new Map(roster.students.map((s) => [s.id, s.initials]));
  const found = await mapBounded(lessonIds, 4, (lessonId) => classQuizScores(store, lessonId, roster.cls.id, ids));
  const items = [];
  for (const q of found) {
    if (!q) continue;
    const waiting = Object.entries(q.scores).filter(([, s]) => s.pending > 0);
    if (!waiting.length) continue;
    items.push({
      ...base, kind: 'quiz', what: 'Quiz answers to mark', title: q.title, lesson_id: q.lesson_id, href: lessonPath(q.lesson_id),
      waiting: waiting.length, handed_in: Object.keys(q.scores).length, answers: waiting.reduce((n, [, s]) => n + s.pending, 0),
      who: waiting.map(([id]) => initials.get(id)).filter(Boolean), oldest_at: oldest(waiting.map(([, s]) => s.submitted_at))
    });
  }
  return items;
}

/** Sprint reflections with no mark in the sprint's reflection column, and group questions with no answer. */
async function sprintItems(store, roster, book, lessonIds, base) {
  const initials = new Map(roster.students.map((s) => [s.id, s.initials]));
  const items = [];
  await mapBounded(lessonIds, 4, async (lessonId) => {
    const k = sprintKeys(lessonId);
    const config = await read(store, k.config);
    if (!config || config.class_id !== roster.cls.id) return;
    const draft = await read(store, draftLessonKey(lessonId));
    const title = draft?.title || 'Design sprint';
    const column = draft?.sprint?.columns?.reflection;
    const marks = (column && book.marks[column]) || {};
    const students = (config.groups ?? []).flatMap((g) => g.students);
    const subs = await mapBounded(students, 8, async (id) => ({ id, sub: await read(store, k.sub(ownerOf(config.class_id, id), 'test')) }));
    const handed = subs.filter((s) => s.sub?.submitted_at);
    const waiting = handed.filter((s) => !marks[s.id]);
    if (waiting.length) {
      items.push({
        ...base, kind: 'sprint', what: 'Sprint reflections to mark', title, lesson_id: lessonId, href: lessonPath(lessonId),
        waiting: waiting.length, handed_in: handed.length, who: waiting.map((s) => initials.get(s.id)).filter(Boolean), oldest_at: oldest(waiting.map((s) => s.sub.submitted_at))
      });
    }
    const groups = await mapBounded(config.groups ?? [], 4, async (g) => ({ g, state: await read(store, k.group(g.id)) }));
    const asked = groups.flatMap(({ g, state }) => (state?.ask_sent ?? []).filter((q) => !state.answers?.[q.id]).map((q) => ({ group: g.name, at: q.at ?? null })));
    if (asked.length) {
      items.push({
        ...base, kind: 'ask', what: 'Sprint questions for you', title, lesson_id: lessonId, href: lessonPath(lessonId),
        waiting: asked.length, who: [...new Set(asked.map((a) => a.group))], oldest_at: oldest(asked.map((a) => a.at))
      });
    }
  });
  return items;
}

/**
 * Lesson-wide records (voice takes, hand-ups) for this class's lessons. A
 * record with no class (a device that never claimed initials) goes to the
 * first class that has the lesson, so it shows once.
 */
function recordItems(byLesson, roster, lessonIds, claimed, base, o) {
  const initials = new Map(roster.students.map((s) => [s.id, s.initials]));
  const items = [];
  for (const lessonId of lessonIds) {
    const rows = byLesson.get(lessonId);
    if (!rows) continue;
    const takeLoose = !claimed.has(lessonId);
    claimed.add(lessonId);
    const mine = rows.filter(({ record }) => (record.class_id ? record.class_id === roster.cls.id : takeLoose) && o.waiting(record));
    for (const [blockId, list] of o.group(mine)) {
      items.push({
        ...base, kind: o.kind, what: o.what, lesson_id: lessonId, block_id: blockId || undefined, href: lessonPath(lessonId, blockId),
        waiting: list.length, who: [...new Set(list.map(({ record }) => initials.get(record.student_id) ?? record.initials).filter(Boolean))],
        oldest_at: oldest(list.map(({ record }) => o.at(record)))
      });
    }
  }
  return items;
}

const byBlock = (rows) => {
  const out = new Map();
  for (const row of rows) {
    const block = row.parts[1] ?? '';
    if (!out.has(block)) out.set(block, []);
    out.get(block).push(row);
  }
  return out;
};
const oneGroup = (rows) => (rows.length ? new Map([['', rows]]) : new Map());
const handupKey = (key) => /^[^/]+\/[^/]+\/handups\//.test(key);

export async function toMarkQueue(store, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const [voice, lectureUps, tutorialUps] = await Promise.all([
    recordsByLesson(store, 'voice_submissions/', () => true),
    recordsByLesson(store, 'lecture/', handupKey),
    recordsByLesson(store, 'tutorial/', handupKey)
  ]);
  const claimed = { voice: new Set(), lecture: new Set(), tutorial: new Set() };
  const tasks = [];
  for (const classId of await listClassIds(store)) {
    const roster = await loadRoster(store, classId);
    if (!roster?.students.length || (roster.cls.status && roster.cls.status !== 'active')) continue;
    const base = { class_id: classId, class_title: roster.cls.display_name || roster.cls.title || 'Class', roster: roster.students.length };
    const [{ book }, lessonIds] = await Promise.all([readBook(store, classId), classLessonIds(store, roster)]);
    const records = [
      ...recordItems(voice, roster, lessonIds, claimed.voice, base, { kind: 'voice', what: 'Recordings to return', waiting: (r) => r.status !== 'returned', group: byBlock, at: (r) => r.submitted_at }),
      ...recordItems(lectureUps, roster, lessonIds, claimed.lecture, base, { kind: 'handup', what: 'Lecture hand-ups', waiting: (r) => r.status === 'open', group: oneGroup, at: (r) => r.at }),
      ...recordItems(tutorialUps, roster, lessonIds, claimed.tutorial, base, { kind: 'handup', what: 'Tutorial hand-ups', waiting: (r) => r.status === 'open', group: oneGroup, at: (r) => r.at })
    ];
    const [pieces, quizzes, sprints, titled] = await Promise.all([
      pieceItems(store, classId, book, base),
      quizItems(store, roster, lessonIds, base),
      sprintItems(store, roster, book, lessonIds, base),
      mapBounded(records, 4, async (item) => ({ ...item, title: await lessonTitle(store, item.lesson_id) }))
    ]);
    tasks.push(...pieces, ...quizzes, ...sprints, ...titled);
  }
  for (const t of tasks) t.late = Boolean(t.waiting && t.oldest_at) && now - Date.parse(t.oldest_at) >= LATE_DAYS * 86400000;
  tasks.sort((a, b) => (b.waiting > 0) - (a.waiting > 0) || String(a.oldest_at).localeCompare(String(b.oldest_at)));
  return { tasks };
}
