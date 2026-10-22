// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const base = {
  version: 'v1',
  open: true,
  attempts_allowed: 1,
  attempts_used: 0,
  settings: { version: 'v1', question_count: 1, total_marks: 1, attempts: 1, feedback: 'end' },
  questions: [],
  live: false,
  current: null,
  results: []
};
let reply: Record<string, unknown> = base;
const apiPost = vi.fn(async () => reply);
vi.mock('@/api/client', () => ({
  apiPost: (...args: unknown[]) => (apiPost as unknown as (...a: unknown[]) => unknown)(...args),
  ApiClientError: class extends Error {}
}));

import { mountStudentQuiz } from '@/quiz/student-quiz';

const lesson = { lesson_id: 'l1', blocks: [], quiz: base.settings } as never;
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('student quiz identity', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k)
    });
    apiPost.mockClear();
    reply = base;
  });

  it('asks for the class page when there is no class', async () => {
    reply = { ...base, identity: { need: 'class', initials: null } };
    const root = mountStudentQuiz(lesson);
    await settle();
    expect(root.textContent).toContain('Open this quiz from your class page.');
  });

  it('a plain link with one class goes straight to initials for that class', async () => {
    apiPost.mockImplementation(async (_url: string, body: Record<string, unknown>) =>
      body.class_id ? { ...base, identity: { need: 'initials', initials: null } } : { ...base, identity: { need: 'class', initials: null, classes: [{ id: 'c1', title: '12 English' }] } }
    );
    const root = mountStudentQuiz(lesson);
    await settle();
    expect(root.querySelector('.qz-initials__input')).toBeTruthy();
    expect(localStorage.getItem('quiz-class:l1')).toBe('"c1"');
    apiPost.mockImplementation(async () => reply);
  });

  it('a plain link with several classes asks which, then uses it', async () => {
    apiPost.mockImplementation(async (_url: string, body: Record<string, unknown>) =>
      body.class_id === 'c2'
        ? { ...base, identity: { need: 'initials', initials: null } }
        : { ...base, identity: { need: 'class', initials: null, classes: [{ id: 'c1', title: '12 English A' }, { id: 'c2', title: '12 English B' }] } }
    );
    const root = mountStudentQuiz(lesson);
    await settle();
    expect(root.textContent).toContain('Which class are you in?');
    [...root.querySelectorAll<HTMLButtonElement>('.qz-class-pick .btn')].find((b) => b.textContent === '12 English B')!.click();
    await settle();
    expect(root.querySelector('.qz-initials__input')).toBeTruthy();
    apiPost.mockImplementation(async () => reply);
  });

  it('the teacher’s focus view never picks a class', async () => {
    reply = { ...base, identity: { need: 'class', initials: null, classes: [{ id: 'c1', title: '12 English' }] } };
    const root = mountStudentQuiz(lesson, { pickClass: false });
    await settle();
    expect(root.textContent).toContain('Open this quiz from your class page.');
    expect(apiPost.mock.calls.every((c) => !(c[1] as Record<string, unknown>).class_id)).toBe(true);
  });

  it('shows an initials box and claims with the class fields', async () => {
    reply = { ...base, identity: { need: 'initials', initials: null } };
    const root = mountStudentQuiz(lesson, { classId: 'c1' });
    await settle();
    const input = root.querySelector<HTMLInputElement>('.qz-initials__input');
    expect(input).toBeTruthy();
    input!.value = 'BB';
    reply = { ...base, identity: { need: null, initials: 'BB' } };
    root.querySelector<HTMLButtonElement>('.qz-initials .btn')!.click();
    await settle();
    const claim = apiPost.mock.calls.map((c) => c[1] as Record<string, unknown>).find((b) => b.action === 'claim');
    expect(claim).toMatchObject({ action: 'claim', initials: 'BB', class_id: 'c1' });
    expect(typeof claim?.class_token).toBe('string');
    expect(root.textContent).toContain('Quizzing as BB');
  });

  it('says who is quizzing once initials are known', async () => {
    reply = { ...base, identity: { need: null, initials: 'BB' } };
    const root = mountStudentQuiz(lesson, { classId: 'c1' });
    await settle();
    expect(root.textContent).toContain('Quizzing as BB');
  });
});
