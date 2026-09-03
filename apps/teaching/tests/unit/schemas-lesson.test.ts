import { describe, it, expect } from 'vitest';
import {
  BlockSchema,
  LessonSchema,
  PublishedLessonSchema,
  PublishableLessonSchema,
  toPublishedLesson
} from '@/schemas';

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

describe('BlockSchema', () => {
  it('parses rich_text block with html content', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'rich_text',
      content: { html: '<p>Hello</p>' }
    });
    expect(block.block_type).toBe('rich_text');
    expect(block.content).toEqual({ html: '<p>Hello</p>' });
  });

  it('parses heading block with text and section variant', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'heading',
      variant: 'section',
      content: { text: 'Memory and Identity' }
    });
    expect(block.block_type).toBe('heading');
    expect(block.variant).toBe('section');
    expect(block.content).toEqual({ text: 'Memory and Identity' });
  });

  it('parses callout block with style, title, and body', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'callout',
      content: {
        style: 'extension',
        title: 'Extension',
        body: 'Consider how memory shapes identity.'
      }
    });
    expect(block.block_type).toBe('callout');
    expect(block.content).toEqual({
      style: 'extension',
      title: 'Extension',
      body: 'Consider how memory shapes identity.'
    });
  });

  it('rejects unknown block_type', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'slideshow',
        content: { slides: [] }
      })
    ).toThrow();
  });

  it('parses quote, table, accordion, and question_set blocks', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'quote',
        content: { quote: 'Stillness.', attribution: 'Ishiguro' }
      }).block_type
    ).toBe('quote');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_table',
        block_type: 'table',
        content: { headers: ['A', 'B'], rows: [['1', '2']] }
      }).block_type
    ).toBe('table');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_acc',
        block_type: 'accordion',
        content: { items: [{ title: 'One', body: 'Body' }] }
      }).block_type
    ).toBe('accordion');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_qs',
        block_type: 'question_set',
        content: {
          questions: [{ id: 'q1', prompt: 'Why?', kind: 'short_answer' }]
        }
      }).block_type
    ).toBe('question_set');
  });

  it('rejects heading with invalid variant', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'heading',
        variant: 'medium',
        content: { text: 'Bad heading' }
      })
    ).toThrow();
  });

  it('parses image, video, embed, and html blocks', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'https://example.com/a.png', alt_text: 'A painting', caption: 'Fig 1' }
      }).block_type
    ).toBe('image');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_v',
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ' }
      }).block_type
    ).toBe('video');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_e',
        block_type: 'embed',
        variant: 'large',
        content: { url: 'https://example.com/page', title: 'Example' }
      }).block_type
    ).toBe('embed');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_h',
        block_type: 'html',
        content: { html: '<p>Hi</p>' }
      }).block_type
    ).toBe('html');
  });

  it('allows empty image url in drafts', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'image',
      variant: 'large',
      content: { url: '', alt_text: '' }
    });
    expect(block.block_type).toBe('image');
    if (block.block_type === 'image') {
      expect(block.content.url).toBe('');
    }
  });
});

describe('LessonSchema', () => {
  const draftLesson = {
    id: 'lesson_aotfw_008',
    type: 'lesson' as const,
    title: 'Memory, Identity and Ono',
    slug: 'memory_identity_and_ono',
    unit_id: 'unit_aotfw',
    sequence: 8,
    blocks: [
      {
        ...baseBlock,
        id: 'block_l008_001',
        block_type: 'heading',
        variant: 'page',
        content: { text: 'Memory, Identity and Ono' }
      },
      {
        ...baseBlock,
        id: 'block_l008_002',
        block_type: 'rich_text',
        content: { html: '<p>Ono reflects on his past.</p>' }
      }
    ],
    status: 'active' as const,
    ...timestamps,
    schema_version: 1 as const
  };

  it('parses draft lesson with blocks array', () => {
    const lesson = LessonSchema.parse(draftLesson);
    expect(lesson.type).toBe('lesson');
    expect(lesson.blocks).toHaveLength(2);
    expect(lesson.blocks[0].block_type).toBe('heading');
  });

  it('accepts optional published_at', () => {
    const lesson = LessonSchema.parse({
      ...draftLesson,
      published_at: '2026-02-01T12:00:00.000Z'
    });
    expect(lesson.published_at).toBe('2026-02-01T12:00:00.000Z');
  });

  it('accepts optional tags, review_status, and syllabus outcomes', () => {
    const lesson = LessonSchema.parse({
      ...draftLesson,
      tags: ['assessment', 'module-c'],
      review_status: 'needs_review',
      syllabus_outcomes: ['EA12-8']
    });
    expect(lesson.tags).toEqual(['assessment', 'module-c']);
    expect(lesson.review_status).toBe('needs_review');
    expect(lesson.syllabus_outcomes).toEqual(['EA12-8']);
  });
});

describe('PublishedLessonSchema', () => {
  it('parses published snapshot shape', () => {
    const snapshot = PublishedLessonSchema.parse({
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory, Identity and Ono',
      unit_id: 'unit_aotfw',
      blocks: [
        {
          ...baseBlock,
          block_type: 'rich_text',
          content: { html: '<p>Published content</p>' }
        }
      ],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    expect(snapshot.lesson_id).toBe('lesson_aotfw_008');
    expect(snapshot.blocks).toHaveLength(1);
  });
});

describe('publish helper', () => {
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

  it('rejects empty title on PublishableLessonSchema', () => {
    const result = PublishableLessonSchema.safeParse({ ...validLesson, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only title on PublishableLessonSchema', () => {
    const result = PublishableLessonSchema.safeParse({ ...validLesson, title: '   ' });
    expect(result.success).toBe(false);
  });

  it('builds published snapshot via toPublishedLesson', () => {
    const lesson = LessonSchema.parse(validLesson);
    const snapshot = toPublishedLesson(lesson, '2026-02-01T12:00:00.000Z');
    expect(snapshot.lesson_id).toBe('lesson_aotfw_008');
    expect(snapshot.title).toBe('Memory, Identity and Ono');
    expect(snapshot.published_at).toBe('2026-02-01T12:00:00.000Z');
    expect(snapshot.blocks).toHaveLength(1);
  });
});

describe('PublishableLessonSchema media rules', () => {
  const baseLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'Lesson',
    slug: 'lesson',
    status: 'active' as const,
    unit_id: 'unit_aotfw',
    sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  const okImage = {
    ...baseBlock,
    block_type: 'image' as const,
    variant: 'large',
    content: { url: 'https://example.com/a.png', alt_text: 'Alt' }
  };

  it('rejects image missing alt_text on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...okImage, content: { url: 'https://example.com/a.png', alt_text: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects javascript image url on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'image',
          variant: 'large',
          content: { url: 'javascript:alert(1)', alt_text: 'x' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects gallery item missing alt on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'g1',
          block_type: 'gallery',
          variant: 'large',
          content: {
            layout: 'grid',
            items: [
              { id: 'i1', url: 'https://example.com/a.png', alt_text: 'A' },
              { id: 'i2', url: 'https://example.com/b.png', alt_text: '  ' }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects gallery item with non-http url on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'g1',
          block_type: 'gallery',
          variant: 'large',
          content: {
            layout: 'carousel',
            items: [
              { id: 'i1', url: 'javascript:alert(1)', alt_text: 'A' },
              { id: 'i2', url: 'https://example.com/b.png', alt_text: 'B' }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('publishes gallery with valid items and empty captions', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'g1',
          block_type: 'gallery',
          variant: 'large',
          content: {
            layout: 'comparison',
            items: [
              { id: 'i1', url: 'https://example.com/a.png', alt_text: 'Before' },
              { id: 'i2', url: 'https://example.com/b.png', alt_text: 'After' }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it('rejects unrecognised video on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'video',
          variant: 'large',
          content: { provider: 'youtube', external_id: '' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty html after trim on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...baseBlock, block_type: 'html', content: { html: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty quote on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...baseBlock, block_type: 'quote', content: { quote: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects audio without http url on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...baseBlock, block_type: 'audio', content: { url: 'ftp://x' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects attachment without title on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'attachment',
          content: { url: 'https://example.com/a.pdf', title: '  ' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects question_set with insufficient MC options on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'question_set',
          content: {
            questions: [
              {
                id: 'q1',
                prompt: 'Pick one',
                kind: 'multiple_choice',
                options: ['Only one']
              }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid image video embed html together', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        okImage,
        {
          ...baseBlock,
          id: 'b2',
          block_type: 'video',
          variant: 'large',
          content: { provider: 'vimeo', external_id: '123456789' }
        },
        {
          ...baseBlock,
          id: 'b3',
          block_type: 'embed',
          variant: 'large',
          content: { url: 'https://example.com' }
        },
        {
          ...baseBlock,
          id: 'b4',
          block_type: 'html',
          content: { html: '<p>Ok</p>' }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});

describe('PublishableLessonSchema layout rules', () => {
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

  it('rejects section with empty title on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'sec',
          block_type: 'section',
          content: { title: '   ', blocks: [] }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects nested image missing alt inside columns on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'cols',
          block_type: 'columns',
          content: {
            preset: '50-50',
            columns: [
              {
                width: 6,
                blocks: [
                  {
                    ...baseBlock,
                    id: 'img',
                    block_type: 'image',
                    variant: 'large',
                    content: { url: 'https://example.com/a.png', alt_text: '   ' }
                  }
                ]
              },
              { width: 6, blocks: [] }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects tabs with empty label on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'tabs1',
          block_type: 'tabs',
          content: {
            tabs: [
              { id: 'a', label: '   ', blocks: [] },
              { id: 'b', label: 'OK', blocks: [] }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('allows tabs with empty panels when labels are set', () => {
    const result = PublishableLessonSchema.safeParse({
      ...validLesson,
      blocks: [
        {
          ...baseBlock,
          id: 'tabs1',
          block_type: 'tabs',
          content: {
            tabs: [
              { id: 'a', label: 'One', blocks: [] },
              { id: 'b', label: 'Two', blocks: [] }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});

describe('PublishableLessonSchema timeline rules', () => {
  const baseLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'Lesson',
    slug: 'lesson',
    status: 'active' as const,
    unit_id: 'unit_aotfw',
    sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  const okEvent = {
    id: 'e1',
    when: '1788',
    label: 'First Fleet',
    description: ''
  };

  it('accepts timeline with label, when, and empty description', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: { events: [okEvent] }
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty label on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: { events: [{ ...okEvent, label: '   ' }] }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty when on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: { events: [{ ...okEvent, when: '' }] }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects image_url without http(s)', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: {
            events: [{ ...okEvent, image_url: 'ftp://x', image_alt: 'Alt' }]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects image_url with blank image_alt', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: {
            events: [
              {
                ...okEvent,
                image_url: 'https://example.com/a.png',
                image_alt: '   '
              }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects link_url without http(s)', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: { events: [{ ...okEvent, link_url: 'javascript:alert(1)' }] }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('accepts image with alt and link with url', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'timeline',
          content: {
            events: [
              {
                ...okEvent,
                image_url: 'https://example.com/a.png',
                image_alt: 'Fleet',
                link_url: 'https://example.com/more',
                link_label: 'Read more'
              }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});

describe('PublishableLessonSchema learning activity rules', () => {
  const baseLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'Lesson',
    slug: 'lesson',
    status: 'active' as const,
    unit_id: 'unit_aotfw',
    sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  function flashcard(id: string, front: string, back: string) {
    return { id, front, back };
  }

  const okFlashcards = {
    ...baseBlock,
    block_type: 'flashcards' as const,
    content: {
      cards: [
        flashcard('c1', 'Term', 'Definition'),
        flashcard('c2', 'Q', 'A')
      ]
    }
  };

  const okCloze = {
    ...baseBlock,
    id: 'cl1',
    block_type: 'cloze' as const,
    content: { text: 'The capital of France is [[Paris]].' }
  };

  it('rejects flashcards with empty front on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okFlashcards,
          content: {
            cards: [flashcard('c1', '   ', 'Back'), flashcard('c2', 'Front', 'Back')]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('front and back'))).toBe(true);
    }
  });

  it('rejects flashcards with empty back on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okFlashcards,
          content: {
            cards: [flashcard('c1', 'Front', ''), flashcard('c2', 'Front', 'Back')]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('front and back'))).toBe(true);
    }
  });

  it('rejects cloze without blanks on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...okCloze, content: { text: 'No blanks here.' } }]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('at least one blank'))).toBe(true);
    }
  });

  it('rejects cloze with whitespace-only blank on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...okCloze, content: { text: 'The capital is [[ ]].' } }]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('Cloze blocks need at least one blank'))).toBe(
        true
      );
    }
  });

  it('rejects self_check with empty prompt on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: { mode: 'reveal', prompt: '   ', answer: 'Answer' }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('need a prompt'))).toBe(true);
    }
  });

  it('rejects self_check reveal with empty answer on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: { mode: 'reveal', prompt: 'What is it?', answer: '' }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('need an answer'))).toBe(true);
    }
  });

  it('rejects self_check confidence with empty answer on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: { mode: 'confidence', prompt: 'Rate yourself', answer: '   ' }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('need an answer'))).toBe(true);
    }
  });

  it('rejects self_check checklist with no valid items on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: {
            mode: 'checklist',
            prompt: 'Check off what you know',
            items: [{ id: 'i1', label: '   ' }]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('at least one item'))).toBe(true);
    }
  });

  it('rejects self_check checklist with empty items array on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: {
            mode: 'checklist',
            prompt: 'Check off what you know',
            items: []
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('at least one item'))).toBe(true);
    }
  });

  it('accepts valid flashcards on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [okFlashcards]
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid cloze on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [okCloze]
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid self_check reveal on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: { mode: 'reveal', prompt: 'What is it?', answer: 'The answer' }
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid self_check confidence on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: { mode: 'confidence', prompt: 'How confident are you?', answer: 'Key point' }
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid self_check checklist on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'self_check',
          content: {
            mode: 'checklist',
            prompt: 'What did you learn?',
            items: [{ id: 'i1', label: 'I can explain the concept' }]
          }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});

describe('PublishableLessonSchema visualisation rules', () => {
  const baseLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'Lesson',
    slug: 'lesson',
    status: 'active' as const,
    unit_id: 'unit_aotfw',
    sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  const okChart = {
    ...baseBlock,
    block_type: 'chart' as const,
    content: {
      chart_type: 'bar' as const,
      title: 'Demo',
      series: [
        {
          id: 's1',
          name: 'Series 1',
          points: [
            { x: 'A', y: 3 },
            { x: 'B', y: 5 }
          ]
        }
      ]
    }
  };

  const okEquation = {
    ...baseBlock,
    id: 'eq1',
    block_type: 'equation' as const,
    content: { latex: 'E = mc^2' }
  };

  const okDiagramImage = {
    ...baseBlock,
    id: 'dg1',
    block_type: 'diagram' as const,
    content: {
      source: 'image' as const,
      image_url: 'https://cdn.example.com/diagram.png',
      image_alt: 'Cell diagram'
    }
  };

  const okDiagramSvg = {
    ...baseBlock,
    id: 'dg2',
    block_type: 'diagram' as const,
    content: {
      source: 'svg' as const,
      svg_markup: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'
    }
  };

  const okMindMap = {
    ...baseBlock,
    id: 'mm1',
    block_type: 'mind_map' as const,
    content: {
      nodes: [
        { id: 'n1', label: 'Centre', parent_id: null },
        { id: 'n2', label: 'Idea 1', parent_id: 'n1' },
        { id: 'n3', label: 'Idea 2', parent_id: 'n1' }
      ],
      edges: []
    }
  };

  const okConceptMap = {
    ...baseBlock,
    id: 'cm1',
    block_type: 'concept_map' as const,
    content: {
      nodes: [
        { id: 'a', label: 'Concept A' },
        { id: 'b', label: 'Concept B' }
      ],
      edges: [{ id: 'e1', from: 'a', to: 'b', label: 'relates to' }]
    }
  };

  it('rejects chart with non-finite y on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okChart,
          content: {
            ...okChart.content,
            series: [
              {
                id: 's1',
                name: 'Series 1',
                points: [
                  { x: 'A', y: 3 },
                  { x: 'B', y: Number.POSITIVE_INFINITY }
                ]
              }
            ]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('finite y'))).toBe(true);
    }
  });

  it('rejects equation with empty latex on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...okEquation, content: { latex: '   ' } }]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('LaTeX'))).toBe(true);
    }
  });

  it('rejects caption-only diagram image on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okDiagramImage,
          content: {
            source: 'image',
            image_url: '',
            image_alt: '',
            caption: 'Spacing vs massed practice'
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('http(s) URL'))).toBe(true);
    }
  });

  it('rejects diagram image with bad url on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okDiagramImage,
          content: {
            source: 'image',
            image_url: 'not-a-url',
            image_alt: 'Alt text'
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('http(s) URL'))).toBe(true);
    }
  });

  it('rejects diagram image with missing alt on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okDiagramImage,
          content: {
            source: 'image',
            image_url: 'https://cdn.example.com/diagram.png',
            image_alt: '   '
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('alt text'))).toBe(true);
    }
  });

  it('rejects diagram svg with empty markup on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okDiagramSvg,
          content: { source: 'svg', svg_markup: '' }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('safe SVG'))).toBe(true);
    }
  });

  it('rejects diagram svg that sanitises to empty on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okDiagramSvg,
          content: { source: 'svg', svg_markup: '<script>alert(1)</script>' }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('safe SVG'))).toBe(true);
    }
  });

  it('rejects diagram svg that is only an empty shell on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okDiagramSvg,
          content: { source: 'svg', svg_markup: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('safe SVG'))).toBe(true);
    }
  });

  it('rejects mind map with multiple roots on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okMindMap,
          content: {
            nodes: [
              { id: 'n1', label: 'A', parent_id: null },
              { id: 'n2', label: 'B', parent_id: null }
            ],
            edges: []
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('root'))).toBe(true);
    }
  });

  it('rejects mind map with cycle on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okMindMap,
          content: {
            nodes: [
              { id: 'n1', label: 'A', parent_id: 'n2' },
              { id: 'n2', label: 'B', parent_id: 'n1' }
            ],
            edges: []
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('cycle'))).toBe(true);
    }
  });

  it('rejects concept map with missing edge label on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...okConceptMap,
          content: {
            nodes: [
              { id: 'a', label: 'Concept A' },
              { id: 'b', label: 'Concept B' }
            ],
            edges: [{ id: 'e1', from: 'a', to: 'b', label: '   ' }]
          }
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('label'))).toBe(true);
    }
  });

  it('accepts valid visualisation blocks on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [okChart, okEquation, okDiagramImage, okDiagramSvg, okMindMap, okConceptMap]
    });
    expect(result.success).toBe(true);
  });
});
