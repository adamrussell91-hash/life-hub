import type { ColumnSlot } from '@/blocks/column-presets';

export function moveBlockBetweenColumns(
  columns: ColumnSlot[],
  fromCol: number,
  fromIndex: number,
  toCol: number,
  toIndex?: number
): ColumnSlot[] {
  if (
    fromCol < 0 ||
    toCol < 0 ||
    fromCol >= columns.length ||
    toCol >= columns.length
  ) {
    return columns;
  }
  const source = columns[fromCol]!;
  if (fromIndex < 0 || fromIndex >= source.blocks.length) return columns;

  const block = source.blocks[fromIndex]!;
  const next = columns.map((col) => ({
    ...col,
    blocks: [...col.blocks]
  }));

  next[fromCol]!.blocks.splice(fromIndex, 1);

  let insertAt = toIndex;
  if (insertAt === undefined || insertAt < 0 || insertAt > next[toCol]!.blocks.length) {
    insertAt = next[toCol]!.blocks.length;
  }
  if (fromCol === toCol && fromIndex < insertAt) insertAt -= 1;

  next[toCol]!.blocks.splice(insertAt, 0, block);
  return next;
}
