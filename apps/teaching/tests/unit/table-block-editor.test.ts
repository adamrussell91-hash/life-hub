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

    const removeRows = editor.querySelectorAll<HTMLButtonElement>(
      '.block-editor__table-remove-row'
    );
    removeRows[1]!.click();

    expect(latest.content.rows).toEqual([['A1', 'B1', 'C1']]);
    expect(editor.querySelectorAll('.block-editor__table-row-wrap')).toHaveLength(1);
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

    const removeColumns = editor.querySelectorAll<HTMLButtonElement>(
      '.block-editor__table-remove-column'
    );
    removeColumns[1]!.click();

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
    const removeColumn = editor.querySelector<HTMLButtonElement>(
      '.block-editor__table-remove-column'
    );

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

    editor.querySelector<HTMLButtonElement>('.block-editor__table-remove-row')!.click();
    expect(latest.content.rows).toEqual([]);

    const addRow = Array.from(editor.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Add row'
    );
    addRow!.click();

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

    const addColumn = Array.from(editor.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Add column'
    );
    addColumn!.click();

    expect(latest.content.headers).toHaveLength(4);
    expect(latest.content.rows[0]).toHaveLength(4);
  });
});
