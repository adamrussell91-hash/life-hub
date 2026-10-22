import { describe, expect, it } from 'vitest';
import { columnPreset, columnWidths } from '@/notion-import/columns';
import { BlockIds, makeBlock } from '@/notion-import/block-factory';
import { BlockSchema } from '@/schemas/block';

describe('columnWidths', () => {
  it('splits equal columns', () => {
    expect(columnWidths([undefined, undefined])).toEqual([6, 6]);
    expect(columnWidths([undefined, undefined, undefined])).toEqual([4, 4, 4]);
  });
  it('rounds ratios to twelfths that sum to 12', () => {
    expect(columnWidths([0.333, 0.667])).toEqual([4, 8]);
    const five = columnWidths([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(five.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.min(...five)).toBeGreaterThanOrEqual(1);
  });
  it('keeps every column at least 1 wide', () => {
    const widths = columnWidths([0.9, 0.05, 0.05]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.min(...widths)).toBe(1);
  });
});

describe('columnPreset', () => {
  it('names known layouts and falls back to custom', () => {
    expect(columnPreset([6, 6])).toBe('50-50');
    expect(columnPreset([4, 8])).toBe('33-67');
    expect(columnPreset([8, 4])).toBe('67-33');
    expect(columnPreset([4, 4, 4])).toBe('33-33-33');
    expect(columnPreset([3, 9])).toBe('custom');
  });
});

describe('makeBlock', () => {
  it('builds a schema-valid block', () => {
    const block = makeBlock('rich_text', 'blk_1', { html: '<p>x</p>' }, '2026-10-18T00:00:00.000Z');
    expect(BlockSchema.safeParse(block).success).toBe(true);
  });
});

describe('BlockIds', () => {
  it('derives stable ids from notion ids and never repeats', () => {
    const ids = new BlockIds();
    expect(ids.from('ab-cd')).toBe('blk_abcd');
    expect(ids.from('ab-cd')).toBe('blk_abcd_2');
  });
});
