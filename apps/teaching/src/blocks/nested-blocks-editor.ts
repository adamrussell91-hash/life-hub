import { createBlockEditor, type BlockEditorContext } from '@/blocks/editors';
import {
  createFromInsertMenu,
  cloneBlockWithNewIds,
  type NewBlockType
} from '@/blocks/create-block';
import {
  blockTypeLabel,
  createBlockTypeLabel,
  createEmptyBlocksPrompt,
  openBlockPicker
} from '@/blocks/block-meta';
import type { Block } from '@/schemas/block';
import { findBlockById } from '@/blocks/find-block';
import {
  moveBlockTo,
  sectionDropUnpacks,
  unpackSectionTo,
  type DropParent
} from '@/teacher/lesson-canvas/drop';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
import { HUB_LIST_ICONS, createHubList } from '../../design-kit/js/hub-list.js';

const PALETTE_MIME = 'application/x-teaching-hub-block';

export interface NestedBlocksEditorOptions {
  blocks: Block[];
  allowedTypes: readonly NewBlockType[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
  /** Passed to every child editor so nested image/library pickers see the same media. */
  context?: BlockEditorContext;
  /** Accessible name for the list, e.g. "Blocks in Learn". */
  label?: string;
  /** Empty container prompt; omit for a plain "Add block" row. */
  empty?: { title: string; detail: string };
  /** Fresh blocks for Undo after the parent rebuilt this list. */
  read?: () => readonly Block[];
  /**
   * Where this list sits in the lesson tree. With it, blocks dragged by their
   * grip from the page or another container move in, and this list's own
   * blocks can be dragged out. Needs `context.getLessonBlocks` / `setLessonBlocks`.
   */
  moveParent?: () => DropParent | null;
  columnMove?: {
    columnCount: number;
    columnIndex: number;
    /** Lists sharing a group accept each other's drags. */
    group: string;
    onMoveToColumn: (toColumnIndex: number, fromIndex: number) => void;
    onReceive: (fromColumnIndex: number, fromIndex: number, toIndex: number) => void;
  };
}

export function createNestedBlocksEditor(options: NestedBlocksEditorOptions): HTMLElement {
  let counter = 0;
  // The editor is rebuilt when a tab is switched or a section is reopened.
  // Its local counter must not reuse IDs already present in the saved list.
  const reservedIds = new Set(options.blocks.map((block) => block.id));
  const nextId = () => {
    for (const block of options.read?.() ?? []) reservedIds.add(block.id);
    let id: string;
    do {
      counter += 1;
      id = options.idFactory() + `_n${counter}`;
    } while (reservedIds.has(id));
    reservedIds.add(id);
    return id;
  };
  // Older records may already contain collisions. Give each editor its own
  // identity before mounting; the next user edit persists the repaired list.
  const seenIds = new Set<string>();
  const blocks = options.blocks.map((block) => {
    const next = seenIds.has(block.id) ? { ...block, id: nextId() } : block;
    seenIds.add(next.id);
    return next;
  });
  const columnMove = options.columnMove;
  // A layout only offers what its page offers (no unit map in a lesson, no live activities on a homepage).
  const pageTypes = options.context?.pageTypes;
  const allowedTypes = pageTypes ? options.allowedTypes.filter((t) => pageTypes.has(t)) : options.allowedTypes;

  const list = createHubList<Block>({
    items: blocks,
    variant: 'blocks',
    noun: 'block',
    label: options.label ?? 'Blocks',
    getKey: (block) => block.id,
    itemLabel: (block) => createBlockTypeLabel(block),
    describe: (block) => blockTypeLabel(block),
    insertBetween: true,
    read: options.read,
    pick: (anchor, done) =>
      openBlockPicker(anchor, allowedTypes, (value) => done(createFromInsertMenu(value, nextId()))),
    duplicate: (block) => cloneBlockWithNewIds(block, nextId),
    onChange: (next) => options.onChange(next),
    renderItem: (block, ctx) =>
      createBlockEditor(block, (updated) => ctx.update(updated), () => ctx.current, options.context),
    group: columnMove?.group,
    dragData: (_block, index) => ({ col: columnMove?.columnIndex ?? 0, index }),
    onTransfer: columnMove
      ? (source, toIndex) => {
          const from = source.data as { col: number; index: number };
          columnMove.onReceive(from.col, from.index, toIndex);
        }
      : undefined,
    extraMenuItems:
      columnMove && columnMove.columnCount > 1
        ? (_block, index) =>
            Array.from({ length: columnMove.columnCount }, (_, i) => i)
              .filter((i) => i !== columnMove.columnIndex)
              .map((i) => ({
                label: `Move to column ${i + 1}`,
                icon: HUB_LIST_ICONS.columns,
                dataset: { listAction: `column-${i}` },
                onSelect: () => columnMove.onMoveToColumn(i, index)
              }))
        : undefined,
    empty: options.empty
      ? (insert, pick) =>
          createEmptyBlocksPrompt({
            ...options.empty!,
            allowed: allowedTypes,
            idFactory: nextId,
            insert,
            pick
          })
      : undefined
  });

  const root = list.el;
  root.classList.add('block-editor__nested-list');

  function carriesPalette(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(PALETTE_MIME);
  }

  function paletteType(event: DragEvent): NewBlockType | null {
    const raw = event.dataTransfer?.getData(PALETTE_MIME) ?? '';
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { kind?: unknown; type?: unknown };
      if (parsed.kind !== 'block' || typeof parsed.type !== 'string') return null;
      return allowedTypes.includes(parsed.type as NewBlockType)
        ? (parsed.type as NewBlockType)
        : null;
    } catch {
      return null;
    }
  }

  const canMoveAcross = () =>
    Boolean(options.moveParent && options.context?.getLessonBlocks && options.context.setLessonBlocks);

  function movingBlockId(event: DragEvent): string | null {
    const raw = event.dataTransfer?.getData(PALETTE_MIME) ?? '';
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { kind?: unknown; block_id?: unknown };
      return parsed.kind === 'move' && typeof parsed.block_id === 'string' ? parsed.block_id : null;
    } catch {
      return null;
    }
  }

  /** Index among this list's own rows (not rows of lists nested inside them). */
  function dropIndexFor(event: DragEvent): number {
    const rows = Array.from(root.children).filter((el) => el.classList.contains('hub-list__row'));
    const y = event.clientY;
    if (typeof y !== 'number') return rows.length;
    const at = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return rect.height > 0 && y < rect.top + rect.height / 2;
    });
    return at < 0 ? rows.length : at;
  }

  function sectionHeading(section: Block): Block | null {
    if (section.block_type !== 'section' || !section.content.title.trim()) return null;
    const heading = createFromInsertMenu('heading', nextId());
    return {
      ...heading,
      visibility: section.visibility,
      content: { text: section.content.title }
    } as Block;
  }

  function moveInto(blockId: string, index: number): void {
    const parent = options.moveParent?.();
    const lesson = options.context?.getLessonBlocks?.();
    if (!parent || !lesson) return;
    const moving = findBlockById(lesson, blockId);
    // A section cannot sit in a tab or column, so its blocks move in instead.
    // A lecture side path moves into a chapter whole.
    const result = moving && sectionDropUnpacks(lesson, blockId, parent)
      ? unpackSectionTo(lesson, blockId, parent, index, sectionHeading(moving))
      : moveBlockTo(lesson, blockId, parent, index);
    if (!result.ok) {
      showHubToast(result.message, { tone: 'danger' });
      return;
    }
    options.context?.setLessonBlocks?.(result.blocks);
  }

  // Dragging one of this list's blocks also advertises it as a lesson move, so
  // the page and other containers can take it. Capture phase: the list's own
  // grip handler stops propagation, and its reorder drops still win inside it.
  root.addEventListener(
    'dragstart',
    (event) => {
      if (!canMoveAcross()) return;
      const grip = (event.target as Element | null)?.closest?.('.hub-list__grip');
      const row = grip?.closest('.hub-list__row') as HTMLElement | null;
      if (!grip || !row || row.parentElement !== root || !row.dataset.key) return;
      event.dataTransfer?.setData(PALETTE_MIME, JSON.stringify({ kind: 'move', block_id: row.dataset.key }));
    },
    true
  );

  // Palette blocks land at the end of this list; moved blocks land where dropped.
  root.addEventListener('dragover', (event) => {
    if (!carriesPalette(event)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  root.addEventListener('drop', (event) => {
    const moving = canMoveAcross() ? movingBlockId(event) : null;
    if (moving) {
      event.preventDefault();
      event.stopPropagation();
      moveInto(moving, dropIndexFor(event));
      return;
    }
    const type = paletteType(event);
    if (!type) return;
    event.preventDefault();
    event.stopPropagation();
    list.insert(list.items.length, createFromInsertMenu(type, nextId()));
  });

  return root;
}
