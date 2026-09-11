import {
  COLUMN_PRESETS,
  remapColumnsPreset,
  type ColumnPreset,
  type ColumnSlot
} from '@/blocks/column-presets';
import { moveBlockBetweenColumns } from '@/blocks/column-move';
import { trySetColumnWidths } from '@/blocks/column-widths';
import {
  COLUMN_CHILD_TYPES,
  SECTION_CHILD_TYPES,
  TAB_CHILD_TYPES
} from '@/blocks/create-block';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';
import type { Block } from '@/schemas/block';
import { createEditorFilter } from '@/views/hub-kit';

type TabsBlock = Extract<Block, { block_type: 'tabs' }>;
type TabPanel = TabsBlock['content']['tabs'][number];
type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;

export function createSpacerEditor(
  block: Extract<Block, { block_type: 'spacer' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'spacer' }>>,
  getLatest: () => Extract<Block, { block_type: 'spacer' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const select = createEditorFilter({
    key: 'Size',
    value: block.content.size,
    options: (['small', 'medium', 'large'] as const).map((size) => ({
      value: size,
      label: size[0]!.toUpperCase() + size.slice(1)
    })),
    className: 'block-editor__spacer-size',
    ariaLabel: 'Spacer size',
    onChange: (value) => {
      onChange({
        ...getLatest(),
        content: { size: value as 'small' | 'medium' | 'large' }
      });
    }
  });

  const preview = document.createElement('div');
  preview.className = `block-spacer block-spacer--${block.content.size}`;
  preview.setAttribute('aria-hidden', 'true');

  fields.append(select.el, preview);
  return editorShell(block, onChange, fields, getLatest);
}

export function createSectionEditor(
  block: Extract<Block, { block_type: 'section' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'section' }>>,
  getLatest: () => Extract<Block, { block_type: 'section' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__section-title';
  title.value = block.content.title;
  title.placeholder = 'Section title';
  title.setAttribute('aria-label', 'Section title');
  title.addEventListener('input', () => {
    onChange({
      ...getLatest(),
      content: { ...getLatest().content, title: title.value }
    });
  });

  const collapse = document.createElement('label');
  const collapseInput = document.createElement('input');
  collapseInput.type = 'checkbox';
  collapseInput.checked = Boolean(block.content.collapsed_in_editor);
  collapseInput.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      content: {
        ...getLatest().content,
        collapsed_in_editor: collapseInput.checked
      }
    });
    children.hidden = collapseInput.checked;
  });
  collapse.append(collapseInput, document.createTextNode(' Collapse in editor'));

  const children = createNestedBlocksEditor({
    blocks: block.content.blocks,
    allowedTypes: SECTION_CHILD_TYPES,
    idFactory: () => `${getLatest().id}_child`,
    onChange: (nextBlocks) => {
      onChange({
        ...getLatest(),
        content: {
          ...getLatest().content,
          blocks: nextBlocks as Extract<Block, { block_type: 'section' }>['content']['blocks']
        }
      });
    }
  });
  children.classList.add('block-editor__section-children');
  children.hidden = Boolean(block.content.collapsed_in_editor);

  fields.append(title, collapse, children);
  return editorShell(block, onChange, fields, getLatest);
}

export function createColumnsEditor(
  block: Extract<Block, { block_type: 'columns' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'columns' }>>,
  getLatest: () => Extract<Block, { block_type: 'columns' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__columns';

  const preset = createEditorFilter({
    key: 'Layout',
    value: block.content.preset,
    options: [...COLUMN_PRESETS, 'custom'].map((value) => ({
      value,
      label: value === 'custom' ? 'Custom' : value
    })),
    className: 'block-editor__columns-preset',
    ariaLabel: 'Column layout',
    onChange: () => {
      const current = getLatest();
      const nextPreset = preset.getValue() as ColumnsBlock['content']['preset'];
      if (nextPreset === 'custom') {
        onChange({
          ...current,
          content: {
            preset: 'custom',
            columns: current.content.columns
          }
        });
      } else {
        onChange({
          ...current,
          content: {
            preset: nextPreset,
            columns: remapColumnsPreset(
              current.content.columns,
              nextPreset as ColumnPreset
            ) as Extract<Block, { block_type: 'columns' }>['content']['columns']
          }
        });
      }
      rebuildPanes();
    }
  });

  const widthsRow = document.createElement('div');
  widthsRow.className = 'block-editor__columns-widths';

  const widthsHint = document.createElement('p');
  widthsHint.className = 'block-editor__hint block-editor__columns-widths-hint';

  const panes = document.createElement('div');
  panes.className = 'block-editor__column-panes';

  function applyMove(fromCol: number, fromIndex: number, toCol: number): void {
    const latest = getLatest();
    const moved = moveBlockBetweenColumns(
      latest.content.columns as ColumnSlot[],
      fromCol,
      fromIndex,
      toCol
    );
    onChange({
      ...latest,
      content: {
        ...latest.content,
        columns: moved as typeof latest.content.columns
      }
    });
    rebuildPanes();
  }

  function rebuildPanes(): void {
    const current = getLatest();
    widthsRow.replaceChildren();
    widthsHint.textContent = '';

    if (current.content.preset === 'custom') {
      current.content.columns.forEach((col, colIndex) => {
        const label = document.createElement('label');
        label.className = 'block-editor__columns-width-label';
        label.textContent = `Col ${colIndex + 1}`;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '11';
        input.className = 'block-editor__columns-width';
        input.value = String(col.width);
        input.setAttribute('aria-label', `Column ${colIndex + 1} width`);
        input.addEventListener('change', () => {
          const latest = getLatest();
          const inputs = [
            ...widthsRow.querySelectorAll('input.block-editor__columns-width')
          ] as HTMLInputElement[];
          const widths = inputs.map((el) => Number.parseInt(el.value, 10));
          const nextCols = trySetColumnWidths(latest.content.columns as ColumnSlot[], widths);
          if (!nextCols) {
            widthsHint.textContent = 'Widths must sum to 12';
            return;
          }
          widthsHint.textContent = '';
          onChange({
            ...latest,
            content: {
              preset: 'custom',
              columns: nextCols as typeof latest.content.columns
            }
          });
          rebuildPanes();
        });
        label.append(input);
        widthsRow.append(label);
      });
    }

    panes.replaceChildren();
    panes.style.gridTemplateColumns = current.content.columns
      .map((col) => `${col.width}fr`)
      .join(' ');

    current.content.columns.forEach((col, colIndex) => {
      const pane = document.createElement('div');
      pane.className = 'block-editor__column-pane';
      const label = document.createElement('p');
      label.className = 'block-editor__hint';
      label.textContent = `Column ${colIndex + 1} (${col.width}/12)`;

      pane.addEventListener('dragover', (event) => {
        event.preventDefault();
        pane.classList.add('block-editor__column-pane--drop');
      });
      pane.addEventListener('dragleave', () => {
        pane.classList.remove('block-editor__column-pane--drop');
      });
      pane.addEventListener('drop', (event) => {
        event.preventDefault();
        pane.classList.remove('block-editor__column-pane--drop');
        const raw = event.dataTransfer?.getData('application/x-th-col-move');
        if (!raw) return;
        const [fromColS, fromIndexS] = raw.split(':');
        const fromCol = Number.parseInt(fromColS ?? '', 10);
        const fromIndex = Number.parseInt(fromIndexS ?? '', 10);
        if (!Number.isFinite(fromCol) || !Number.isFinite(fromIndex)) return;
        applyMove(fromCol, fromIndex, colIndex);
      });

      const nested = createNestedBlocksEditor({
        blocks: col.blocks,
        allowedTypes: COLUMN_CHILD_TYPES,
        idFactory: () => `${getLatest().id}_c${colIndex}`,
        onChange: (nextBlocks) => {
          const latest = getLatest();
          const columns = latest.content.columns.map((c, i) =>
            i === colIndex
              ? {
                  ...c,
                  blocks: nextBlocks as (typeof latest.content.columns)[number]['blocks']
                }
              : c
          );
          onChange({
            ...latest,
            content: { ...latest.content, columns }
          });
        },
        columnMove: {
          columnCount: current.content.columns.length,
          columnIndex: colIndex,
          onMoveToColumn: (toCol, fromIndex) => {
            applyMove(colIndex, fromIndex, toCol);
          }
        }
      });
      pane.append(label, nested);
      panes.append(pane);
    });
  }

  rebuildPanes();
  fields.append(preset.el, widthsRow, widthsHint, panes);
  return editorShell(block, onChange, fields, getLatest);
}

const preferredTabsPanel = new Map<string, number>();

export function rememberTabsPanel(blockId: string, index: number): void {
  preferredTabsPanel.set(blockId, index);
}

export function applyRememberedTabsPanel(root: ParentNode, blockId: string): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  if (buttons.length === 0) return;
  buttons[preferredPanelIndex(blockId, buttons.length)]?.click();
}

function preferredPanelIndex(blockId: string, tabCount: number): number {
  const stored = preferredTabsPanel.get(blockId) ?? 0;
  const next = Math.max(0, Math.min(stored, tabCount - 1));
  preferredTabsPanel.set(blockId, next);
  return next;
}

export function createTabsEditor(
  block: TabsBlock,
  onChange: BlockChangeHandler<TabsBlock>,
  getLatest: () => TabsBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__tabs';

  const chrome = document.createElement('div');
  chrome.className = 'block-tabs';

  const tablist = document.createElement('div');
  tablist.className = 'block-tabs__tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Content tabs');

  const pane = document.createElement('div');
  pane.className = 'block-tabs__panel block-editor__tabs-panel';
  pane.setAttribute('role', 'tabpanel');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--ghost block-editor__tabs-add';
  addBtn.textContent = 'Add tab';

  function emitTabs(tabs: TabPanel[]): void {
    onChange({
      ...getLatest(),
      content: { tabs }
    });
    rebuild();
  }

  function patchTab(index: number, patch: (tab: TabPanel) => TabPanel): void {
    const latest = getLatest();
    onChange({
      ...latest,
      content: {
        tabs: latest.content.tabs.map((tab, i) => (i === index ? patch(tab) : tab))
      }
    });
  }

  function selectPanel(index: number): void {
    rememberTabsPanel(getLatest().id, index);
    rebuild();
  }

  function swapSelected(delta: number): void {
    const latest = getLatest();
    const selected = preferredPanelIndex(latest.id, latest.content.tabs.length);
    const next = selected + delta;
    if (next < 0 || next >= latest.content.tabs.length) return;
    const tabs = [...latest.content.tabs];
    const swap = tabs[next]!;
    tabs[next] = tabs[selected]!;
    tabs[selected] = swap;
    rememberTabsPanel(latest.id, next);
    emitTabs(tabs);
  }

  function rebuild(): void {
    const current = getLatest();
    const selected = preferredPanelIndex(current.id, current.content.tabs.length);
    const panel = current.content.tabs[selected];
    if (!panel) return;

    addBtn.disabled = current.content.tabs.length >= 8;
    tablist.replaceChildren();
    pane.replaceChildren();
    pane.id = `${current.id}-editor-panel-${panel.id}`;
    pane.setAttribute('aria-labelledby', `${current.id}-editor-tab-${panel.id}`);

    current.content.tabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block-tabs__tab';
      btn.setAttribute('role', 'tab');
      btn.id = `${current.id}-editor-tab-${tab.id}`;
      btn.setAttribute('aria-controls', `${current.id}-editor-panel-${tab.id}`);
      btn.setAttribute('aria-selected', index === selected ? 'true' : 'false');
      btn.tabIndex = index === selected ? 0 : -1;
      btn.classList.toggle('block-tabs__tab--active', index === selected);
      btn.textContent = tab.label || `Tab ${index + 1}`;
      btn.addEventListener('click', () => selectPanel(index));
      tablist.append(btn);
    });

    const header = document.createElement('div');
    header.className = 'block-editor__tabs-panel-header';

    const label = document.createElement('input');
    label.type = 'text';
    label.className = 'block-editor__tab-label';
    label.value = panel.label;
    label.placeholder = `Tab ${selected + 1} label`;
    label.setAttribute('aria-label', `Tab ${selected + 1} label`);
    label.addEventListener('input', () => {
      patchTab(selected, (tab) => ({ ...tab, label: label.value }));
      const activeTab = tablist.querySelector<HTMLElement>('[aria-selected="true"]');
      if (activeTab) activeTab.textContent = label.value || `Tab ${selected + 1}`;
    });

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn btn--ghost';
    up.textContent = '↑';
    up.disabled = selected === 0;
    up.addEventListener('click', () => swapSelected(-1));

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'btn btn--ghost';
    down.textContent = '↓';
    down.disabled = selected === current.content.tabs.length - 1;
    down.addEventListener('click', () => swapSelected(1));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost block-editor__tabs-remove';
    remove.textContent = 'Remove tab';
    remove.disabled = current.content.tabs.length <= 2;
    remove.addEventListener('click', () => {
      const latest = getLatest();
      if (latest.content.tabs.length <= 2) return;
      rememberTabsPanel(latest.id, Math.max(0, selected - 1));
      emitTabs(latest.content.tabs.filter((_, i) => i !== selected));
    });

    header.append(label, up, down, remove);

    const nested = createNestedBlocksEditor({
      blocks: panel.blocks,
      allowedTypes: TAB_CHILD_TYPES,
      idFactory: () => `${getLatest().id}_t${selected}`,
      onChange: (nextBlocks) => {
        patchTab(selected, (tab) => ({
          ...tab,
          blocks: nextBlocks as TabPanel['blocks']
        }));
      }
    });

    pane.append(header, nested);
  }

  tablist.addEventListener('keydown', (event) => {
    const tabs = getLatest().content.tabs;
    if (tabs.length === 0) return;
    const selected = preferredPanelIndex(getLatest().id, tabs.length);
    let next = selected;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (selected + 1) % tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (selected - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectPanel(next);
    tablist.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  });

  addBtn.addEventListener('click', () => {
    const latest = getLatest();
    if (latest.content.tabs.length >= 8) return;
    const n = latest.content.tabs.length + 1;
    rememberTabsPanel(latest.id, latest.content.tabs.length);
    emitTabs([
      ...latest.content.tabs,
      { id: `${latest.id}_t${n}_${Date.now()}`, label: '', blocks: [] }
    ]);
  });

  rebuild();
  chrome.append(tablist, pane);
  fields.append(chrome, addBtn);
  return editorShell(block, onChange, fields, getLatest);
}
