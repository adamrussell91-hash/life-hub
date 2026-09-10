import { describe, it, expect } from 'vitest';
import {
  COLUMN_PRESET_WIDTHS,
  remapColumnsPreset,
  type ColumnPreset
} from '@/blocks/column-presets';
import type { Block } from '@/schemas/block';

const leaf = (id: string): Block =>
  ({
    id,
    type: 'block',
    block_type: 'rich_text',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { html: id },
    layout: {},
    print: {},
    settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1
  }) as Block;

describe('COLUMN_PRESET_WIDTHS', () => {
  it('maps four presets to 12-grid widths', () => {
    expect(COLUMN_PRESET_WIDTHS['50-50']).toEqual([6, 6]);
    expect(COLUMN_PRESET_WIDTHS['33-67']).toEqual([4, 8]);
    expect(COLUMN_PRESET_WIDTHS['67-33']).toEqual([8, 4]);
    expect(COLUMN_PRESET_WIDTHS['33-33-33']).toEqual([4, 4, 4]);
  });
});

describe('remapColumnsPreset', () => {
  it('keeps blocks when expanding 50-50 → 33-33-33', () => {
    const columns = [
      { width: 6, blocks: [leaf('a')] },
      { width: 6, blocks: [leaf('b')] }
    ];
    const next = remapColumnsPreset(columns, '33-33-33');
    expect(next.map((c) => c.width)).toEqual([4, 4, 4]);
    expect(next[0]!.blocks.map((b) => b.id)).toEqual(['a']);
    expect(next[1]!.blocks.map((b) => b.id)).toEqual(['b']);
    expect(next[2]!.blocks).toEqual([]);
  });

  it('folds surplus column blocks into the last column when shrinking', () => {
    const columns = [
      { width: 4, blocks: [leaf('a')] },
      { width: 4, blocks: [leaf('b')] },
      { width: 4, blocks: [leaf('c'), leaf('d')] }
    ];
    const next = remapColumnsPreset(columns, '50-50');
    expect(next.map((c) => c.width)).toEqual([6, 6]);
    expect(next[0]!.blocks.map((b) => b.id)).toEqual(['a']);
    expect(next[1]!.blocks.map((b) => b.id)).toEqual(['b', 'c', 'd']);
  });

  it('is a no-op shape when preset column count matches', () => {
    const columns = [
      { width: 4, blocks: [leaf('a')] },
      { width: 8, blocks: [leaf('b')] }
    ];
    const next = remapColumnsPreset(columns, '33-67' as ColumnPreset);
    expect(next[0]!.blocks.map((b) => b.id)).toEqual(['a']);
    expect(next[1]!.blocks.map((b) => b.id)).toEqual(['b']);
    expect(next.map((c) => c.width)).toEqual([4, 8]);
  });
});
