import { describe, it, expect, vi } from 'vitest';
import { renderFadedExample, FADED_EVENT, type FadedExampleBlock } from '@/blocks/faded-example';
import { LECTURE_ANSWERED } from '@/lecture/answered';
import { isGate, takesSidePath } from '@/lecture/scenes';

const block: FadedExampleBlock = {
  id: 'f1', type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'p', extract: 'e', parts: [{ label: 'Technique', answer: 'Cyclical' }, { label: 'Effect', answer: 'Lonely' }], blanks: [1] }
} as FadedExampleBlock;

describe('faded example check', () => {
  it('Check shows the model next to the answer; rating fires both events', () => {
    const el = renderFadedExample(block, 'student');
    document.body.append(el);
    const faded = vi.fn();
    const answered = vi.fn();
    document.body.addEventListener(FADED_EVENT, (e) => faded((e as CustomEvent).detail));
    document.body.addEventListener(LECTURE_ANSWERED, (e) => answered((e as CustomEvent).detail));
    (el.querySelector('textarea') as HTMLTextAreaElement).value = 'It feels sad';
    (el.querySelector('.block-faded__check') as HTMLButtonElement).click();
    expect(el.textContent).toContain('Lonely');
    (el.querySelector('.block-faded__rate--wrong') as HTMLButtonElement).click();
    expect(faded).toHaveBeenCalledWith({ blockId: 'f1', parts: { 1: 'It feels sad' }, rating: 'wrong' });
    expect(answered).toHaveBeenCalledWith({ blockId: 'f1', result: 'wrong' });
    el.remove();
  });

  it('Check waits for something written', () => {
    const el = renderFadedExample(block, 'student');
    (el.querySelector('.block-faded__check') as HTMLButtonElement).click();
    expect(el.textContent).not.toContain('Lonely');
    expect(el.querySelector('.block-faded__nudge')?.textContent).toBe('Write your part first.');
  });

  it('is a gate when it has blanks and takes a side path', () => {
    expect(isGate(block)).toBe(true);
    expect(isGate({ ...block, content: { ...block.content, blanks: [] } })).toBe(false);
    expect(isGate({ ...block, content: { ...block.content, gate: false } as FadedExampleBlock['content'] })).toBe(false);
    expect(takesSidePath(block)).toBe(true);
  });
});
