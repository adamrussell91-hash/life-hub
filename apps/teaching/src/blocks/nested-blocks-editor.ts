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
        const move = document.createElement('select');
        move.className = 'block-editor__nested-move-column';
        move.setAttribute('aria-label', 'Move to column');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Move to column…';
        move.append(placeholder);
        for (let i = 0; i < columnMove.columnCount; i += 1) {
          if (i === columnMove.columnIndex) continue;
          const opt = document.createElement('option');
          opt.value = String(i);
          opt.textContent = `Column ${i + 1}`;
          move.append(opt);
        }
        move.addEventListener('change', () => {
          if (move.value === '') return;
          const to = Number.parseInt(move.value, 10);
          move.value = '';
          if (!Number.isFinite(to)) return;
          columnMove.onMoveToColumn(to, index);
        });
        controls.append(move);

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

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Add nested block type');
    for (const group of BLOCK_GROUPS) {
      const baseTypes = group.types.filter((t) => options.allowedTypes.includes(t));
      const menuTypes = expandGroupTypesForMenu(baseTypes);
      if (menuTypes.length === 0) continue;
      const og = document.createElement('optgroup');
      og.label = group.label;
      for (const type of menuTypes) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = INSERT_MENU_LABEL[type];
        og.append(opt);
      }
      select.append(og);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn--ghost block-editor__nested-add';
    addBtn.textContent = 'Add block';
    addBtn.addEventListener('click', () => {
      emit([...blocks, createFromInsertMenu(select.value, nextId())]);
    });

    addRow.append(select, addBtn);
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
