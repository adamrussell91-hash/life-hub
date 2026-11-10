import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';

export type DiamondNineBlock = Extract<Block, { block_type: 'diamond_nine' }>;

/** STUB: replaced by the Diamond 9 view. */
export function renderDiamondNine(block: DiamondNineBlock, _mode: RenderMode, _ctx: RenderContext = {}): HTMLElement {
  const root = document.createElement('section');
  root.className = 'd9';
  root.textContent = block.content.criterion;
  return root;
}

/** STUB: replaced by the Diamond 9 editor. */
export function createDiamondNineEditor(_block: DiamondNineBlock, _onChange: (b: DiamondNineBlock) => void): HTMLElement {
  return document.createElement('div');
}
