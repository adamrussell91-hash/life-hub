import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';

const ISO = '2026-01-01T00:00:00.000Z';

function baseSection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'block_1',
    type: 'block',
    block_type: 'section',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { title: 'Hint', blocks: [] },
    layout: {},
    print: {},
    settings: {},
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

describe('linked section schema', () => {
  it('accepts linked stub with empty blocks', () => {
    const parsed = BlockSchema.safeParse(
      baseSection({
        content: {
          title: 'Hint',
          blocks: [],
          link: { mode: 'linked', source_composition_id: 'composition_1' }
        }
      })
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects linked stub with non-empty blocks', () => {
    const child = {
      id: 'block_child',
      type: 'block',
      block_type: 'rich_text',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>x</p>' },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const parsed = BlockSchema.safeParse(
      baseSection({
        content: {
          title: 'Hint',
          blocks: [child],
          link: { mode: 'linked', source_composition_id: 'composition_1' }
        }
      })
    );
    expect(parsed.success).toBe(false);
  });

  it('still accepts independent sections without link', () => {
    expect(BlockSchema.safeParse(baseSection()).success).toBe(true);
  });
});
