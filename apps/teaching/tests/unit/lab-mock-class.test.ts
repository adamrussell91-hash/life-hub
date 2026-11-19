import { describe, expect, it } from 'vitest';
import { LAB_CLASS_ID, LAB_ROSTER, LAB_WALKS, labClassAct, labClassJoin, type LabWalkId } from '../../scripts/mock-lab-class';
import { labAction, labTeacherAction, prepareLabPublish } from '../../../../netlify/functions/_shared/lab.mjs';
import { labKeys } from '../../../../netlify/functions/_shared/lab-keys.mjs';
import { markbookAction } from '../../../../netlify/functions/_shared/markbook.mjs';
import { toMarkQueue } from '../../../../netlify/functions/_shared/to-mark.mjs';
import { labColumn } from '@/lab/after';
import { classKey, draftLessonKey, publishedLessonKey } from '../../../../netlify/functions/_shared/teaching-blobs.mjs';
import { memoryStore } from '../../../../tests/unit/helpers/lab-store.js';

// The dev preview's invented class, run against the real lab functions: each level from Start to the finish.

const stamp = '2026-11-19T00:00:00.000Z';
function storeFor(lessonId: LabWalkId) {
  const walk = LAB_WALKS[lessonId];
  const draft = { id: lessonId, type: 'lesson', title: walk.title, unit_id: 'unit1', pedagogical_mode: 'lab', lab: walk.lab, blocks: [], status: 'active', created_at: stamp, updated_at: stamp, schema_version: 1 };
  const pub = prepareLabPublish(draft);
  expect(pub.problems).toEqual([]);
  return memoryStore([
    [classKey(LAB_CLASS_ID), { id: LAB_CLASS_ID, type: 'class', status: 'active', title: '12 Lab', students: LAB_ROSTER.map((s) => ({ id: s.id, name: s.name })) }],
    [draftLessonKey(lessonId), { ...draft, blocks: pub.draftBlocks, published_at: stamp }],
    [publishedLessonKey(lessonId), { lesson_id: lessonId, title: walk.title, unit_id: 'unit1', blocks: pub.blocks, published_at: stamp, schema_version: 1, pedagogical_mode: 'lab', lab: pub.snapshot }],
    [labKeys(lessonId).config, pub.config]
  ]);
}
type Board = Awaited<ReturnType<typeof labTeacherAction>>;
/** The walker's own device: KT, the first student. */
const walker = (store: unknown, lessonId: string, action: string, extra: Record<string, unknown> = {}) =>
  labAction(store, lessonId, { class_id: LAB_CLASS_ID, class_token: 'f'.repeat(48), action, ...extra });

/** Start the lab, then press Next through every step as the mock API does: the class finishes the step first. */
async function run(lessonId: LabWalkId, atStep: (name: string, store: ReturnType<typeof memoryStore>) => Promise<void> = async () => undefined) {
  const store = storeFor(lessonId);
  // The board saves the explanations' column before it starts the round.
  await markbookAction(store, LAB_CLASS_ID, { action: 'save_column', column: labColumn({ id: lessonId, title: LAB_WALKS[lessonId].title }, 'labcolumn001', '2026-11-19') });
  let board: Board = await labTeacherAction(store, lessonId, { action: 'start' });
  await labClassJoin(store, lessonId);
  await walker(store, lessonId, 'claim', { initials: 'KT' });
  const seen: Record<string, Board> = {};
  while (!board.round.finished) {
    await atStep(board.round.step_name, store);
    await labClassAct(store, lessonId);
    seen[board.round.step_name] = await labTeacherAction(store, lessonId, { action: 'board' });
    board = await labTeacherAction(store, lessonId, { action: 'next', step: board.round.step + 1 });
    if (board.round.step_name) seen[`at ${board.round.step_name}`] = board;
  }
  return { store, seen, board };
}

describe('the dev preview’s invented lab class', () => {
  it('joins with initials: fifteen classmates beside the two students the walker plays', async () => {
    const store = storeFor('lesson_lab_passive');
    await labTeacherAction(store, 'lesson_lab_passive', { action: 'start' });
    await labClassJoin(store, 'lesson_lab_passive');
    const board = await labTeacherAction(store, 'lesson_lab_passive', { action: 'board' });
    expect(board.counts).toEqual({ here: 15, done: 15, total: 17 });
  });

  it('You supply it: the class predicts and rates, and the passive paragraph draws less blame', async () => {
    const { seen, board } = await run('lesson_lab_passive');
    expect(seen.Predict!.counts.done).toBe(15);
    expect(seen.Test!.counts.done).toBe(15);
    const result = seen['at Result']!.results;
    expect(result.readers).toBe(15);
    expect(result.top).toBe(0);
    expect(result.win).toBe(true);
    expect(board.round.finished).toBe(true);
  });

  it('Students write it: the class writes, each reads six writers, and a piece is most chosen', async () => {
    const { seen } = await run('lesson_lab_storm', async (name, store) => {
      // The walker writes too, so their writing is dealt and their own counts come back.
      if (name === 'Make') for (let option = 0; option < 3; option += 1) await walker(store, 'lesson_lab_storm', 'write', { option, text: `KT version ${option + 1}` });
    });
    expect(seen.Make!.counts.done).toBe(16);
    const result = seen['at Result']!.results;
    expect(result.values.reduce((a: number, b: number) => a + b, 0)).toBe(15 * 6);
    expect(result.top).toBe(1);
    expect(seen['at Result']!.best.chosen).toBeGreaterThan(0);
    expect(seen['at Result']!.held).toEqual([]);
  });

  it('Pairs design it: five pairs run trials, the walker’s pairs and pair 8 have none, and the findings come back', async () => {
    const { seen, store } = await run('lesson_lab_hesitant');
    expect(seen.Design!.pairs).toEqual({ total: 8, changed: 5, ready: 5, predicted: 0, named: 0 });
    expect(seen.Predict!.pairs.predicted).toBe(5);
    expect(seen.Test!.findings).toBeNull();
    const found = seen['at Result']!.findings;
    expect(found.trials.map((t: { pair: string }) => t.pair)).toEqual(['p3', 'p4', 'p5', 'p6', 'p7']);
    expect(found.control.n).toBe(30);
    expect(found.trials.every((t: { n: number }) => t.n >= 4)).toBe(true);
    // Cutting the hedge and closing the question make the speaker sound less hesitant; the extra break, more.
    const shift = Object.fromEntries(found.trials.map((t: { pair: string; shift: number }) => [t.pair, t.shift]));
    expect(shift.p3).toBeLessThan(-1);
    expect(shift.p5).toBeLessThan(-1);
    expect(shift.p7).toBeGreaterThan(0);
    // The class writes its lab notes as it goes, so every gated step went through; then each pair names its feature.
    expect(seen['Name it']!.pairs.named).toBe(5);
    expect(seen['Name it']!.levels.map((g: { level: string; trials: number }) => [g.level, g.trials])).toEqual([['Sentence', 3], ['Form', 2], ['Word', 0]]);
    // The walker, in pair 1 with nothing on the bench, gets the class findings.
    const mine = await walker(store, 'lesson_lab_hesitant', 'status');
    expect(mine.round.finished).toBe(true);
    expect(mine.findings.mine).toBeNull();
    expect(mine.findings.trials.length).toBe(5);
  });

  it('every level ends with explanations handed in: After class lists them and they wait in To mark', async () => {
    for (const lessonId of Object.keys(LAB_WALKS) as LabWalkId[]) {
      const { store, board } = await run(lessonId);
      expect(board.explained).toBe(7);
      const after = await labTeacherAction(store, lessonId, { action: 'after', session: board.round.session });
      const handed = after.students.filter((s: { handed_in_at: string | null }) => s.handed_in_at);
      expect(handed.length).toBe(7);
      expect(handed.every((s: { explanation: string; initials: string }) => s.explanation.length > 20 && s.initials.length === 2)).toBe(true);
      const queue = await toMarkQueue(store, { now: () => Date.now() });
      expect(queue.tasks.map((t: { column_id: string; waiting: number }) => [t.column_id, t.waiting])).toEqual([['labcolumn001', 7]]);
      // Marking one of them: the record the marking view reads has the student's notes when the lab keeps them.
      const record = await labTeacherAction(store, lessonId, { action: 'student', student_id: handed[0].student_id });
      expect(record.lab.level).toBe(LAB_WALKS[lessonId].lab.level);
      if (lessonId === 'lesson_lab_hesitant') expect(Object.keys(record.record.notes)).toEqual(expect.arrayContaining(['Question', 'Test', 'Result']));
    }
  });
});
