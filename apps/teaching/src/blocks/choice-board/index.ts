import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';

export type ChoiceBoardBlock = Extract<Block, { block_type: 'tabs' }>;

/** STUB: replaced by the choice board view. `renderChild` renders a tile's nested block. */
export function renderChoiceBoard(block: ChoiceBoardBlock, _mode: RenderMode, _ctx: RenderContext, _renderChild: (child: Block) => HTMLElement): HTMLElement {
  const root = document.createElement('div');
  root.className = 'cb';
  root.textContent = String(block.content.tabs.length);
  return root;
}
