// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const question = { id: 'q1', type: 'true_false', prompt: 'The Moon orbits the Earth.', marks: 1 };
const base = {
  version: 'v1',
  open: true,
  attempts_allowed: 1,
  attempts_used: 0,
  settings: { version: 'v1', question_count: 1, total_marks: 1, attempts: 1, feedback: 'end' },
  questions: [question],
  live: false,
  identity: { need: null, initials: 'AB' },
  current: null,
  results: []
};
let running = false;
const apiPost = vi.fn(async (_url: string, body: Record<string, unknown>) => {
  if (body.action === 'live_status') return { live: running ? { session: 's1', phase: 'lobby', index: -1, total: 1, joined: false } : null };
  return { ...base, live: running };
});
vi.mock('@/api/client', () => ({
  apiPost: (...args: unknown[]) => (apiPost as unknown as (...a: unknown[]) => unknown)(...args),
  ApiClientError: class extends Error {}
}));

import { mountStudentQuiz } from '@/quiz/student-quiz';

const lesson = { lesson_id: 'l1', blocks: [], quiz: base.settings } as never;
const settle = () => new Promise((r) => setTimeout(r, 20));
const startButton = (root: HTMLElement) => [...root.querySelectorAll('button')].find((b) => /Start the quiz/.test(b.textContent ?? ''));

describe('student quiz: one way in at a time', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k)
    });
    running = false;
  });

  it('with no live round, students start the quiz at their own pace', async () => {
    const root = mountStudentQuiz(lesson, { classId: 'c1' });
    await settle();
    expect(startButton(root)).toBeTruthy();
    expect(root.querySelector('.qz-code-input')).toBeNull();
  });

  it('while the teacher runs it live, students see only the join box, and the start comes back when it ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      running = true;
      const root = document.body.appendChild(mountStudentQuiz(lesson, { classId: 'c1' }));
      await vi.advanceTimersByTimeAsync(20);
      expect(root.querySelector('.qz-code-input')).toBeTruthy();
      expect(startButton(root)).toBeUndefined();

      running = false;
      // The next live poll finds the round over.
      await vi.advanceTimersByTimeAsync(3000);
      expect(root.querySelector('.qz-code-input')).toBeNull();
      expect(startButton(root)).toBeTruthy();
      root.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
