import type { Block } from '@/schemas/block';

/** Read, set and remove a lens kept in the shared `lenses` field. */
export function readLens(block: Block, id: string): Record<string, unknown> | undefined {
  return block.lenses?.find((item) => item.id === id)?.config;
}

export function withLens<T extends Block>(block: T, id: string, config: Record<string, unknown>): T {
  const lenses = [...(block.lenses ?? [])];
  const at = lenses.findIndex((item) => item.id === id);
  if (at < 0) lenses.push({ id, config });
  else lenses[at] = { id, config };
  return { ...block, lenses };
}

export function withoutLens<T extends Block>(block: T, id: string): T {
  const lenses = block.lenses?.filter((item) => item.id !== id) ?? [];
  const { lenses: _removed, ...rest } = block;
  return (lenses.length ? { ...rest, lenses } : rest) as T;
}
