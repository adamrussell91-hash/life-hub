// apps/teaching/src/lecture/preview.ts
import type { Block } from '@/schemas/block';

/**
 * What a student would get, from the draft, for the teacher's Play as
 * student. Teacher-only blocks and teacher notes go; hinge answers stay so
 * the preview can check them without a published copy.
 */
export function previewBlocks(blocks: readonly Block[]): Block[] {
  return blocks
    .filter((block) => block.visibility !== 'teacher_only' && (block.block_type as string) !== 'teacher_note')
    .map((block) => {
      const c = block.content as { blocks?: Block[]; columns?: Array<{ blocks: Block[] }>; tabs?: Array<{ blocks: Block[] }> };
      if (block.block_type === 'section' && c.blocks) return { ...block, content: { ...block.content, blocks: previewBlocks(c.blocks) } } as Block;
      if (block.block_type === 'columns' && c.columns) return { ...block, content: { ...block.content, columns: c.columns.map((col) => ({ ...col, blocks: previewBlocks(col.blocks) })) } } as Block;
      if (block.block_type === 'tabs' && c.tabs) return { ...block, content: { ...block.content, tabs: c.tabs.map((tab) => ({ ...tab, blocks: previewBlocks(tab.blocks) })) } } as Block;
      return block;
    });
}
