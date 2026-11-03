import { cloneBlockWithNewIds } from '@/blocks/create-block';
import type { Block } from '@/schemas';

/** Every block in a list, depth first, through sections, columns and tabs. Clones share the order. */
function flatten(blocks: readonly Block[], out: Block[] = []): Block[] {
  for (const b of blocks) {
    out.push(b);
    if (b.block_type === 'section') flatten(b.content.blocks as Block[], out);
    else if (b.block_type === 'columns') for (const c of b.content.columns) flatten(c.blocks as Block[], out);
    else if (b.block_type === 'tabs') for (const t of b.content.tabs) flatten(t.blocks as Block[], out);
  }
  return out;
}

/**
 * Blocks that point at another block in the same copy (a return line's
 * `returns_to`) follow it to its new id. A pointer to a block outside the copy
 * is dropped, so the copy never reaches back into the lesson it came from.
 */
export function relinkCopiedBlocks<T extends Block>(before: readonly Block[], after: T[]): T[] {
  const old = flatten(before);
  const fresh = flatten(after);
  const ids = new Map(old.map((b, i) => [b.id, fresh[i]?.id]));
  for (const b of fresh) {
    if (b.block_type !== 'continuum_line' || !b.content.returns_to) continue;
    const next = ids.get(b.content.returns_to);
    if (next) b.content.returns_to = next;
    else delete b.content.returns_to;
  }
  return after;
}

/** Deep-clone a block list with fresh ids for template save or use. */
export function cloneBlocksWithNewIds(
  blocks: Block[],
  nextId: () => string = () => `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
): Block[] {
  return relinkCopiedBlocks(blocks, blocks.map((block) => cloneBlockWithNewIds(block, nextId)));
}
