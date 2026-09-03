import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { PublishableLessonSchema } from '@/schemas/lesson';
import {
  BLOCK_GROUPS,
  HOMEPAGE_BLOCK_GROUPS,
  LESSON_BLOCK_GROUPS,
  NEW_BLOCK_TYPES,
  COLUMN_CHILD_TYPES,
  SECTION_CHILD_TYPES,
  TAB_CHILD_TYPES,
  createBlock
} from '@/blocks/create-block';
import {
  RECENT_LESSONS_LIMIT,
  resolveCollection,
  emptyMessageForCollection
} from '@/blocks/collection-resolve';
import { createCollectionEditor } from '@/blocks/editors';
import { renderCollectionBlock } from '@/blocks/render';

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

describe('Collection schema', () => {
  it('parses unit_lessons and recent_lessons', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'collection',
        content: { source: 'unit_lessons' }
      }).block_type
    ).toBe('collection');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'collection',
        content: { source: 'recent_lessons', title: 'Recent' }
      }).content
    ).toMatchObject({ source: 'recent_lessons', title: 'Recent' });
  });

  it('rejects unknown source', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'collection',
        content: { source: 'resources' }
      })
    ).toThrow();
  });
});

describe('createBlock collection menus', () => {
  it('creates unit_lessons default', () => {
    const block = createBlock('collection', 'c1');
    expect(block.block_type).toBe('collection');
    if (block.block_type !== 'collection') return;
    expect(block.content.source).toBe('unit_lessons');
  });

  it('lists collection on homepage Layout but not lesson menu or nest children', () => {
    expect(NEW_BLOCK_TYPES).toContain('collection');
    const layout = BLOCK_GROUPS.find((g) => g.label === 'Layout');
    expect(layout?.types).toContain('collection');
    expect(
      HOMEPAGE_BLOCK_GROUPS.find((g) => g.label === 'Layout')?.types
    ).toContain('collection');
    expect(
      LESSON_BLOCK_GROUPS.find((g) => g.label === 'Layout')?.types
    ).not.toContain('collection');
    expect(COLUMN_CHILD_TYPES).not.toContain('collection');
    expect(SECTION_CHILD_TYPES).not.toContain('collection');
    expect(TAB_CHILD_TYPES).not.toContain('collection');
  });
});

describe('PublishableLessonSchema collection rules', () => {
  const validLesson = {
    id: 'lesson_aotfw_008',
    type: 'lesson' as const,
    title: 'Memory, Identity and Ono',
    slug: 'memory_identity_and_ono',
    unit_id: 'unit_aotfw',
    sequence: 8,
    blocks: [
      {
        ...baseBlock,
        block_type: 'rich_text',
        content: { html: '<p>Content</p>' }
      }
    ],
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const
  };

  it('rejects collection block in a lesson on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [createBlock('collection', 'c1')]
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('class homepages'))).toBe(
      true
    );
  });
});

describe('renderCollectionBlock', () => {
  it('renders links and empty state', () => {
    const block = createBlock('collection', 'c1');
    if (block.block_type !== 'collection') return;

    const withLinks = renderCollectionBlock(block, 'student', {
      links: [{ lesson_id: 'l1', title: 'Lesson 1', href: '/s/lessons/l1' }]
    });
    expect(withLinks.classList.contains('block-collection')).toBe(true);
    expect(withLinks.querySelector('a')?.getAttribute('href')).toBe('/s/lessons/l1');

    const empty = renderCollectionBlock(block, 'student', {
      links: [],
      emptyMessage: 'No current unit.'
    });
    expect(empty.textContent).toMatch(/No current unit/);
  });
});

describe('createCollectionEditor', () => {
  it('updates source via onChange and refreshes preview from resolveCollection', () => {
    const block = createBlock('collection', 'c1');
    if (block.block_type !== 'collection') return;

    let latest = block;
    const editor = createCollectionEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest,
      {
        resolveCollection: (current) => ({
          links: [
            {
              lesson_id: 'l1',
              title: current.content.source === 'recent_lessons' ? 'Recent link' : 'Unit link',
              href: '/s/lessons/l1'
            }
          ]
        })
      }
    );

    expect(editor.querySelector('.block-editor__collection-preview a')?.textContent).toBe(
      'Unit link'
    );

    const source = editor.querySelector<HTMLSelectElement>('.block-editor__collection-source');
    expect(source).toBeTruthy();
    source!.value = 'recent_lessons';
    source!.dispatchEvent(new Event('change'));

    expect(latest.content.source).toBe('recent_lessons');
    expect(editor.querySelector('.block-editor__collection-preview a')?.textContent).toBe(
      'Recent link'
    );
  });
});

describe('collection-resolve', () => {
  it('resolves unit lessons in unit order', () => {
    const links = resolveCollection(
      { source: 'unit_lessons' },
      {
        currentUnitId: 'unit_1',
        unitLessons: [
          { lesson_id: 'l2', title: 'B' },
          { lesson_id: 'l1', title: 'A' }
        ],
        schedule: []
      }
    );
    expect(links.map((l) => l.lesson_id)).toEqual(['l2', 'l1']);
    expect(links[0]?.href).toBe('/s/lessons/l2');
  });

  it('returns empty when no current unit', () => {
    expect(
      resolveCollection(
        { source: 'unit_lessons' },
        { currentUnitId: undefined, unitLessons: [{ lesson_id: 'l1', title: 'A' }], schedule: [] }
      )
    ).toEqual([]);
    expect(emptyMessageForCollection('unit_lessons', { hasCurrentUnit: false, linkCount: 0 })).toMatch(
      /current unit/i
    );
  });

  it('resolves recent lessons newest first, capped, publishedOnly', () => {
    const schedule = [
      { lesson_id: 'a', title: 'A', schedule_order: 1, published: true },
      { lesson_id: 'b', title: 'B', schedule_order: 3, published: false },
      { lesson_id: 'c', title: 'C', schedule_order: 2, published: true },
      { lesson_id: 'd', title: 'D', schedule_order: 4, published: true },
      { lesson_id: 'e', title: 'E', schedule_order: 5, published: true },
      { lesson_id: 'f', title: 'F', schedule_order: 6, published: true }
    ];
    const student = resolveCollection(
      { source: 'recent_lessons' },
      { schedule },
      { publishedOnly: true }
    );
    expect(student).toHaveLength(RECENT_LESSONS_LIMIT);
    expect(student.map((l) => l.lesson_id)).toEqual(['f', 'e', 'd', 'c', 'a']);

    const teacher = resolveCollection(
      { source: 'recent_lessons' },
      { schedule },
      { publishedOnly: false }
    );
    expect(teacher[0]?.lesson_id).toBe('f');
    expect(teacher.map((l) => l.lesson_id)).toContain('b');
  });
});
