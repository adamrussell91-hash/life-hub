// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const q1 = { id: 'block_q1', kind: 'true_false', prompt: 'The Moon orbits the Earth.', marks: 1 };
const q2 = { id: 'block_q2', kind: 'short_answer', prompt: 'Name the red planet.', marks: 2 };
const settings = { version: 'v1', question_count: 2, total_marks: 3, attempts: 1, feedback: 'end' };
const base = {
  version: 'v1',
  open: true,
  attempts_allowed: 1,
  attempts_used: 0,
  settings,
  questions: [q1, q2],
  live: false,
  identity: { need: null, initials: 'AB' },
  current: null as unknown,
  results: [] as unknown[]
};
const current = { n: 1, version: 'v1', settings, questions: [q1, q2], started_at: '2026-10-29T00:00:00.000Z', deadline: null, hints: {}, answers: {} };
let state = { ...base };
const apiPost = vi.fn(async (_url: string, body: Record<string, unknown>) => {
  if (body.action === 'live_status') return { live: null };
  if (body.action === 'claim') state = { ...base, identity: { need: null, initials: String(body.initials) } };
  if (body.action === 'start') state = { ...base, current };
  if (body.action === 'submit') state = { ...base, attempts_used: 1, current: null, results: [{ n: 1, submitted_at: '2026-10-29T00:05:00.000Z', released: false }] };
  return state;
});
vi.mock('@/api/client', () => ({
  apiPost: (...args: unknown[]) => (apiPost as unknown as (...a: unknown[]) => unknown)(...args),
  ApiClientError: class extends Error {}
}));

import { hasNestedQuizQuestion, mountStudentQuiz } from '@/quiz/student-quiz';
import { renderQuizQuestion } from '@/blocks/quiz-question';

const quizBlock = (q: typeof q1 | typeof q2) => ({ id: q.id, type: 'block', block_type: 'quiz_question', content: { question: q } });
const section = (blocks: unknown[]) => ({ id: 's1', type: 'block', block_type: 'section', content: { title: 'Part', blocks } });
const columns = (left: unknown[], right: unknown[]) => ({
  id: 'c1',
  type: 'block',
  block_type: 'columns',
  content: { preset: '50-50', columns: [{ width: 6, blocks: left }, { width: 6, blocks: right }] }
});
const lesson = { lesson_id: 'l1', blocks: [section([columns([], [quizBlock(q1)])]), section([quizBlock(q2)])], quiz: settings } as never;
const settle = () => new Promise((r) => setTimeout(r, 20));
const buttonNamed = (root: ParentNode, name: RegExp) => [...root.querySelectorAll('button')].find((b) => name.test(b.textContent ?? ''));

describe('quiz questions answered where they sit', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k)
    });
    state = { ...base };
    apiPost.mockClear();
  });

  it('spots questions inside sections, columns or tabs', () => {
    expect(hasNestedQuizQuestion((lesson as { blocks: never[] }).blocks)).toBe(true);
    expect(hasNestedQuizQuestion([quizBlock(q1), quizBlock(q2)] as never)).toBe(false);
    expect(hasNestedQuizQuestion([section([{ id: 'r', type: 'block', block_type: 'rich_text', content: { html: '' } }])] as never)).toBe(false);
  });

  it('a question card in a student lesson holds the slot it is given', () => {
    const slot = document.createElement('div');
    const card = renderQuizQuestion(quizBlock(q1) as never, 'student', { quizSlot: (id) => (id === 'block_q1' ? slot : document.createElement('p')) });
    expect(card.contains(slot)).toBe(true);
    expect(card.textContent).not.toContain('part of the quiz');
  });

  it('students start in a slot, answer in place, and hand in from the box', async () => {
    const slots = new Map([
      ['block_q1', document.createElement('div')],
      ['block_q2', document.createElement('div')]
    ]);
    const page = document.body.appendChild(document.createElement('div'));
    page.append(...slots.values());
    const root = page.appendChild(mountStudentQuiz(lesson, { classId: 'c1', slots }));
    await settle();

    const first = slots.get('block_q1') as HTMLElement;
    expect(first.textContent).toContain('The Moon orbits the Earth.');
    const start = buttonNamed(first, /Start answering/) as HTMLButtonElement;
    expect(start).toBeTruthy();
    expect(root.textContent).toContain('where it sits in the lesson');

    start.click();
    await settle();
    expect(apiPost.mock.calls.some(([, b]) => (b as { action: string }).action === 'start')).toBe(true);
    // Both questions open for answering in their own places.
    expect(first.querySelector('.qz-player')).toBeTruthy();
    expect((slots.get('block_q2') as HTMLElement).querySelector('.qz-player')).toBeTruthy();
    // The box is now the hand-in, with no question-by-question view.
    expect(root.textContent).toContain('Hand in your answers');
    expect(buttonNamed(root, /Back to the questions/)).toBeUndefined();
    expect(root.textContent).toContain('2 questions not answered yet');

    (buttonNamed(first, /^True$/) as HTMLButtonElement).click();
    expect(root.textContent).toContain('1 question not answered yet');
    // Answering one slot leaves the other's player in place.
    const secondPlayer = (slots.get('block_q2') as HTMLElement).querySelector('.qz-player');
    expect(secondPlayer?.isConnected).toBe(true);

    (buttonNamed(root, /Hand it in/) as HTMLButtonElement).click();
    await settle();
    const submit = apiPost.mock.calls.find(([, b]) => (b as { action: string }).action === 'submit');
    expect((submit?.[1] as { responses: Record<string, unknown> }).responses).toEqual({ block_q1: { value: true } });
    expect(root.textContent).toContain('Handed in');
    expect(first.querySelector('.qz-player')).toBeNull();
    expect(first.textContent).toContain('Handed in');
    page.remove();
  });
  it('a student types initials in the question card and answers there', async () => {
    state = { ...base, identity: { need: 'initials', initials: null } };
    const slots = new Map([
      ['block_q1', document.createElement('div')],
      ['block_q2', document.createElement('div')]
    ]);
    const page = document.body.appendChild(document.createElement('div'));
    page.append(...slots.values());
    page.appendChild(mountStudentQuiz(lesson, { classId: 'c1', slots }));
    await settle();

    const first = slots.get('block_q1') as HTMLElement;
    expect(first.textContent).not.toContain('end of the lesson');
    const input = first.querySelector('.qz-initials__input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'AB';
    (buttonNamed(first, /Continue/) as HTMLButtonElement).click();
    await settle();
    expect(apiPost.mock.calls.find(([, b]) => (b as { action: string }).action === 'claim')?.[1]).toMatchObject({ initials: 'AB' });
    // The go starts straight away, so the question is open to answer where it sits.
    expect(first.querySelector('.qz-player')).toBeTruthy();
    expect((slots.get('block_q2') as HTMLElement).querySelector('.qz-player')).toBeTruthy();
    page.remove();
  });
});
