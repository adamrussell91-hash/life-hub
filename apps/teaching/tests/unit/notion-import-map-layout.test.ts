// apps/teaching/tests/unit/notion-import-map-layout.test.ts
import { describe, expect, it } from 'vitest';
import { mapBlocks } from '@/notion-import/map-blocks';
import { BlockSchema } from '@/schemas/block';
import { node, notionFile, p, rt, state, toggle } from './notion-import-fixtures';

const valid = (blocks: unknown[]) => blocks.every((b) => {
  const r = BlockSchema.safeParse(b);
  if (!r.success) console.error(JSON.stringify(r.error.issues, null, 2));
  return r.success;
});
const tab = (label: string, children: any[]) => node('tab', { label }, children);
const tabs = (...items: any[]) => node('tabs', {}, items);
const column = (children: any[], width_ratio?: number) => node('column', width_ratio ? { width_ratio } : {}, children);
const columns = (...cols: any[]) => node('column_list', {}, cols);
const image = () => node('image', { ...notionFile('https://files.example/i.png'), caption: rt('cap') });

describe('callouts', () => {
  it('maps colour and emoji to a style and keeps text in the body', () => {
    const blocks = mapBlocks([
      node('callout', { rich_text: rt('Careful'), color: 'red_background', icon: { type: 'emoji', emoji: '💡' } }),
      node('callout', { rich_text: rt('Done'), color: 'default', icon: { type: 'emoji', emoji: '✅' } }),
      node('callout', { rich_text: rt('Plain'), color: 'gray_background' })
    ], 'top', state()) as any[];
    expect(blocks.map((b) => b.content.style)).toEqual(['warning', 'remember', 'information']);
    expect(blocks[0].content.body).toBe('Careful');
    expect(valid(blocks)).toBe(true);
  });

  it('keeps text children in the body and moves other children after it', () => {
    const st = state();
    const blocks = mapBlocks([
      node('callout', { rich_text: rt('Title line'), color: 'blue_background' }, [p('More text'), image()])
    ], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['callout', 'image']);
    expect(blocks[0].content.body).toBe('Title line\nMore text');
    expect(st.warnings.some((w) => w.rule === 'flattened')).toBe(true);
  });
});

describe('toggles', () => {
  it('merges a run of text-only toggles into one accordion', () => {
    const blocks = mapBlocks([toggle('Q1', [p('A1')]), toggle('Q2', [p('A2')])], 'top', state()) as any[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content.items).toEqual([{ title: 'Q1', body: 'A1' }, { title: 'Q2', body: 'A2' }]);
  });

  it('turns a toggle with rich content into a collapsed section at top level', () => {
    const blocks = mapBlocks([toggle('Activity', [p('Do this'), image()])], 'top', state()) as any[];
    expect(blocks[0].block_type).toBe('section');
    expect(blocks[0].content).toMatchObject({ title: 'Activity', collapsed_in_editor: true });
    expect(blocks[0].content.blocks.map((b: any) => b.block_type)).toEqual(['rich_text', 'image']);
    expect(valid(blocks)).toBe(true);
  });

  it('turns a toggle heading into a collapsed section', () => {
    const blocks = mapBlocks([node('heading_2', { rich_text: rt('Part A'), is_toggleable: true }, [p('x')])], 'top', state()) as any[];
    expect(blocks[0]).toMatchObject({ block_type: 'section', content: { title: 'Part A' } });
  });

  it('flattens a rich toggle inside a column to a bold line plus its blocks', () => {
    const st = state();
    const blocks = mapBlocks([columns(column([toggle('Inside', [image()])]), column([p('b')]))], 'top', st) as any[];
    const first = blocks[0].content.columns[0].blocks;
    expect(first[0]).toMatchObject({ block_type: 'rich_text', content: { html: '<p><strong>Inside</strong></p>' } });
    expect(first[1].block_type).toBe('image');
    expect(valid(blocks)).toBe(true);
  });
});

describe('columns', () => {
  it('maps widths and preset', () => {
    const blocks = mapBlocks([columns(column([p('a')], 0.333), column([p('b')], 0.667))], 'top', state()) as any[];
    expect(blocks[0].content.preset).toBe('33-67');
    expect(blocks[0].content.columns.map((c: any) => c.width)).toEqual([4, 8]);
  });

  it('stacks nested columns inside the outer column', () => {
    const st = state();
    const inner = columns(column([p('x')]), column([p('y')]));
    const blocks = mapBlocks([columns(column([inner]), column([p('b')]))], 'top', st) as any[];
    const first = blocks[0].content.columns[0].blocks;
    expect(first.map((b: any) => b.content.html)).toEqual(['<p>x</p>', '<p>y</p>']);
    expect(st.warnings.some((w) => w.rule === 'flattened')).toBe(true);
    expect(valid(blocks)).toBe(true);
  });

  it('turns a single column into plain blocks', () => {
    const blocks = mapBlocks([columns(column([p('solo')]))], 'top', state()) as any[];
    expect(blocks[0].block_type).toBe('rich_text');
  });
});

describe('tabs', () => {
  it('maps 2–8 tabs at top level to a tabs block', () => {
    const blocks = mapBlocks([tabs(tab('Do Now', [p('a')]), tab('Teach', [p('b')]))], 'top', state()) as any[];
    expect(blocks[0].block_type).toBe('tabs');
    expect(blocks[0].content.tabs.map((t: any) => t.label)).toEqual(['Do Now', 'Teach']);
    expect(valid(blocks)).toBe(true);
  });

  it('turns 1 tab or 9 tabs into sections at top level', () => {
    const one = mapBlocks([tabs(tab('Only', [p('a')]))], 'top', state()) as any[];
    expect(one.map((b) => b.block_type)).toEqual(['section']);
    const nine = mapBlocks([tabs(...Array.from({ length: 9 }, (_, k) => tab(`T${k}`, [p('x')])))], 'top', state()) as any[];
    expect(nine).toHaveLength(9);
    expect(nine.every((b) => b.block_type === 'section')).toBe(true);
  });

  it('turns tabs inside tabs into a heading per tab', () => {
    const st = state();
    const nested = tabs(tab('Inner A', [p('ia')]), tab('Inner B', [p('ib')]));
    const blocks = mapBlocks([tabs(tab('Outer', [nested]), tab('Other', [p('o')]))], 'top', st) as any[];
    const outer = blocks[0].content.tabs[0].blocks;
    expect(outer.map((b: any) => b.block_type)).toEqual(['heading', 'rich_text', 'heading', 'rich_text']);
    expect(valid(blocks)).toBe(true);
  });

  it('keeps a column inside a toggle inside tabs valid', () => {
    const deep = tabs(
      tab('A', [toggle('Rich', [columns(column([image()]), column([p('t')]))])]),
      tab('B', [p('b')])
    );
    const blocks = mapBlocks([deep], 'top', state()) as any[];
    expect(valid(blocks)).toBe(true);
  });
});

describe('child pages', () => {
  it('flattens a non-database child page to a heading plus its content', () => {
    const st = state();
    const blocks = mapBlocks([node('child_page', { title: 'Notes' }, [p('inside')])], 'top', st) as any[];
    expect(blocks.map((b) => b.block_type)).toEqual(['heading', 'rich_text']);
    expect(st.warnings.some((w) => w.rule === 'flattened')).toBe(true);
  });
});
