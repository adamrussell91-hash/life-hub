import { isLinkedSection } from '@/blocks/composition-link';
import {
  COLUMN_CHILD_TYPES,
  NEW_BLOCK_TYPES,
  SECTION_CHILD_TYPES,
  TAB_CHILD_TYPES,
  type NewBlockType
} from '@/blocks/create-block';
import { findBlockById } from '@/blocks/find-block';
import { isSidePath, takesSidePath } from '@/lecture/scenes';
import type { Block } from '@/schemas/block';

const LINKED_SECTION_MESSAGE = 'Linked sections cannot contain blocks.';

export type DropParent =
  | { kind: 'root' }
  | { kind: 'section'; id: string }
  | { kind: 'column'; id: string; columnIndex: number }
  | { kind: 'tab'; id: string; tabIndex: number };

type DropResult = { ok: true; blocks: Block[] } | { ok: false; message: string };

export type DropRootMode = 'lesson' | 'page';

export type DropOptions = { rootMode?: DropRootMode };

const PAGE_ONLY = new Set(['collection']);
const LESSON_ROOT_CHILD_TYPES = NEW_BLOCK_TYPES.filter((t) => !PAGE_ONLY.has(t));
const PAGE_ROOT_CHILD_TYPES = NEW_BLOCK_TYPES;

function allowedTypesFor(parent: DropParent, rootMode: DropRootMode): readonly NewBlockType[] {
  switch (parent.kind) {
    case 'root':
      return rootMode === 'page' ? PAGE_ROOT_CHILD_TYPES : LESSON_ROOT_CHILD_TYPES;
    case 'section':
      return SECTION_CHILD_TYPES;
    case 'column':
      return COLUMN_CHILD_TYPES;
    case 'tab':
      return TAB_CHILD_TYPES;
  }
}

function rejectReason(parent: DropParent, type: NewBlockType, rootMode: DropRootMode): string {
  if (parent.kind === 'root' && PAGE_ONLY.has(type) && rootMode !== 'page') {
    return 'Collection cannot be added to a lesson page.';
  }
  if (parent.kind === 'column' && type === 'columns') {
    return 'Columns cannot be nested inside columns.';
  }
  return `${type} is not allowed in this ${parent.kind}.`;
}

export function insertTypeForParent(
  parent: DropParent,
  type: NewBlockType,
  rootMode: DropRootMode = 'lesson'
): string | null {
  return allowedTypesFor(parent, rootMode).includes(type) ? null : rejectReason(parent, type, rootMode);
}

const SIDE_PATH_PLACE = 'An If wrong path can sit on the page or inside a chapter.';

/**
 * Why `block` cannot go in `parent`, or null. Like `insertTypeForParent`, but
 * a lecture side path may sit one level down, inside a chapter section.
 */
function placeReason(
  blocks: Block[],
  parent: DropParent,
  block: Block,
  rootMode: DropRootMode = 'lesson'
): string | null {
  if (isSidePath(block)) {
    if (parent.kind === 'root') return insertTypeForParent(parent, 'section', rootMode);
    if (parent.kind === 'section') {
      const holder = findBlockById(blocks, parent.id);
      return holder && !isSidePath(holder) ? null : SIDE_PATH_PLACE;
    }
    return SIDE_PATH_PLACE;
  }
  return insertTypeForParent(parent, block.block_type as NewBlockType, rootMode);
}

/**
 * Dropping a section where a section cannot go moves its blocks in instead.
 * A side path never unpacks: it moves whole onto the page or into a chapter,
 * and `moveBlockTo` refuses it anywhere else.
 */
export function sectionDropUnpacks(blocks: Block[], sectionId: string, parent: DropParent): boolean {
  const moving = findBlockById(blocks, sectionId);
  if (moving?.block_type !== 'section') return false;
  // A side path moves whole or is refused, never quietly unpacked.
  if (isSidePath(moving)) return false;
  return insertTypeForParent(parent, 'section') !== null;
}

function linkedSectionWriteError(blocks: Block[], parent: DropParent): string | null {
  if (parent.kind !== 'section') return null;
  const target = findBlockById(blocks, parent.id);
  return target && isLinkedSection(target) ? LINKED_SECTION_MESSAGE : null;
}

function sameParent(a: DropParent, b: DropParent): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'root') return true;
  if (a.kind === 'section' && b.kind === 'section') return a.id === b.id;
  if (a.kind === 'column' && b.kind === 'column') {
    return a.id === b.id && a.columnIndex === b.columnIndex;
  }
  if (a.kind === 'tab' && b.kind === 'tab') {
    return a.id === b.id && a.tabIndex === b.tabIndex;
  }
  return false;
}

export function findBlockLocation(
  blocks: Block[],
  blockId: string
): { parent: DropParent; index: number } | null {
  function search(
    list: Block[],
    parent: DropParent
  ): { parent: DropParent; index: number } | null {
    const index = list.findIndex((b) => b.id === blockId);
    if (index >= 0) return { parent, index };
    for (const block of list) {
      if (block.block_type === 'section') {
        const found = search(block.content.blocks as Block[], {
          kind: 'section',
          id: block.id
        });
        if (found) return found;
      } else if (block.block_type === 'columns') {
        for (let i = 0; i < block.content.columns.length; i++) {
          const found = search(block.content.columns[i]!.blocks as Block[], {
            kind: 'column',
            id: block.id,
            columnIndex: i
          });
          if (found) return found;
        }
      } else if (block.block_type === 'tabs') {
        for (let i = 0; i < block.content.tabs.length; i++) {
          const found = search(block.content.tabs[i]!.blocks as Block[], {
            kind: 'tab',
            id: block.id,
            tabIndex: i
          });
          if (found) return found;
        }
      }
    }
    return null;
  }
  return search(blocks, { kind: 'root' });
}

export function insertTargetForSelection(
  blocks: Block[],
  selectedId: string | null
): { parent: DropParent; index: number } {
  if (!selectedId) return { parent: { kind: 'root' }, index: blocks.length };
  const selected = findBlockById(blocks, selectedId);
  if (!selected) return { parent: { kind: 'root' }, index: blocks.length };
  if (selected.block_type === 'section') {
    return {
      parent: { kind: 'section', id: selected.id },
      index: selected.content.blocks.length
    };
  }
  if (selected.block_type === 'columns') {
    const column = selected.content.columns[0];
    return {
      parent: { kind: 'column', id: selected.id, columnIndex: 0 },
      index: column?.blocks.length ?? 0
    };
  }
  if (selected.block_type === 'tabs') {
    const tab = selected.content.tabs[0];
    return {
      parent: { kind: 'tab', id: selected.id, tabIndex: 0 },
      index: tab?.blocks.length ?? 0
    };
  }
  const location = findBlockLocation(blocks, selectedId);
  if (!location) return { parent: { kind: 'root' }, index: blocks.length };
  return { parent: location.parent, index: location.index + 1 };
}

function updateListAtParent(
  blocks: Block[],
  parent: DropParent,
  updater: (list: Block[]) => Block[]
): Block[] | null {
  if (parent.kind === 'root') return updater(blocks);

  function walk(list: Block[]): Block[] | null {
    for (let i = 0; i < list.length; i++) {
      const block = list[i]!;
      if (parent.kind === 'section' && block.block_type === 'section' && block.id === parent.id) {
        const copy = [...list];
        copy[i] = {
          ...block,
          content: { ...block.content, blocks: updater(block.content.blocks as Block[]) }
        } as Block;
        return copy;
      }
      if (parent.kind === 'column' && block.block_type === 'columns' && block.id === parent.id) {
        const col = block.content.columns[parent.columnIndex];
        if (!col) return null;
        const columns = block.content.columns.map((column, ci) =>
          ci === parent.columnIndex
            ? { ...column, blocks: updater(column.blocks as Block[]) }
            : column
        );
        const copy = [...list];
        copy[i] = { ...block, content: { ...block.content, columns } } as Block;
        return copy;
      }
      if (parent.kind === 'tab' && block.block_type === 'tabs' && block.id === parent.id) {
        const tab = block.content.tabs[parent.tabIndex];
        if (!tab) return null;
        const tabs = block.content.tabs.map((row, ti) =>
          ti === parent.tabIndex ? { ...row, blocks: updater(row.blocks as Block[]) } : row
        );
        const copy = [...list];
        copy[i] = { ...block, content: { ...block.content, tabs } } as Block;
        return copy;
      }
      if (block.block_type === 'section') {
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
          const deeper = walk(block.content.columns[c]!.blocks as Block[]);
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
          const deeper = walk(block.content.tabs[t]!.blocks as Block[]);
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

  return walk(blocks);
}

export function insertAt(
  blocks: Block[],
  parent: DropParent,
  index: number,
  block: Block,
  options: DropOptions = {}
): DropResult {
  const rootMode = options.rootMode ?? 'lesson';
  const linked = linkedSectionWriteError(blocks, parent);
  if (linked) return { ok: false, message: linked };
  const reason = placeReason(blocks, parent, block, rootMode);
  if (reason) return { ok: false, message: reason };
  const next = updateListAtParent(blocks, parent, (list) => {
    const at = Math.max(0, Math.min(index, list.length));
    const copy = [...list];
    copy.splice(at, 0, block);
    return copy;
  });
  if (!next) return { ok: false, message: 'Parent not found.' };
  return { ok: true, blocks: next };
}

export function deleteBlocksById(blocks: Block[], ids: string[]): Block[] {
  const idSet = new Set(ids);
  function walk(list: Block[]): Block[] {
    return list
      .filter((block) => !idSet.has(block.id))
      .map((block) => {
        if (block.block_type === 'section') {
          return {
            ...block,
            content: { ...block.content, blocks: walk(block.content.blocks as Block[]) }
          } as Block;
        }
        if (block.block_type === 'columns') {
          return {
            ...block,
            content: {
              ...block.content,
              columns: block.content.columns.map((col) => ({
                ...col,
                blocks: walk(col.blocks as Block[])
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
                blocks: walk(tab.blocks as Block[])
              }))
            }
          } as Block;
        }
        return block;
      });
  }
  return walk(blocks);
}

function siblingsAt(blocks: Block[], parent: DropParent): Block[] | null {
  let found: Block[] | null = null;
  updateListAtParent(blocks, parent, (list) => {
    found = list;
    return list;
  });
  return found;
}

/** The side path that travels with a hinge or cloze: the section right after it. */
function attachedSidePath(
  blocks: Block[],
  location: { parent: DropParent; index: number },
  moving: Block
): Block | null {
  if (!takesSidePath(moving)) return null;
  const after = siblingsAt(blocks, location.parent)?.[location.index + 1];
  return after && isSidePath(after) ? after : null;
}

/**
 * Moves a block to `index` in `parent` (an index in the list as it is now).
 * A hinge or cloze takes the side path right after it along, so the pair
 * stays together.
 */
export function moveBlockTo(
  blocks: Block[],
  blockId: string,
  parent: DropParent,
  index: number,
  options: DropOptions = {}
): DropResult {
  const location = findBlockLocation(blocks, blockId);
  const moving = findBlockById(blocks, blockId);
  if (!location || !moving) return { ok: false, message: 'Block not found.' };
  const linked = linkedSectionWriteError(blocks, parent);
  if (linked) return { ok: false, message: linked };
  const rootMode = options.rootMode ?? 'lesson';
  const reason = placeReason(blocks, parent, moving, rootMode);
  if (reason) return { ok: false, message: reason };
  const path = attachedSidePath(blocks, location, moving);
  if (path && placeReason(blocks, parent, path, rootMode)) {
    return { ok: false, message: 'A question and its If wrong path move together, onto the page or into a chapter.' };
  }
  const group = path ? [moving, path] : [moving];

  const without = deleteBlocksById(blocks, group.map((block) => block.id));
  // Slots the group leaves behind before `index` close up.
  const destIndex = sameParent(location.parent, parent)
    ? index - group.filter((_, i) => location.index + i < index).length
    : index;
  const next = updateListAtParent(without, parent, (list) => {
    const at = Math.max(0, Math.min(destIndex, list.length));
    const copy = [...list];
    copy.splice(at, 0, ...group);
    return copy;
  });
  if (!next) return { ok: false, message: 'Parent not found.' };
  return { ok: true, blocks: next };
}

/**
 * The `moveBlockTo` index for Move up / Move down in `list`, or null at an
 * end. A hinge or cloze with its side path counts as one step, both as the
 * block moving and as the neighbour it passes.
 */
export function moveByTarget(list: Block[], blockId: string, delta: 1 | -1): number | null {
  const from = list.findIndex((block) => block.id === blockId);
  if (from < 0) return null;
  const is = (at: number, test: (block: Block) => boolean) => {
    const block = list[at];
    return block !== undefined && test(block);
  };
  const span = (at: number) => (is(at, takesSidePath) && is(at + 1, isSidePath) ? 2 : 1);
  if (delta < 0) {
    if (from === 0) return null;
    const prev = from - 1;
    return is(prev, isSidePath) && is(prev - 1, takesSidePath) ? prev - 1 : prev;
  }
  const next = from + span(from);
  if (next >= list.length) return null;
  return next + span(next);
}

/**
 * Sections cannot nest inside tabs, columns or other sections, so dropping one
 * there unpacks it: its blocks move in at `index`, led by `heading` (the
 * section title) when given, and the emptied section is removed.
 */
export function unpackSectionTo(
  blocks: Block[],
  sectionId: string,
  parent: DropParent,
  index: number,
  heading: Block | null = null
): DropResult {
  const location = findBlockLocation(blocks, sectionId);
  const section = findBlockById(blocks, sectionId);
  if (!location || section?.block_type !== 'section') return { ok: false, message: 'Section not found.' };
  if (isLinkedSection(section)) {
    return { ok: false, message: 'Detach this linked section before moving its blocks.' };
  }
  const linked = linkedSectionWriteError(blocks, parent);
  if (linked) return { ok: false, message: linked };
  const moving = [...(heading ? [heading] : []), ...(section.content.blocks as Block[])];
  for (const child of moving) {
    const reason = placeReason(blocks, parent, child);
    if (reason === SIDE_PATH_PLACE) return { ok: false, message: reason };
    if (reason) {
      const label = child.block_type.replace(/_/g, ' ');
      return { ok: false, message: `This section holds a ${label} block, which cannot go in a ${parent.kind}.` };
    }
  }

  const destIndex =
    sameParent(location.parent, parent) && location.index < index ? index - 1 : index;
  const without = deleteBlocksById(blocks, [sectionId]);
  const next = updateListAtParent(without, parent, (list) => {
    const at = Math.max(0, Math.min(destIndex, list.length));
    const copy = [...list];
    copy.splice(at, 0, ...moving);
    return copy;
  });
  if (!next) return { ok: false, message: 'Parent not found.' };
  return { ok: true, blocks: next };
}

export function reorderSiblings(
  blocks: Block[],
  parent: DropParent,
  orderedIds: string[]
): DropResult {
  const linked = linkedSectionWriteError(blocks, parent);
  if (linked) return { ok: false, message: linked };
  let message: string | null = null;
  const next = updateListAtParent(blocks, parent, (list) => {
    if (orderedIds.length !== list.length) {
      message = 'Ordered ids must match the sibling list.';
      return list;
    }
    const byId = new Map(list.map((block) => [block.id, block]));
    if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !byId.has(id))) {
      message = 'Ordered ids must be a permutation of the sibling list.';
      return list;
    }
    return orderedIds.map((id) => byId.get(id)!);
  });
  if (!next) return { ok: false, message: 'Parent not found.' };
  if (message) return { ok: false, message };
  return { ok: true, blocks: next };
}

export function countBlocksInTree(blocks: Block[]): number {
  let count = 0;
  function walk(list: Block[]): void {
    for (const block of list) {
      count += 1;
      if (block.block_type === 'section') {
        walk(block.content.blocks as Block[]);
      } else if (block.block_type === 'columns') {
        for (const col of block.content.columns) walk(col.blocks as Block[]);
      } else if (block.block_type === 'tabs') {
        for (const tab of block.content.tabs) walk(tab.blocks as Block[]);
      }
    }
  }
  walk(blocks);
  return count;
}

export function nextBlockIdFactory(prefix: string, blocks: Block[]): () => string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}_(\\d+)$`);
  let max = 0;
  function walk(list: Block[]): void {
    for (const block of list) {
      const match = re.exec(block.id);
      if (match) max = Math.max(max, Number(match[1]));
      if (block.block_type === 'section') walk(block.content.blocks as Block[]);
      else if (block.block_type === 'columns') {
        for (const col of block.content.columns) walk(col.blocks as Block[]);
      } else if (block.block_type === 'tabs') {
        for (const tab of block.content.tabs) walk(tab.blocks as Block[]);
      }
    }
  }
  walk(blocks);
  let counter = max;
  return () => {
    counter += 1;
    return `${prefix}_${counter}`;
  };
}
