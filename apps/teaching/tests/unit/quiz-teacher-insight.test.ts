// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { InsightPayload } from '@/evidence/types';

vi.mock('@/api/client', () => ({
  ApiClientError: class ApiClientError extends Error {},
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

  it('keeps the closed state when a slower poll reply lands after Close now', async () => {
    sessionStorage.setItem('quiz-panel:tab', 'results');
    let calls = 0;
    let releasePoll: (p: InsightPayload) => void = () => {};
    const load = vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(payload);
      return new Promise<InsightPayload>((resolve) => (releasePoll = resolve));
    });
    const handle = mountQuizPanel({
      getLesson: () => ({ id: 'l1' }) as never,
      onSettings: () => {},
      onAddBlocks: () => {},
      onRemoveBlock: () => {},
      idFactory: () => 'x',
      insightApi: {
        classes: async () => ({ classes: [{ id: 'c1', title: '10A' }] }),
        load,
        close: async () => ({ ...payload, closed: true, closed_by: 'button' as const }),
        reopen: async () => payload,
        dismiss: async () => ({ dismissed: [] })
      }
    });
    document.body.append(handle.root);
    const buttonNamed = (name: string) => [...handle.root.querySelectorAll('button')].find((n) => n.textContent === name) as HTMLButtonElement | undefined;
    await vi.waitFor(() => expect(buttonNamed('Close now')).toBeTruthy());
    // Start a poll (re-selecting the tab refreshes) whose insight reply hangs.
    buttonNamed('Results')!.click();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    buttonNamed('Close now')!.click();
    await vi.waitFor(() => expect(buttonNamed('Reopen')).toBeTruthy());
    releasePoll(payload); // the stale reply still says open
    await new Promise((r) => setTimeout(r, 20));
    expect(buttonNamed('Reopen')).toBeTruthy();
    expect(buttonNamed('Close now')).toBeUndefined();
    handle.dispose();
  });

  it('falls back to every class once when the class list fails', async () => {
    sessionStorage.setItem('quiz-panel:tab', 'results');
    const classes = vi.fn(async () => {
      throw new Error('classes down');
    });
    const load = vi.fn(async () => payload);
    const handle = mountQuizPanel({
      getLesson: () => ({ id: 'l1' }) as never,
      onSettings: () => {},
      onAddBlocks: () => {},
      onRemoveBlock: () => {},
      idFactory: () => 'x',
      insightApi: { classes, load, close: async () => payload, reopen: async () => payload, dismiss: async () => ({ dismissed: [] }) }
    });
    document.body.append(handle.root);
    await vi.waitFor(() => expect([...handle.root.querySelectorAll('button')].some((n) => n.textContent === 'Close now')).toBe(true));
    expect(load).toHaveBeenCalledWith('l1', null);
    const alert = handle.root.querySelector('.qz-alert') as HTMLElement;
    expect(alert.hidden).toBe(false);
    // Another refresh does not ask for classes again.
    ([...handle.root.querySelectorAll('button')].find((n) => n.textContent === 'Results') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(classes).toHaveBeenCalledTimes(1);
    handle.dispose();
  });
});
