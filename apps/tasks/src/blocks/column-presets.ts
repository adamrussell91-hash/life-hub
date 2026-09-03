import type { Block } from '@/schemas/block';

export const COLUMN_PRESETS = ['50-50', '33-67', '67-33', '33-33-33'] as const;
export type ColumnPreset = (typeof COLUMN_PRESETS)[number];

export const COLUMN_PRESET_WIDTHS: Record<ColumnPreset, number[]> = {
  '50-50': [6, 6],
  '33-67': [4, 8],
  '67-33': [8, 4],
  '33-33-33': [4, 4, 4]
};

export type ColumnSlot = { width: number; blocks: Block[] };

export function remapColumnsPreset(
  columns: ColumnSlot[],
  preset: ColumnPreset
): ColumnSlot[] {
  const widths = COLUMN_PRESET_WIDTHS[preset];
  const next: ColumnSlot[] = widths.map((width, index) => ({
    width,
    blocks: columns[index] ? [...columns[index]!.blocks] : []
  }));

  if (columns.length > widths.length) {
    const last = next[next.length - 1]!;
    for (let i = widths.length; i < columns.length; i += 1) {
      last.blocks.push(...columns[i]!.blocks);
    }
  }

  return next;
}

export function emptyColumnsForPreset(preset: ColumnPreset): ColumnSlot[] {
  return COLUMN_PRESET_WIDTHS[preset].map((width) => ({ width, blocks: [] as Block[] }));
}
