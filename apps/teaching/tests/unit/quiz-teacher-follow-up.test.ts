// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { InsightPayload } from '@/evidence/types';

vi.mock('@/api/client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiPost: vi.fn(async () => ({ published: true, version: 'v1', feedback: 'after', released: false, questions: [], attempts: [] }))
}));
vi.mock('@/evidence/context', () => ({
  loadInsightContext: async () => ({ table: null, outcomes: [], skills: null, codes: [] }),
  codeLabel: (id: string) => id
}));
const openFollowUpPlan = vi.fn();
vi.mock('@/evidence/follow-up', () => ({ openFollowUpPlan: (o: unknown) => openFollowUpPlan(o) }));

import { mountQuizPanel } from '@/quiz/teacher-panel';

const row = (id: string, awarded: number, confidence: 1 | 2 | 3 | null) =>
  ({ id, awarded, max: 1, confidence, codes: [], outcomes: [], items: [{ item: id, tags: ['tech:~juxtaposition'], share: awarded, why: [] }] });
const attempt = (student: string, rows: ReturnType<typeof row>[]) => ({
  student, attempt_id: `${student}~0`, submitted_at: '2026-10-20T01:00:00Z', score: rows.reduce((s, r) => s + r.awarded, 0), max: rows.length, pending: 0, rows
});
const payload: InsightPayload = {
  lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', record_version: 'v1', class_id: 'c1', closed: false, closed_by: null, built_at: '', saved: false, confidence: true,
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }, { id: 's2', name: 'Bo Birch', initials: 'BB' }, { id: 's3', name: 'Cy Cole', initials: 'CC' }],
  questions: [{ id: 'q1', prompt: 'Spot it', marks: 1, kind: 'quote_technique', outcomes: [] }, { id: 'q2', prompt: 'Name it', marks: 1, kind: 'quote_technique', outcomes: [] }],
  attempts: [
    attempt('s1', [row('q1', 0, 3), row('q2', 0, 3)]),
    attempt('s2', [row('q1', 0, 3), row('q2', 1, 2)]),
    attempt('s3', [row('q1', 1, 1), row('q2', 1, 1)])
  ],
  compare_with: null, follow_up_of: null, follow_up_flag: null, for_students: [], dismissed: [], follow_ups: [], siblings: []
};

function mount(p: InsightPayload = payload) {
  sessionStorage.setItem('quiz-panel:tab', 'results');
  const handle = mountQuizPanel({
    getLesson: () => ({ id: 'l1' }) as never,
    onSettings: () => {},
    onAddBlocks: () => {},
    onRemoveBlock: () => {},
    idFactory: () => 'x',
    insightApi: {
      classes: async () => ({ classes: [{ id: 'c1', title: '10A' }] }),
      load: async () => p,
      close: async () => payload,
      reopen: async () => payload,
      dismiss: async () => ({ dismissed: [] })
    }
  });
  document.body.append(handle.root);
  return handle;
}

const followButtons = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent === 'Ann drafts follow-up quiz');

describe('follow-up from a quiz flag', () => {
  it('opens the plan sheet for the flag, with its students ticked', async () => {
    openFollowUpPlan.mockClear();
    const handle = mount();
    const sure = await vi.waitFor(() => {
      const b = followButtons(handle.root).find((n) => n.getAttribute('aria-label')?.includes('Sure but wrong'));
      expect(b).toBeTruthy();
      return b!;
    });
    sure.click();
    expect(openFollowUpPlan).toHaveBeenCalledTimes(1);
    const o = openFollowUpPlan.mock.calls[0][0];
    expect(o).toMatchObject({
      sourceLessonId: 'l1',
      sourceTitle: 'Pre-test',
      unitId: 'u1',
      flagId: 'sure_wrong:tech:~juxtaposition',
      tag: 'tech:~juxtaposition',
      chosen: ['s1', 's2'],
      students: payload.students
    });
    expect(o.evidence.length).toBeGreaterThan(0);
    expect(o.label('tech:~juxtaposition')).toBe('Juxtaposition');
    handle.dispose();
  });

  it('ticks everyone for a flag that names no students', async () => {
    openFollowUpPlan.mockClear();
    // One question on the tag: a "tested once" flag, which names no students.
    const once = { ...payload, questions: payload.questions.slice(0, 1), attempts: payload.attempts.map((a) => ({ ...a, rows: a.rows.slice(0, 1) })) };
    const handle = mount(once);
    const thin = await vi.waitFor(() => {
      const b = followButtons(handle.root).find((n) => n.getAttribute('aria-label')?.includes('tested once'));
      expect(b).toBeTruthy();
      return b!;
    });
    thin.click();
    const o = openFollowUpPlan.mock.calls[0][0];
    expect(o.flagId).toMatch(/^thin:/);
    expect(o.chosen).toEqual(['s1', 's2', 's3']);
    handle.dispose();
  });
});
