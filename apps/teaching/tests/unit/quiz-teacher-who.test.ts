// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const attempt = (id: string, device: string, student: unknown) => ({
  id,
  device,
  n: 0,
  submitted_at: new Date().toISOString(),
  overtime: false,
  score: 1,
  max: 2,
  pending: 0,
  current: true,
  student
});

vi.mock('@/api/client', () => ({
  apiPost: vi.fn(async () => ({
    published: true,
    version: 'v1',
    feedback: 'after',
    released: false,
    questions: [],
    attempts: [
      attempt('a1', 'dev-1', null),
      attempt('a2', 'dev-2', { initials: 'BB', name: 'Bob Brown' }),
      attempt('a3', 'dev-3', { initials: null, name: null }),
      attempt('a4', 'dev-4', null)
    ]
  }))
}));

import { mountQuizPanel } from '@/quiz/teacher-panel';

describe('teacher results attempt labels', () => {
  it('names known students, flags removed ones, keeps anonymous letters', async () => {
    sessionStorage.setItem('quiz-panel:tab', 'results');
    const handle = mountQuizPanel({
      getLesson: () => ({ id: 'l1' }) as never,
      onSettings: () => {},
      onAddBlocks: () => {},
      onRemoveBlock: () => {},
      idFactory: () => 'x'
    });
    document.body.append(handle.root);
    await vi.waitFor(() => expect(handle.root.querySelectorAll('.qz-attempt__who').length).toBe(4));
    const who = [...handle.root.querySelectorAll('.qz-attempt__who')].map((n) => n.textContent ?? '');
    expect(who[0]).toBe('Student A');
    expect(who[1].startsWith('BB · Bob Brown')).toBe(true);
    expect(who[2]).toBe('Removed student');
    expect(who[3]).toBe('Student B');
    handle.dispose();
  });
});
