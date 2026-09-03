import type { ColumnSlot } from '@/blocks/column-presets';

export function trySetColumnWidths(
  columns: ColumnSlot[],
  widths: number[]
): ColumnSlot[] | null {
  if (widths.length !== columns.length) return null;
  if (!widths.every((w) => Number.isInteger(w) && w >= 1 && w <= 11)) return null;
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== 12) return null;
  return columns.map((col, i) => ({ ...col, width: widths[i]! }));
}
