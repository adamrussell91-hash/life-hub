import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultOn, mountEndQuestions, readiness, stuckSummary, type EndQuestionResults } from '@/teacher/end-questions';
import type { Lesson } from '@/schemas/lesson';

const q = (id: string, prompt: string, options: string[], counts: number[]) => ({ id, label: id, prompt, options, counts, n: counts.reduce((a, b) => a + b, 0) });
const tally = (questions: ReturnType<typeof q>[], unclear: string[] = []) => ({ questions, unclear, responses: 12, students: 25, ticked: 20 });
const results: EndQuestionResults = {
  settings: { on: true, pool: ['clear_task', 'unstuck', 'checked'], unclear: true },
  bank: [{ id: 'clear_task', label: 'Clear task', prompt: 'Did you know what you were meant to be doing?' }, { id: 'unstuck', label: 'Getting unstuck', prompt: 'When you got stuck, what happened?' }, { id: 'checked', label: 'Checked before moving on', prompt: 'Did the lesson check?' }],
  all: tally([
    q('clear_task', 'Did you know what you were meant to be doing?', ['All the way through', 'Mostly', 'Some of the time', 'Hardly at all'], [6, 4, 2, 0]),
    q('unstuck', 'When you got stuck, what happened?', ['I didn’t get stuck', 'I worked it out myself', 'I got help and kept going', 'I stayed stuck'], [2, 2, 1, 2]),
    q('checked', 'Did the lesson check?', ['Yes, more than once', 'Once', 'Not that I noticed'], [1, 2, 0])
  ], ['what counts as corroboration']),
  classes: []
};
const lesson = (extra: Partial<Lesson> = {}) => ({ id: 'lesson1', title: 'L', pedagogical_mode: 'lesson', blocks: [], ...extra }) as unknown as Lesson;

afterEach(() => document.body.replaceChildren());

describe('end-of-lesson questions (teacher)', () => {
  it('reads results by how many answers there are', () => {
    expect(readiness(4)).toBe('hidden');
    expect(readiness(5)).toBe('early');
    expect(readiness(10)).toBe('firm');
    expect(stuckSummary([2, 2, 1, 2])).toEqual({ stuck: 5, stayed: 2, n: 7 });
    expect(defaultOn({ pedagogical_mode: 'assessment' })).toBe(false);
    expect(defaultOn({ pedagogical_mode: 'quiz' })).toBe(false);
    expect(defaultOn({ pedagogical_mode: 'seminar' })).toBe(true);
  });

  it('shows pooled answers: hidden under 5, early under 10, stuck as two numbers, and the ticked share', async () => {
    const section = mountEndQuestions({ lessonId: 'lesson1', getLesson: () => lesson(), onChange: () => {}, load: async () => results });
    document.body.append(section.element);
    section.refresh();
    await vi.waitFor(() => expect(section.element.textContent).toContain('20 of 25 ticked'));
    const items = [...section.element.querySelectorAll('.eq__item')].map((n) => n.textContent ?? '');
    expect(items[0]).toContain('12 answers');
    expect(items[0]).not.toContain('early read');
    expect(items[1]).toContain('7 answers · early read');
    expect(items[1]).toContain('5 of 7 got stuck; 2 of them stayed stuck.');
    expect(items[2]).toContain('Shows at 5 answers.');
    expect(items[3]).toContain('what counts as corroboration');
  });

  it('switches questions off for this lesson, and turns the lesson off or on', async () => {
    let current = lesson({ pedagogical_mode: 'assessment' } as Partial<Lesson>);
    const onChange = vi.fn((next) => { current = { ...current, end_questions: next }; });
    const section = mountEndQuestions({ lessonId: 'lesson1', getLesson: () => current, onChange, load: async () => results });
    document.body.append(section.element);
    section.refresh();
    await vi.waitFor(() => expect(section.element.querySelectorAll('.eq__check').length).toBe(4));
    const on = section.element.querySelector<HTMLInputElement>('#eq-on-lesson1')!;
    expect(on.checked).toBe(false);
    expect(section.element.textContent).toContain('Off by default for assessments and quizzes.');
    on.click();
    expect(onChange).toHaveBeenLastCalledWith({ on: true });
    section.element.querySelector<HTMLInputElement>('#eq-lesson1-checked')!.click();
    expect(onChange).toHaveBeenLastCalledWith({ on: true, skip: ['checked'] });
    section.element.querySelector<HTMLInputElement>('#eq-lesson1-unclear')!.click();
    expect(onChange).toHaveBeenLastCalledWith({ on: true, skip: ['checked'], unclear: false });
  });
});
