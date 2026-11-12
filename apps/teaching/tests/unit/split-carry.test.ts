import { beforeEach, describe, expect, it } from 'vitest';
import { carrySplitWork } from '@/student/split-carry';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) => ({ id, type: 'block', block_type, visibility: 'student_teacher', content });
const lesson = {
  lesson_id: 'lesson_new',
  split_from: 'lesson_old',
  blocks: [b('s3', 'section', { title: 'Moved', blocks: [b('q2', 'question_set'), b('cols', 'columns', { columns: [{ blocks: [b('cz', 'cloze')] }] })] })]
} as never;

describe('carrySplitWork', () => {
  beforeEach(() => localStorage.clear());

  it('copies saved answers for moved blocks to the new lesson', () => {
    localStorage.setItem('teaching-hub.activity.lesson_old.q2.answers', '{"a":"mine"}');
    localStorage.setItem('teaching-hub.activity.lesson_old.cz', '{"filled":["x"]}');
    localStorage.setItem('teaching-hub.activity.lesson_old.q1.answers', '{"a":"stays"}');
    expect(carrySplitWork(lesson)).toBe(2);
    expect(localStorage.getItem('teaching-hub.activity.lesson_new.q2.answers')).toBe('{"a":"mine"}');
    expect(localStorage.getItem('teaching-hub.activity.lesson_new.cz')).toBe('{"filled":["x"]}');
    expect(localStorage.getItem('teaching-hub.activity.lesson_new.q1.answers')).toBeNull();
    // The old copy is left alone.
    expect(localStorage.getItem('teaching-hub.activity.lesson_old.q2.answers')).toBe('{"a":"mine"}');
  });

  it('never overwrites work already saved in the new lesson', () => {
    localStorage.setItem('teaching-hub.activity.lesson_old.q2.answers', '{"a":"old"}');
    localStorage.setItem('teaching-hub.activity.lesson_new.q2.answers', '{"a":"newer"}');
    expect(carrySplitWork(lesson)).toBe(0);
    expect(localStorage.getItem('teaching-hub.activity.lesson_new.q2.answers')).toBe('{"a":"newer"}');
  });

  it('does nothing for a lesson that was not split', () => {
    localStorage.setItem('teaching-hub.activity.lesson_old.q2.answers', '{"a":"mine"}');
    expect(carrySplitWork({ ...(lesson as object), split_from: undefined } as never)).toBe(0);
  });
});
