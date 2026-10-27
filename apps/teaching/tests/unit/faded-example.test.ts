import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderFadedExample, groupFadedRuns, FADED_EVENT, type FadedExampleBlock } from '@/blocks/faded-example';
import { LECTURE_ANSWERED } from '@/lecture/answered';
import { isGate, takesSidePath } from '@/lecture/scenes';

const block: FadedExampleBlock = {
  id: 'f1', type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'p', extract: 'e', parts: [{ label: 'Technique', answer: 'Cyclical' }, { label: 'Effect', answer: 'Lonely' }], blanks: [1] }
} as FadedExampleBlock;

const cleanups: Array<() => void> = [];
function listen(type: string, fn: (d: unknown) => void): void {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  document.body.addEventListener(type, h);
  cleanups.push(() => document.body.removeEventListener(type, h));
}
afterEach(() => {
  cleanups.splice(0).forEach((c) => c());
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('faded example check', () => {
  it('Check shows the model next to the answer; rating fires both events', () => {
    const el = renderFadedExample(block, 'student');
    document.body.append(el);
    const faded = vi.fn();
    const answered = vi.fn();
    listen(FADED_EVENT, faded);
    listen(LECTURE_ANSWERED, answered);
    (el.querySelector('textarea') as HTMLTextAreaElement).value = 'It feels sad';
    (el.querySelector('.block-faded__check') as HTMLButtonElement).click();
    expect(el.textContent).toContain('Lonely');
    (el.querySelector('.block-faded__rate--wrong') as HTMLButtonElement).click();
    expect(faded).toHaveBeenCalledWith({ blockId: 'f1', parts: { 1: 'It feels sad' }, rating: 'wrong' });
    expect(answered).toHaveBeenCalledWith({ blockId: 'f1', result: 'wrong' });
    expect(faded).toHaveBeenCalledTimes(1);
    (el.querySelector('.block-faded__rate--right') as HTMLButtonElement).click();
    expect(faded).toHaveBeenCalledTimes(1);
    expect(answered).toHaveBeenCalledTimes(1);
  });

  it('focuses Got it after Check and groups the rating buttons', () => {
    const el = renderFadedExample(block, 'student');
    document.body.append(el);
    (el.querySelector('textarea') as HTMLTextAreaElement).value = 'x';
    (el.querySelector('.block-faded__check') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(el.querySelector('.block-faded__rate--right'));
    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('How did yours compare?');
  });

  it('restores a rated answer locked, without firing events', () => {
    const first = renderFadedExample(block, 'student');
    document.body.append(first);
    (first.querySelector('textarea') as HTMLTextAreaElement).value = 'It feels sad';
    (first.querySelector('.block-faded__check') as HTMLButtonElement).click();
    (first.querySelector('.block-faded__rate--right') as HTMLButtonElement).click();
    first.remove();
    const faded = vi.fn();
    const answered = vi.fn();
    listen(FADED_EVENT, faded);
    listen(LECTURE_ANSWERED, answered);
    const again = renderFadedExample(block, 'student');
    document.body.append(again);
    const area = again.querySelector('textarea') as HTMLTextAreaElement;
    expect(area.value).toBe('It feels sad');
    expect(area.readOnly).toBe(true);
    expect(again.textContent).toContain('Lonely');
    expect(again.querySelector('.block-faded__check')).toBeNull();
    const buttons = [...again.querySelectorAll<HTMLButtonElement>('.block-faded__rate')];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(again.querySelector('.block-faded__rate--right')?.getAttribute('aria-pressed')).toBe('true');
    buttons.forEach((b) => b.click());
    expect(faded).not.toHaveBeenCalled();
    expect(answered).not.toHaveBeenCalled();
  });

  it('does not offer Check in print mode', () => {
    expect(renderFadedExample(block, 'print').querySelector('.block-faded__check')).toBeNull();
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
    expect(isGate({ ...block, content: { ...block.content, gate: false } })).toBe(false);
    expect(takesSidePath(block)).toBe(true);
  });
});

describe('faded sequence', () => {
  const mk = (id: string, blanks: number[]): FadedExampleBlock =>
    ({ ...block, id, content: { ...block.content, blanks } }) as FadedExampleBlock;
  const mount = (blocks: FadedExampleBlock[]) => {
    const host = document.createElement('div');
    document.body.append(host);
    for (const b of blocks) {
      const wrap = document.createElement('div');
      wrap.className = 'block';
      wrap.dataset.blockType = 'faded_example';
      wrap.dataset.blockId = b.id;
      wrap.append(renderFadedExample(b, 'student'));
      host.append(wrap);
    }
    groupFadedRuns(host);
    return host;
  };

  it('joins consecutive steps under one rail with one step open', () => {
    const host = mount([mk('a', []), mk('b', [1]), mk('c', [0, 1])]);
    expect(host.querySelectorAll('.block-faded-rail')).toHaveLength(1);
    expect(host.querySelector('.block-faded__num')?.textContent).toBe('Step 1 of 3 · ');
    expect(host.querySelectorAll('.block-faded-step--shut')).toHaveLength(2);
    (host.querySelector('.block-faded__next') as HTMLButtonElement).click();
    expect(host.querySelectorAll('.block-faded-step--shut')[0]?.getAttribute('data-block-id')).toBe('a');
  });

  it('moves to the next step after a rating, and is safe to group twice', () => {
    const host = mount([mk('b', [1]), mk('c', [1])]);
    groupFadedRuns(host);
    expect(host.querySelectorAll('.block-faded-rail')).toHaveLength(1);
    (host.querySelector('textarea') as HTMLTextAreaElement).value = 'x';
    (host.querySelector('.block-faded__check') as HTMLButtonElement).click();
    (host.querySelector('.block-faded__rate--right') as HTMLButtonElement).click();
    expect(host.querySelector('[data-block-id="c"]')?.classList.contains('block-faded-step--shut')).toBe(false);
    expect(host.querySelector('[data-block-id="b"]')?.classList.contains('block-faded-step--shut')).toBe(true);
  });

  it('leaves a lone step without a rail', () => {
    const host = mount([mk('a', [1])]);
    expect(host.querySelector('.block-faded-rail')).toBeNull();
  });
});
