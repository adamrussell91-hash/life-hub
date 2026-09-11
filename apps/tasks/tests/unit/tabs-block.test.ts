import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlock, TAB_CHILD_TYPES } from '@/blocks/create-block';
import { createTabsEditor, rememberTabsPanel } from '@/blocks/layout-editors';
import { renderTabsBlock, renderBlock } from '@/blocks/registry';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import type { Block } from '@/schemas/block';

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

function tabButton(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (btn) => btn.textContent === label
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('createBlock tabs', () => {
  it('creates three empty panels', () => {
    const block = tabsBlock();
    expect(block.content.tabs).toHaveLength(3);
    expect(TAB_CHILD_TYPES.includes('columns')).toBe(true);
    expect((TAB_CHILD_TYPES as readonly string[]).includes('tabs')).toBe(false);
  });
});

describe('renderTabsBlock', () => {
  it('selects the first tab by default and switches on click', () => {
    const block = tabsBlock();
    block.content.tabs[0]!.label = 'Alpha';
    block.content.tabs[1]!.label = 'Beta';
    block.content.tabs[0]!.blocks = [createBlock('rich_text', 'a')];
    block.content.tabs[1]!.blocks = [createBlock('heading', 'b')];

    const el = renderTabsBlock(block, 'student');
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

  it('renderBlock dispatches tabs', () => {
    expect(renderBlock(tabsBlock('t'), 'student').dataset.blockType).toBe('tabs');
  });
});

describe('createTabsEditor', () => {
  it('shows one panel at a time and switches on tab click', () => {
    const block = tabsBlock();
    block.content.tabs[0]!.label = 'Noelle';
    block.content.tabs[1]!.label = 'Henry';
    block.content.tabs[2]!.label = 'Brendan';
    rememberTabsPanel(block.id, 0);

    const { el } = mountEditor(block);
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(el.querySelectorAll('.block-editor__tabs-panel')).toHaveLength(1);
    expect(el.querySelector('.block-editor__tab-label')).toHaveProperty('value', 'Noelle');

    tabButton(el, 'Henry')?.click();
    expect(el.querySelector('.block-editor__tab-label')).toHaveProperty('value', 'Henry');
    expect(el.querySelectorAll('.block-editor__tabs-panel')).toHaveLength(1);
  });

  it('label input updates the active panel only', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 0);
    const { el, onChange } = mountEditor(block);
    const input = el.querySelector('.block-editor__tab-label') as HTMLInputElement;
    input.value = 'Sources';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const updated = onChange.mock.calls.at(-1)![0] as TabsBlock;
    expect(updated.content.tabs[0]!.label).toBe('Sources');
    expect(updated.content.tabs[1]!.label).toBe('');
  });

  it('adds a block into the active tab only', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 1);
    const { el, onChange } = mountEditor(block);
    const add = el.querySelector('button.block-editor__nested-add') as HTMLButtonElement;
    add.click();
    const updated = onChange.mock.calls.at(-1)![0] as TabsBlock;
    expect(updated.content.tabs[0]!.blocks).toHaveLength(0);
    expect(updated.content.tabs[1]!.blocks[0]?.block_type).toBe('rich_text');
    expect(updated.content.tabs[2]!.blocks).toHaveLength(0);
  });

  it('can add columns inside the active tab via the kit filter', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 0);
    const { el, onChange } = mountEditor(block);
    const typeBtn = el.querySelector<HTMLButtonElement>('.block-editor__add-nested-type');
    typeBtn?.click();
    document.querySelector<HTMLButtonElement>('[data-hub-option="columns"]')?.click();
    el.querySelector<HTMLButtonElement>('button.block-editor__nested-add')?.click();
    const updated = onChange.mock.calls.at(-1)![0] as TabsBlock;
    expect(updated.content.tabs[0]!.blocks[0]?.block_type).toBe('columns');
  });

  it('add panel works until max 8; remove until min 2', () => {
    const block = tabsBlock();
    rememberTabsPanel(block.id, 0);
    const { el, onChange, latest } = mountEditor(block);
    const addBtn = el.querySelector('.block-editor__tabs-add') as HTMLButtonElement;
    for (let i = 0; i < 5; i += 1) addBtn.click();
    expect((onChange.mock.calls.at(-1)![0] as TabsBlock).content.tabs.length).toBe(8);
    expect(addBtn.disabled).toBe(true);

    let current = latest();
    const el2 = createTabsEditor(
      current,
      (next) => {
        current = next;
        onChange(next);
      },
      () => current
    );
    for (let i = 0; i < 6; i += 1) {
      el2.querySelector<HTMLButtonElement>('.block-editor__tabs-remove')?.click();
    }
    expect(current.content.tabs.length).toBe(2);
    expect(el2.querySelector<HTMLButtonElement>('.block-editor__tabs-remove')?.disabled).toBe(
      true
    );
  });
});

function enterBlockEdit(root: ParentNode, selector = '[data-block-type="tabs"]'): HTMLElement {
  const row = root.querySelector<HTMLElement>(selector)!;
  row.querySelector<HTMLButtonElement>('.lesson-page__block-menu')!.click();
  document.querySelector<HTMLButtonElement>('[data-card-menu-item="edit"]')!.click();
  return root.querySelector<HTMLElement>(selector)!;
}

describe('project page tabs canvas', () => {
  it('stays in published view when switching tabs', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const block = tabsBlock();
    block.content.tabs[0]!.label = 'Noelle';
    block.content.tabs[1]!.label = 'Henry';
    rememberTabsPanel(block.id, 0);

    mountBlockCanvas(host, {
      blocks: [block],
      idFactory: () => 'n',
      onChange: () => undefined
    });

    const row = host.querySelector<HTMLElement>('[data-block-type="tabs"]')!;
    tabButton(row, 'Henry')?.click();
    expect(row.querySelector('.block-editor__tab-label')).toBeNull();
    expect(row.querySelector('button.block-editor__nested-add')).toBeNull();
    expect(tabButton(row, 'Henry')?.getAttribute('aria-selected')).toBe('true');
    expect(row.querySelector('.lesson-page__block-menu')).toBeTruthy();
  });

  it('opens the editor from the block menu and Done returns to published', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const block = tabsBlock();
    block.content.tabs[0]!.label = 'Noelle';
    block.content.tabs[1]!.label = 'Henry';
    rememberTabsPanel(block.id, 0);

    mountBlockCanvas(host, {
      blocks: [block],
      idFactory: () => 'n',
      onChange: () => undefined
    });

    tabButton(host, 'Henry')?.click();
    const editing = enterBlockEdit(host);
    expect(editing.querySelector('.lesson-page__inspector')).toBeNull();
    expect(editing.querySelectorAll('.block-editor__tabs-panel')).toHaveLength(1);
    expect(editing.querySelector('.block-editor__tab-label')).toHaveProperty('value', 'Henry');
    expect(editing.querySelector('button.block-editor__nested-add')).toBeTruthy();

    editing.querySelector<HTMLButtonElement>('.lesson-page__done')!.click();
    const published = host.querySelector<HTMLElement>('[data-block-type="tabs"]')!;
    expect(published.querySelector('.block-editor__tab-label')).toBeNull();
    expect(tabButton(published, 'Henry')?.getAttribute('aria-selected')).toBe('true');
  });

  it('omits the edit menu on a published student canvas', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountBlockCanvas(host, {
      blocks: [tabsBlock()],
      idFactory: () => 'n',
      onChange: () => undefined,
      editable: false
    });
    expect(host.querySelector('.lesson-page__block-menu')).toBeNull();
    expect(host.querySelector('.block-editor__tab-label')).toBeNull();
  });
});
