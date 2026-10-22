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
  it('lets the teacher tag outcomes by code', () => {
    const onChange = vi.fn();
    const b = mountQuestionBuilder({ question: q, audience: 'teacher', outcomes: labels, onChange });
    const box = b.root.querySelector<HTMLInputElement>('.qz-outcomes')!;
    type(box, 'en12-1, XX9');
    expect(onChange.mock.calls.at(-1)![0].outcomes).toEqual(['o1']);
    expect(b.root.querySelector('.qz-outcomes__unknown')?.textContent).toBe('Not an outcome code: XX9');
    type(box, '');
    expect(onChange.mock.calls.at(-1)![0].outcomes).toBeUndefined();
  });
  it('names the field and links the note to it for screen readers', () => {
    const b = mountQuestionBuilder({ question: q, audience: 'teacher', outcomes: labels, onChange: vi.fn() });
    const box = b.root.querySelector<HTMLInputElement>('.qz-outcomes')!;
    expect(b.root.querySelector(`label[for="${box.id}"]`)?.textContent).toBe('Outcomes (optional)');
    const note = b.root.querySelector<HTMLElement>('.qz-outcomes__unknown')!;
    expect(note.getAttribute('aria-live')).toBe('polite');
    expect(box.getAttribute('aria-describedby')!.split(' ')).toContain(note.id);
  });
  it('keeps the first 8 outcomes and says so', () => {
    const onChange = vi.fn();
    const b = mountQuestionBuilder({ question: q, audience: 'teacher', outcomes: labels, onChange });
    const box = b.root.querySelector<HTMLInputElement>('.qz-outcomes')!;
    type(box, 'EN12-1, XA0, XA1, XA2, XA3, XA4, XA5, XA6');
    expect(onChange.mock.calls.at(-1)![0].outcomes).toHaveLength(8);
    expect(b.root.querySelector('.qz-outcomes__unknown')?.textContent).toBe('');
    type(box, 'EN12-1, XA0, XA1, XA2, XA3, XA4, XA5, XA6, XA7');
    expect(onChange.mock.calls.at(-1)![0].outcomes).toHaveLength(8);
    expect(b.root.querySelector('.qz-outcomes__unknown')?.textContent).toContain('Only the first 8 outcomes are kept.');
  });
  it('names outcomes in the optional summary when the field is offered', () => {
    const teacher = mountQuestionBuilder({ question: q, audience: 'teacher', outcomes: labels, onChange: vi.fn() });
    expect(teacher.root.querySelector('.qz-more__summary')?.textContent).toBe('Hint, explanation, outcomes and picture (optional)');
    const plain = mountQuestionBuilder({ question: q, audience: 'teacher', onChange: vi.fn() });
    expect(plain.root.querySelector('.qz-more__summary')?.textContent).toBe('Hint, explanation and picture (optional)');
    const student = mountQuestionBuilder({ question: q, audience: 'student', outcomes: labels, onChange: vi.fn() });
    expect(student.root.querySelector('.qz-more__summary')?.textContent).toBe('Hint, explanation and picture (optional)');
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
