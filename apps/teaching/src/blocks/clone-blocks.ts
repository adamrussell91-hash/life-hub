import { cloneBlockWithNewIds } from '@/blocks/create-block';
import type { Block } from '@/schemas';

/** Deep-clone a block list with fresh ids for template save or use. */
export function cloneBlocksWithNewIds(
  blocks: Block[],
  nextId: () => string = () => `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
): Block[] {
  return blocks.map((block) => cloneBlockWithNewIds(block, nextId));
}
