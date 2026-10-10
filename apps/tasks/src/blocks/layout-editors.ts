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
  TAB_CHILD_TYPES,
  cloneBlockWithNewIds
} from '@/blocks/create-block';
import { editorShell, type BlockChangeHandler, type BlockEditorContext } from '@/blocks/editors';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';
import { createHubTabStrip } from '../../design-kit/js/hub-list.js';
import type { Block } from '@/schemas/block';
import { createEditorFilter } from '@/views/hub-kit';

type TabsBlock = Extract<Block, { block_type: 'tabs' }>;
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
  getLatest: () => Extract<Block, { block_type: 'section' }> = () => block,
  context: BlockEditorContext = {}
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
    context,
    label: 'Blocks in this section',
    empty: { title: 'This section is empty', detail: ' Add the first block to it.' },
    read: () => getLatest().content.blocks,
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
  getLatest: () => Extract<Block, { block_type: 'columns' }> = () => block,
  context: BlockEditorContext = {}
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

  const group = `columns-${block.id}-${Math.random().toString(36).slice(2, 8)}`;

  function applyMove(fromCol: number, fromIndex: number, toCol: number, toIndex?: number): void {
    const latest = getLatest();
    const moved = moveBlockBetweenColumns(
      latest.content.columns as ColumnSlot[],
      fromCol,
      fromIndex,
      toCol,
      toIndex
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
      label.className = 'block-editor__column-pane-label';
      label.textContent = `Column ${colIndex + 1} · ${col.width}/12`;

      const nested = createNestedBlocksEditor({
        blocks: col.blocks,
        allowedTypes: COLUMN_CHILD_TYPES,
        context,
        label: `Blocks in column ${colIndex + 1}`,
        read: () => getLatest().content.columns[colIndex]?.blocks ?? [],
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
          group,
          onMoveToColumn: (toCol, fromIndex) => {
            applyMove(colIndex, fromIndex, toCol);
          },
          onReceive: (fromCol, fromIndex, toIndex) => {
            applyMove(fromCol, fromIndex, colIndex, toIndex);
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

const TABS_MIN = 2;
const TABS_MAX = 8;

/**
 * Tabs are edited as the strip students see: rename on the tab, drag sideways,
 * ··· to move / duplicate / hold-to-delete, + to add. One panel shows at a time.
 * The open tab is remembered so the preview and the editor stay on the same one.
 */
export function createTabsEditor(
  block: TabsBlock,
  onChange: BlockChangeHandler<TabsBlock>,
  getLatest: () => TabsBlock = () => block,
  context: BlockEditorContext = {}
): HTMLElement {
  type Tab = TabsBlock['content']['tabs'][number];
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__tabs';
  let seq = 0;

  function emitTabs(tabs: Tab[]): void {
    onChange({ ...getLatest(), content: { tabs } });
  }

  function patchTab(tabId: string, blocks: Block[]): void {
    const latest = getLatest();
    emitTabs(
      latest.content.tabs.map((t) =>
        t.id === tabId ? { ...t, blocks: blocks as Tab['blocks'] } : t
      )
    );
  }

  const strip = createHubTabStrip<Tab>({
    tabs: block.content.tabs,
    active: preferredPanelIndex(block.id, block.content.tabs.length),
    onActiveChange: (index) => rememberTabsPanel(getLatest().id, index),
    label: 'Tabs',
    min: TABS_MIN,
    max: TABS_MAX,
    minReason: 'A tabs block needs at least two tabs. Delete the whole block from its ··· menu instead.',
    maxReason: 'A tabs block holds up to eight tabs.',
    read: () => getLatest().content.tabs,
    onChange: emitTabs,
    getLabel: (tab) => tab.label,
    setLabel: (tab, label) => ({ ...tab, label }),
    countChildren: (tab) => tab.blocks.length,
    create: (index) => ({
      id: `${getLatest().id}_t${index + 1}_${Date.now().toString(36)}${(seq += 1)}`,
      label: '',
      blocks: []
    }),
    duplicate: (tab) => {
      const id = `${getLatest().id}_t${Date.now().toString(36)}${(seq += 1)}`;
      let n = 0;
      return {
        id,
        label: tab.label ? `${tab.label} copy` : '',
        blocks: tab.blocks.map((child) =>
          cloneBlockWithNewIds(child, () => `${id}_n${(n += 1)}`)
        ) as Tab['blocks']
      };
    },
    renderPanel: (tab) =>
      createNestedBlocksEditor({
        blocks: tab.blocks,
        allowedTypes: TAB_CHILD_TYPES,
        context,
        label: `Blocks in ${tab.label || 'this tab'}`,
        empty: {
          title: `${tab.label ? `“${tab.label}”` : 'This tab'} is empty`,
          detail: ' Add the first block. Students won’t see an empty tab.'
        },
        read: () => getLatest().content.tabs.find((t) => t.id === tab.id)?.blocks ?? [],
        idFactory: () => `${tab.id}_b`,
        onChange: (next) => patchTab(tab.id, next)
      })
  });

  fields.append(strip.el);
  return editorShell(block, onChange, fields, getLatest);
}
