import type { Block } from '@/schemas/block';
import { findBlockById } from '@/blocks/find-block';

/** Find the nearest ancestor section containing `blockId`, or the block itself if it is a section. */
export function findEnclosingSection(blocks: Block[], blockId: string): Block | null {
  const direct = findBlockById(blocks, blockId);
  if (direct?.block_type === 'section') return direct;

  function walk(list: Block[], ancestors: Block[]): Block | null {
    for (const block of list) {
      if (block.id === blockId) {
        for (let i = ancestors.length - 1; i >= 0; i--) {
          if (ancestors[i]!.block_type === 'section') return ancestors[i]!;
        }
        return null;
      }
      const next = [...ancestors, block];
      if (block.block_type === 'section') {
        const found = walk(block.content.blocks as Block[], next);
        if (found) return found;
      } else if (block.block_type === 'columns') {
        for (const col of block.content.columns) {
          const found = walk(col.blocks as Block[], next);
          if (found) return found;
        }
      } else if (block.block_type === 'tabs') {
        for (const tab of block.content.tabs) {
          const found = walk(tab.blocks as Block[], next);
          if (found) return found;
        }
      }
    }
    return null;
  }

  return walk(blocks, []);
}

export function replaceBlockInTree(blocks: Block[], blockId: string, next: Block): Block[] {
  return blocks.map((block) => {
    if (block.id === blockId) return next;
    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: replaceBlockInTree(block.content.blocks as Block[], blockId, next)
        }
      } as Block;
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: block.content.columns.map((col) => ({
            ...col,
            blocks: replaceBlockInTree(col.blocks as Block[], blockId, next)
          }))
        }
      } as Block;
    }
    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          ...block.content,
          tabs: block.content.tabs.map((tab) => ({
            ...tab,
            blocks: replaceBlockInTree(tab.blocks as Block[], blockId, next)
          }))
        }
      } as Block;
    }
    return block;
  });
}

function insertInList(
  list: Block[],
  anchorId: string,
  position: 'above' | 'below',
  inserts: Block[]
): Block[] | null {
  const idx = list.findIndex((b) => b.id === anchorId);
  if (idx < 0) return null;
  const at = position === 'above' ? idx : idx + 1;
  const copy = [...list];
  copy.splice(at, 0, ...inserts);
  return copy;
}

export function applyInsertBlocks(
  blocks: Block[],
  anchorId: string,
  position: 'above' | 'below',
  inserts: Block[]
): { blocks: Block[]; ok: boolean } {
  const top = insertInList(blocks, anchorId, position, inserts);
  if (top) return { blocks: top, ok: true };

  function walk(list: Block[]): Block[] | null {
    for (let i = 0; i < list.length; i++) {
      const block = list[i]!;
      if (block.block_type === 'section') {
        const innerTop = insertInList(block.content.blocks as Block[], anchorId, position, inserts);
        if (innerTop) {
          const copy = [...list];
          copy[i] = {
            ...block,
            content: { ...block.content, blocks: innerTop }
          } as Block;
          return copy;
        }
        const deeper = walk(block.content.blocks as Block[]);
        if (deeper) {
          const copy = [...list];
          copy[i] = {
            ...block,
            content: { ...block.content, blocks: deeper }
          } as Block;
          return copy;
        }
      } else if (block.block_type === 'columns') {
        for (let c = 0; c < block.content.columns.length; c++) {
          const col = block.content.columns[c]!;
          const innerTop = insertInList(col.blocks as Block[], anchorId, position, inserts);
          if (innerTop) {
            const columns = block.content.columns.map((column, ci) =>
              ci === c ? { ...column, blocks: innerTop } : column
            );
            const copy = [...list];
            copy[i] = { ...block, content: { ...block.content, columns } } as Block;
            return copy;
          }
          const deeper = walk(col.blocks as Block[]);
          if (deeper) {
            const columns = block.content.columns.map((column, ci) =>
              ci === c ? { ...column, blocks: deeper } : column
            );
            const copy = [...list];
            copy[i] = { ...block, content: { ...block.content, columns } } as Block;
            return copy;
          }
        }
      } else if (block.block_type === 'tabs') {
        for (let t = 0; t < block.content.tabs.length; t++) {
          const tab = block.content.tabs[t]!;
          const innerTop = insertInList(tab.blocks as Block[], anchorId, position, inserts);
          if (innerTop) {
            const tabs = block.content.tabs.map((row, ti) =>
              ti === t ? { ...row, blocks: innerTop } : row
            );
            const copy = [...list];
            copy[i] = { ...block, content: { ...block.content, tabs } } as Block;
            return copy;
          }
          const deeper = walk(tab.blocks as Block[]);
          if (deeper) {
            const tabs = block.content.tabs.map((row, ti) =>
              ti === t ? { ...row, blocks: deeper } : row
            );
            const copy = [...list];
            copy[i] = { ...block, content: { ...block.content, tabs } } as Block;
            return copy;
          }
        }
      }
    }
    return null;
  }

  const next = walk(blocks);
  return next ? { blocks: next, ok: true } : { blocks, ok: false };
}
