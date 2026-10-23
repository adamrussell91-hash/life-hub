// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { InsightPayload } from '@/evidence/types';

vi.mock('@/api/client', () => ({
  apiPost: vi.fn(async () => ({
    published: true,
    version: 'v1',
    feedback: 'after',
    released: false,
    questions: [],
    attempts: []
  }))
}));
vi.mock('@/evidence/context', () => ({
  loadInsightContext: async () => ({ table: null, outcomes: [], skills: null, codes: [] }),
  codeLabel: (id: string) => id
}));

import { mountQuizPanel } from '@/quiz/teacher-panel';

const payload: InsightPayload = {
  lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', record_version: 'v1', class_id: 'c1', closed: false, closed_by: null, built_at: '', saved: false, confidence: false,
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }],
  questions: [{ id: 'q1', prompt: 'Spot it', marks: 1, kind: 'multiple_choice', outcomes: [] }],
  attempts: [
    { student: 's1', attempt_id: 's1~0', submitted_at: '2026-10-20T01:00:00Z', score: 1, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 1, max: 1, confidence: null, codes: [], outcomes: [], items: [{ item: 'q1', tags: ['out:X'], share: 1, why: [] }] }] }
  ],
  compare_with: null, follow_up_of: null, follow_up_flag: null, for_students: [], dismissed: [], follow_ups: [], siblings: []
} as InsightPayload;

describe('teacher results insights', () => {
  it('shows the insight section and Close now calls the insight api', async () => {
    sessionStorage.setItem('quiz-panel:tab', 'results');
    const close = vi.fn(async () => ({ ...payload, closed: true, closed_by: 'button' as const }));
    const handle = mountQuizPanel({
      getLesson: () => ({ id: 'l1' }) as never,
      onSettings: () => {},
      onAddBlocks: () => {},
      onRemoveBlock: () => {},
      idFactory: () => 'x',
      insightApi: {
        classes: async () => ({ classes: [{ id: 'c1', title: '10A' }] }),
        load: async () => payload,
        close,
        reopen: async () => payload,
        dismiss: async () => ({ dismissed: [] })
      }
    });
    document.body.append(handle.root);
    const closeNow = await vi.waitFor(() => {
      const b = [...handle.root.querySelectorAll('button')].find((n) => n.textContent === 'Close now');
      expect(b).toBeTruthy();
      return b as HTMLButtonElement;
    });
    closeNow.click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledWith('l1', 'c1'));
    handle.dispose();
  });
});
