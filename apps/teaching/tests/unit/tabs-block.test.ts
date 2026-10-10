import { afterEach, describe, it, expect, vi } from 'vitest';
import { rememberTabsPanel } from '@/blocks/layout-editors';
import { closeHubMenu } from '../../design-kit/js/hub-list.js';
import { resetHubFeedbackForTests } from '../../design-kit/js/hub-feedback.js';
import { clickMenuAction, holdDelete, menuItem } from './helpers/hub-list';
import { createBlock, cloneBlockWithNewIds, TAB_CHILD_TYPES } from '@/blocks/create-block';
import {
  createTabsEditor,
  renderTabsBlock,
  renderBlock
} from '@/blocks/registry';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import { BlockSchema, type Block } from '@/schemas/block';

afterEach(() => {
  closeHubMenu();
  resetHubFeedbackForTests();
  document.body.replaceChildren();
});

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

type TabsBlock = Extract<Block, { block_type: 'tabs' }>;

function tabsBlock(id = 'tabs1'): TabsBlock {
  const block = createBlock('tabs', id);
  if (block.block_type !== 'tabs') throw new Error('expected tabs');
  return block;
}

function mountEditor(initial: TabsBlock, onChange = vi.fn()) {
  let latest: Block = initial;
  const el = createTabsEditor(
    initial,
    (next) => {
      latest = next;
      onChange(next);
    },
    () => latest as TabsBlock
  );
  return { el, onChange, latest: () => latest as TabsBlock };
}

function tabNames(root: ParentNode): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('.hub-tabstrip__name')];
}

function activeName(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('.hub-tabstrip__tab.is-active .hub-tabstrip__name');
}

function openTab(root: ParentNode, index: number): void {
  tabNames(root)[index]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
}

describe('createTabsEditor', () => {
  it('edits tabs as a strip and shows one panel at a time', () => {
    const block = tabsBlock();
    block.content.tabs[0]!.label = 'Noelle';
    block.content.tabs[1]!.label = 'Henry';
    block.content.tabs[2]!.label = 'Brendan';
    rememberTabsPanel(block.id, 0);

    const { el } = mountEditor(block);
    document.body.append(el);
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(el.querySelectorAll('.hub-tabstrip__panel')).toHaveLength(1);
    expect(activeName(el)?.value).toBe('Noelle');

    openTab(el, 1);
    expect(activeName(el)?.value).toBe('Henry');
    expect(el.querySelectorAll('.hub-tabstrip__panel')).toHaveLength(1);
  });

  it('renames the active tab on the tab itself', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 0);
    const { el, onChange } = mountEditor(block);
    const input = activeName(el)!;
    input.value = 'Sources';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const updated = onChange.mock.calls.at(-1)![0] as TabsBlock;
    expect(updated.content.tabs[0]!.label).toBe('Sources');
    expect(updated.content.tabs[1]!.label).toBe(block.content.tabs[1]!.label);
  });

  it('adds a block into the active tab only from the empty-tab prompt', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 1);
    const { el, onChange } = mountEditor(block);
    expect(el.querySelector('.hub-list__empty')).toBeTruthy();
    el.querySelector<HTMLButtonElement>('.hub-list__chip')!.click();
    const updated = onChange.mock.calls.at(-1)![0] as TabsBlock;
    expect(updated.content.tabs[0]!.blocks).toHaveLength(0);
    expect(updated.content.tabs[1]!.blocks[0]?.block_type).toBe('rich_text');
    expect(updated.content.tabs[2]!.blocks).toHaveLength(0);
  });

  it('can add columns inside the active tab from the block picker', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 0);
    const { el, onChange } = mountEditor(block);
    document.body.append(el);
    const more = [...el.querySelectorAll<HTMLButtonElement>('.hub-list__chip')].find((b) =>
      b.textContent?.includes('More blocks')
    )!;
    more.click();
    document.querySelector<HTMLButtonElement>('.hub-insert__option[data-value="columns"]')!.click();
    const updated = onChange.mock.calls.at(-1)![0] as TabsBlock;
    expect(updated.content.tabs[0]!.blocks[0]?.block_type).toBe('columns');
  });

  it('adds tabs until 8, deletes by hold until 2, then explains why delete is off', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 0);
    const { el, latest } = mountEditor(block);
    document.body.append(el);
    for (let i = 0; i < 5; i += 1) el.querySelector<HTMLButtonElement>('.hub-tabstrip__add')!.click();
    expect(latest().content.tabs.length).toBe(8);
    expect(el.querySelector<HTMLButtonElement>('.hub-tabstrip__add')!.disabled).toBe(true);

    // A plain click on Delete never deletes.
    menuItem(el.querySelector('.hub-tabstrip__tab.is-active .hub-tabstrip__more')!, 'delete')!.click();
    expect(latest().content.tabs.length).toBe(8);

    for (let i = 0; i < 6; i += 1) {
      holdDelete(el.querySelector('.hub-tabstrip__tab.is-active .hub-tabstrip__more')!);
    }
    expect(latest().content.tabs.length).toBe(2);
    const del = menuItem(el.querySelector('.hub-tabstrip__tab.is-active .hub-tabstrip__more')!, 'delete')!;
    expect(del.disabled).toBe(true);
    expect(document.querySelector('.hub-action-menu__reason')?.textContent).toMatch(/at least two tabs/);
  });

  it('undo restores a deleted tab with its blocks', () => {
    const block = tabsBlock();
    block.content.tabs[1]!.blocks = [createBlock('heading', 'h')];
    rememberTabsPanel(block.id, 1);
    const { el, latest } = mountEditor(block);
    document.body.append(el);
    holdDelete(el.querySelector('.hub-tabstrip__tab.is-active .hub-tabstrip__more')!);
    expect(latest().content.tabs).toHaveLength(2);
    [...document.querySelectorAll<HTMLButtonElement>('.hub-toast button')]
      .find((b) => b.textContent === 'Undo')!
      .click();
    expect(latest().content.tabs).toHaveLength(3);
    expect(latest().content.tabs[1]!.blocks[0]?.id).toBe('h');
  });

  it('moves a tab right from its menu', () => {
    const block = tabsBlock();
    block.content.tabs[0]!.label = 'A';
    block.content.tabs[1]!.label = 'B';
    rememberTabsPanel(block.id, 0);
    const { el, latest } = mountEditor(block);
    document.body.append(el);
    clickMenuAction(el.querySelector('.hub-tabstrip__tab.is-active .hub-tabstrip__more')!, 'right');
    expect(latest().content.tabs.map((t) => t.label).slice(0, 2)).toEqual(['B', 'A']);
    expect(activeName(el)?.value).toBe('A');
  });
});

