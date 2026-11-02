import { describe, expect, it, vi } from 'vitest';
import { mountQuestionBuilder } from '@/quiz/builder';
import type { QuizQuestion } from '@/quiz/core';

const q = { id: 'q1', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] } as QuizQuestion;
const labels = [
  { id: 'o1', code: 'EN12-1', title: 'Responds', group: 'A' },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, code: `XA${i}`, title: `T${i}`, group: 'A' }))
];

function type(box: HTMLInputElement, value: string) {
  box.value = value;
  box.dispatchEvent(new Event('input'));
}

describe('quiz builder outcome codes', () => {
  it('offers no outcome field: outcomes come from the dot points', () => {
    const b = mountQuestionBuilder({ question: q, audience: 'teacher', outcomes: labels, onChange: vi.fn() });
    expect(b.root.querySelector('.qz-outcomes')).toBeNull();
    expect(b.root.querySelector('.qz-more__summary')?.textContent).not.toMatch(/outcomes/i);
  });
  it('never shows the field to students', () => {
    const b = mountQuestionBuilder({ question: q, audience: 'student', outcomes: labels, onChange: vi.fn() });
    expect(b.root.querySelector('.qz-outcomes')).toBeNull();
  });
  it('drops outcomes from a student question even if one was passed in', () => {
    const onChange = vi.fn();
    const b = mountQuestionBuilder({ question: { ...q, outcomes: ['o1'] }, audience: 'student', outcomes: labels, onChange });
    expect(b.get().outcomes).toBeUndefined();
  });
});
