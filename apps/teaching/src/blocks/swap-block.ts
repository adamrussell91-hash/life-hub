import { replaceBlockInTree } from '@/ai/block-tree';
import type { Block } from '@/schemas/block';

type SwapContext = {
  getLessonBlocks?: () => Block[];
  setLessonBlocks?: (blocks: Block[]) => void;
};

/**
 * A picker on a block that turns it into its sibling type (Callout ↔ Quote,
 * Image ↔ Gallery, Divider ↔ Space, Mind map ↔ Concept map). The page swaps
 * the block in place and redraws, so the new type's editor opens. Without a
 * page (a bare editor in a test), the change still goes through onChange.
 */
export function swapBlock(next: Block, onChange: (block: Block) => void, context: SwapContext = {}): void {
  const page = context.getLessonBlocks?.();
  if (page && context.setLessonBlocks) {
    context.setLessonBlocks(replaceBlockInTree(page, next.id, next));
    return;
  }
  onChange(next);
}
