// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { InsightPayload } from '@/evidence/types';

const row = (awarded: number | null, codes: string[], id = 'q1') => ({
  id,
  mark: { score: awarded, max: 2, correct: awarded === 2 },
  awarded,
  hinted: false,
  response: { type: 'text', text: 'Because it is.' },
  confidence: null,
  question: { id, kind: 'short_answer', prompt: 'Why?', marks: 2, has_hint: false },
  key: { id, kind: 'short_answer', marks: 2, answer: { type: 'text', accepted: ['because'], case_sensitive: false } },
  codes
});
const detail = (codes: string[]) => ({
  student: { initials: 'AA', name: 'Ada Ash' }, id: 'att1', device: 'd1', n: 0, submitted_at: '2026-10-20T01:00:00Z', overtime: false, score: 1, max: 2, pending: 0, rows: [row(1, codes), row(1, [], 'q2')]
});

const calls: Array<Record<string, unknown>> = [];
/** How a mark post answers; tests swap it to hold or fail a post. */
let onMark: (body: Record<string, unknown>) => Promise<unknown> = async (body) => ({ attempt: detail(body.question_id === 'q1' ? (body.codes as string[]) : []) });
vi.mock('@/api/client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiPost: vi.fn(async (_endpoint: string, body: Record<string, unknown>) => {
    calls.push(body);
    if (body.action === 'attempt') return { attempt: detail([]) };
    if (body.action === 'mark') return onMark(body);
    return {
      published: true, version: 'v1', feedback: 'after', released: false, questions: [],
      attempts: [{ student: { initials: 'AA', name: 'Ada Ash' }, id: 'att1', device: 'd1', n: 0, go: 0, submitted_at: '2026-10-20T01:00:00Z', overtime: false, score: 1, max: 2, pending: 0, current: true }]
    };
  })
}));
vi.mock('@/evidence/context', () => ({
  loadInsightContext: async () => ({
    table: null, outcomes: [], skills: null,
    codes: [
      { id: 'e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'sage', descriptor: 'Link evidence.' },
      { id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 2, colour: 'sage', descriptor: 'Open with the point.' }
    ]
  }),
  codeLabel: (id: string) => id
}));

import { mountQuizPanel } from '@/quiz/teacher-panel';

const payload = {
  lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', record_version: 'v1', class_id: 'c1', closed: false, closed_by: null, built_at: '', saved: false, confidence: false,
  students: [], questions: [], attempts: [],
  compare_with: null, follow_up_of: null, follow_up_flag: null, for_students: [], dismissed: [], follow_ups: [], siblings: []
} as unknown as InsightPayload;

async function openAttempt() {
  calls.length = 0;
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
  await vi.waitFor(() => expect(handle.root.querySelector('.qz-attempt')).toBeTruthy());
  await new Promise((r) => setTimeout(r, 0));
  handle.root.querySelector<HTMLButtonElement>('button.qz-attempt')!.click();
  await vi.waitFor(() => expect(handle.root.querySelectorAll('.qz-attempt-row .ev-chips').length).toBe(2));
  const rows = () => [...handle.root.querySelectorAll<HTMLElement>('.qz-attempt-row')];
  return { handle, rows };
}
const marks = () => calls.filter((c) => c.action === 'mark');

describe('teacher attempt view feedback codes', () => {
  it('offers labelled code chips on an answer below full marks and saves them with the mark', async () => {
    const { handle, rows } = await openAttempt();
    const group = rows()[0]!.querySelector<HTMLElement>('.ev-chips')!;
    expect(group.getAttribute('aria-label')).toBe('Why marks were lost: question 1');
    expect(rows()[0]!.querySelector('label[for="' + group.id + '"]')).toBeNull();
    group.querySelector<HTMLButtonElement>('.ev-chip')!.click();
    await vi.waitFor(() => expect(marks()).toEqual([{ action: 'mark', attempt_id: 'att1', question_id: 'q1', score: 1, codes: ['e'] }]));
    handle.dispose();
  });

  it('sends a Mark only after an earlier chip save has landed', async () => {
    const { handle, rows } = await openAttempt();
    let release: () => void = () => {};
    const normal = onMark;
    onMark = (body) => (body.question_id === 'q1' ? new Promise((r) => (release = () => r({ attempt: detail(['e']) }))) : normal(body));
    rows()[0]!.querySelector<HTMLButtonElement>('.ev-chip')!.click();
    const markButton = [...rows()[1]!.querySelectorAll('button')].find((b) => b.textContent === 'Change mark')!;
    markButton.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(marks().map((c) => c.question_id)).toEqual(['q1']);
    release();
    await vi.waitFor(() => expect(marks().map((c) => c.question_id)).toEqual(['q1', 'q2']));
    onMark = normal;
    handle.dispose();
  });

  it('sends no codes with a full mark', async () => {
    const { handle, rows } = await openAttempt();
    rows()[0]!.querySelector<HTMLButtonElement>('.ev-chip')!.click();
    await vi.waitFor(() => expect(marks()).toHaveLength(1));
    const fresh = rows()[0]!;
    fresh.querySelector<HTMLInputElement>('.qz-input--marks')!.value = '2';
    [...fresh.querySelectorAll('button')].find((b) => b.textContent === 'Change mark')!.click();
    await vi.waitFor(() => expect(marks()[1]).toMatchObject({ question_id: 'q1', score: 2, codes: [] }));
    handle.dispose();
  });

  it('puts the chips back when a chip save fails', async () => {
    const { handle, rows } = await openAttempt();
    const normal = onMark;
    onMark = async () => {
      throw new Error('Server said no');
    };
    rows()[0]!.querySelector<HTMLButtonElement>('.ev-chip')!.click();
    expect(rows()[0]!.querySelector('.ev-chip')!.getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(rows()[0]!.querySelector('.ev-chip')!.getAttribute('aria-pressed')).toBe('false'));
    expect(handle.root.textContent).toContain('Something went wrong');
    onMark = normal;
    handle.dispose();
  });

  it('shows the server’s codes after a failed save overlaps a later one that lands', async () => {
    const { handle, rows } = await openAttempt();
    const normal = onMark;
    let rejectFirst: (e: Error) => void = () => {};
    let resolveSecond: () => void = () => {};
    onMark = (body) =>
      marks().length === 1
        ? new Promise((_, reject) => (rejectFirst = reject))
        : new Promise((r) => (resolveSecond = () => r({ attempt: detail(body.codes as string[]) })));
    const chip = (code: string) => [...rows()[0]!.querySelectorAll<HTMLButtonElement>('.ev-chip')].find((b) => b.textContent === code)!;
    chip('E').focus();
    chip('E').click();
    chip('TS').click();
    await vi.waitFor(() => expect(marks()).toHaveLength(1));
    rejectFirst(new Error('Server said no'));
    await vi.waitFor(() => expect(marks()).toHaveLength(2));
    expect(marks()[1]!.codes).toEqual(['e', 'ts']);
    // The later save is still waiting, so the failure leaves the chips alone.
    expect(chip('E').getAttribute('aria-pressed')).toBe('true');
    resolveSecond();
    await vi.waitFor(() => expect(chip('TS').getAttribute('aria-pressed')).toBe('true'));
    expect(chip('E').getAttribute('aria-pressed')).toBe('true');
    onMark = normal;
    handle.dispose();
  });

  it('settles on the server’s set and keeps focus on the chip last used', async () => {
    const { handle, rows } = await openAttempt();
    const normal = onMark;
    // The server keeps only E, whatever it is sent.
    onMark = async () => ({ attempt: detail(['e']) });
    const chip = (code: string) => [...rows()[0]!.querySelectorAll<HTMLButtonElement>('.ev-chip')].find((b) => b.textContent === code)!;
    chip('TS').focus();
    chip('TS').click();
    await vi.waitFor(() => expect(chip('E').getAttribute('aria-pressed')).toBe('true'));
    expect(chip('TS').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(chip('TS'));
    onMark = normal;
    handle.dispose();
  });
});
