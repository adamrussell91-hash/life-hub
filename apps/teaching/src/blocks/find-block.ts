import type { Block } from '@/schemas/block';

export function findBlockById(blocks: Block[], id: string): Block | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.block_type === 'section') {
      const found = findBlockById(block.content.blocks as Block[], id);
      if (found) return found;
    } else if (block.block_type === 'columns') {
      for (const col of block.content.columns) {
        const found = findBlockById(col.blocks as Block[], id);
        if (found) return found;
      }
    } else if (block.block_type === 'tabs') {
      for (const tab of block.content.tabs) {
        const found = findBlockById(tab.blocks as Block[], id);
        if (found) return found;
      }
    }
  }
  return null;
}
