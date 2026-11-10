import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';

export type VennBlock = Extract<Block, { block_type: 'venn' }>;

/** STUB: replaced by the Venn view. */
export function renderVenn(block: VennBlock, _mode: RenderMode, _ctx: RenderContext = {}): HTMLElement {
  const root = document.createElement('section');
  root.className = 'venn';
  root.textContent = block.content.prompt;
  return root;
}

/** STUB: replaced by the Venn editor. */
export function createVennEditor(_block: VennBlock, _onChange: (b: VennBlock) => void): HTMLElement {
  return document.createElement('div');
}
