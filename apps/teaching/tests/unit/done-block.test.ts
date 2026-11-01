import { describe, expect, it } from 'vitest';
import { renderDone } from '@/blocks/done';
import { renderBlock } from '@/blocks/render';
import { LESSON_BLOCK_GROUPS } from '@/blocks/create-block';

const block = { id: 'b1', type: 'block', block_type: 'done', variant: 'small', visibility: 'student_teacher', content: { label: 'I’ve finished this' } } as never;

describe('Done block (retired: the lesson footer does it)', () => {
  it('shows students nothing', () => {
    expect(renderDone(block, 'student').hidden).toBe(true);
    expect(renderBlock(block, 'student', { lessonId: 'l1', classId: 'class1' }).hidden).toBe(true);
  });
  it('tells the teacher it can be deleted', () => {
    expect(renderDone(block, 'teacher').textContent).toContain('You can delete it');
  });
  it('is no longer offered in a lesson menu', () => {
    expect(LESSON_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('done');
  });
});
