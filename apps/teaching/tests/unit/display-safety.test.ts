import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';

const display = { lessonId: 'L1', display: true };

afterEach(() => vi.restoreAllMocks());

describe('class display keeps answers and student work off the projector', () => {
  it('cloze shows empty blanks, not the filled-in answers', () => {
    const block = createBlock('cloze', 'c1');
    expect(renderBlock(block, 'teacher', { lessonId: 'L1' }).querySelector('.block-cloze__preview-blank')).toBeTruthy();
    const shown = renderBlock(block, 'teacher', display);
    expect(shown.querySelector('.block-cloze__preview-blank')).toBeNull();
    expect(shown.querySelector<HTMLInputElement>('input.block-cloze__blank')!.value).toBe('');
  });

  it('flashcards show the cards, not the editing hint', () => {
    const shown = renderBlock(createBlock('flashcards', 'f1'), 'teacher', display);
    expect(shown.textContent).not.toContain('Select this block to edit cards.');
  });

  it('self check can reveal its answer on the display', () => {
    const block = createBlock('self_check', 's1') as Extract<Block, { block_type: 'self_check' }>;
    block.content.prompt = 'Name the device.';
    block.content.answer = 'Metaphor';
    const shown = renderBlock(block, 'teacher', display);
    expect(shown.textContent).not.toContain('Answer hidden');
    expect(shown.querySelector('button')).toBeTruthy();
  });

  it('faded example hides the model answer for blank parts', () => {
    const block = createBlock('faded_example', 'e1') as Extract<Block, { block_type: 'faded_example' }>;
    block.content.extract = 'The road ran on.';
    block.content.parts = [{ label: 'Technique', answer: 'Personification' }];
    block.content.blanks = [0];
    const shown = renderBlock(block, 'teacher', display);
    expect(shown.textContent).not.toContain('Personification');
  });

  it('peer feedback and voice show the task without loading student work', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const peer = renderBlock(createBlock('peer_feedback', 'p1'), 'teacher', display);
    expect(peer.textContent).toContain('on your own device');
    const voice = createBlock('audio', 'v1') as Extract<Block, { block_type: 'audio' }>;
    voice.content.mode = 'respond';
    expect(renderBlock(voice, 'teacher', display).textContent).toContain('Record your answer on your own device.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
