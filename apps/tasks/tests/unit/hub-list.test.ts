import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeHubMenu, createHubList } from '../../design-kit/js/hub-list.js';
import { resetHubFeedbackForTests } from '../../design-kit/js/hub-feedback.js';
import { createBlock } from '@/blocks/create-block';
import { createAccordionEditor, createTableEditor } from '@/blocks/registry';
import type { Block } from '@/schemas/block';
import { clickMenuAction, hold, holdDelete, menuItem } from './helpers/hub-list';

type Item = { id: string; name: string };

function mount(items: Item[], extra: Partial<Parameters<typeof createHubList<Item>>[0]> = {}) {
  const onChange = vi.fn();
  let seq = 0;
  const list = createHubList<Item>({
    items,
    noun: 'item',
    getKey: (item) => item.id,
    create: () => ({ id: `new${(seq += 1)}`, name: '' }),
    duplicate: (item) => ({ ...item, id: `${item.id}_copy` }),
    renderItem: (item, ctx) => {
      const input = document.createElement('input');
      input.value = item.name;
      input.addEventListener('input', () => ctx.update({ ...ctx.current, name: input.value }));
      return input;
    },
    onChange,
    ...extra
  });
  document.body.append(list.el);
  const ids = () => (onChange.mock.calls.at(-1)?.[0] as Item[] | undefined)?.map((i) => i.id);
  const rows = () => [...list.el.children].filter((c): c is HTMLElement => c.classList.contains('hub-list__row'));
  return { list, onChange, ids, rows };
}

const abc = (): Item[] => [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' }
];

afterEach(() => {
  closeHubMenu();
  resetHubFeedbackForTests();
  document.body.replaceChildren();
});

describe('createHubList', () => {
  it('adds at the end and between rows', () => {
    const { list, ids } = mount(abc(), { insertBetween: true });
    list.el.querySelector<HTMLButtonElement>('.hub-list__add')!.click();
    expect(ids()).toEqual(['a', 'b', 'c', 'new1']);
    list.el.querySelectorAll<HTMLButtonElement>('.hub-list__insert')[1]!.click();
    expect(ids()).toEqual(['a', 'new2', 'b', 'c', 'new1']);
  });

  it('reorders with Alt + arrow on the grip and keeps focus on the moved row', () => {
    const { rows, ids } = mount(abc());
    const grip = rows()[0]!.querySelector<HTMLButtonElement>('.hub-list__grip')!;
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    expect(ids()).toEqual(['b', 'a', 'c']);
    expect((document.activeElement as HTMLElement).closest<HTMLElement>('.hub-list__row')?.dataset.key).toBe('a');
  });

  it('moves and duplicates from the ··· menu', () => {
    const { rows, ids } = mount(abc());
    clickMenuAction(rows()[2]!.querySelector('.hub-list__more')!, 'up');
    expect(ids()).toEqual(['a', 'c', 'b']);
    clickMenuAction(rows()[0]!.querySelector('.hub-list__more')!, 'duplicate');
    expect(ids()).toEqual(['a', 'a_copy', 'c', 'b']);
    expect(menuItem(rows()[0]!.querySelector('.hub-list__more')!, 'up')!.disabled).toBe(true);
  });

  it('deletes only on press-and-hold, then Undo puts the row back', () => {
    const { rows, ids, onChange } = mount(abc());
    const del = menuItem(rows()[1]!.querySelector('.hub-list__more')!, 'delete')!;
    del.click();
    expect(onChange).not.toHaveBeenCalled();
    hold(del);
    expect(ids()).toEqual(['a', 'c']);
    const undo = [...document.querySelectorAll<HTMLButtonElement>('.hub-toast button')].find(
      (b) => b.textContent === 'Undo'
    )!;
    undo.click();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('a short press is not a delete', () => {
    const { rows, onChange } = mount(abc());
    const del = menuItem(rows()[0]!.querySelector('.hub-list__more')!, 'delete')!;
    vi.useFakeTimers();
    del.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(200);
    del.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(onChange).not.toHaveBeenCalled();
    expect(del.querySelector('.hub-action-menu__hint')?.textContent).toBe('Keep holding');
  });

  it('says why delete and add are off at the limits', () => {
    const { rows, list } = mount(abc().slice(0, 1), {
      min: 1,
      max: 1,
      minReason: 'Keep one.',
      maxReason: 'Only one.'
    });
    const del = menuItem(rows()[0]!.querySelector('.hub-list__more')!, 'delete')!;
    expect(del.disabled).toBe(true);
    expect(del.nextElementSibling?.textContent).toBe('Keep one.');
    const add = list.el.querySelector<HTMLButtonElement>('.hub-list__add')!;
    expect(add.disabled).toBe(true);
    expect(add.title).toBe('Only one.');
  });

  it('content edits update the item without re-rendering the row', () => {
    const { rows, ids, onChange } = mount(abc());
    const input = rows()[1]!.querySelector('input')!;
    input.value = 'Bee';
    input.dispatchEvent(new Event('input'));
    expect((onChange.mock.calls.at(-1)![0] as Item[])[1]!.name).toBe('Bee');
    expect(rows()[1]!.querySelector('input')).toBe(input);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('hands a drag to another list in the same group', () => {
    const onTransfer = vi.fn();
    const left = mount(abc(), { group: 'g', dragData: (_item, index) => ({ col: 0, index }) });
    const right = mount([{ id: 'x', name: 'X' }], { group: 'g', onTransfer });
    left.rows()[1]!.querySelector('.hub-list__grip')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    const gap = right.list.el.querySelector<HTMLElement>('.hub-list__gap[data-index="1"]')!;
    gap.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    gap.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(onTransfer).toHaveBeenCalledWith({ data: { col: 0, index: 1 }, index: 1 }, 1);
  });
});

describe('item editors on the shared list', () => {
  it('accordion items reorder from the menu', () => {
    const block = createBlock('accordion', 'acc') as Extract<Block, { block_type: 'accordion' }>;
    block.content.items = [
      { title: 'One', body: '1' },
      { title: 'Two', body: '2' }
    ];
    let latest = block;
    const el = createAccordionEditor(block, (next) => (latest = next), () => latest);
    document.body.append(el);
    clickMenuAction(el.querySelectorAll('.hub-list__row .hub-list__more')[1]!, 'up');
    expect(latest.content.items.map((i) => i.title)).toEqual(['Two', 'One']);
  });

  it('table rows delete by hold; columns move and delete from the header menu', () => {
    const block = createBlock('table', 't') as Extract<Block, { block_type: 'table' }>;
    block.content.headers = ['A', 'B', 'C'];
    block.content.rows = [
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2']
    ];
    let latest = block;
    const el = createTableEditor(block, (next) => (latest = next), () => latest);
    document.body.append(el);

    holdDelete(el.querySelectorAll('.hub-list__row .hub-list__more')[0]!);
    expect(latest.content.rows).toEqual([['A2', 'B2', 'C2']]);

    clickMenuAction(el.querySelectorAll('.block-editor__table-column-menu')[0]!, 'right');
    expect(latest.content.headers).toEqual(['B', 'A', 'C']);
    expect(latest.content.rows).toEqual([['B2', 'A2', 'C2']]);

    holdDelete(el.querySelectorAll('.block-editor__table-column-menu')[2]!);
    expect(latest.content.headers).toEqual(['B', 'A']);
    expect(latest.content.rows).toEqual([['B2', 'A2']]);
  });
});
