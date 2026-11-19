// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { LAB_CLASS_ID, LAB_WALKS, type LabWalkId } from '../../scripts/mock-lab-class';
import { labColumn } from '../../src/lab/after';

const seed = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/seed.json'), 'utf-8')) as SeedData;
const PASSPHRASE = 'teaching-hub-local';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The mock API as the dev preview builds it: the walkable labs are seeded outside test runs only. */
function previewApi() {
  const flag = process.env.VITEST;
  delete process.env.VITEST;
  try {
    return createMockApi({ seed: JSON.parse(JSON.stringify(seed)) as SeedData, passphrase: PASSPHRASE });
  } finally {
    process.env.VITEST = flag;
  }
}

// The dev preview's three labs, walked through the mock API's own routes as the board and one student's device do.
describe('lab routes (mock): each walkable lab from Start to After class', () => {
  for (const lessonId of Object.keys(LAB_WALKS) as LabWalkId[]) {
    it(`${LAB_WALKS[lessonId].lab.level}: the round runs, explanations are handed in, and one opens for marking with its lab record`, async () => {
      const api = previewApi();
      const cookie = (await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } })).headers.get('set-cookie') as string;
      const post = async (path: string, body: Json, signedIn = true): Promise<Json> => {
        const response = await api.request('POST', path, { ...(signedIn ? { cookie } : {}), body });
        const json = (await response.json()) as Json;
        expect(response.status, `${path} ${JSON.stringify(body).slice(0, 80)} → ${JSON.stringify(json).slice(0, 200)}`).toBe(200);
        return (json.data ?? json) as Json;
      };
      const teacher = (action: string, extra: Json = {}) => post(`/api/lessons/${lessonId}/lab`, { action, ...extra });
      const kt = { class_id: LAB_CLASS_ID, class_token: 'f'.repeat(48) };
      const student = (action: string, extra: Json = {}) => post(`/api/published/lab/${lessonId}`, { ...kt, action, ...extra }, false);

      // The board saves the explanations' column, then starts the round; the invented class joins.
      const column = labColumn({ id: lessonId, title: LAB_WALKS[lessonId].title }, 'labcolumn001', '2026-11-19');
      await post(`/api/classes/${LAB_CLASS_ID}/markbook`, { action: 'save_column', column });
      let board = await teacher('start');
      const session = board.round.session as string;
      await student('claim', { initials: 'KT' });
      expect((await teacher('board')).counts.here).toBe(16);

      const seen: Record<string, Json> = {};
      while (!board.round.finished) {
        seen[board.round.step_name] = board;
        board = await teacher('next', { session, step: board.round.step + 1 });
      }
      if (lessonId === 'lesson_lab_hesitant') {
        expect(seen['Name it']!.findings.trials.length).toBe(5);
        expect(board.levels.map((g: Json) => [g.level, g.trials])).toEqual([['Sentence', 3], ['Form', 2], ['Word', 0]]);
      } else {
        expect(board.results.readers).toBeGreaterThan(10);
      }

      const after = await teacher('after', { session });
      const handed = after.students.filter((s: Json) => s.handed_in_at);
      expect(handed.length).toBe(7);
      const queue = await api.request('GET', '/api/to-mark', { cookie });
      const tasks = ((await queue.json()) as Json);
      expect(JSON.stringify(tasks)).toContain('labcolumn001');
      const piece = await post(`/api/classes/${LAB_CLASS_ID}/pieces`, { column_id: 'labcolumn001', action: 'load', student_id: handed[0].student_id });
      expect(piece.column.piece).toEqual({ lesson_id: lessonId, block_id: 'lab_explain' });
      expect(Object.values(piece.text.answers as Json)[0]).toContain(' ');
      const record = await teacher('student', { student_id: handed[0].student_id });
      expect(record.lab.notes_on).toBe(lessonId === 'lesson_lab_hesitant');
      expect(Object.keys(record.record.notes).length).toBeGreaterThan(0);
    });
  }
});
