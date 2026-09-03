import { describe, it, expect, vi } from 'vitest';
import { createBlock, cloneBlockWithNewIds, TAB_CHILD_TYPES } from '@/blocks/create-block';
import {
  createTabsEditor,
  renderTabsBlock,
  renderBlock
} from '@/blocks/registry';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import { BlockSchema, type Block } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const base = {
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

const rich = (id: string, html = '') => ({
  ...base,
  id,
  block_type: 'rich_text' as const,
  content: { html }
});

const emptyTabs = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    label: `Tab ${i + 1}`,
    blocks: [] as Block[]
  }));

describe('tabs block schema', () => {
  it('parses a tabs block', () => {
    expect(
      BlockSchema.parse({
        ...base,
        id: 'tabs1',
        block_type: 'tabs',
        content: {
          tabs: [
            { id: 'a', label: 'One', blocks: [rich('r1')] },
            { id: 'b', label: 'Two', blocks: [] }
          ]
        }
      }).block_type
    ).toBe('tabs');
  });

  it('rejects nested tabs inside a panel', () => {
    const nested = {
      ...base,
      id: 'inner',
      block_type: 'tabs' as const,
      content: { tabs: emptyTabs(2) }
    };
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'tabs',
      content: {
        tabs: [
          { id: 'a', label: 'A', blocks: [nested] },
          { id: 'b', label: 'B', blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section inside a tab panel', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'tabs1',
      block_type: 'tabs',
      content: {
        tabs: [
          {
            id: 'a',
            label: 'A',
            blocks: [
              {
                ...base,
                id: 'sec',
                block_type: 'section',
                content: { title: 'Nope', blocks: [] }
              }
            ]
          },
          { id: 'b', label: 'B', blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects tabs inside a column', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'cols',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          {
            width: 6,
            blocks: [
              {
                ...base,
                id: 'tabs1',
                block_type: 'tabs',
                content: { tabs: emptyTabs(2) }
              }
            ]
          },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('allows tabs inside a section', () => {
    const parsed = BlockSchema.parse({
      ...base,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Compare',
        blocks: [
          {
            ...base,
            id: 'tabs1',
            block_type: 'tabs',
            content: {
              tabs: [
                { id: 'a', label: 'A', blocks: [rich('r1')] },
                { id: 'b', label: 'B', blocks: [] }
              ]
            }
          }
        ]
      }
    });
    expect(parsed.block_type).toBe('section');
  });

  it('allows columns inside a tab panel', () => {
    const parsed = BlockSchema.parse({
      ...base,
      id: 'tabs1',
      block_type: 'tabs',
      content: {
        tabs: [
          {
            id: 'a',
            label: 'A',
            blocks: [
              {
                ...base,
                id: 'cols',
                block_type: 'columns',
                content: {
                  preset: '50-50',
                  columns: [
                    { width: 6, blocks: [rich('l')] },
                    { width: 6, blocks: [rich('r')] }
                  ]
                }
              }
            ]
          },
          { id: 'b', label: 'B', blocks: [] }
        ]
      }
    });
    expect(parsed.block_type).toBe('tabs');
  });

  it('rejects fewer than 2 tabs', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'tabs1',
      block_type: 'tabs',
      content: { tabs: [{ id: 'a', label: 'A', blocks: [] }] }
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 8 tabs', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'tabs1',
      block_type: 'tabs',
      content: { tabs: emptyTabs(9) }
    });
    expect(result.success).toBe(false);
  });
});

describe('createBlock tabs', () => {
  it('creates three empty panels', () => {
    const block = createBlock('tabs', 'tabs1');
    expect(block.block_type).toBe('tabs');
    if (block.block_type !== 'tabs') throw new Error('expected tabs');
    expect(block.content.tabs).toHaveLength(3);
    expect(block.content.tabs.map((t) => t.label)).toEqual(['', '', '']);
    expect(block.content.tabs.every((t) => t.blocks.length === 0)).toBe(true);
    expect(block.content.tabs.map((t) => t.id)).toEqual([
      'tabs1_t1',
      'tabs1_t2',
      'tabs1_t3'
    ]);
  });

  it('TAB_CHILD_TYPES excludes tabs and section', () => {
    expect((TAB_CHILD_TYPES as readonly string[]).includes('tabs')).toBe(false);
    expect((TAB_CHILD_TYPES as readonly string[]).includes('section')).toBe(false);
    expect(TAB_CHILD_TYPES.includes('columns')).toBe(true);
  });
});

describe('cloneBlockWithNewIds tabs', () => {
  it('regenerates panel and child ids', () => {
    let n = 0;
    const nextId = () => `id_${++n}`;

    const tabs = createBlock('tabs', 'tabs1');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    tabs.content.tabs[0]!.blocks = [
      createBlock('rich_text', 'rt') as (typeof tabs.content.tabs)[number]['blocks'][number]
    ];

    const clone = cloneBlockWithNewIds(tabs, nextId);
    expect(clone.id).toBe('id_1');
    if (clone.block_type !== 'tabs') throw new Error('expected tabs');
    // Panel 0 id, then its child, then remaining panel ids
    expect(clone.content.tabs[0]!.id).toBe('id_2');
    expect(clone.content.tabs[0]!.blocks[0]!.id).toBe('id_3');
    expect(clone.content.tabs[1]!.id).toBe('id_4');
    expect(clone.content.tabs[2]!.id).toBe('id_5');
    expect(tabs.content.tabs[0]!.id).toBe('tabs1_t1');
  });
});

describe('sanitizeBlocksDeep tabs', () => {
  it('sanitises rich_text nested under tabs', () => {
    const tabs = createBlock('tabs', 'tabs1');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    const rt = createBlock('rich_text', 'rt');
    if (rt.block_type !== 'rich_text') throw new Error('expected rich_text');
    rt.content.html = '<p>Hi<script>alert(1)</script></p>';
    tabs.content.tabs[0]!.blocks = [rt] as (typeof tabs.content.tabs)[number]['blocks'];

    const [out] = sanitizeBlocksDeep([tabs]);
    if (out?.block_type !== 'tabs') throw new Error('expected tabs');
    const child = out.content.tabs[0]!.blocks[0]!;
    if (child.block_type !== 'rich_text') throw new Error('expected rich_text');
    expect(child.content.html).not.toContain('<script>');
  });
});

describe('renderTabsBlock', () => {
  it('selects the first tab by default and switches on click', () => {
    const tabs = createBlock('tabs', 'tabs1');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    tabs.content.tabs[0]!.label = 'Alpha';
    tabs.content.tabs[1]!.label = 'Beta';
    tabs.content.tabs[0]!.blocks = [
      createBlock('rich_text', 'a') as (typeof tabs.content.tabs)[number]['blocks'][number]
    ];
    tabs.content.tabs[1]!.blocks = [
      createBlock('heading', 'b') as (typeof tabs.content.tabs)[number]['blocks'][number]
    ];

    const el = renderTabsBlock(tabs, 'student');
    const tabButtons = el.querySelectorAll('[role="tab"]');
    expect(tabButtons).toHaveLength(3);
    expect(tabButtons[0]!.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[data-block-type="rich_text"]')).toBeTruthy();
    expect(el.querySelector('[data-block-type="heading"]')).toBeFalsy();

    (tabButtons[1] as HTMLButtonElement).click();
    expect(tabButtons[1]!.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[data-block-type="heading"]')).toBeTruthy();
    expect(el.querySelector('[data-block-type="rich_text"]')).toBeFalsy();
  });

  it('arrow keys move between tabs', () => {
    const tabs = createBlock('tabs', 'tabs1');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    tabs.content.tabs[0]!.label = 'A';
    tabs.content.tabs[1]!.label = 'B';
    const el = renderTabsBlock(tabs, 'student');
    const tablist = el.querySelector('[role="tablist"]') as HTMLElement;
    const tabButtons = el.querySelectorAll('[role="tab"]');

    (tabButtons[0] as HTMLElement).focus();
    tablist.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(tabButtons[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('renderBlock dispatches tabs', () => {
    expect(renderBlock(createBlock('tabs', 't'), 'student').dataset.blockType).toBe('tabs');
  });
});

describe('createTabsEditor', () => {
  it('label input updates panel label', () => {
    const block = createBlock('tabs', 'tabs1');
    const onChange = vi.fn();
    let latest = block;
    const el = createTabsEditor(
      block as Extract<Block, { block_type: 'tabs' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'tabs' }>
    );
    const input = el.querySelector('.block-editor__tab-label') as HTMLInputElement;
    input.value = 'Sources';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const updated = onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'tabs' }>;
    expect(updated.content.tabs[0]!.label).toBe('Sources');
  });

  it('add panel works until max 8; remove until min 2', () => {
    const block = createBlock('tabs', 'tabs1');
    const onChange = vi.fn();
    let latest = block;
    const el = createTabsEditor(
      block as Extract<Block, { block_type: 'tabs' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'tabs' }>
    );

    const addBtn = el.querySelector('.block-editor__tabs-add') as HTMLButtonElement;
    for (let i = 0; i < 5; i += 1) {
      addBtn.click();
    }
    expect(
      (onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'tabs' }>).content.tabs
        .length
    ).toBe(8);
    expect(addBtn.disabled).toBe(true);

    // Rebuild editor from latest so remove buttons reflect 8 panels
    const el2 = createTabsEditor(
      latest as Extract<Block, { block_type: 'tabs' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'tabs' }>
    );
    for (let i = 0; i < 6; i += 1) {
      const remove = el2.querySelector('.block-editor__tabs-remove') as HTMLButtonElement;
      remove.click();
    }
    expect(
      (latest as Extract<Block, { block_type: 'tabs' }>).content.tabs.length
    ).toBe(2);
    const removeDisabled = el2.querySelector(
      '.block-editor__tabs-remove'
    ) as HTMLButtonElement;
    expect(removeDisabled.disabled).toBe(true);
  });

  it('can add columns inside a tab panel', () => {
    const block = createBlock('tabs', 'tabs1');
    const onChange = vi.fn();
    let latest = block;
    const el = createTabsEditor(
      block as Extract<Block, { block_type: 'tabs' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'tabs' }>
    );
    const firstPanel = el.querySelectorAll('.block-editor__tabs-panel')[0]!;
    const addSelect = firstPanel.querySelector('select') as HTMLSelectElement;
    const addButton = firstPanel.querySelector(
      'button.block-editor__nested-add'
    ) as HTMLButtonElement;
    addSelect.value = 'columns';
    addButton.click();
    const updated = onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'tabs' }>;
    expect(updated.content.tabs[0]!.blocks[0]!.block_type).toBe('columns');
  });
});
