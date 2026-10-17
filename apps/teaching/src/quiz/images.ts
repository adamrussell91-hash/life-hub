import type { Block } from '@/schemas/block';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { QuizImage } from '@/quiz/core';

/** The images already in a lesson: the only pictures a student may put in a question. */
export function lessonImages(blocks: Block[]): QuizImage[] {
  const out = new Map<string, QuizImage>();
  visitBlocks(blocks, (block) => {
    if (block.block_type === 'image' && block.content.url) out.set(block.content.url, { url: block.content.url, alt: block.content.alt_text ?? '' });
    if (block.block_type === 'gallery') {
      for (const item of block.content.items) if (item.url) out.set(item.url, { url: item.url, alt: item.alt_text ?? '' });
    }
  });
  return [...out.values()];
}
