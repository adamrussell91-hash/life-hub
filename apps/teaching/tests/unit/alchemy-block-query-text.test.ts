import { describe, expect, it } from 'vitest';
import { blockQueryText } from '@/alchemy/blockQueryText';
import type { Block } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

function heading(text: string): Block {
  return {
    id: 'h1',
    type: 'block',
    block_type: 'heading',
    variant: 'section',
    visibility: 'student_teacher',
    content: { text },
    layout: {},
    print: {},
    settings: {},
    ...timestamps,
    schema_version: 1
  };
}

describe('blockQueryText', () => {
  it('returns empty for no block', () => {
    expect(blockQueryText(null)).toBe('');
  });

  it('uses heading text', () => {
    expect(blockQueryText(heading('  Inherited duty  '))).toBe('Inherited duty');
  });

  it('strips rich_text html', () => {
    const block = {
      ...heading('x'),
      id: 'r1',
      block_type: 'rich_text' as const,
      variant: 'medium',
      content: { html: '<p>A <em>Heaney</em> poem</p>' }
    } as Block;
    expect(blockQueryText(block)).toBe('A Heaney poem');
  });

  it('joins section children', () => {
    const section = {
      id: 's1',
      type: 'block' as const,
      block_type: 'section' as const,
      variant: 'plain',
      visibility: 'student_teacher' as const,
      content: { title: 'Starter', blocks: [heading('Caesar'), heading('Heaney')] },
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1 as const
    } as Block;
    expect(blockQueryText(section)).toBe('Starter\n\nCaesar\n\nHeaney');
  });

  it('caps at 8000 characters', () => {
    expect(blockQueryText(heading('a'.repeat(9000))).length).toBe(8000);
  });
});
