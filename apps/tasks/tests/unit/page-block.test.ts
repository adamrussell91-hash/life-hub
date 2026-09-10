import { describe, expect, it } from 'vitest';
import { PageBlockSchema } from '@/schemas/page-block';
import { taskPaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';

describe('page block schema', () => {
  it('accepts the calendar stub quote shape and fills Teaching Hub fields', () => {
    const block = PageBlockSchema.parse({
      id: 'block_q',
      type: 'block',
      block_type: 'quote',
      variant: 'medium',
      content: { text: 'Hold the line', attribution: 'Adam' },
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(block).toMatchObject({
      block_type: 'quote',
      visibility: 'student_teacher',
      content: { quote: 'Hold the line', attribution: 'Adam' }
    });
  });

  it('keeps the full Teaching Hub family list on task pages', () => {
    const families = taskPaletteFamilies();
    expect(families.map((family) => family.id)).toEqual([
      'Basic',
      'Media',
      'Teaching',
      'Learning',
      'Visualisation',
      'Layout'
    ]);
    const types = families.flatMap((family) =>
      family.cards.filter((card) => card.kind === 'block').map((card) => card.type)
    );
    expect(types).toEqual(
      expect.arrayContaining([
        'heading',
        'rich_text',
        'callout',
        'image',
        'video',
        'flashcards',
        'cloze',
        'equation',
        'mind_map',
        'columns',
        'tabs',
        'question_set'
      ])
    );
    expect(types).not.toContain('collection');
  });
});
