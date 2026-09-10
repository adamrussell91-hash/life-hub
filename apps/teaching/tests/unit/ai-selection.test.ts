import { describe, expect, it } from 'vitest';
import { resolveSelection } from '@/ai/selection';
import type { Block } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

function heading(id: string): Block {
  return {
    id,
    type: 'block',
    block_type: 'heading',
    variant: 'section',
    visibility: 'student_teacher',
    content: { text: 'A' },
    layout: {},
    print: {},
    settings: {},
    ...timestamps,
    schema_version: 1
  };
}

describe('resolveSelection', () => {
  const blocks = [heading('block_1')];

  it('keeps a hint the saved draft knows about', () => {
    expect(resolveSelection(blocks, 'block_1', 'block')).toEqual({
      selectedBlockId: 'block_1',
      scope: 'block'
    });
  });

  it('drops to lesson scope for a block the draft has not saved yet', () => {
    expect(resolveSelection(blocks, 'block_added_seconds_ago', 'block')).toEqual({
      selectedBlockId: null,
      scope: 'lesson'
    });
  });

  it('treats a missing or blank hint as no selection', () => {
    expect(resolveSelection(blocks, undefined, 'lesson')).toEqual({
      selectedBlockId: null,
      scope: 'lesson'
    });
    expect(resolveSelection(blocks, '   ', 'block')).toEqual({
      selectedBlockId: null,
      scope: 'lesson'
    });
  });

  it('finds blocks nested inside layout blocks', () => {
    const nested = {
      id: 'section_1',
      type: 'block',
      block_type: 'section',
      variant: 'plain',
      visibility: 'student_teacher',
      content: { title: 'S', blocks: [heading('inner_1')] },
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1
    } as Extract<Block, { block_type: 'section' }>;

    expect(resolveSelection([nested], 'inner_1', 'block')).toEqual({
      selectedBlockId: 'inner_1',
      scope: 'block'
    });
  });
});
