/**
 * End-of-lesson questions: after a student ticks a lesson finished, two quick
 * questions about the lesson, then an optional "still unclear" box. Anonymous:
 * nothing stored here names the student.
 *
 *   end-questions/{lesson}/counts                    { [question]: answers so far }  (picks the next pair)
 *   end-questions/{lesson}/answers/{class}/{id}      { answers: { [question]: option }, unclear?, day }
 *   end-questions/{lesson}/given/{hash}              { day }  one set per device per lesson
 *
 * The device's class claim is checked so only a class's students can answer,
 * but only a one-way hash of the device token, salted with the lesson, is kept,
 * and it is not the hash the class claims use. Answers keep the Sydney day,
 * never the time, so they can't be matched to a tick by timestamp.
 *
 * The questions ask what happened in the lesson, never whether it was good; see
 * docs/mockups/lesson-footer-rail.html for the research behind the bank.
 */
import { createHash, randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { claimFor, classesForLesson, loadRoster } from './class-claims.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { listClassDone } from './profile-done.mjs';
import { read, reject, validToken } from './question-drop.mjs';

/** The bank. Every answer is an option to tap; order runs from the strongest to the weakest. */
export const END_QUESTIONS = [
  { id: 'clear_task', label: 'Clear task', prompt: 'Did you know what you were meant to be doing?', options: ['All the way through', 'Mostly', 'Some of the time', 'Hardly at all'] },
  { id: 'unstuck', label: 'Getting unstuck', prompt: 'When you got stuck, what happened?', options: ['I didn’t get stuck', 'I worked it out myself', 'I got help and kept going', 'I stayed stuck'] },
  { id: 'explain', label: 'Explain thinking', prompt: 'Did this lesson make you explain your thinking, not just give answers?', options: ['Yes, a lot', 'A bit', 'Not really'] },
  { id: 'checked', label: 'Checked before moving on', prompt: 'Did the lesson check whether you’d got it before moving on?', options: ['Yes, more than once', 'Once', 'Not that I noticed'] },
  { id: 'example', label: 'Worked example', prompt: 'Was there a worked example before you had to do it yourself?', options: ['Yes, and I used it', 'Yes, but I didn’t need it', 'No'] },
  { id: 'earlier', label: 'Earlier learning', prompt: 'Did this lesson bring back something from an earlier lesson?', options: ['Yes', 'No', 'Not sure'] }
];
export const UNCLEAR_PROMPT = 'Anything from this lesson still unclear?';
const BY_ID = new Map(END_QUESTIONS.map((q) => [q.id, q]));
/** Lesson types where the questions start off: an assessment or a quiz (weekly reviews) isn't a taught lesson. */
const OFF_BY_DEFAULT = new Set(['assessment', 'quiz']);
const PER_STUDENT = 2;
const UNCLEAR_MAX = 300;
const SYDNEY_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' });

const keys = (lesson) => ({
  counts: `end-questions/${lesson}/counts`,
  answers: (cls) => `end-questions/${lesson}/answers/${cls}/`,
  answer: (cls, id) => `end-questions/${lesson}/answers/${cls}/${id}`,
  given: (hash) => `end-questions/${lesson}/given/${hash}`
});
const givenHash = (lesson, token) => createHash('sha256').update(`end-questions:${lesson}:${token}`).digest('hex').slice(0, 32);

/**
 * What this lesson asks: on or off, the questions in its pool, and the box.
 * A lesson with fewer than two questions left in its pool asks nothing.
 */
export function endQuestionSettings(draft) {
  const saved = draft?.end_questions && typeof draft.end_questions === 'object' ? draft.end_questions : {};
  const on = typeof saved.on === 'boolean' ? saved.on : !OFF_BY_DEFAULT.has(draft?.pedagogical_mode);
  const skip = new Set(Array.isArray(saved.skip) ? saved.skip : []);
  const pool = END_QUESTIONS.map((q) => q.id).filter((id) => !skip.has(id));
  return { on: on && pool.length >= PER_STUDENT, pool, unclear: saved.unclear !== false };
}

/** The two questions this lesson has the fewest answers to, ties broken at random, in random order. */
export function pickQuestions(pool, counts, random = Math.random) {
  const ranked = pool.map((id) => ({ id, n: Number(counts?.[id]) || 0, r: random() })).sort((a, b) => a.n - b.n || a.r - b.r);
  const pair = ranked.slice(0, PER_STUDENT).map((x) => x.id);
  return random() < 0.5 ? pair : pair.reverse();
}

const publicQuestion = (id) => {
  const q = BY_ID.get(id);
  return { id: q.id, prompt: q.prompt, options: q.options };
};

async function loadLesson(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lesson not found.');
  const [draft, snapshot] = await Promise.all([read(store, draftLessonKey(lessonId)), read(store, publishedLessonKey(lessonId))]);
  if (!draft || isDeletedRecord(draft) || !snapshot) reject(404, 'not_found', 'Lesson not found.');
  return draft;
}

/** Student: `ask` for this device's questions, `send` the answers. */
export async function endQuestionsAction(store, lessonId, body, random = Math.random) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'ask';
  if (!['ask', 'send'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const draft = await loadLesson(store, lessonId);
  const settings = endQuestionSettings(draft);
  if (!settings.on) return { off: true };
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this lesson from your class page.');
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  // Only the class's own students answer; a class with no list can't tell anyone apart, so it isn't asked.
  if (!roster.students.length || !(await claimFor(store, roster, body.class_token))) return { off: true };
  const k = keys(lessonId);
  const given = k.given(givenHash(lessonId, body.class_token));
  if (await read(store, given)) return { given: true };

  if (action === 'ask') {
    const counts = (await read(store, k.counts)) ?? {};
    return { questions: pickQuestions(settings.pool, counts, random).map(publicQuestion), unclear: settings.unclear ? UNCLEAR_PROMPT : null };
  }

  const answers = {};
  const sent = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  for (const [id, option] of Object.entries(sent)) {
    const q = BY_ID.get(id);
    if (!q || !settings.pool.includes(id) || !Number.isInteger(option) || option < 0 || option >= q.options.length) continue;
    if (Object.keys(answers).length >= PER_STUDENT) break;
    answers[id] = option;
  }
  const unclear = settings.unclear && typeof body.unclear === 'string' ? body.unclear.trim().slice(0, UNCLEAR_MAX) : '';
  const day = SYDNEY_DAY.format(new Date());
  // Marked given first: a second send from this device finds it and stops.
  const marked = await store.setJSON(given, { day }, { onlyIfNew: true });
  if (marked?.modified === false) return { given: true };
  if (!Object.keys(answers).length && !unclear) return { given: true, saved: false };
  await store.setJSON(k.answer(roster.cls.id, randomBytes(9).toString('hex')), { answers, ...(unclear ? { unclear } : {}), day });
  // Only steers which questions come next, so a lost update between two sends costs nothing.
  const counts = (await read(store, k.counts)) ?? {};
  for (const id of Object.keys(answers)) counts[id] = (Number(counts[id]) || 0) + 1;
  await store.setJSON(k.counts, counts);
  return { given: true, saved: true };
}

/** A class's answers to this lesson. */
async function classAnswers(store, lessonId, classId) {
  const prefix = keys(lessonId).answers(classId);
  const rows = await mapBounded(await listBlobKeys(store, prefix), 8, (key) => read(store, key));
  return rows.filter(Boolean);
}

function tally(rows) {
  const questions = END_QUESTIONS.map((q) => {
    const counts = q.options.map(() => 0);
    for (const row of rows) {
      const option = row.answers?.[q.id];
      if (Number.isInteger(option) && option >= 0 && option < counts.length) counts[option] += 1;
    }
    return { id: q.id, label: q.label, prompt: q.prompt, options: q.options, counts, n: counts.reduce((a, b) => a + b, 0) };
  });
  const unclear = rows.map((r) => (typeof r.unclear === 'string' ? r.unclear : '')).filter(Boolean);
  return { questions, unclear, responses: rows.length };
}

/**
 * Teacher: this lesson's pooled answers, for every class it's taught to, and
 * the share of each class who ticked it finished.
 */
export async function endQuestionResults(store, lessonId) {
  const draft = await loadLesson(store, lessonId);
  const settings = endQuestionSettings(draft);
  const taught = await classesForLesson(store, lessonId);
  const classes = (await mapBounded(taught, 4, async ({ id: classId }) => {
    const roster = await loadRoster(store, classId);
    // A class with no list is never asked (see endQuestionsAction).
    if (!roster?.students.length) return null;
    const [rows, done] = await Promise.all([classAnswers(store, lessonId, classId), listClassDone(store, classId, roster.students.map((s) => s.id))]);
    const ticked = Object.values(done).filter((records) => records?.[lessonId] && !records[lessonId].partial).length;
    return { rows, summary: { class_id: classId, title: roster.cls.display_name || roster.cls.title || roster.cls.code || 'Class', students: roster.students.length, ticked, ...tally(rows) } };
  })).filter(Boolean);
  const all = tally(classes.flatMap((c) => c.rows));
  return {
    settings,
    bank: END_QUESTIONS.map(({ id, label, prompt }) => ({ id, label, prompt })),
    all: { ...all, students: classes.reduce((a, c) => a + c.summary.students, 0), ticked: classes.reduce((a, c) => a + c.summary.ticked, 0) },
    classes: classes.map((c) => c.summary)
  };
}
