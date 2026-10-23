import { describe, it, expect } from 'vitest';
import { renderBlock } from '@/blocks/render';
import { LECTURE_ANSWERED, type AnsweredDetail } from '@/lecture/answered';
import type { Block } from '@/schemas/block';

const b = (id: string, block_type: string, content: Record<string, unknown>) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;

function listen(host: HTMLElement): AnsweredDetail[] {
  const got: AnsweredDetail[] = [];
  host.addEventListener(LECTURE_ANSWERED, (e) => got.push((e as CustomEvent<AnsweredDetail>).detail));
  return got;
}

describe('gate answers', () => {
  it('cloze reports right when every blank is right, wrong otherwise', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const el = renderBlock(b('c1', 'cloze', { text: 'The sky is [[blue]] and grass is [[green]].' }), 'student');
    host.append(el);
    const [a, c] = el.querySelectorAll<HTMLInputElement>('.block-cloze__blank');
    a!.value = 'blue';
    c!.value = 'red';
    el.querySelector<HTMLButtonElement>('.block-cloze__btn')!.click();
    c!.value = 'green';
    el.querySelector<HTMLButtonElement>('.block-cloze__btn')!.click();
    expect(got).toEqual([{ blockId: 'c1', result: 'wrong' }, { blockId: 'c1', result: 'right' }]);
  });

  it('self-check reports done when the answer is shown or a confidence is picked', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const reveal = renderBlock(b('k1', 'self_check', { mode: 'reveal', prompt: 'Why?', answer: 'Because' }), 'student');
    const sure = renderBlock(b('k2', 'self_check', { mode: 'confidence', prompt: 'How sure?', answer: 'x' }), 'student');
    host.append(reveal, sure);
    reveal.querySelector<HTMLButtonElement>('.block-self-check__btn')!.click();
    sure.querySelector<HTMLButtonElement>('.block-self-check__confidence-btn')!.click();
    expect(got).toEqual([{ blockId: 'k1', result: 'done' }, { blockId: 'k2', result: 'done' }]);
  });
});

describe('side-path sections', () => {
  const side = b('s1', 'section', {
    title: 'Try again',
    side_path: true,
    blocks: [b('t1', 'text', { text: 'Detour' })]
  });
  it('hide on a normal student page, show in the lecture player, teacher and print', () => {
    expect(renderBlock(side, 'student').hidden).toBe(true);
    expect(renderBlock(side, 'student').querySelector('.block-section')).toBeNull();
    expect(renderBlock(side, 'student', { lecture: 'live' }).querySelector('.block-section')).not.toBeNull();
    expect(renderBlock(side, 'teacher').querySelector('.block-section')).not.toBeNull();
    expect(renderBlock(side, 'print').querySelector('.block-section')).not.toBeNull();
  });
});
