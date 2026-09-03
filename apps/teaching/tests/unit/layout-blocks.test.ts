import { describe, it, expect, vi } from 'vitest';
import { createBlock, cloneBlockWithNewIds } from '@/blocks/create-block';
import {
  createColumnsEditor,
  createSectionEditor,
  createSpacerEditor,
  renderSpacerBlock,
  renderSectionBlock,
  renderColumnsBlock,
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

describe('layout block schemas', () => {
  it('parses spacer, section, and columns', () => {
    expect(
      BlockSchema.parse({
        ...base,
        id: 'sp1',
        block_type: 'spacer',
        content: { size: 'medium' }
      }).block_type
    ).toBe('spacer');

    expect(
      BlockSchema.parse({
        ...base,
        id: 'sec1',
        block_type: 'section',
        content: { title: 'Week 1', blocks: [rich('c1')] }
      }).block_type
    ).toBe('section');

    expect(
      BlockSchema.parse({
        ...base,
        id: 'col1',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            { width: 6, blocks: [rich('l')] },
            { width: 6, blocks: [rich('r')] }
          ]
        }
      }).block_type
    ).toBe('columns');
  });

  it('rejects columns nested inside columns', () => {
    const nestedColumns = {
      ...base,
      id: 'inner',
      block_type: 'columns' as const,
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [] },
          { width: 6, blocks: [] }
        ]
      }
    };
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [nestedColumns] },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section nested inside section', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'section',
      content: {
        title: 'Outer',
        blocks: [
          {
            ...base,
            id: 'inner',
            block_type: 'section',
            content: { title: 'Inner', blocks: [] }
          }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section nested inside a column', () => {
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
                id: 'sec',
                block_type: 'section',
                content: { title: 'Nope', blocks: [] }
              }
            ]
          },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('allows columns inside a section', () => {
    const parsed = BlockSchema.parse({
      ...base,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Layout',
        blocks: [
          {
            ...base,
            id: 'cols',
            block_type: 'columns',
            content: {
              preset: '33-67',
              columns: [
                { width: 4, blocks: [rich('a')] },
                { width: 8, blocks: [rich('b')] }
              ]
            }
          }
        ]
      }
    });
    expect(parsed.block_type).toBe('section');
  });

  it('rejects column widths that do not sum to 12', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'bad',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 5, blocks: [] },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });
});

describe('createBlock layout defaults', () => {
  it('creates empty columns for 50-50', () => {
    const block = createBlock('columns', 'c1');
    expect(block.block_type).toBe('columns');
    if (block.block_type !== 'columns') throw new Error('expected columns');
    expect(block.content.preset).toBe('50-50');
    expect(block.content.columns).toEqual([
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ]);
  });

  it('creates section and spacer defaults', () => {
    expect(createBlock('section', 's1')).toMatchObject({
      block_type: 'section',
      content: { title: '', blocks: [] }
    });
    expect(createBlock('spacer', 'sp1')).toMatchObject({
      block_type: 'spacer',
      content: { size: 'medium' }
    });
  });
});

describe('sanitizeBlocksDeep', () => {
  it('sanitises rich_text nested under columns', () => {
    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    const rt = createBlock('rich_text', 'rt');
    if (rt.block_type !== 'rich_text') throw new Error('expected rich_text');
    rt.content.html = '<p>Hi<script>alert(1)</script></p>';
    columns.content.columns[0]!.blocks = [rt] as typeof columns.content.columns[0]['blocks'];

    const [out] = sanitizeBlocksDeep([columns]);
    if (out?.block_type !== 'columns') throw new Error('expected columns');
    const child = out.content.columns[0]!.blocks[0]!;
    if (child.block_type !== 'rich_text') throw new Error('expected rich_text');
    expect(child.content.html).not.toContain('<script>');
  });
});

describe('cloneBlockWithNewIds', () => {
  it('assigns new ids to nested descendants', () => {
    let n = 0;
    const nextId = () => `id_${++n}`;

    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    columns.content.columns[0]!.blocks.push(
      createBlock('rich_text', 'rt') as (typeof columns.content.columns)[number]['blocks'][number]
    );
    section.content.blocks = [columns];

    const clone = cloneBlockWithNewIds(section, nextId);
    expect(clone.id).toBe('id_1');
    if (clone.block_type !== 'section') throw new Error('expected section');
    const clonedCols = clone.content.blocks[0]!;
    expect(clonedCols.id).toBe('id_2');
    if (clonedCols.block_type !== 'columns') throw new Error('expected columns');
    expect(clonedCols.content.columns[0]!.blocks[0]!.id).toBe('id_3');
    expect(section.id).toBe('sec'); // original untouched
  });
});

describe('layout block renderers', () => {
  it('renderSpacerBlock applies size class', () => {
    const block = createBlock('spacer', 'sp');
    if (block.block_type !== 'spacer') throw new Error('expected spacer');
    block.content.size = 'large';
    const el = renderSpacerBlock(block, 'student');
    expect(el.querySelector('.block-spacer')?.classList.contains('block-spacer--large')).toBe(
      true
    );
  });

  it('renderSectionBlock shows title and nested children', () => {
    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    section.content.title = 'Inquiry';
    section.content.blocks = [
      createBlock('heading', 'h1') as (typeof section.content.blocks)[number]
    ];
    const el = renderSectionBlock(section, 'student');
    expect(el.querySelector('.block-section__title')?.textContent).toBe('Inquiry');
    expect(el.querySelector('[data-block-type="heading"]')).toBeTruthy();
  });

  it('renderColumnsBlock builds grid with width style and children', () => {
    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    columns.content.columns[0]!.blocks = [
      createBlock('rich_text', 'l')
    ] as (typeof columns.content.columns)[number]['blocks'];
    columns.content.columns[1]!.blocks = [
      createBlock('rich_text', 'r')
    ] as (typeof columns.content.columns)[number]['blocks'];
    const el = renderColumnsBlock(columns, 'student');
    const grid = el.querySelector('.block-columns');
    expect(grid).toBeTruthy();
    expect((grid as HTMLElement).style.gridTemplateColumns).toContain('6fr');
    expect(el.querySelectorAll('.block-columns__col').length).toBe(2);
    expect(el.querySelectorAll('[data-block-type="rich_text"]').length).toBe(2);
  });

  it('renderBlock dispatches layout types', () => {
    expect(renderBlock(createBlock('spacer', 'sp'), 'student').dataset.blockType).toBe(
      'spacer'
    );
  });
});

describe('layout block editors', () => {
  it('spacer size select emits change via getLatest', () => {
    const block = createBlock('spacer', 'sp');
    const onChange = vi.fn();
    let latest = block;
    const el = createSpacerEditor(
      block as Extract<Block, { block_type: 'spacer' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'spacer' }>
    );
    const select = el.querySelector(
      '.block-editor__spacer-size'
    ) as HTMLSelectElement;
    select.value = 'large';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalled();
    expect(
      (onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'spacer' }>).content.size
    ).toBe('large');
  });

  it('section title input updates content.title', () => {
    const block = createBlock('section', 'sec');
    const onChange = vi.fn();
    let latest = block;
    const el = createSectionEditor(
      block as Extract<Block, { block_type: 'section' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'section' }>
    );
    const input = el.querySelector(
      '.block-editor__section-title'
    ) as HTMLInputElement;
    input.value = 'Module A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      (onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'section' }>).content
        .title
    ).toBe('Module A');
  });

  it('columns preset change remaps widths and folds surplus blocks', () => {
    const block = createBlock('columns', 'cols');
    if (block.block_type !== 'columns') throw new Error('expected columns');
    block.content.preset = '33-33-33';
    block.content.columns = [
      { width: 4, blocks: [createBlock('rich_text', 'a')] },
      { width: 4, blocks: [createBlock('rich_text', 'b')] },
      { width: 4, blocks: [createBlock('rich_text', 'c')] }
    ] as typeof block.content.columns;
    const onChange = vi.fn();
    let latest = block;
    const el = createColumnsEditor(
      block,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'columns' }>
    );
    const select = el.querySelector(
      '.block-editor__columns-preset'
    ) as HTMLSelectElement;
    select.value = '50-50';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const updated = onChange.mock.calls.at(-1)![0] as Extract<
      Block,
      { block_type: 'columns' }
    >;
    expect(updated.content.preset).toBe('50-50');
    expect(updated.content.columns.map((c) => c.width)).toEqual([6, 6]);
    expect(updated.content.columns[1]!.blocks.map((b) => b.id)).toEqual(['b', 'c']);
  });

  it('adding a block inside a column nests it under that column', () => {
    const block = createBlock('columns', 'cols');
    const onChange = vi.fn();
    let latest = block;
    const el = createColumnsEditor(
      block as Extract<Block, { block_type: 'columns' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'columns' }>
    );
    const firstPane = el.querySelectorAll('.block-editor__column-pane')[0]!;
    const addSelect = firstPane.querySelector('select') as HTMLSelectElement;
    const addButton = firstPane.querySelector(
      'button.block-editor__nested-add'
    ) as HTMLButtonElement;
    addSelect.value = 'heading';
    addButton.click();
    const updated = onChange.mock.calls.at(-1)![0] as Extract<
      Block,
      { block_type: 'columns' }
    >;
    expect(updated.content.columns[0]!.blocks[0]!.block_type).toBe('heading');
  });
});
