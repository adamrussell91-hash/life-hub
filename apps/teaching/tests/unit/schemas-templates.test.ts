import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { LessonTemplateSchema } from '@/schemas/lesson-template';
import { UnitTemplateSchema } from '@/schemas/unit-template';
import { lessonTemplateKey, unitTemplateKey } from '@/storage/keys';

describe('LessonTemplateSchema', () => {
  it('accepts a lesson template with blocks', () => {
    const parsed = LessonTemplateSchema.safeParse({
      id: 'lesson_template_1',
      type: 'lesson_template',
      title: 'Close reading',
      slug: 'close-reading',
      status: 'active',
      blocks: [createBlock('heading', 'h1')],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty title', () => {
    const parsed = LessonTemplateSchema.safeParse({
      id: 'lesson_template_1',
      type: 'lesson_template',
      title: '',
      slug: 'x',
      status: 'active',
      blocks: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(false);
  });
});

describe('UnitTemplateSchema', () => {
  it('accepts a unit template with optional blocks', () => {
    const parsed = UnitTemplateSchema.safeParse({
      id: 'unit_template_1',
      type: 'unit_template',
      title: 'Poetry unit',
      slug: 'poetry-unit',
      status: 'active',
      description: 'Overview',
      blocks: [createBlock('rich_text', 'rt1')],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(true);
  });
});

describe('cloneBlocksWithNewIds', () => {
  it('assigns unique ids distinct from source', () => {
    let n = 0;
    const source = [createBlock('heading', 'h_src'), createBlock('rich_text', 'rt_src')];
    const cloned = cloneBlocksWithNewIds(source, () => `block_new_${n++}`);
    expect(cloned.map((b) => b.id)).toEqual(['block_new_0', 'block_new_1']);
    expect(cloned[0]?.id).not.toBe(source[0]?.id);
  });
});

describe('template storage keys', () => {
  it('uses templates/lessons and templates/units prefixes', () => {
    expect(lessonTemplateKey('a')).toBe('templates/lessons/a');
    expect(unitTemplateKey('b')).toBe('templates/units/b');
  });
});
