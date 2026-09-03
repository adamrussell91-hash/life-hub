import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';

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

function emptyEvent(id: string) {
  return { id, when: '', label: '', description: '' };
}

describe('TimelineBlockSchema', () => {
  it('parses timeline with events', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'timeline',
      content: {
        events: [
          {
            id: 'e1',
            when: '1788',
            label: 'First Fleet',
            description: 'Arrival',
            image_url: 'https://example.com/a.png',
            image_alt: 'Fleet',
            link_url: 'https://example.com',
            link_label: 'Read more'
          }
        ]
      }
    });
    expect(block.block_type).toBe('timeline');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    expect(block.content.events).toHaveLength(1);
  });

  it('rejects zero events', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'timeline',
        content: { events: [] }
      })
    ).toThrow();
  });

  it('rejects more than 12 events', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'timeline',
        content: {
          events: Array.from({ length: 13 }, (_, i) => emptyEvent(`e${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects timeline inside a columns cell', () => {
    expect(() =>
      BlockSchema.parse({
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
                  id: 'tl',
                  block_type: 'timeline',
                  content: { events: [emptyEvent('e1')] }
                }
              ]
            },
            { width: 6, blocks: [] }
          ]
        }
      })
    ).toThrow();
  });

  it('allows timeline inside a section', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Era',
        blocks: [
          {
            ...baseBlock,
            id: 'tl',
            block_type: 'timeline',
            content: { events: [emptyEvent('e1')] }
          }
        ]
      }
    });
    expect(block.block_type).toBe('section');
    if (block.block_type !== 'section') throw new Error('expected section');
    expect(block.content.blocks[0]?.block_type).toBe('timeline');
  });
});

describe('createBlock timeline', () => {
  it('creates 3 empty events', () => {
    const block = createBlock('timeline', 'tl1');
    expect(block.block_type).toBe('timeline');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    expect(block.content.events).toHaveLength(3);
    expect(block.content.events.map((e) => e.id)).toEqual(['tl1_e1', 'tl1_e2', 'tl1_e3']);
    expect(block.content.events[0]).toMatchObject({
      when: '',
      label: '',
      description: ''
    });
  });

  it('COLUMN_CHILD_TYPES excludes timeline', () => {
    expect((COLUMN_CHILD_TYPES as readonly string[]).includes('timeline')).toBe(false);
  });

  it('clone regenerates event ids', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events[0]!.label = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'timeline') throw new Error('expected timeline');
    expect(cloned.content.events.map((e) => e.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.events[0]!.label).toBe('A');
  });
});

describe('timeline editor', () => {
  it('updates when and label on input', () => {
    const block = createBlock('timeline', 'tl1');
    let latest: Block = block;
    const editor = createBlockEditor(block, (next) => {
      latest = next;
    });
    const when = editor.querySelector(
      '[aria-label="Timeline event 1 when"]'
    ) as HTMLInputElement;
    const label = editor.querySelector(
      '[aria-label="Timeline event 1 label"]'
    ) as HTMLInputElement;
    when.value = '1788';
    when.dispatchEvent(new Event('input', { bubbles: true }));
    label.value = 'Fleet';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    expect(latest.block_type).toBe('timeline');
    if (latest.block_type !== 'timeline') throw new Error('expected timeline');
    expect(latest.content.events[0]!.when).toBe('1788');
    expect(latest.content.events[0]!.label).toBe('Fleet');
  });

  it('adds up to 12 and removes down to 1', () => {
    const block = createBlock('timeline', 'tl1');
    let latest: Block = block;
    const mount = document.createElement('div');
    const rebuild = () => {
      mount.replaceChildren(
        createBlockEditor(latest, (next) => {
          latest = next;
          rebuild();
        })
      );
    };
    rebuild();
    const add = () =>
      (mount.querySelector('.block-editor__timeline-add') as HTMLButtonElement).click();
    for (let i = 0; i < 9; i += 1) add();
    expect(latest.block_type === 'timeline' && latest.content.events).toHaveLength(12);
    expect(
      (mount.querySelector('.block-editor__timeline-add') as HTMLButtonElement).disabled
    ).toBe(true);
    while (latest.block_type === 'timeline' && latest.content.events.length > 1) {
      (mount.querySelector('.block-editor__timeline-remove') as HTMLButtonElement).click();
    }
    expect(latest.block_type === 'timeline' && latest.content.events).toHaveLength(1);
    expect(
      (mount.querySelector('.block-editor__timeline-remove') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('reorders events with up/down', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events[0]!.label = 'A';
    block.content.events[1]!.label = 'B';
    block.content.events[2]!.label = 'C';
    let latest: Block = block;
    const mount = document.createElement('div');
    const rebuild = () => {
      mount.replaceChildren(
        createBlockEditor(latest, (next) => {
          latest = next;
          rebuild();
        })
      );
    };
    rebuild();
    const downs = mount.querySelectorAll('.block-editor__timeline-down');
    (downs[0] as HTMLButtonElement).click();
    expect(latest.block_type === 'timeline' && latest.content.events.map((e) => e.label)).toEqual([
      'B',
      'A',
      'C'
    ]);
  });
});

describe('timeline render', () => {
  it('renders ordered list with when, label, description', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events = [
      {
        id: 'e1',
        when: '1788',
        label: 'First Fleet',
        description: 'Arrival at Sydney Cove',
        image_url: 'https://example.com/a.png',
        image_alt: 'Fleet',
        link_url: 'https://example.com/more',
        link_label: 'Read more'
      }
    ];
    const el = renderBlock(block, 'student');
    expect(el.dataset.blockType).toBe('timeline');
    expect(el.querySelector('.block-timeline')).toBeTruthy();
    expect(el.querySelectorAll('.block-timeline__event')).toHaveLength(1);
    expect(el.querySelector('.block-timeline__when')?.textContent).toBe('1788');
    expect(el.querySelector('.block-timeline__label')?.textContent).toBe('First Fleet');
    expect(el.querySelector('.block-timeline__description')?.textContent).toBe(
      'Arrival at Sydney Cove'
    );
    const img = el.querySelector('.block-timeline__image') as HTMLImageElement;
    expect(img.src).toContain('https://example.com/a.png');
    expect(img.alt).toBe('Fleet');
    const link = el.querySelector('.block-timeline__link') as HTMLAnchorElement;
    expect(link.href).toBe('https://example.com/more');
    expect(link.textContent).toBe('Read more');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('uses Open link when link_label empty', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events = [
      {
        id: 'e1',
        when: '1',
        label: 'A',
        description: '',
        link_url: 'https://example.com'
      }
    ];
    const el = renderBlock(block, 'student');
    expect(el.querySelector('.block-timeline__link')?.textContent).toBe('Open link');
  });

  it('registry includes timeline', () => {
    expect(blockRegistry.timeline).toBeDefined();
    expect(renderBlock(createBlock('timeline', 't'), 'student').dataset.blockType).toBe(
      'timeline'
    );
  });
});
