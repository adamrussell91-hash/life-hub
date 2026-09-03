import type { Block } from '@/schemas/block';
import type { CompositionTemplate } from '@/schemas/composition';
import { cloneBlockWithNewIds } from '@/blocks/create-block';
import { isCompositionUsable, isLinkedSection } from '@/blocks/composition-link';

export class LinkedResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedResolveError';
  }
}

export function resolveLinkedSectionsForPublish(
  blocks: Block[],
  getComposition: (id: string) => CompositionTemplate | null,
  nextId: () => string
): Block[] {
  return blocks.map((block) => {
    if (!isLinkedSection(block)) return block;
    const composition = getComposition(block.content.link.source_composition_id);
    if (!isCompositionUsable(composition)) {
      throw new LinkedResolveError(
        `Linked composition ${block.content.link.source_composition_id} is missing or not active`
      );
    }
    const cloned = cloneBlockWithNewIds(composition.root, nextId) as Extract<
      Block,
      { block_type: 'section' }
    >;
    if (cloned.content.link) {
      const { link: _link, ...content } = cloned.content;
      return { ...cloned, content };
    }
    return cloned;
  });
}
