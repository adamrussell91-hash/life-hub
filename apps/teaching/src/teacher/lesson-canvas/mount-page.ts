import { refreshCalloutReferences } from '@/blocks/callout-reference';
import { isLinkedSection } from '@/blocks/composition-link';
import { offerTimedUndo } from '../../../design-kit/js/hub-feedback.js';
import {
  HUB_LIST_ICONS,
  createHubMenuButton
} from '../../../design-kit/js/hub-list.js';
import { blockTypeLabel, createBlockTypeLabel } from '@/blocks/block-meta';
import { applyRememberedTabsPanel, rememberTabsPanel } from '@/blocks/layout-editors';
import {
  createFromInsertMenu,
  cloneBlockWithNewIds,
  createBlock,
  type InsertMenuValue
} from '@/blocks/create-block';
import {
  createBlockEditor,
  createVisibilitySelect,
  type BlockEditorContext
} from '@/blocks/editors';
import { findBlockById } from '@/blocks/find-block';
import { createDiscernConfirmBlock, findDiscernConfirm, insertDiscernConfirm, removeDiscernConfirms } from '@/blocks/discern';
import { DISCERN_ATTACH_EVENT, DISCERN_DETACH_EVENT } from '@/blocks/discern-editor';
import { renderBlock } from '@/blocks/render';
import { mountLecturePanel, type LecturePanelHandle } from '@/lecture/teacher-panel';
import { insertAfter, prependToSection } from '@/lecture/tree';
import { mapBlockById, setBlockPulseOff } from '@/blocks/block-pulse';
import { createTeacherBlockPulse } from '@/teacher/block-pulse';
import { mountPulseSummary } from '@/teacher/pulse-summary';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import type { CurriculumOutcome } from '@/schemas/outcome';
import { mountOutcomeStrip, publicOutcomesForPage } from '@/outcomes/strip';
import { mountLineChips } from '@/network/line-chips';
import { mountLessonFlow, type FlowPeer } from '@/network/lesson-flow';
import { mountLessonDotPoints } from '@/alignment/lesson-dot-points';
import { revealBlockFromHash } from '@/app/block-hash';
import type { NetworkLine } from '@/schemas/block';
import {
  PEDAGOGICAL_MODES,
  PEDAGOGICAL_MODE_LABELS,
  pedagogicalModeLabel,
  resolvePedagogicalMode,
  type PedagogicalMode
} from '@/curriculum/pedagogical-mode';
import { renderEntityBanner, type EntityBannerHandle } from '@/teacher/entity-banner';
import { mountEntityPageTitle } from '@/teacher/entity-page-title';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import {
  deleteBlocksById,
  findBlockLocation,
  insertAt,
  insertTargetForSelection,
  moveBlockTo,
  moveByTarget,
  type DropRootMode
} from '@/teacher/lesson-canvas/drop';
import {
  draggable,
  dropTargetForElements
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { CleanupFn } from '@atlaskit/pragmatic-drag-and-drop/types';
import { isRootBlockDrag, rootBlockDrag } from '@/blocks/teaching-pragmatic-dnd';
import { createTeacherClassExamples } from '@/class-examples/teacher';
import { mountQuizPanel, type QuizPanelHandle } from '@/quiz/teacher-panel';
import { createLectureEditorTools } from '@/lecture/editor-tools';

const DND_MIME = 'application/x-teaching-hub-block';

export type MountBlockCanvasOptions = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
  media?: Media[];
  editorContext?: BlockEditorContext;
  renderPreview?: (block: Block) => HTMLElement;
  allowCollectionAtRoot?: boolean;
  heading?: string;
  onSelect?: (blockId: string | null) => void;
  onSaveComposition?: (blockId: string) => void;
  onEditSource?: (compositionId: string) => void;
  onDetachComposition?: (blockId: string) => void;
  onCompositionDrop?: (id: string) => void;
  renderLinkedPreview?: (compositionId: string) => HTMLElement;
  /** Adds per-block extras (class examples) after each editable row is built. */
  decorateRow?: (row: HTMLElement, block: Block) => void;
  /** Author canvases only. Student / published surfaces omit the ⋯ menu. */
  editable?: boolean;
  /**
   * Clicking a published block opens its editor. Tasks and Professional pages
   * (notes typed mid-meeting) want this; lessons wait for Edit in the ⋯ menu.
   */
  editOnClick?: boolean;
};

export type BlockCanvasHandle = {
  update(blocks: Block[], nextMedia?: Media[]): void;
  insertType(type: InsertMenuValue): void;
  revealPublishBlock(blockId: string, errorIds?: string[]): void;
  dispose(): void;
};

export type MountLessonPageOptions = {
  lesson: Lesson;
  media?: Media[];
  onChange: (lesson: Lesson) => void;
  onPrint: () => void;
  onSelect?: (blockId: string | null) => void;
  idFactory: () => string;
  onSaveTemplate?: () => void;
  onExport?: () => void;
  onTrash?: () => void;
  onSaveComposition?: (blockId: string) => void;
  onEditSource?: (compositionId: string) => void;
  onDetachComposition?: (blockId: string) => void;
  onCompositionDrop?: (id: string) => void;
  renderLinkedPreview?: (compositionId: string) => HTMLElement;
  outcomesCatalog?: CurriculumOutcome[];
  subject?: { id: string; outcome_ids: string[]; network_lines?: NetworkLine[] };
  /** The unit's lessons in order, for "Before and after" at the foot of the page. */
  flowPeers?: FlowPeer[];
  onFlowPeer?: (lessonId: string, after: string[]) => Promise<void>;
  /** Set when the subject is in the syllabus alignment: tag the dot points this lesson teaches. */
  dotPoints?: { unitTitle?: string; focusArea?: string };
  onToggleFullPage?: () => void;
  /**
   * Render the in-canvas page menu (Export, Print, Trash…). The lesson
   * editor passes false and carries those items in its single header menu,
   * so the page never shows two kebabs.
   */
  showPageMenu?: boolean;
};

export type LessonPageHandle = {
  update(lesson: Lesson, nextMedia?: Media[]): void;
  insertType(type: InsertMenuValue): void;
  revealPublishBlock(blockId: string, errorIds?: string[]): void;
  dispose(): void;
};

function removeBlockFromTree(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) => {
      if (block.block_type === 'section') {
        return { ...block, content: { ...block.content, blocks: removeBlockFromTree(block.content.blocks as Block[], id) } } as Block;
      }
      if (block.block_type === 'columns') {
        return {
          ...block,
          content: { ...block.content, columns: block.content.columns.map((c) => ({ ...c, blocks: removeBlockFromTree(c.blocks as Block[], id) })) }
        } as Block;
      }
      if (block.block_type === 'tabs') {
        return {
          ...block,
          content: { ...block.content, tabs: block.content.tabs.map((t) => ({ ...t, blocks: removeBlockFromTree(t.blocks as Block[], id) })) }
        } as Block;
      }
      return block;
    });
}

function replaceBlockInTree(blocks: Block[], updated: Block): Block[] {
  return blocks.map((block) => {
    if (block.id === updated.id) return updated;
    if (block.block_type === 'section') {
      return {
        ...block,
        content: { ...block.content, blocks: replaceBlockInTree(block.content.blocks as Block[], updated) }
      } as Block;
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: block.content.columns.map((col) => ({
            ...col,
            blocks: replaceBlockInTree(col.blocks as Block[], updated)
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
            blocks: replaceBlockInTree(tab.blocks as Block[], updated)
          }))
        }
      } as Block;
    }
    return block;
  });
}

type DropPayload =
  | { kind: 'block'; type: string }
  | { kind: 'composition'; id: string }
  | { kind: 'move'; blockId: string };

function readDropPayload(event: Event): DropPayload | null {
  const dt = (event as DragEvent).dataTransfer;
  const raw = dt?.getData(DND_MIME) ?? '';
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { kind?: unknown; type?: unknown; id?: unknown; block_id?: unknown };
    if (record.kind === 'composition' && typeof record.id === 'string') {
      return { kind: 'composition', id: record.id };
    }
    if (record.kind === 'move' && typeof record.block_id === 'string') {
      return { kind: 'move', blockId: record.block_id };
    }
    if (typeof record.type === 'string') {
      return { kind: 'block', type: record.type };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * `getData` is blocked during dragover, so acceptance is decided from the
 * advertised types instead. Without this the browser shows a no-drop cursor.
 */
function carriesCanvasPayload(event: Event): boolean {
  const types = (event as DragEvent).dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(DND_MIME);
}

function scrollElementIntoView(el: Element, block: ScrollLogicalPosition = 'center'): void {
  const scroll = (el as HTMLElement).scrollIntoView?.bind(el);
  if (!scroll) return;
  scroll({ behavior: 'smooth', block, inline: 'nearest' });
}

function gripIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path fill="currentColor" d="M9 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 18.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>';
  return svg;
}

export function mountBlockCanvas(
  host: HTMLElement,
  options: MountBlockCanvasOptions
): BlockCanvasHandle {
  let blocks = options.blocks;
  let selectedId: string | null = null;
  let media = options.media ?? [];
  let activeDropIndex: number | null = null;
  let pendingReveal: string | null = null;
  let publishErrorIds = new Set<string>();
  let dndCleanups: CleanupFn[] = [];
  let menuDisposers: Array<() => void> = [];
  const rootMode: DropRootMode = options.allowCollectionAtRoot ? 'page' : 'lesson';
  const canEdit = options.editable !== false;

  const root = document.createElement('div');
  root.className = 'lesson-page lesson-page--blocks';
  host.append(root);

  root.addEventListener('callout-reference-jump', event => {
    event.stopPropagation();
    select(null);
  });

  // Discern's Confirm card is its own block: added after its activity on attach,
  // removed with it on detach. The teacher drags it later in the lesson.
  root.addEventListener(DISCERN_ATTACH_EVENT, event => {
    const hostId = (event as CustomEvent<{ blockId: string }>).detail.blockId;
    if (findDiscernConfirm(blocks, hostId)) return;
    emit(insertDiscernConfirm(blocks, hostId, createDiscernConfirmBlock(options.idFactory(), hostId)));
  });
  root.addEventListener(DISCERN_DETACH_EVENT, event => {
    const hostId = (event as CustomEvent<{ blockId: string }>).detail.blockId;
    if (findDiscernConfirm(blocks, hostId)) emit(removeDiscernConfirms(blocks, hostId));
  });

  function clearDnd(): void {
    for (const stop of dndCleanups) stop();
    dndCleanups = [];
  }

  function clearMenus(): void {
    for (const stop of menuDisposers) stop();
    menuDisposers = [];
  }

  root.addEventListener('dragleave', (event) => {
    const next = (event as DragEvent).relatedTarget as Node | null;
    if (!next || !root.contains(next)) clearDropIndicator();
  });

  function emit(next: Block[], rerender = true): void {
    blocks = next;
    options.onChange(next);
    if (rerender) render();
  }

  function select(blockId: string | null): void {
    if (!canEdit && blockId) return;
    // Re-selecting the open block would rebuild its editor mid-edit, so clicks
    // inside an already-selected block are left alone.
    if (selectedId === blockId) return;
    selectedId = blockId;
    options.onSelect?.(blockId);
    render();
  }

  function selectAndReveal(blockId: string): void {
    pendingReveal = blockId;
    if (selectedId === blockId) {
      render();
      return;
    }
    select(blockId);
  }

  /**
   * Content edits must not re-render the canvas: `render()` replaces every row,
   * which tears the field out from under the teacher and loses focus and caret
   * after a single keystroke. Only the block's preview needs refreshing.
   */
  function onBlockChange(updated: Block): void {
    blocks = replaceBlockInTree(blocks, updated);
    options.onChange(blocks);
    refreshPreview(updated.id);
    refreshCalloutReferences(root, blocks, 'teacher');
  }

  function refreshPreview(blockId: string): void {
    const holder = root.querySelector<HTMLElement>(
      `.lesson-page__block[data-block-id="${blockId}"] > .lesson-page__preview`
    );
    if (!holder) return;
    const block = findBlockById(blocks, blockId);
    if (block) holder.replaceChildren(preview(block));
  }

  function latestBlock(id: string, fallback: Block): () => Block {
    return () => findBlockById(blocks, id) ?? fallback;
  }

  function editorCtx(): BlockEditorContext {
    return {
      ...options.editorContext,
      media,
      getLessonBlocks: () => blocks,
      setLessonBlocks: (next) => {
        emit(next, true);
      }
    };
  }

  function setHint(message: string): void {
    const hint = root.querySelector('.lesson-page__hint');
    if (hint) hint.textContent = message;
  }

  function clearDropIndicator(): void {
    activeDropIndex = null;
    root
      .querySelectorAll('.lesson-page__gap--active')
      .forEach((el) => el.classList.remove('lesson-page__gap--active'));
  }

  function showDropIndicator(index: number): void {
    if (activeDropIndex === index) return;
    clearDropIndicator();
    activeDropIndex = index;
    root
      .querySelector(`.lesson-page__gap[data-index="${index}"]`)
      ?.classList.add('lesson-page__gap--active');
  }

  function autoScrollDuringDrag(event: Event): void {
    const y = (event as DragEvent).clientY;
    if (typeof y !== 'number' || typeof window === 'undefined') return;
    if (typeof window.scrollBy !== 'function') return;
    const edge = 96;
    if (y < edge) window.scrollBy({ top: -28, behavior: 'auto' });
    else if (y > window.innerHeight - edge) window.scrollBy({ top: 28, behavior: 'auto' });
  }

  function handleDragOverAt(event: Event, index: number): void {
    if (!carriesCanvasPayload(event)) return;
    event.preventDefault();
    const dt = (event as DragEvent).dataTransfer;
    if (dt) dt.dropEffect = dt.effectAllowed === 'move' ? 'move' : 'copy';
    showDropIndicator(index);
    autoScrollDuringDrag(event);
  }

  function handleDropAt(event: Event, index: number): void {
    event.preventDefault();
    clearDropIndicator();
    const payload = readDropPayload(event);
    if (!payload) return;

    if (payload.kind === 'composition') {
      options.onCompositionDrop?.(payload.id);
      return;
    }

    if (payload.kind === 'move') {
      const result = moveBlockTo(blocks, payload.blockId, { kind: 'root' }, index, { rootMode });
      if (!result.ok) {
        setHint(result.message);
        return;
      }
      setHint('');
      emit(result.blocks);
      pendingReveal = payload.blockId;
      select(payload.blockId);
      return;
    }

    const block = createFromInsertMenu(payload.type as InsertMenuValue, options.idFactory());
    const result = insertAt(blocks, { kind: 'root' }, index, block, { rootMode });
    if (!result.ok) {
      setHint(result.message);
      return;
    }
    setHint('');
    emit(result.blocks);
    pendingReveal = block.id;
    select(block.id);
  }

  function applyRootMove(blockId: string, index: number): void {
    const result = moveBlockTo(blocks, blockId, { kind: 'root' }, index, { rootMode });
    if (!result.ok) {
      setHint(result.message);
      return;
    }
    setHint('');
    emit(result.blocks);
    pendingReveal = blockId;
    select(blockId);
  }

  function createGap(index: number): HTMLElement {
    const gap = document.createElement('div');
    gap.className = 'lesson-page__gap';
    gap.dataset.index = String(index);
    gap.style.pointerEvents = 'auto';
    // HTML5 path kept for palette / composition drops and existing unit tests.
    gap.addEventListener('dragover', (event) => handleDragOverAt(event, index));
    gap.addEventListener('dragenter', (event) => handleDragOverAt(event, index));
    gap.addEventListener('drop', (event) => handleDropAt(event, index));
    dndCleanups.push(
      dropTargetForElements({
        element: gap,
        canDrop: ({ source }) => isRootBlockDrag(source.data),
        onDragEnter: () => showDropIndicator(index),
        onDragLeave: () => {
          if (activeDropIndex === index) clearDropIndicator();
        },
        onDrop: ({ source }) => {
          clearDropIndicator();
          if (!isRootBlockDrag(source.data)) return;
          applyRootMove(source.data.blockId, index);
        }
      })
    );
    return gap;
  }

  /** A block body is the target a teacher actually aims at, so it drops too. */
  function bindRowDropTarget(row: HTMLElement, index: number): void {
    function indexForPointer(event: Event): number {
      const y = (event as DragEvent).clientY;
      const rect = row.getBoundingClientRect();
      if (typeof y !== 'number' || rect.height === 0) return index;
      return y > rect.top + rect.height / 2 ? index + 1 : index;
    }
    row.addEventListener('dragover', (event) => {
      handleDragOverAt(event, indexForPointer(event));
    });
    row.addEventListener('dragenter', (event) => {
      handleDragOverAt(event, indexForPointer(event));
    });
    row.addEventListener('drop', (event) => {
      handleDropAt(event, indexForPointer(event));
    });
  }

  function createGrip(block: Block, row: HTMLElement): HTMLElement {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'lesson-page__grip';
    grip.draggable = true;
    grip.setAttribute('aria-label', `Move ${block.block_type.replace(/_/g, ' ')}`);
    grip.title = 'Drag to move';
    grip.append(gripIcon());
    grip.addEventListener('click', (event) => event.stopPropagation());
    // HTML5 MIME kept for palette-compatible drops / unit tests.
    grip.addEventListener('dragstart', (event) => {
      const dt = event.dataTransfer;
      if (!dt) return;
      dt.effectAllowed = 'move';
      dt.setData(DND_MIME, JSON.stringify({ kind: 'move', block_id: block.id }));
      dt.setDragImage?.(row, 24, 12);
      row.classList.add('lesson-page__block--dragging');
    });
    grip.addEventListener('dragend', () => {
      row.classList.remove('lesson-page__block--dragging');
      clearDropIndicator();
    });
    dndCleanups.push(
      draggable({
        element: grip,
        getInitialData: () => rootBlockDrag(block.id),
        onDragStart: () => row.classList.add('lesson-page__block--dragging'),
        onDrop: () => {
          row.classList.remove('lesson-page__block--dragging');
          clearDropIndicator();
        }
      })
    );
    return grip;
  }

  function moveBy(blockId: string, delta: 1 | -1): void {
    // A lecture gate and its If wrong path move, and are passed, as one.
    const at = moveByTarget(blocks, blockId, delta);
    if (at === null) return;
    const result = moveBlockTo(blocks, blockId, { kind: 'root' }, at, { rootMode });
    if (!result.ok) {
      setHint(result.message);
      return;
    }
    setHint('');
    pendingReveal = blockId;
    emit(result.blocks);
  }

  function duplicateBlock(block: Block): void {
    const clone = cloneBlockWithNewIds(findBlockById(blocks, block.id) ?? block, options.idFactory);
    const location = findBlockLocation(blocks, block.id);
    const parent = location?.parent ?? { kind: 'root' };
    const at = location ? location.index + 1 : blocks.length;
    const result = insertAt(blocks, parent, at, clone, { rootMode });
    if (result.ok) emit(result.blocks);
  }

  function deleteBlock(block: Block): void {
    const location = findBlockLocation(blocks, block.id);
    if (selectedId === block.id) {
      selectedId = null;
      options.onSelect?.(null);
    }
    emit(deleteBlocksById(blocks, [block.id]));
    offerTimedUndo({
      message: `${blockTypeLabel(block)} block deleted`,
      onUndo: () => {
        const parent = location?.parent ?? { kind: 'root' as const };
        const result = insertAt(blocks, parent, location?.index ?? blocks.length, block, { rootMode });
        if (!result.ok) {
          setHint(result.message);
          return;
        }
        emit(result.blocks);
      }
    });
  }


  function createBlockMenu(block: Block): HTMLElement {
    return createHubMenuButton(
      () => {
        const editing = selectedId === block.id;
        const index = blocks.findIndex((row) => row.id === block.id);
        const canMoveDown = moveByTarget(blocks, block.id, 1) !== null;
        return [
          {
            label: editing ? 'Done' : 'Edit',
            icon: editing ? HUB_LIST_ICONS.check : HUB_LIST_ICONS.edit,
            dataset: { blockAction: editing ? 'done' : 'edit' },
            onSelect: () => select(editing ? null : block.id)
          },
          {
            label: 'Move up',
            icon: HUB_LIST_ICONS.up,
            disabled: index <= 0,
            dataset: { blockAction: 'up' },
            onSelect: () => moveBy(block.id, -1)
          },
          {
            label: 'Move down',
            icon: HUB_LIST_ICONS.down,
            disabled: !canMoveDown,
            dataset: { blockAction: 'down' },
            onSelect: () => moveBy(block.id, 1)
          },
          {
            label: 'Duplicate',
            icon: HUB_LIST_ICONS.copy,
            dataset: { blockAction: 'duplicate' },
            onSelect: () => duplicateBlock(block)
          },
          ...(block.block_type === 'section' && !isLinkedSection(block) && options.onSaveComposition
            ? [{
                label: 'Save as composition',
                icon: HUB_LIST_ICONS.copy,
                dataset: { blockAction: 'save-composition' },
                onSelect: () => options.onSaveComposition?.(block.id)
              }]
            : []),
          'separator',
          {
            label: 'Delete block',
            icon: HUB_LIST_ICONS.trash,
            danger: true,
            hold: true,
            dataset: { blockAction: 'delete' },
            onSelect: () => deleteBlock(block)
          }
        ];
      },
      { label: `${blockTypeLabel(block)} block options`, className: 'lesson-page__block-menu' }
    );
  }

  function createEditChrome(block: Block): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'lesson-page__toolbar';

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'btn btn--primary lesson-page__done';
    done.textContent = 'Done';
    done.addEventListener('click', (event) => {
      event.stopPropagation();
      select(null);
    });

    const spacer = document.createElement('span');
    spacer.className = 'lesson-page__toolbar-spacer';

    // A Teacher note block is always teacher-only, so it has no visibility choice.
    const visibility =
      block.block_type === 'teacher_note'
        ? Object.assign(document.createElement('span'), {
            className: 'tk-note__pill',
            textContent: 'Only you see this'
          })
        : createVisibilitySelect(block, onBlockChange, latestBlock(block.id, block));
    bar.append(createBlockTypeLabel(block), visibility, spacer, done);

    if (block.block_type === 'section' && !isLinkedSection(block) && options.onSaveComposition) {
      const saveComposition = document.createElement('button');
      saveComposition.type = 'button';
      saveComposition.className = 'btn btn--ghost lesson-editor__save-composition';
      saveComposition.textContent = 'Save as composition';
      saveComposition.setAttribute('aria-label', 'Save as composition');
      saveComposition.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onSaveComposition?.(block.id);
      });
      bar.append(saveComposition);
    }

    return bar;
  }

  function createLinkedChrome(block: Block): HTMLElement {
    const chrome = document.createElement('div');
    chrome.className = 'lesson-page__linked-chrome';

    const badge = document.createElement('span');
    badge.className = 'lesson-editor__linked-badge';
    badge.textContent = 'Linked';
    chrome.append(badge);

    if (isLinkedSection(block)) {
      const compositionId = block.content.link.source_composition_id;

      const editSource = document.createElement('button');
      editSource.type = 'button';
      editSource.className = 'btn btn--ghost lesson-editor__edit-source';
      editSource.textContent = 'Edit Source';
      editSource.setAttribute('aria-label', 'Edit source');
      editSource.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onEditSource?.(compositionId);
      });

      const detach = document.createElement('button');
      detach.type = 'button';
      detach.className = 'btn btn--ghost lesson-editor__detach-composition';
      detach.textContent = 'Detach';
      detach.setAttribute('aria-label', 'Detach linked composition');
      detach.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onDetachComposition?.(block.id);
      });

      chrome.append(editSource, detach);
    }

    return chrome;
  }

  function preview(block: Block): HTMLElement {
    const el = options.renderPreview?.(block) ?? renderBlock(block, 'teacher', { pageBlocks: blocks });
    if (block.block_type === 'tabs') {
      el.querySelectorAll('[role="tab"]').forEach((btn, index) => {
        btn.addEventListener('click', () => rememberTabsPanel(block.id, index));
      });
      applyRememberedTabsPanel(el, block.id);
    }
    return el;
  }

  function render(): void {
    clearDnd();
    clearMenus();
    root.replaceChildren();

    if (options.heading) {
      const heading = document.createElement('h2');
      heading.className = 'lesson-page__heading class-page__heading';
      heading.textContent = options.heading;
      root.append(heading);
    }

    const hint = document.createElement('p');
    hint.className = 'lesson-page__hint';
    hint.setAttribute('role', 'status');
    root.append(hint);

    const list = document.createElement('div');
    list.className = 'lesson-page__blocks';

    blocks.forEach((block, index) => {
      list.append(createGap(index));

      const row = document.createElement('div');
      row.className = 'lesson-page__block';
      row.dataset.blockId = block.id;
      row.dataset.blockType = block.block_type;
      if (selectedId === block.id) row.classList.add('lesson-page__block--selected');
      if (blockOrDescendantHasError(block, publishErrorIds)) {
        row.classList.add('lesson-page__block--publish-error');
      }
      bindRowDropTarget(row, index);
      if (canEdit) {
        row.append(createGrip(block, row), createBlockMenu(block));
        if (options.editOnClick) {
          row.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, textarea, select, .lesson-page__grip, .lesson-page__block-menu')) return;
            select(block.id);
          });
        }
      }

      if (isLinkedSection(block)) {
        row.append(createLinkedChrome(block));
        row.append(
          options.renderLinkedPreview?.(block.content.link.source_composition_id) ?? preview(block)
        );
      } else if (canEdit && selectedId === block.id) {
        const editor = createBlockEditor(block, onBlockChange, latestBlock(block.id, block), editorCtx());
        editor.querySelectorAll('.block-editor__move-up, .block-editor__move-down').forEach((el) => el.remove());
        row.append(createEditChrome(block), editor);
      } else {
        row.append(preview(block));
      }
      if (canEdit) options.decorateRow?.(row, block);

      list.append(row);
    });

    list.append(createGap(blocks.length));
    root.append(list);

    if (pendingReveal) {
      const target = pendingReveal;
      pendingReveal = null;
      const row = root.querySelector(`.lesson-page__block[data-block-id="${target}"]`);
      const nested = row ? null : root.querySelector(`.hub-list__row[data-key="${CSS.escape(target)}"]`);
      const editor = nested ?? row?.querySelector('.lesson-page__inspector') ?? row;
      if (editor) scrollElementIntoView(editor);
    }
  }

  render();

  return {
    update(next: Block[], nextMedia?: Media[]) {
      blocks = next;
      if (nextMedia) media = nextMedia;
      if (selectedId && !findBlockById(blocks, selectedId)) selectedId = null;
      render();
    },
    insertType(type: InsertMenuValue) {
      if (!canEdit) return;
      const block = createFromInsertMenu(type, options.idFactory());
      const target = insertTargetForSelection(blocks, selectedId);
      const result = insertAt(blocks, target.parent, target.index, block, { rootMode });
      if (!result.ok) {
        setHint(result.message);
        return;
      }
      // Only page-level rows can be selected. A block added inside a section,
      // column or tab opens its container's editor, scrolled to the new block;
      // selecting the nested id itself left nothing editable on the page.
      const containerId = rootAncestorId(result.blocks, block.id) ?? block.id;
      const container = findBlockById(result.blocks, containerId);
      emit(result.blocks, false);
      pendingReveal = block.id;
      if (selectedId === containerId) render();
      else select(containerId);
      setHint(
        containerId !== block.id && container
          ? `Added inside the ${blockTypeLabel(container).toLowerCase()}. Choose Done to add blocks to the page instead.`
          : ''
      );
    },
    revealPublishBlock(blockId: string, errorIds: string[] = [blockId]) {
      publishErrorIds = new Set(errorIds);
      if (!blockId) {
        render();
        return;
      }
      const targetId = rootAncestorId(blocks, blockId) ?? blockId;
      selectAndReveal(targetId);
      const target = root.querySelector(`[data-block-id="${blockId}"]`);
      if (target) {
        target.classList.add('lesson-page__block--publish-error');
        scrollElementIntoView(target);
      }
    },
    dispose() {
      clearDnd();
      clearMenus();
      root.remove();
    }
  };
}

/** Drops the optional key rather than leaving `cover: undefined` behind. */
function lessonWithoutCover(lesson: Lesson): Lesson {
  const { cover: _removed, ...rest } = lesson;
  return rest as Lesson;
}

function rootAncestorId(blocks: Block[], blockId: string): string | null {
  for (const block of blocks) {
    if (findBlockById([block], blockId)) return block.id;
  }
  return null;
}

function blockOrDescendantHasError(block: Block, errorIds: Set<string>): boolean {
  if (errorIds.has(block.id)) return true;
  for (const id of errorIds) {
    if (findBlockById([block], id)) return true;
  }
  return false;
}

export function mountLessonPage(host: HTMLElement, options: MountLessonPageOptions): LessonPageHandle {
  let lesson = options.lesson;
  let media = options.media ?? [];

  const root = document.createElement('div');
  root.className = 'lesson-page';
  host.append(root);

  function emitLesson(next: Lesson): void {
    lesson = next;
    options.onChange(next);
  }

  const optionsMenu = mountPageOptionsMenu(
    [
      {
        label: 'Export JSON',
        onSelect: () => {
          options.onExport?.();
        }
      },
      {
        label: 'Save as lesson template',
        onSelect: () => {
          options.onSaveTemplate?.();
        }
      },
      ...(options.onToggleFullPage
        ? [
            {
              label: 'Full screen',
              className: 'lesson-page__fullscreen',
              dataset: { builderFullscreen: '' },
              onSelect: () => {
                options.onToggleFullPage?.();
              }
            }
          ]
        : []),
      {
        label: 'Print',
        className: 'lesson-page__print',
        ariaLabel: 'Print',
        onSelect: () => {
          options.onPrint();
        }
      },
      ...(options.onTrash
        ? [
            {
              label: 'Move to trash',
              danger: true,
              className: 'lesson-page__trash',
              onSelect: () => {
                options.onTrash?.();
              }
            }
          ]
        : [])
    ],
    { label: 'Page menu', className: 'lesson-page__more', triggerClassName: 'lesson-page__more-btn' }
  );

  const showPageMenu = options.showPageMenu ?? true;
  const chrome = document.createElement('div');
  chrome.className = 'lesson-page__chrome';
  chrome.append(optionsMenu.el);

  const coverHost = document.createElement('div');
  coverHost.className = 'lesson-page__cover';

  const banner: EntityBannerHandle = renderEntityBanner(coverHost, {
    cover: lesson.cover ?? null,
    media,
    title: lesson.title,
    eyebrow: pedagogicalModeLabel(lesson.pedagogical_mode),
    entityId: lesson.id,
    editable: true,
    size: 'hero',
    fallback: 'marine',
    editButtonClass: 'entity-banner__edit entity-banner__edit--hero btn btn--ghost',
    onSave: (cover) => {
      emitLesson(cover ? { ...lesson, cover } : lessonWithoutCover(lesson));
    }
  });

  const titleEditor = mountEntityPageTitle(coverHost, {
    value: lesson.title,
    ariaLabel: 'Lesson name',
    inputClassName: 'lesson-page__title',
    onPreview: (title) => {
      banner.update({ title });
      emitLesson({ ...lesson, title });
    }
  });

  // Lesson type sits as a quiet chip at the head of the outcomes row
  // rather than a labelled form field above the canvas.
  const metaRow = document.createElement('div');
  metaRow.className = 'lesson-page__meta';
  const modeSelect = document.createElement('select');
  modeSelect.className = 'lesson-page__mode-select';
  modeSelect.setAttribute('aria-label', 'Lesson type');
  modeSelect.title = 'Lesson type';
  for (const mode of PEDAGOGICAL_MODES) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = PEDAGOGICAL_MODE_LABELS[mode];
    modeSelect.append(option);
  }
  modeSelect.value = resolvePedagogicalMode(lesson.pedagogical_mode);
  modeSelect.addEventListener('change', () => {
    const pedagogical_mode = modeSelect.value as PedagogicalMode;
    emitLesson({ ...lesson, pedagogical_mode });
    banner.update({ eyebrow: PEDAGOGICAL_MODE_LABELS[pedagogical_mode] });
    syncQuizPanel();
    syncLecturePanel();
    // Lecture controls on the canvas come and go with the lesson type.
    canvas.update(lesson.blocks, media);
  });
  metaRow.append(modeSelect);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'lesson-page__canvas';

  // A lesson set to Quiz gets its quiz panel: questions from students, settings, results and live.
  const quizHost = document.createElement('div');
  quizHost.className = 'lesson-page__quiz';
  let quizPanel: QuizPanelHandle | null = null;
  function syncQuizPanel(): void {
    const isQuiz = resolvePedagogicalMode(lesson.pedagogical_mode) === 'quiz';
    if (isQuiz && !quizPanel) {
      quizPanel = mountQuizPanel({
        getLesson: () => lesson,
        idFactory: options.idFactory,
        onSettings: (quiz) => emitLesson({ ...lesson, quiz }),
        onAddBlocks: (added) => {
          const blocks = [...lesson.blocks, ...added];
          emitLesson({ ...lesson, blocks });
          canvas.update(blocks, media);
        },
        onRemoveBlock: (blockId) => {
          const blocks = removeBlockFromTree(lesson.blocks, blockId);
          emitLesson({ ...lesson, blocks });
          canvas.update(blocks, media);
        }
      });
      quizHost.append(quizPanel.root);
    } else if (!isQuiz && quizPanel) {
      quizPanel.dispose();
      quizPanel = null;
    }
    quizHost.hidden = !isQuiz;
  }

  // A lesson set to Lecture gets its panel: Play as student, the replay strip and hand-ups.
  const lectureHost = document.createElement('div');
  lectureHost.className = 'lesson-page__lecture';
  let lecturePanel: LecturePanelHandle | null = null;
  function syncLecturePanel(): void {
    const isLecture = resolvePedagogicalMode(lesson.pedagogical_mode) === 'lecture';
    if (isLecture && !lecturePanel) {
      lecturePanel = mountLecturePanel({
        getLesson: () => lesson,
        onAddCallout: (sceneId, text) => {
          const base = createBlock('callout', options.idFactory());
          const callout = { ...base, content: { ...base.content, style: 'information', body: text } } as Block;
          // A chapter-intro scene is the section itself, so the callout opens it.
          const inSection = prependToSection(lesson.blocks, sceneId, callout);
          const blocks = inSection !== lesson.blocks ? inSection : insertAfter(lesson.blocks, sceneId, callout);
          emitLesson({ ...lesson, blocks });
          canvas.update(blocks, media);
        }
      });
      lectureHost.append(lecturePanel.root);
      void lecturePanel.refresh();
    } else if (!isLecture && lecturePanel) {
      lecturePanel.dispose();
      lecturePanel = null;
    }
    lectureHost.hidden = !isLecture;
  }

  if (showPageMenu) root.append(chrome);
  root.append(coverHost, metaRow, quizHost, lectureHost, canvasHost);

  const classExamples = createTeacherClassExamples({ lessonId: lesson.id });
  const pulse = createTeacherBlockPulse({
    lessonId: lesson.id,
    isLessonOff: () => lesson.feedback_off === true,
    onSetBlockOff: (blockId, off) => {
      const blocks = mapBlockById(lesson.blocks, blockId, (block) => setBlockPulseOff(block, off));
      emitLesson({ ...lesson, blocks });
      canvas.update(blocks, media);
    }
  });
  const lectureTools = createLectureEditorTools({
    isLecture: () => resolvePedagogicalMode(lesson.pedagogical_mode) === 'lecture',
    getBlocks: () => lesson.blocks,
    onBlocks: (blocks) => {
      emitLesson({ ...lesson, blocks });
      canvas.update(blocks, media);
    },
    idFactory: options.idFactory
  });
  const canvas = mountBlockCanvas(canvasHost, {
    decorateRow: (row, block) => {
      classExamples.decorate(row, block);
      pulse.decorate(row, block);
      lectureTools.decorate(row, block);
    },
    blocks: lesson.blocks,
    media,
    editorContext: { lessonId: lesson.id },
    onChange: (blocks) => {
      emitLesson({ ...lesson, blocks });
    },
    onSelect: options.onSelect,
    idFactory: options.idFactory,
    onSaveComposition: options.onSaveComposition,
    onEditSource: options.onEditSource,
    onDetachComposition: options.onDetachComposition,
    onCompositionDrop: options.onCompositionDrop,
    renderLinkedPreview: options.renderLinkedPreview,
    renderPreview: (block) =>
      renderBlock(block, 'teacher', {
        lessonId: lesson.id,
        pageBlocks: lesson.blocks,
        attachedOutcomes: publicOutcomesForPage(lesson, options.outcomesCatalog ?? [])
      })
  });

  syncQuizPanel();
  syncLecturePanel();

  const stripHost = document.createElement('div');
  stripHost.className = 'lesson-page__meta-outcomes';
  metaRow.append(stripHost);

  // Every dot's counts in one panel above the canvas, opened from the meta row.
  const pulseSummary = mountPulseSummary({
    pulse,
    getBlocks: () => lesson.blocks,
    isLessonOff: () => lesson.feedback_off === true
  });
  metaRow.append(pulseSummary.chip);
  canvasHost.before(pulseSummary.panel);
  const strip =
    options.subject && options.outcomesCatalog
      ? mountOutcomeStrip(stripHost, {
          catalog: options.outcomesCatalog,
          subject: options.subject,
          attached: lesson,
          editable: true,
          onChange: (ids) => {
            emitLesson({ ...lesson, outcome_ids: ids, syllabus_outcomes: ids });
          },
          onCatalogChange: (created) => {
            options.outcomesCatalog = [...(options.outcomesCatalog ?? []), created];
            if (options.subject) {
              options.subject = {
                ...options.subject,
                outcome_ids: [...options.subject.outcome_ids, created.id]
              };
            }
          }
        })
      : null;

  revealBlockFromHash(root);

  const networkLines = options.subject?.network_lines ?? [];
  const lineChips = networkLines.length
    ? mountLineChips(stripHost, {
        lines: networkLines,
        stops: lesson.line_stops,
        onChange: (stops) => emitLesson({ ...lesson, line_stops: stops })
      })
    : null;

  // Before and after: what leads here and what comes next (the unit map splits on a choice).
  const flowHost = document.createElement('div');
  flowHost.className = 'lesson-page__flow';
  root.append(flowHost);
  const lessonFlow = options.flowPeers && options.onFlowPeer
    ? mountLessonFlow(flowHost, {
        lessonId: lesson.id,
        peers: options.flowPeers,
        after: lesson.after_lesson_ids ?? undefined,
        kind: lesson.lesson_kind,
        onSelf: (patch) => emitLesson({ ...lesson, ...patch }),
        onPeer: options.onFlowPeer
      })
    : null;

  const dotPoints = options.dotPoints
    ? mountLessonDotPoints(stripHost, {
        dotPoints: lesson.dot_points,
        ...options.dotPoints,
        onChange: (refs) => emitLesson({ ...lesson, dot_points: refs })
      })
    : null;

  return {
    update(next: Lesson, nextMedia?: Media[]) {
      lesson = next;
      dotPoints?.update(lesson.dot_points);
      lessonFlow?.update(lesson.after_lesson_ids ?? undefined, lesson.lesson_kind);
      if (nextMedia) media = nextMedia;
      titleEditor.update(lesson.title);
      modeSelect.value = resolvePedagogicalMode(lesson.pedagogical_mode);
      syncQuizPanel();
      syncLecturePanel();
      lecturePanel?.repaint();
      quizPanel?.update(lesson);
      banner.update({
        cover: lesson.cover ?? null,
        title: lesson.title,
        eyebrow: pedagogicalModeLabel(lesson.pedagogical_mode),
        ...(nextMedia ? { media } : {})
      });
      canvas.update(lesson.blocks, media);
      pulseSummary.refresh();
      strip?.update({ attached: lesson, catalog: options.outcomesCatalog ?? [] });
      lineChips?.update(lesson.line_stops);
    },
    insertType(type: InsertMenuValue) {
      canvas.insertType(type);
    },
    revealPublishBlock(blockId: string, errorIds?: string[]) {
      canvas.revealPublishBlock(blockId, errorIds);
    },
    dispose() {
      quizPanel?.dispose();
      lecturePanel?.dispose();
      classExamples.dispose();
      pulseSummary.dispose();
      pulse.dispose();
      canvas.dispose();
      strip?.dispose();
      lineChips?.dispose();
      lessonFlow?.dispose();
      dotPoints?.dispose();
      titleEditor.dispose();
      banner.dispose();
      optionsMenu.dispose();
      root.remove();
    }
  };
}
