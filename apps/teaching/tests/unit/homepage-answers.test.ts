import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';

describe('question set on the class homepage', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a student answer under the class when there is no lesson', () => {
    const block = createBlock('question_set', 'qs1');
    const first = renderBlock(block, 'student', { saveScope: 'class-c1' });
    const box = first.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type="text"]')!;
    box.value = 'My answer';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    const again = renderBlock(block, 'student', { saveScope: 'class-c1' });
    expect(again.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type="text"]')!.value).toBe('My answer');
  });
});
