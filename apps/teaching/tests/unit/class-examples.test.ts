import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicExamples } from '@/class-examples/api';

const api = vi.hoisted(() => ({
  fetchPublicExamples: vi.fn(),
  unlockExample: vi.fn(),
  submitExample: vi.fn()
}));

vi.mock('@/class-examples/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/class-examples/api')>()),
  ...api
}));

import { mountStudentClassExamples } from '@/class-examples/student';
import { pickDefaultContext } from '@/class-examples/teacher';

function page(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="lesson-blocks">
      <div class="block" data-block-id="block_q1">Q1</div>
      <div class="block" data-block-id="block_q2">Q2</div>
    </div>`;
  document.body.append(root);
  return root;
}

function examples(slots: PublicExamples['slots']): PublicExamples {
  return { lesson_id: 'lesson_1', context: 'class_a', poll_seconds: 60, slots };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

describe('student class examples', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    setHidden(false);
    sessionStorage.clear();
    api.fetchPublicExamples.mockReset();
    api.unlockExample.mockReset();
    api.submitExample.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('a lesson with no example boxes checks once and never again', async () => {
    api.fetchPublicExamples.mockResolvedValue(examples([]));
    const handle = mountStudentClassExamples(page(), { lessonId: 'lesson_1', classId: 'class_a' });
    await flush();
    vi.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it('checks once a minute, only while the tab is visible', async () => {
    api.fetchPublicExamples.mockResolvedValue(
      examples([{ id: 's1', block_id: 'block_q2', label: 'Question 2', shown: false }])
    );
    const handle = mountStudentClassExamples(page(), { lessonId: 'lesson_1', classId: 'class_a' });
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59_000);
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(2);

    setHidden(true);
    vi.advanceTimersByTime(3 * 60_000);
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(2);

    // Coming back after a long gap catches up straight away.
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(3);

    handle.dispose();
    vi.advanceTimersByTime(5 * 60_000);
    await flush();
    expect(api.fetchPublicExamples).toHaveBeenCalledTimes(3);
  });

  it('puts each box directly under its block and shows only shared answers', async () => {
    api.fetchPublicExamples.mockResolvedValue(
      examples([
        { id: 's1', block_id: 'block_q2', label: 'Question 2', shown: true, text: 'Line one\nLine two' },
        { id: 's2', block_id: 'block_q1', label: 'Question 1', shown: false }
      ])
    );
    const root = page();
    const handle = mountStudentClassExamples(root, { lessonId: 'lesson_1', classId: 'class_a' });
    await flush();

    const q2 = root.querySelector('[data-block-id="block_q2"]')!;
    const group = q2.nextElementSibling as HTMLElement;
    expect(group.classList.contains('cx-group')).toBe(true);
    expect(group.querySelector('.cx-slot--shown .cx-slot__text')?.textContent).toBe('Line one\nLine two');

    const q1Group = root.querySelector('[data-block-id="block_q1"]')!.nextElementSibling!;
    expect(q1Group.querySelector('.cx-slot--waiting')).not.toBeNull();
    expect(q1Group.textContent).toContain("A classmate's answer will appear here.");
    handle.dispose();
  });

  it('a refresh never wipes what the student is typing', async () => {
    api.fetchPublicExamples.mockResolvedValue(
      examples([{ id: 's1', block_id: 'block_q2', label: 'Question 2', shown: false }])
    );
    api.unlockExample.mockResolvedValue({ token: 'tok' });
    const root = page();
    const handle = mountStudentClassExamples(root, { lessonId: 'lesson_1', classId: 'class_a' });
    await flush();

    (root.querySelector('.cx-slot__code-btn') as HTMLButtonElement).click();
    const input = root.querySelector<HTMLInputElement>('.cx-unlock__input')!;
    input.value = '472';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(api.unlockExample).toHaveBeenCalledWith('lesson_1', { class: 'class_a', slot_id: 's1', code: '472' });

    const field = root.querySelector<HTMLTextAreaElement>('.cx-write__field')!;
    field.value = 'Half a thought';
    field.dispatchEvent(new Event('input'));

    api.fetchPublicExamples.mockResolvedValue(
      examples([{ id: 's1', block_id: 'block_q2', label: 'Question 2 (renamed)', shown: false }])
    );
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(root.querySelector('.cx-write__field')).toBe(field);
    expect(field.value).toBe('Half a thought');
    handle.dispose();
  });

  it('a wrong code says how many tries are left', async () => {
    const { ApiClientError } = await import('@/api/client');
    api.fetchPublicExamples.mockResolvedValue(
      examples([{ id: 's1', block_id: 'block_q2', label: 'Question 2', shown: false }])
    );
    api.unlockExample.mockRejectedValue(
      new ApiClientError({ code: 'wrong_code', message: 'That code did not match.', details: { attempts_left: 7 } })
    );
    const root = page();
    const handle = mountStudentClassExamples(root, { lessonId: 'lesson_1' });
    await flush();
    (root.querySelector('.cx-slot__code-btn') as HTMLButtonElement).click();
    root.querySelector<HTMLInputElement>('.cx-unlock__input')!.value = '111';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const msg = root.querySelector<HTMLElement>('.cx-msg')!;
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toBe("That code didn't match. 7 tries left.");
    handle.dispose();
  });
});

describe('teacher default class', () => {
  const contexts = [
    { id: 'class_a', label: '9A', detail: '', dates: ['2026-10-01'] },
    { id: 'class_b', label: '9B', detail: '', dates: ['2026-10-15'] },
    { id: 'class_c', label: '9C', detail: '', dates: ['2026-10-20'] },
    { id: 'direct', label: 'Lesson link', detail: '', dates: [] }
  ];

  it("picks today's class, then the latest past, then the next upcoming", () => {
    expect(pickDefaultContext(contexts, '2026-10-15')).toBe('class_b');
    expect(pickDefaultContext(contexts, '2026-10-10')).toBe('class_a');
    expect(pickDefaultContext(contexts.slice(2), '2026-10-10')).toBe('class_c');
    expect(pickDefaultContext([contexts[3]!], '2026-10-10')).toBe('direct');
  });

  it('a class the teacher chose earlier wins while it is still listed', () => {
    expect(pickDefaultContext(contexts, '2026-10-15', 'class_c')).toBe('class_c');
    expect(pickDefaultContext(contexts, '2026-10-15', 'class_gone')).toBe('class_b');
  });
});
