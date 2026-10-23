// apps/teaching/src/lecture/tree.ts
import type { Block } from '@/schemas/block';

type ChildList = { blocks: Block[]; rebuild: (blocks: Block[]) => Block };

/** The child lists a block holds: a section's blocks, each column, each tab. */
function childLists(block: Block): ChildList[] {
  const c = block.content as {
    blocks?: Block[];
    columns?: Array<{ blocks: Block[] }>;
    tabs?: Array<{ blocks: Block[] }>;
  };
  if (block.block_type === 'section' && Array.isArray(c.blocks)) {
    return [{ blocks: c.blocks, rebuild: (blocks) => ({ ...block, content: { ...block.content, blocks } }) as Block }];
  }
  if (block.block_type === 'columns' && c.columns) {
    const columns = c.columns;
    return columns.map((col, i) => ({
      blocks: col.blocks,
      rebuild: (blocks) =>
        ({ ...block, content: { ...block.content, columns: columns.map((x, j) => (j === i ? { ...x, blocks } : x)) } }) as Block
    }));
  }
  if (block.block_type === 'tabs' && c.tabs) {
    const tabs = c.tabs;
    return tabs.map((tab, i) => ({
      blocks: tab.blocks,
      rebuild: (blocks) =>
        ({ ...block, content: { ...block.content, tabs: tabs.map((x, j) => (j === i ? { ...x, blocks } : x)) } }) as Block
    }));
  }
  return [];
}

/** `added` right after block `id`, wherever it sits. Untouched branches keep their identity. */
export function insertAfter(blocks: Block[], id: string, added: Block): Block[] {
  const at = blocks.findIndex((b) => b.id === id);
  if (at >= 0) return [...blocks.slice(0, at + 1), added, ...blocks.slice(at + 1)];
  let touched = false;
  const out = blocks.map((block) => {
    let next = block;
    // Ids are unique, so at most one list changes.
    for (const list of childLists(block)) {
      const changed = insertAfter(list.blocks, id, added);
      if (changed !== list.blocks) {
        next = list.rebuild(changed);
        touched = true;
      }
    }
    return next;
  });
  return touched ? out : blocks;
}

/** The block right after `id` in the same list, or null. */
export function nextSibling(blocks: Block[], id: string): Block | null {
  const at = blocks.findIndex((b) => b.id === id);
  if (at >= 0) return blocks[at + 1] ?? null;
  for (const block of blocks) {
    for (const list of childLists(block)) {
      const found = nextSibling(list.blocks, id);
      if (found) return found;
    }
  }
  return null;
}

/** The section, columns or tabs block holding `id`; null at the top level; undefined if absent. */
export function containerOf(blocks: Block[], id: string, parent: Block | null = null): Block | null | undefined {
  if (blocks.some((b) => b.id === id)) return parent;
  for (const block of blocks) {
    for (const list of childLists(block)) {
      const found = containerOf(list.blocks, id, block);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** The block right before `id` in the same list, or null (also when `id` is first or absent). */
export function previousSibling(blocks: Block[], id: string): Block | null {
  return findPrevious(blocks, id) ?? null;
}

function findPrevious(blocks: Block[], id: string): Block | null | undefined {
  const at = blocks.findIndex((b) => b.id === id);
  if (at >= 0) return blocks[at - 1] ?? null;
  for (const block of blocks) {
    for (const list of childLists(block)) {
      const found = findPrevious(list.blocks, id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** `added` as the first child of the section `id`, wherever it sits; unchanged if `id` is not a section. */
export function prependToSection(blocks: Block[], id: string, added: Block): Block[] {
  let touched = false;
  const out = blocks.map((block) => {
    if (block.id === id && block.block_type === 'section') {
      touched = true;
      const c = block.content as { blocks: Block[] };
      return { ...block, content: { ...block.content, blocks: [added, ...c.blocks] } } as Block;
    }
    let next = block;
    for (const list of childLists(block)) {
      const changed = prependToSection(list.blocks, id, added);
      if (changed !== list.blocks) { next = list.rebuild(changed); touched = true; }
    }
    return next;
  });
  return touched ? out : blocks;
}
