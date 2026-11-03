import type { Block } from '@/schemas/block';
import { cloneBlockWithNewIds } from '@/blocks/create-block';
import { relinkCopiedBlocks } from '@/blocks/clone-blocks';

type SectionBlock = Extract<Block, { block_type: 'section' }>;

/** Clone a composition's section root into a lesson with fresh block ids. */
export function insertCompositionRoot(
  root: SectionBlock,
  nextId: () => string,
  now?: () => string
): SectionBlock {
  return relinkCopiedBlocks([root], [cloneBlockWithNewIds(root, nextId, now) as SectionBlock])[0]!;
}
