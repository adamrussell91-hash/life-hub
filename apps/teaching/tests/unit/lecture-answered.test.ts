import { describe, it, expect, vi } from 'vitest';
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
    const area = reveal.querySelector<HTMLTextAreaElement>('.block-self-check__response')!;
    area.value = 'My go';
    area.dispatchEvent(new Event('input'));
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

describe('hinge in a lecture', () => {
  it('a hinge in a lecture preview checks locally and reports the result', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const hinge = b('hq1', 'hinge_question', { prompt: 'Which?', options: [{ id: 'a', text: 'Gravity' }, { id: 'b', text: 'Magnetism' }], correct_id: 'a', seconds: 60, move_on: 80, reteach: 50 });
    const el = renderBlock(hinge, 'student', { lessonId: 'l1', lecture: 'preview' });
    host.append(el);
    el.querySelectorAll<HTMLButtonElement>('.hq-choice')[1]!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(got).toEqual([{ blockId: 'hq1', result: 'wrong' }]);
    expect(el.querySelector('.hq-verdict--wrong')).not.toBeNull();
    expect(el.querySelector<HTMLElement>('.hq-choice[data-right="true"]')?.textContent).toContain('Gravity');
    // Drawn again (after a detour), the preview still shows the answer.
    const again = renderBlock(hinge, 'student', { lessonId: 'l1', lecture: 'preview' });
    expect(again.querySelector('.hq-verdict--wrong')).not.toBeNull();
  });

  it('lets a student carry on when a hinge in a lecture can’t be answered', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const hinge = b('hq2', 'hinge_question', { prompt: 'Which?', options: [{ id: 'a', text: 'Gravity' }, { id: 'b', text: 'Magnetism' }], seconds: 60, move_on: 80, reteach: 50 });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const el = renderBlock(hinge, 'student', { lessonId: 'l1', lecture: 'live' });
    host.append(el);
    el.querySelectorAll<HTMLButtonElement>('.hq-choice')[0]!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const skip = el.querySelector<HTMLButtonElement>('.hq-solo__skip')!;
    expect(skip.textContent).toBe('Skip to the next step');
    skip.click();
    expect(got).toEqual([{ blockId: 'hq2', result: 'done' }]);
    fetchMock.mockRestore();
  });
});
