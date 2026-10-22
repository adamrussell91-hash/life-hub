import { describe, expect, it } from 'vitest';
import { QuizQuestionSchema, splitQuestion } from '@/quiz/core';

describe('quiz question outcomes', () => {
  const q = { id: 'q1', kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'], outcomes: ['o1', 'o2'] };
  it('keeps outcomes on the question and puts them in the key, not the student copy', () => {
    const parsed = QuizQuestionSchema.parse(q);
    expect(parsed.outcomes).toEqual(['o1', 'o2']);
    const { question, key } = splitQuestion(parsed, () => 0.5);
    expect(key.outcomes).toEqual(['o1', 'o2']);
    expect('outcomes' in question).toBe(false);
  });
  it('leaves outcomes off when there are none', () => {
    const { key } = splitQuestion(QuizQuestionSchema.parse({ ...q, outcomes: undefined }), () => 0.5);
    expect('outcomes' in key).toBe(false);
  });
  it('takes eight, like a criterion, and refuses more', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(QuizQuestionSchema.safeParse({ ...q, outcomes: eight }).success).toBe(true);
    expect(QuizQuestionSchema.safeParse({ ...q, outcomes: [...eight, 'i'] }).success).toBe(false);
  });
});
