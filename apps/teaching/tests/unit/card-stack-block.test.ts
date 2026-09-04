import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';
import { blockQueryText } from '@/alchemy/blockQueryText';

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

function emptyCard(id: string, tint: 'navy' | 'wave' = 'navy') {
  return { id, eyebrow: '', title: '', description: '', tint };
}

describe('CardStackBlockSchema', () => {
  it('parses a card stack with cards', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'card_stack',
      content: {
        title: 'Case studies',
        cards: [
          {
            id: 'c1',
            eyebrow: 'Fintech',
            title: 'Faster onboarding',
            description: 'A clearer first session.',
            image_url: 'https://example.com/a.png',
            image_alt: 'Onboarding',
            tint: 'navy'
          }
        ]
      }
    });
    expect(block.block_type).toBe('card_stack');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    expect(block.content.cards).toHaveLength(1);
    expect(block.content.cards[0]?.tint).toBe('navy');
  });

  it('rejects zero cards and more than 8', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'card_stack',
        content: { cards: [] }
      })
    ).toThrow();
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'card_stack',
        content: {
          cards: Array.from({ length: 9 }, (_, i) => emptyCard(`c${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects card stack inside a columns cell', () => {
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
                  id: 'cs',
                  block_type: 'card_stack',
                  content: { cards: [emptyCard('c1')] }
                }
              ]
            },
            { width: 6, blocks: [] }
          ]
        }
      })
    ).toThrow();
  });

  it('allows card stack inside a section', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Cases',
        blocks: [
          {
            ...baseBlock,
            id: 'cs',
            block_type: 'card_stack',
            content: { cards: [emptyCard('c1')] }
          }
        ]
      }
    });
    expect(block.block_type).toBe('section');
    if (block.block_type !== 'section') throw new Error('expected section');
    expect(block.content.blocks[0]?.block_type).toBe('card_stack');
  });
});

describe('createBlock card_stack', () => {
  it('creates 3 empty cards with cycling tints', () => {
    const block = createBlock('card_stack', 'cs1');
    expect(block.block_type).toBe('card_stack');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    expect(block.content.cards).toHaveLength(3);
    expect(block.content.cards.map((card) => card.id)).toEqual(['cs1_c1', 'cs1_c2', 'cs1_c3']);
    expect(block.content.cards.map((card) => card.tint)).toEqual(['navy', 'wave', 'marine']);
  });

  it('COLUMN_CHILD_TYPES excludes card_stack', () => {
    expect((COLUMN_CHILD_TYPES as readonly string[]).includes('card_stack')).toBe(false);
  });

  it('clone regenerates card ids', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.cards[0]!.title = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'card_stack') throw new Error('expected card_stack');
    expect(cloned.content.cards.map((card) => card.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.cards[0]!.title).toBe('A');
  });
});

describe('card stack editor', () => {
  it('updates heading and title on input', () => {
    const block = createBlock('card_stack', 'cs1');
    let latest: Block = block;
    const editor = createBlockEditor(block, (next) => {
      latest = next;
    });
    const heading = editor.querySelector(
      '[aria-label="Card stack heading"]'
    ) as HTMLInputElement;
    const title = editor.querySelector('[aria-label="Card 1 title"]') as HTMLInputElement;
    heading.value = 'Options';
    heading.dispatchEvent(new Event('input', { bubbles: true }));
    title.value = 'First case';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(latest.block_type).toBe('card_stack');
    if (latest.block_type !== 'card_stack') throw new Error('expected card_stack');
    expect(latest.content.title).toBe('Options');
    expect(latest.content.cards[0]!.title).toBe('First case');
  });

  it('adds up to 8 and removes down to 1', () => {
    const block = createBlock('card_stack', 'cs1');
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
      (mount.querySelector('.block-editor__card-stack-add') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i += 1) add();
    expect(latest.block_type === 'card_stack' && latest.content.cards).toHaveLength(8);
    expect(
      (mount.querySelector('.block-editor__card-stack-add') as HTMLButtonElement).disabled
    ).toBe(true);
    while (latest.block_type === 'card_stack' && latest.content.cards.length > 1) {
      (mount.querySelector('.block-editor__card-stack-remove') as HTMLButtonElement).click();
    }
    expect(latest.block_type === 'card_stack' && latest.content.cards).toHaveLength(1);
    expect(
      (mount.querySelector('.block-editor__card-stack-remove') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('reorders cards with up/down', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.cards[0]!.title = 'A';
    block.content.cards[1]!.title = 'B';
    block.content.cards[2]!.title = 'C';
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
    const downs = mount.querySelectorAll('.block-editor__card-stack-down');
    (downs[0] as HTMLButtonElement).click();
    expect(latest.block_type === 'card_stack' && latest.content.cards.map((card) => card.title)).toEqual([
      'B',
      'A',
      'C'
    ]);
  });
});

describe('card stack render', () => {
  it('renders stacked cards with copy, image, and controls', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.title = 'Case studies';
    block.content.cards = [
      {
        id: 'c1',
        eyebrow: 'Fintech',
        title: 'Faster onboarding',
        description: 'A clearer first session.',
        image_url: 'https://example.com/a.png',
        image_alt: 'Onboarding',
        tint: 'navy'
      },
      {
        id: 'c2',
        eyebrow: 'Climate',
        title: 'Clearer data',
        description: 'Operators can act.',
        tint: 'wave'
      }
    ];
    const el = renderBlock(block, 'student');
    expect(el.dataset.blockType).toBe('card_stack');
    expect(el.querySelector('.block-card-stack__heading')?.textContent).toBe('Case studies');
    expect(el.querySelectorAll('.block-card-stack__card')).toHaveLength(2);
    expect(el.querySelector('.block-card-stack__eyebrow')?.textContent).toBe('Fintech');
    expect(el.querySelector('.block-card-stack__title')?.textContent).toBe('Faster onboarding');
    const img = el.querySelector('.block-card-stack__image') as HTMLImageElement;
    expect(img.src).toContain('https://example.com/a.png');
    expect(img.alt).toBe('Onboarding');
    expect(el.querySelector('.block-card-stack__status')?.textContent).toBe('1 / 2');
    expect((el.querySelector('.block-card-stack__card') as HTMLElement).dataset.tint).toBe('navy');
    (el.querySelector('.block-card-stack__next') as HTMLButtonElement).click();
    expect(el.querySelector('.block-card-stack')?.getAttribute('data-active-index')).toBe('1');
    expect(el.querySelector('.block-card-stack__status')?.textContent).toBe('2 / 2');
  });

  it('print mode stacks cards without controls', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.cards[0]!.title = 'Print me';
    const el = renderBlock(block, 'print');
    expect(el.querySelector('.block-card-stack--print')).toBeTruthy();
    expect(el.querySelector('.block-card-stack__controls')).toBeNull();
    expect(el.querySelectorAll('.block-card-stack__card')).toHaveLength(3);
    expect(el.querySelector('.block-card-stack__title')?.textContent).toBe('Print me');
  });

  it('registry includes card_stack', () => {
    expect(blockRegistry.card_stack).toBeDefined();
    expect(renderBlock(createBlock('card_stack', 'c'), 'student').dataset.blockType).toBe(
      'card_stack'
    );
  });
});

describe('card stack publish and search', () => {
  it('blocks publish when a card title is empty', () => {
    const block = createBlock('card_stack', 'cs1');
    const issues = listPublishBlockIssues([block]);
    expect(issues[0]?.message).toBe('Card stack cards need a title to publish');
  });

  it('requires alt text when an image URL is set', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.cards[0]!.title = 'Ready';
    block.content.cards[1]!.title = 'Also ready';
    block.content.cards[2]!.title = 'Still ready';
    block.content.cards[0]!.image_url = 'https://example.com/a.png';
    expect(listPublishBlockIssues([block])[0]?.message).toBe(
      'Card stack images need alt text to publish'
    );
    block.content.cards[0]!.image_alt = 'A scene';
    expect(listPublishBlockIssues([block])).toEqual([]);
  });

  it('includes card copy in alchemy query text', () => {
    const block = createBlock('card_stack', 'cs1');
    if (block.block_type !== 'card_stack') throw new Error('expected card_stack');
    block.content.title = 'Sources';
    block.content.cards[0]!.title = 'The raft';
    block.content.cards[0]!.description = 'A river crossing.';
    expect(blockQueryText(block)).toContain('The raft');
    expect(blockQueryText(block)).toContain('A river crossing.');
  });
});
