// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTeacherPreview, withTeacherPreview } from '@/quiz/teacher-preview';
import { mountStudentQuiz } from '@/quiz/student-quiz';
import type { PublishedLesson } from '@/schemas/published-lesson';

const question = { id: 'q1', kind: 'multiple_choice', prompt: 'Which word is a noun?', marks: 1, options: [{ id: 'a', text: 'river' }, { id: 'b', text: 'quickly' }] };

function statusNeedingInitials() {
  return {
    version: 'v1',
    open: true,
    attempts_allowed: 1,
    attempts_used: 0,
    settings: { version: 'v1', feedback: 'end' },
    questions: [question],
    live: false,
    identity: { need: 'initials', initials: null },
    current: null,
    results: []
  };
}

describe('teacher preview', () => {
  afterEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('adds the flag to a link once', () => {
    expect(withTeacherPreview('https://class.example/s/lessons/l1')).toBe('https://class.example/s/lessons/l1#preview');
    expect(withTeacherPreview('https://class.example/s/lessons/l1#note=x')).toBe('https://class.example/s/lessons/l1#preview');
  });

  it('keeps the flag for the tab and takes it off the address bar', () => {
    history.replaceState(null, '', '/s/lessons/l1#preview');
    expect(isTeacherPreview()).toBe(true);
    expect(location.hash).toBe('');
    expect(location.pathname).toBe('/s/lessons/l1');
    expect(isTeacherPreview()).toBe(true);
  });

  it('is off for a plain student link', () => {
    history.replaceState(null, '', '/s/lessons/l1');
    expect(isTeacherPreview()).toBe(false);
  });

  it('shows the questions instead of the initials box and only ever reads', async () => {
    history.replaceState(null, '', '/s/lessons/l1#preview');
    const sent: Array<{ action: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true, data: statusNeedingInitials() }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const lesson = { lesson_id: 'l1', blocks: [], quiz: { version: 'v1', feedback: 'end' } } as unknown as PublishedLesson;
    const root = mountStudentQuiz(lesson, { classId: 'c1' });
    document.body.append(root);
    await vi.waitFor(() => expect(root.textContent).toContain('Which word is a noun?'));
    expect(root.textContent).toContain('Teacher preview');
    expect(root.textContent).not.toContain('Type your initials');
    expect(sent.every((body) => body.action === 'status')).toBe(true);
    root.remove();
  });
});
