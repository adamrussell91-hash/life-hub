import { holdDelete, menuItem } from './helpers/hub-list';
import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createTableEditor } from '@/blocks/registry';

describe('createTableEditor row and column deletion', () => {
  it('removes the selected row and emits the remaining rows', () => {
    const block = createBlock('table', 'table_1');
    if (block.block_type !== 'table') throw new Error('expected table');
    block.content.rows = [
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2']
    ];

    let latest = block;
    const editor = createTableEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );

    holdDelete(editor.querySelectorAll('.hub-list__row .hub-list__more')[1]!);

    expect(latest.content.rows).toEqual([['A1', 'B1', 'C1']]);
    expect(editor.querySelectorAll('.hub-list__row')).toHaveLength(1);
  });

  it('removes the selected column from headers and every row', () => {
    const block = createBlock('table', 'table_1');
    if (block.block_type !== 'table') throw new Error('expected table');
    block.content.headers = ['A', 'B', 'C'];
    block.content.rows = [
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2']
    ];

    let latest = block;
    const editor = createTableEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );

    holdDelete(editor.querySelectorAll('.block-editor__table-column-menu')[1]!);

    expect(latest.content.headers).toEqual(['A', 'C']);
    expect(latest.content.rows).toEqual([
      ['A1', 'C1'],
      ['A2', 'C2']
    ]);
    expect(editor.querySelectorAll('.block-editor__table-header-cell')).toHaveLength(2);
  });

  it('keeps one column so the block remains an editable table', () => {
    const block = createBlock('table', 'table_1');
    if (block.block_type !== 'table') throw new Error('expected table');
    block.content.headers = ['Only'];
    block.content.rows = [['Value']];

    const editor = createTableEditor(block, () => undefined);
    const removeColumn = menuItem(editor.querySelector('.block-editor__table-column-menu')!, 'delete');

    expect(removeColumn?.disabled).toBe(true);
  });

  it('allows every data row to be removed and added back at the current width', () => {
    const block = createBlock('table', 'table_1');
    if (block.block_type !== 'table') throw new Error('expected table');

    let latest = block;
    const editor = createTableEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );

    holdDelete(editor.querySelector('.hub-list__row .hub-list__more')!);
    expect(latest.content.rows).toEqual([]);

    editor.querySelector<HTMLButtonElement>('.hub-list__add')!.click();

    expect(latest.content.rows).toEqual([['', '', '']]);
  });

  it('adds a column without emitting an extra hidden cell', () => {
    const block = createBlock('table', 'table_1');
    if (block.block_type !== 'table') throw new Error('expected table');

    let latest = block;
    const editor = createTableEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );

    editor.querySelector<HTMLButtonElement>('[aria-label="Add column"]')!.click();

    expect(latest.content.headers).toHaveLength(4);
    expect(latest.content.rows[0]).toHaveLength(4);
  });
});
