import { createBlockEditor } from '@/blocks/editors';
import {
  BLOCK_GROUPS,
  INSERT_MENU_LABEL,
  createFromInsertMenu,
  cloneBlockWithNewIds,
  expandGroupTypesForMenu,
  type NewBlockType
} from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import { createEditorFilter, type HubFilterControl } from '@/views/hub-kit';

export interface NestedBlocksEditorOptions {
  blocks: Block[];
  allowedTypes: readonly NewBlockType[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
  columnMove?: {
    columnCount: number;
    columnIndex: number;
    onMoveToColumn: (toColumnIndex: number, fromIndex: number) => void;
  };
}

export function createNestedBlocksEditor(options: NestedBlocksEditorOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-editor__nested-list';

  let blocks = [...options.blocks];
  let counter = 0;

  const nextId = () => {
    counter += 1;
    return options.idFactory() + `_n${counter}`;
  };

  function emit(next: Block[]): void {
    blocks = next;
    options.onChange(next);
    render();
  }

  function render(): void {
    root.replaceChildren();

    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__nested-row';
      row.dataset.blockId = block.id;

      const controls = document.createElement('div');
      controls.className = 'block-editor__nested-controls';

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost';
      up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...blocks];
        const tmp = next[index - 1]!;
        next[index - 1] = next[index]!;
        next[index] = tmp;
        emit(next);
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost';
      down.textContent = '↓';
      down.disabled = index === blocks.length - 1;
      down.addEventListener('click', () => {
        if (index >= blocks.length - 1) return;
        const next = [...blocks];
        const tmp = next[index + 1]!;
        next[index + 1] = next[index]!;
        next[index] = tmp;
        emit(next);
      });

      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'btn btn--ghost';
      dup.textContent = 'Duplicate';
      dup.addEventListener('click', () => {
        const clone = cloneBlockWithNewIds(blocks[index]!, nextId);
        const next = [...blocks];
        next.splice(index + 1, 0, clone);
        emit(next);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        emit(blocks.filter((_, i) => i !== index));
      });

      controls.append(up, down, dup, del);

      const columnMove = options.columnMove;
      if (columnMove && columnMove.columnCount > 1) {
        let move: HubFilterControl;
        move = createEditorFilter({
          key: 'Move',
          value: '',
          defaultValue: '',
          options: [
            { value: '', label: 'Move to column…' },
            ...Array.from({ length: columnMove.columnCount }, (_, i) => i)
              .filter((i) => i !== columnMove.columnIndex)
              .map((i) => ({ value: String(i), label: `Column ${i + 1}` }))
          ],
          className: 'block-editor__nested-move-column',
          ariaLabel: 'Move to column',
          onChange: (value) => {
            if (!value) return;
            const to = Number.parseInt(value, 10);
            move.setValue('');
            if (!Number.isFinite(to)) return;
            columnMove.onMoveToColumn(to, index);
          }
        });
        controls.append(move.el);

        row.draggable = true;
        row.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData(
            'application/x-th-col-move',
            `${columnMove.columnIndex}:${index}`
          );
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
      }

      const editor = createBlockEditor(
        block,
        (updated) => {
          const next = [...blocks];
          next[index] = updated;
          blocks = next;
          options.onChange(next);
        },
        () => blocks[index]!
      );

      row.append(controls, editor);
      root.append(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'block-editor__nested-add-row';

    const addTypeOptions = BLOCK_GROUPS.flatMap((group) => {
      const baseTypes = group.types.filter((t) => options.allowedTypes.includes(t));
      return expandGroupTypesForMenu(baseTypes).map((type) => ({
        value: type,
        label: INSERT_MENU_LABEL[type]
      }));
    });
    const addType = createEditorFilter({
      key: 'Add',
      value: addTypeOptions[0]?.value ?? 'rich_text',
      options: addTypeOptions,
      className: 'block-editor__add-nested-type',
      ariaLabel: 'Add nested block type',
      onChange: () => undefined
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn--ghost block-editor__nested-add';
    addBtn.textContent = 'Add block';
    addBtn.addEventListener('click', () => {
      emit([...blocks, createFromInsertMenu(addType.getValue(), nextId())]);
    });

    addRow.append(addType.el, addBtn);
    root.append(addRow);
  }

  render();

  const PALETTE_MIME = 'application/x-teaching-hub-block';

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
    emit([...blocks, createFromInsertMenu(type, nextId())]);
  });

  return root;
}
