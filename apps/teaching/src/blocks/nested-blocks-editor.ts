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
  const nextId = () => {
    counter += 1;
    return options.idFactory() + `_n${counter}`;
  };
  const columnMove = options.columnMove;

  const list = createHubList<Block>({
    items: options.blocks,
    variant: 'blocks',
    noun: 'block',
    label: options.label ?? 'Blocks',
    getKey: (block) => block.id,
    itemLabel: (block) => createBlockTypeLabel(block),
    describe: (block) => blockTypeLabel(block),
    insertBetween: true,
    read: options.read,
    pick: (anchor, done) =>
      openBlockPicker(anchor, options.allowedTypes, (value) => done(createFromInsertMenu(value, nextId()))),
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
            allowed: options.allowedTypes,
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
      return options.allowedTypes.includes(parsed.type as NewBlockType)
        ? (parsed.type as NewBlockType)
        : null;
    } catch {
      return null;
    }
  }

  // Blocks dragged in from the page palette land at the end of this list.
  root.addEventListener('dragover', (event) => {
    if (!carriesPalette(event)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  root.addEventListener('drop', (event) => {
    const type = paletteType(event);
    if (!type) return;
    event.preventDefault();
    event.stopPropagation();
    list.insert(list.items.length, createFromInsertMenu(type, nextId()));
  });

  return root;
}
