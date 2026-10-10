import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlock, TAB_CHILD_TYPES } from '@/blocks/create-block';
import { createTabsEditor, rememberTabsPanel } from '@/blocks/layout-editors';
import { renderTabsBlock, renderBlock } from '@/blocks/registry';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import type { Block } from '@/schemas/block';
import { clickMenuAction, holdDelete, menuItem } from './helpers/hub-list';
import { closeHubMenu } from '../../design-kit/js/hub-list.js';

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
  closeHubMenu();
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
    expect(el.querySelector('select')).toBeNull();

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

function enterBlockEdit(root: ParentNode, selector = '[data-block-type="tabs"]'): HTMLElement {
  const row = root.querySelector<HTMLElement>(selector)!;
  clickMenuAction(row.querySelector('.lesson-page__block-menu')!, 'edit');
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
    expect(row.querySelector('.hub-tabstrip__name')).toBeNull();
    expect(row.querySelector('.hub-list__add')).toBeNull();
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
    expect(editing.querySelectorAll('.hub-tabstrip__panel')).toHaveLength(1);
    expect(activeName(editing)?.value).toBe('Henry');
    expect(editing.querySelector('.hub-list__empty, .hub-list__add')).toBeTruthy();

    editing.querySelector<HTMLButtonElement>('.lesson-page__done')!.click();
    const published = host.querySelector<HTMLElement>('[data-block-type="tabs"]')!;
    expect(published.querySelector('.hub-tabstrip__name')).toBeNull();
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
    expect(host.querySelector('.hub-tabstrip__name')).toBeNull();
  });
});
