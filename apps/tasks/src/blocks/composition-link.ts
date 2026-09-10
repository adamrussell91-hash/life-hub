import type { Block } from '@/schemas/block';
import type { CompositionTemplate } from '@/schemas/composition';
import { createBlock } from '@/blocks/create-block';

type SectionBlock = Extract<Block, { block_type: 'section' }>;

export function isLinkedSection(block: Block): block is SectionBlock & {
  content: SectionBlock['content'] & {
    link: { mode: 'linked'; source_composition_id: string };
  };
} {
  return (
    block.block_type === 'section' &&
    block.content.link?.mode === 'linked' &&
    typeof block.content.link.source_composition_id === 'string'
  );
}

export function createLinkedSectionStub(options: {
  id: string;
  sourceCompositionId: string;
  titleHint: string;
  now?: () => string;
}): SectionBlock {
  const section = createBlock('section', options.id) as SectionBlock;
  if (options.now) {
    const stamp = options.now();
    section.created_at = stamp;
    section.updated_at = stamp;
  }
  section.content.title = options.titleHint;
  section.content.blocks = [];
  section.content.link = {
    mode: 'linked',
    source_composition_id: options.sourceCompositionId
  };
  return section;
}

export function isCompositionUsable(
  composition: CompositionTemplate | null | undefined
): composition is CompositionTemplate {
  return !!composition && composition.status === 'active';
}
