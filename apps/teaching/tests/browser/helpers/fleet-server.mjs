// The real Fleet week server, in the Playwright process: the student and teacher
// game actions over one in-memory store, with a clock the test controls. The
// browser spec routes /api/published/game/:lesson and /api/lessons/:lesson/game
// here, so a whole lesson-mode game plays through the same code as production.
// Everything is invented: a class of four made-up students and the fixture grid.
import { classKey, draftLessonKey, publishedLessonKey } from '../../../../../netlify/functions/_shared/teaching-blobs.mjs';
import { gameStudentAction, prepareGamePublish, storeGameKeys } from '../../../../../netlify/functions/_shared/games.mjs';
import { fleetTeacherAction, isFleetTeacherAction } from '../../../../../netlify/functions/_shared/fleet-week-teacher.mjs';
import { memoryStore } from '../../../../../tests/unit/helpers/lab-store.js';
import { fleetGame } from '../../../../../tests/unit/helpers/fleet-fixture.mjs';

export const LESSON_ID = 'fw_lesson';
export const CLASS_ID = 'class_fw';
export const NAMES = ['Pim Arlow', 'Quin Bexley', 'Rory Cask', 'Sasha Dunmore'];
export const ROSTER = NAMES.map((name, i) => ({ id: `st_fw${i + 1}`, name, initials: name.split(' ').map((w) => w[0]).join('') }));

/** Accepted answers as stored: "Mast A3" (a student types "mast a3"), recall "Line 2". */
export const KEY_PATTERN = /Mast [AB]\d+|Line \d/;

export async function fleetServer() {
  const store = memoryStore();
  const clock = { frozen: null, offset: 0 };
  const now = () => clock.frozen ?? Date.now() + clock.offset;
  store.data.set(classKey(CLASS_ID), { id: CLASS_ID, status: 'active', title: 'Year 8 English', students: ROSTER });
  const draft = {
    id: LESSON_ID, type: 'lesson', title: 'Harbour week', unit_id: 'unit1', pedagogical_mode: 'game', status: 'active',
    blocks: [], game: { games: [fleetGame({ settings: { rounds: 2, round_cap_s: 240, placement_cap_s: 120, answer_s: 60 } })] }
  };
  store.data.set(draftLessonKey(LESSON_ID), draft);
  const pub = prepareGamePublish(draft);
  if (pub.problems.length) throw new Error(`fleet game can't publish: ${pub.problems[0]}`);
  const published = {
    lesson_id: LESSON_ID, title: 'Harbour week', unit_id: 'unit1', blocks: [], published_at: '2026-11-19T00:00:00.000Z',
    schema_version: 1, pedagogical_mode: 'game', game: pub.snapshot
  };
  store.data.set(publishedLessonKey(LESSON_ID), published);
  await storeGameKeys(store, LESSON_ID, pub.record);

  /** Runs one action as the Function would and answers with the API envelope. */
  async function run(fn) {
    try {
      return { status: 200, body: { ok: true, data: await fn() } };
    } catch (e) {
      if (e && typeof e.status === 'number' && typeof e.code === 'string') return { status: e.status, body: { ok: false, error: { code: e.code, message: e.message, retryable: false } } };
      if (e instanceof SyntaxError) return { status: 400, body: { ok: false, error: { code: 'bad_request', message: 'Invalid request.', retryable: false } } };
      throw e;
    }
  }
  return {
    store,
    clock,
    now,
    draft,
    published,
    student: (body) => run(() => gameStudentAction(store, LESSON_ID, body, { now: now() })),
    teacher: (body) => run(() => (isFleetTeacherAction(body?.action) ? fleetTeacherAction(store, LESSON_ID, body, { now: now() }) : Promise.reject(Object.assign(new Error('Not in this test.'), { status: 400, code: 'bad_action' }))))
  };
}
