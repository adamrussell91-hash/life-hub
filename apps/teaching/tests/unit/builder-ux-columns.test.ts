import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { trySetColumnWidths } from '@/blocks/column-widths';
import { moveBlockBetweenColumns } from '@/blocks/column-move';
import { COLUMN_CHILD_TYPES, createBlock } from '@/blocks/create-block';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';
import { createColumnsEditor } from '@/blocks/layout-editors';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};
const base = {
  id: 'c1',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('custom columns schema', () => {
  it('accepts custom widths summing to 12', () => {
    const block = BlockSchema.parse({
      ...base,
      block_type: 'columns',
      content: {
        preset: 'custom',
        columns: [
          { width: 3, blocks: [] },
          { width: 9, blocks: [] }
        ]
      }
    });
    expect(block.block_type).toBe('columns');
    if (block.block_type !== 'columns') return;
    expect(block.content.preset).toBe('custom');
  });

  it('rejects custom widths that do not sum to 12', () => {
    expect(() =>
      BlockSchema.parse({
        ...base,
        block_type: 'columns',
        content: {
          preset: 'custom',
          columns: [
            { width: 5, blocks: [] },
            { width: 5, blocks: [] }
          ]
        }
      })
    ).toThrow();
  });
});

describe('trySetColumnWidths', () => {
  it('returns next columns when sum is 12', () => {
    const cols = [
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ];
    expect(trySetColumnWidths(cols, [4, 8])).toEqual([
      { width: 4, blocks: [] },
      { width: 8, blocks: [] }
    ]);
  });

  it('returns null when sum is not 12', () => {
    const cols = [
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ];
    expect(trySetColumnWidths(cols, [5, 5])).toBeNull();
  });
});

describe('moveBlockBetweenColumns', () => {
  it('appends block to another column', () => {
    const a = createBlock('heading', 'h1');
    const b = createBlock('callout', 'c1');
    const columns = [
      { width: 6, blocks: [a, b] },
      { width: 6, blocks: [] }
    ];
    const next = moveBlockBetweenColumns(columns, 0, 1, 1);
    expect(next[0]!.blocks.map((x) => x.id)).toEqual(['h1']);
    expect(next[1]!.blocks.map((x) => x.id)).toEqual(['c1']);
  });

  it('no-ops on invalid indices', () => {
    const columns = [
      { width: 6, blocks: [createBlock('heading', 'h1')] },
      { width: 6, blocks: [] }
    ];
    expect(moveBlockBetweenColumns(columns, 0, 5, 1)).toBe(columns);
  });
});

describe('nested columnMove', () => {
  it('Move to column select calls onMoveToColumn', () => {
    const block = createBlock('heading', 'h1');
    const moves: number[] = [];
    const el = createNestedBlocksEditor({
      blocks: [block],
      allowedTypes: COLUMN_CHILD_TYPES,
      idFactory: () => 'id',
      onChange: () => {},
      columnMove: {
        columnCount: 2,
        columnIndex: 0,
        onMoveToColumn: (to) => {
          moves.push(to);
        }
      }
    });
    const select = el.querySelector(
      'select.block-editor__nested-move-column'
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    expect(moves).toEqual([1]);
  });

  it('accepts a palette drop onto the nested list', () => {
    const changes: Block[][] = [];
    const el = createNestedBlocksEditor({
      blocks: [],
      allowedTypes: COLUMN_CHILD_TYPES,
      idFactory: () => 'id',
      onChange: (next) => {
        changes.push(next);
      }
    });
    document.body.append(el);

    const dt = {
      types: ['application/x-teaching-hub-block'],
      getData: () => JSON.stringify({ kind: 'block', type: 'heading' }),
      effectAllowed: 'copy',
      dropEffect: 'copy'
    };
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: dt });
    el.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: dt });
    el.dispatchEvent(drop);

    expect(changes.at(-1)?.[0]?.block_type).toBe('heading');
    el.remove();
  });
});

describe('createColumnsEditor builder UX', () => {
  it('Custom unlocks width inputs and Move moves blocks', () => {
    const block = createBlock('columns', 'cols');
    if (block.block_type !== 'columns') return;
    block.content.columns[0]!.blocks = [
      createBlock('heading', 'h1') as (typeof block.content.columns)[number]['blocks'][number]
    ];
    let latest = block;
    const el = createColumnsEditor(
      block,
      (n) => {
        latest = n;
      },
      () => latest
    );

    const preset = el.querySelector(
      'select.block-editor__columns-preset'
    ) as HTMLSelectElement;
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change'));
    expect(latest.content.preset).toBe('custom');
    expect(el.querySelectorAll('input.block-editor__columns-width').length).toBe(2);

    const move = el.querySelector(
      'select.block-editor__nested-move-column'
    ) as HTMLSelectElement;
    move.value = '1';
    move.dispatchEvent(new Event('change'));
    expect(latest.content.columns[0]!.blocks).toHaveLength(0);
    expect(latest.content.columns[1]!.blocks[0]?.id).toBe('h1');
  });
});
