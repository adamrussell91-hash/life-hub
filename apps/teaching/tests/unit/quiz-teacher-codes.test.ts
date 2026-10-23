// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { InsightPayload } from '@/evidence/types';

const row = (awarded: number | null, codes: string[]) => ({
  id: 'q1',
  mark: { score: awarded, max: 2, correct: awarded === 2 },
  awarded,
  hinted: false,
  response: { type: 'text', text: 'Because it is.' },
  confidence: null,
  question: { id: 'q1', kind: 'short_answer', prompt: 'Why?', marks: 2, has_hint: false },
  key: { id: 'q1', kind: 'short_answer', marks: 2, answer: { type: 'text', accepted: ['because'], case_sensitive: false } },
  codes
});
const detail = (codes: string[]) => ({
  student: { initials: 'AA', name: 'Ada Ash' }, id: 'att1', device: 'd1', n: 0, submitted_at: '2026-10-20T01:00:00Z', overtime: false, score: 1, max: 2, pending: 0, rows: [row(1, codes)]
});

const calls: Array<Record<string, unknown>> = [];
vi.mock('@/api/client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiPost: vi.fn(async (_endpoint: string, body: Record<string, unknown>) => {
    calls.push(body);
    if (body.action === 'attempt') return { attempt: detail([]) };
    if (body.action === 'mark') return { attempt: detail(body.codes as string[]) };
    return {
      published: true, version: 'v1', feedback: 'after', released: false, questions: [],
      attempts: [{ student: { initials: 'AA', name: 'Ada Ash' }, id: 'att1', device: 'd1', n: 0, go: 0, submitted_at: '2026-10-20T01:00:00Z', overtime: false, score: 1, max: 2, pending: 0, current: true }]
    };
  })
}));
vi.mock('@/evidence/context', () => ({
  loadInsightContext: async () => ({
    table: null, outcomes: [], skills: null,
    codes: [{ id: 'e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'sage', descriptor: 'Link evidence.' }]
  }),
  codeLabel: (id: string) => id
}));

import { mountQuizPanel } from '@/quiz/teacher-panel';

const payload = {
  lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', record_version: 'v1', class_id: 'c1', closed: false, closed_by: null, built_at: '', saved: false, confidence: false,
  students: [], questions: [], attempts: [],
  compare_with: null, follow_up_of: null, follow_up_flag: null, for_students: [], dismissed: [], follow_ups: [], siblings: []
} as unknown as InsightPayload;

describe('teacher attempt view feedback codes', () => {
  it('offers code chips on an answer below full marks and saves them with the mark', async () => {
    sessionStorage.setItem('quiz-panel:tab', 'results');
    const handle = mountQuizPanel({
      getLesson: () => ({ id: 'l1' }) as never,
      onSettings: () => {},
      onAddBlocks: () => {},
      onRemoveBlock: () => {},
      idFactory: () => 'x',
      insightApi: {
        classes: async () => ({ classes: [{ id: 'c1', title: '10A' }] }),
        load: async () => payload,
        close: async () => payload,
        reopen: async () => payload,
        dismiss: async () => ({ dismissed: [] })
      }
    });
    document.body.append(handle.root);
    // Wait for the insight context, then open the attempt.
    await vi.waitFor(() => expect(handle.root.querySelector('.ev-insight, .qz-attempt')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 0));
    handle.root.querySelector<HTMLButtonElement>('button.qz-attempt')!.click();
    const chip = await vi.waitFor(() => {
      const b = handle.root.querySelector<HTMLButtonElement>('.qz-attempt-row .ev-chip');
      expect(b).toBeTruthy();
      return b!;
    });
    chip.click();
    await vi.waitFor(() => expect(calls.find((c) => c.action === 'mark')).toEqual({ action: 'mark', attempt_id: 'att1', question_id: 'q1', score: 1, codes: ['e'] }));
    handle.dispose();
  });
});
