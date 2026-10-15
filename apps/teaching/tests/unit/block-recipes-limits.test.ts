import { describe, expect, it } from 'vitest';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { createBlock } from '@/blocks/create-block';
import { BlockSchema } from '@/schemas/block';

function withItems(type: 'flashcards' | 'card_stack' | 'timeline', count: number) {
  const block = createBlock(type, `${type}_limit`) as { content: Record<string, unknown[]> };
  const key = type === 'timeline' ? 'events' : 'cards';
  const sample = block.content[key]![0] as { id: string };
  block.content[key] = Array.from({ length: count }, (_, i) => ({ ...sample, id: `${sample.id}_${i}` }));
  return block;
}

describe('block recipe limits', () => {
  it.each([
    ['flashcards', 20, 'flashcards: 20 cards'],
    ['card_stack', 8, 'card_stack 8 cards'],
    ['timeline', 12, 'timeline 12 events']
  ] as const)('%s cap stated in the recipes matches the schema (%i)', (type, cap, phrase) => {
    expect(BLOCK_BUILD_RECIPES).toContain(phrase);
    expect(BlockSchema.safeParse(withItems(type, cap)).success).toBe(true);
    expect(BlockSchema.safeParse(withItems(type, cap + 1)).success).toBe(false);
  });

  it('tells agents to flag limits before agreeing', () => {
    expect(BLOCK_BUILD_RECIPES).toContain('Never agree to something these limits rule out');
    expect(BLOCK_BUILD_RECIPES).toContain('at most 48 blocks');
    expect(BLOCK_BUILD_RECIPES).toMatch(/Draw on a whiteboard/);
    expect(BLOCK_BUILD_RECIPES).toMatch(/voice tracks/);
  });
});
