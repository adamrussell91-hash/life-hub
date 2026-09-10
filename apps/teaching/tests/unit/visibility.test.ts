import { describe, it, expect } from 'vitest';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

describe('filterBlocksForStudent', () => {
  it('drops teacher_only blocks for students', () => {
    const blocks: Block[] = [
      createBlock('rich_text', 'a'),
      (() => {
        const b = createBlock('rich_text', 'b');
        b.visibility = 'teacher_only';
        return b;
      })()
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out.map((b) => b.id)).toEqual(['a']);
  });

  it('keeps all student_teacher blocks', () => {
    const blocks: Block[] = [createBlock('rich_text', 'a'), createBlock('rich_text', 'c')];
    const out = filterBlocksForStudent(blocks);
    expect(out.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when all blocks are teacher_only', () => {
    const blocks: Block[] = [
      (() => {
        const b = createBlock('rich_text', 'x');
        b.visibility = 'teacher_only';
        return b;
      })(),
      (() => {
        const b = createBlock('rich_text', 'y');
        b.visibility = 'teacher_only';
        return b;
      })()
    ];
    const out = filterBlocksForStudent(blocks);
    expect(out).toEqual([]);
  });

  it('recursively drops teacher_only children inside section and columns', () => {
    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    const visible = createBlock('rich_text', 'vis');
    const hidden = createBlock('rich_text', 'hid');
    hidden.visibility = 'teacher_only';
    section.content.blocks = [visible, hidden] as typeof section.content.blocks;

    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    const colHidden = createBlock('rich_text', 'col_hid');
    colHidden.visibility = 'teacher_only';
    columns.content.columns[0]!.blocks = [createBlock('rich_text', 'col_vis'), colHidden] as typeof columns.content.columns[0]['blocks'];
    section.content.blocks.push(columns);

    const out = filterBlocksForStudent([section]);
    expect(out).toHaveLength(1);
    const s = out[0]!;
    if (s.block_type !== 'section') throw new Error('expected section');
    expect(s.content.blocks.map((b) => b.id)).toEqual(['vis', 'cols']);
    const c = s.content.blocks[1]!;
    if (c.block_type !== 'columns') throw new Error('expected columns');
    expect(c.content.columns[0]!.blocks.map((b) => b.id)).toEqual(['col_vis']);
  });

  it('drops an entire teacher_only section', () => {
    const section = createBlock('section', 'sec');
    section.visibility = 'teacher_only';
    expect(filterBlocksForStudent([section])).toEqual([]);
  });

  it('recursively drops teacher_only children inside tabs panels', () => {
    const tabs = createBlock('tabs', 'tabs1');
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    const visible = createBlock('rich_text', 'vis');
    const hidden = createBlock('rich_text', 'hid');
    hidden.visibility = 'teacher_only';
    tabs.content.tabs[0]!.blocks = [visible, hidden] as (typeof tabs.content.tabs)[number]['blocks'];

    const out = filterBlocksForStudent([tabs]);
    expect(out).toHaveLength(1);
    const t = out[0]!;
    if (t.block_type !== 'tabs') throw new Error('expected tabs');
    expect(t.content.tabs[0]!.blocks.map((b) => b.id)).toEqual(['vis']);
  });
});
