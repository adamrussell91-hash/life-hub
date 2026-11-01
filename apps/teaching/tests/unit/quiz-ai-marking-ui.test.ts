// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Invented students and answers only: this repository is public. */

const shortKey = { id: 'q1', kind: 'short_answer', marks: 1, ai: true, answer: { type: 'text', accepted: ['Romeo'], case_sensitive: false } };
const essayKey = { id: 'q2', kind: 'extended_response', marks: 4, ai: true, answer: { type: 'manual', guide: '2 for a claim.' } };
const rows = (overrides: { q1?: object; q2?: object } = {}) => [
  {
    id: 'q1', mark: { score: null, max: 1, correct: null, pending: 'ai' }, awarded: 0, by: 'ai', hinted: false, response: { text: 'the lover' }, confidence: null,
    question: { id: 'q1', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, has_hint: false }, key: shortKey, codes: [],
    ai: { marks: 0, verdict: 'wrong', reason: 'Describes him; names nobody.' }, ...overrides.q1
  },
  {
    id: 'q2', mark: { score: null, max: 4, correct: null, pending: 'ai' }, awarded: null, by: null, hinted: false, response: { text: 'The town forgets.' }, confidence: null,
    question: { id: 'q2', kind: 'extended_response', prompt: 'Explain the ending.', marks: 4, has_hint: false }, key: essayKey, codes: [],
    ai: { marks: null, suggested: 2, reason: 'Claim, thin evidence.', feedback: 'You make a clear claim. Add a quote from the ending.' }, ...overrides.q2
  }
];
const detail = (overrides?: { q1?: object; q2?: object }) => ({ student: { initials: 'PQ', name: 'Pip Quill' }, id: 'att1', device: 'd1', n: 0, submitted_at: '2026-11-01T01:00:00Z', overtime: false, score: 0, max: 5, pending: 1, rows: rows(overrides) });

const calls: Array<Record<string, unknown>> = [];
const jobPosts: Array<Record<string, unknown>> = [];
let aiWaiting = 3;
let attemptReply = () => detail();
vi.mock('@/api/client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiGet: vi.fn(async () => ({ continuum: { strands: [] } })),
  apiPost: vi.fn(async (_endpoint: string, body: Record<string, unknown>) => {
    calls.push(body);
    if (body.action === 'attempt') return { attempt: attemptReply() };
    if (body.action === 'mark') return { attempt: attemptReply() };
    return {
      published: true, version: 'v1', feedback: 'after', released: false, questions: [], ai_waiting: aiWaiting,
      attempts: [{ student: { initials: 'PQ', name: 'Pip Quill' }, id: 'att1', device: 'd1', n: 0, go: 0, submitted_at: '2026-11-01T01:00:00Z', overtime: false, score: 0, max: 5, pending: 1, current: true }]
    };
  })
}));
vi.mock('@/ai/jobs-client', () => ({
  AiJobConflictError: class AiJobConflictError extends Error {},
  postAiJob: vi.fn(async (body: Record<string, unknown>) => {
    jobPosts.push(body);
    if (body.dry_run) return { estimate: { kind: 'quiz_ai_mark', answers: 3, questions: 2, calls: 2, input_tokens: 900, output_tokens: 300, cost_usd: 0.004, cost_aud: 0.0062 } };
    aiWaiting = 0;
    return { id: 'ai_job_1', status: 'working' };
  }),
  pollAiJob: vi.fn(async () => ({ id: 'ai_job_1', status: 'done', response: 'Marked 2 · 1 for you to check', cost_usd: 0.004, cost_aud: 0.0062 }))
}));
vi.mock('@/evidence/context', () => ({ loadInsightContext: async () => ({ table: null, outcomes: [], skills: null, codes: [] }), codeLabel: (id: string) => id }));

import { mountQuizPanel } from '@/quiz/teacher-panel';
import { mountQuestionPlayer } from '@/quiz/player';
import { mountQuestionBuilder } from '@/quiz/builder';
import type { Block } from '@/schemas/block';
import type { QuizQuestion } from '@/quiz/core';

const notInsight = async () => ({ published: false }) as never;
function mount(onUpdateBlock?: (block: Block) => void) {
  sessionStorage.setItem('quiz-panel:tab', 'results');
  const lesson = {
    id: 'l1',
    blocks: [{ id: 'q1', type: 'block', block_type: 'quiz_question', visibility: 'student_teacher', content: { question: { id: 'q1', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] } } }]
  };
  const handle = mountQuizPanel({
    getLesson: () => lesson as never,
    onSettings: () => {},
    onAddBlocks: () => {},
    onRemoveBlock: () => {},
    ...(onUpdateBlock ? { onUpdateBlock } : {}),
    idFactory: () => 'x',
    insightApi: { classes: async () => ({ classes: [] }), load: notInsight, close: notInsight, reopen: notInsight, dismiss: async () => ({ dismissed: [] }) }
  });
  document.body.append(handle.root);
  return handle;
}

beforeEach(() => {
  calls.length = 0;
  jobPosts.length = 0;
  aiWaiting = 3;
  attemptReply = () => detail();
  document.body.replaceChildren();
});

describe('AI marking on the results', () => {
  it('shows the dry-run figure on the button, then runs the job and says what it did', async () => {
    const handle = mount();
    await vi.waitFor(() => expect(handle.root.querySelector('.qz-ai-strip button')?.textContent).toBe('AI mark 3 answers · about A$0.01'));
    expect(jobPosts).toEqual([{ kind: 'quiz_ai_mark', lesson_id: 'l1', dry_run: true }]);
    handle.root.querySelector<HTMLButtonElement>('.qz-ai-strip button')!.click();
    await vi.waitFor(() => expect(handle.root.querySelector('.qz-ai-strip')?.textContent).toContain('Marked 2 · 1 for you to check · A$0.01'));
    expect(jobPosts[1]).toEqual({ kind: 'quiz_ai_mark', lesson_id: 'l1' });
    expect(handle.root.querySelector('.qz-ai-strip button')).toBeNull();
    handle.dispose();
  });

  it('the attempt view tags AI marks, shows unsure ones with the suggested mark, and saves a comment', async () => {
    const handle = mount();
    await vi.waitFor(() => expect(handle.root.querySelector('button.qz-attempt')).toBeTruthy());
    handle.root.querySelector<HTMLButtonElement>('button.qz-attempt')!.click();
    await vi.waitFor(() => expect(handle.root.querySelectorAll('.qz-attempt-row').length).toBe(2));
    const [short, essay] = [...handle.root.querySelectorAll<HTMLElement>('.qz-attempt-row')];
    expect(short!.querySelector('.qz-ai-note')?.textContent).toBe('AI marked Describes him; names nobody.');
    expect(essay!.querySelector('.qz-ai-note')?.textContent).toBe('AI wasn’t sure Claim, thin evidence.');
    expect(essay!.querySelector<HTMLInputElement>('.qz-input--marks')!.value).toBe('2');
    const field = [...essay!.querySelectorAll<HTMLElement>('.qz-field')].find((f) => f.querySelector('.qz-field__label')?.textContent === 'Comment for the student (optional)')!;
    const comment = field.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(comment.value).toBe('You make a clear claim. Add a quote from the ending.');
    comment.value = 'You make a clear claim. Add the last line as evidence.';
    [...essay!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!.click();
    await vi.waitFor(() => expect(calls.some((c) => c.action === 'mark')).toBe(true));
    expect(calls.find((c) => c.action === 'mark')).toMatchObject({ question_id: 'q2', score: 2, comment: 'You make a clear claim. Add the last line as evidence.' });
    handle.dispose();
  });

  it('a short answer the teacher turned to right offers Add to accepted answers', async () => {
    attemptReply = () => detail({ q1: { awarded: 1, by: 'teacher' } });
    const updated: Block[] = [];
    const handle = mount((block) => updated.push(block));
    await vi.waitFor(() => expect(handle.root.querySelector('button.qz-attempt')).toBeTruthy());
    handle.root.querySelector<HTMLButtonElement>('button.qz-attempt')!.click();
    await vi.waitFor(() => expect(handle.root.querySelectorAll('.qz-attempt-row').length).toBe(2));
    const add = [...handle.root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add to accepted answers')!;
    expect(handle.root.querySelectorAll('.qz-accept').length).toBe(1);
    add.click();
    expect((updated[0]!.content as { question: { accepted: string[] } }).question.accepted).toEqual(['Romeo', 'the lover']);
    expect(handle.root.querySelector('.qz-accept')?.textContent).toBe('Added. New attempts get it once you republish.');
    handle.dispose();
  });
});

describe('AI marking for students and in the builder', () => {
  it('a waiting answer says the teacher will check it; a comment shows under a marked one', () => {
    const question = { id: 'q1', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, has_hint: false } as const;
    const waiting = mountQuestionPlayer({ question, response: { text: 'the lover' }, result: { mark: { score: null, max: 1, correct: null, pending: 'ai' }, awarded: null } });
    expect(waiting.querySelector('.qz-result__text')?.textContent).toBe('Your teacher will check this one.');
    const marked = mountQuestionPlayer({ question, response: { text: 'the lover' }, result: { mark: { score: null, max: 1, correct: null, pending: 'ai' }, awarded: 1, comment: 'You named him by his role.' } });
    expect(marked.querySelector('.qz-result__comment')?.textContent).toBe('You named him by his role.');
  });

  it('the AI switch is on for short answers, off for written ones, and saves only a change', () => {
    const switchIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLLabelElement>('.qz-check')].find((l) => l.textContent === 'AI can mark this')!.querySelector('input')!;
    let latest: QuizQuestion | null = null;
    const short = mountQuestionBuilder({ question: { id: 'q1', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] } as QuizQuestion, audience: 'teacher', onChange: (q) => (latest = q) });
    const box = switchIn(short.root);
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect((latest as unknown as { ai_mark?: boolean }).ai_mark).toBe(false);
    expect([...short.root.querySelectorAll('.qz-field__label')].some((l) => l.textContent === 'Looking for (optional)')).toBe(true);
    const essay = mountQuestionBuilder({ question: { id: 'q2', kind: 'extended_response', prompt: 'Explain.', marks: 4 } as QuizQuestion, audience: 'teacher', onChange: (q) => (latest = q) });
    const essayBox = switchIn(essay.root);
    expect(essayBox.checked).toBe(false);
    essayBox.checked = true;
    essayBox.dispatchEvent(new Event('change'));
    expect((latest as unknown as { ai_mark?: boolean }).ai_mark).toBe(true);
    const student = mountQuestionBuilder({ question: { id: 'q3', kind: 'short_answer', prompt: 'Q', marks: 1, accepted: ['a'] } as QuizQuestion, audience: 'student', onChange: () => {} });
    expect([...student.root.querySelectorAll('.qz-check')].some((l) => l.textContent === 'AI can mark this')).toBe(false);
  });
});
