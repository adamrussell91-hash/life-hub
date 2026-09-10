import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';

function emptyCard(id: string) {
  return { id, eyebrow: '', title: '', description: '', tint: 'navy' as const };
}

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('card stack page block', () => {
  it('parses and creates a card stack', () => {
    const parsed = BlockSchema.parse({
      ...baseBlock,
      block_type: 'card_stack',
      content: { cards: [emptyCard('c1')] }
    });
    expect(parsed.block_type).toBe('card_stack');
    const created = createBlock('card_stack', 'cs1');
    expect(created.block_type).toBe('card_stack');
    if (created.block_type !== 'card_stack') throw new Error('expected card_stack');
    expect(created.content.cards).toHaveLength(3);
    expect((COLUMN_CHILD_TYPES as readonly string[]).includes('card_stack')).toBe(false);
  });

  it('clones card ids and renders the stack', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.cards[0]!.title = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    if (cloned.block_type !== 'card_stack') throw new Error('expected card_stack');
    expect(cloned.content.cards.map((card) => card.id)).toEqual(['id_2', 'id_3', 'id_4']);

    cloned.content.cards[0]!.title = 'First';
    cloned.content.cards[1]!.title = 'Second';
    const el = renderBlock(cloned, 'student');
    expect(el.dataset.blockType).toBe('card_stack');
    expect(el.querySelectorAll('.block-card-stack__card')).toHaveLength(3);
    (el.querySelector('.block-card-stack__next') as HTMLButtonElement).click();
    expect(el.querySelector('.block-card-stack')?.getAttribute('data-active-index')).toBe('1');
    expect(blockRegistry.card_stack).toBeDefined();
  });

  it('edits the first card title', () => {
    const block = createBlock('card_stack', 'cs1');
    let latest: Block = block;
    const editor = createBlockEditor(block, (next) => {
      latest = next;
    });
    const title = editor.querySelector('[aria-label="Card 1 title"]') as HTMLInputElement;
    title.value = 'Option A';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(latest.block_type === 'card_stack' && latest.content.cards[0]?.title).toBe('Option A');
  });
});
