import { isLinkedSection } from '@/blocks/composition-link';
import {
  createFromInsertMenu,
  cloneBlockWithNewIds,
  type InsertMenuValue
} from '@/blocks/create-block';
import {
  createBlockEditor,
  createVisibilitySelect,
  type BlockEditorContext
} from '@/blocks/editors';
import { findBlockById } from '@/blocks/find-block';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import type { CurriculumOutcome } from '@/schemas/outcome';
import { mountOutcomeStrip, publicOutcomesForPage } from '@/outcomes/strip';
import {
  PEDAGOGICAL_MODES,
  PEDAGOGICAL_MODE_LABELS,
  resolvePedagogicalMode,
  type PedagogicalMode
} from '@/curriculum/pedagogical-mode';
import { renderEntityBanner, type EntityBannerHandle } from '@/teacher/entity-banner';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import {
  deleteBlocksById,
  findBlockLocation,
  insertAt,
  insertTargetForSelection,
  moveBlockTo,
  type DropRootMode
} from '@/teacher/lesson-canvas/drop';
import { isInlineEditor } from '@/teacher/lesson-canvas/kinds';

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
  subject?: { id: string; outcome_ids: string[] };
  onToggleFullPage?: () => void;
};

export type LessonPageHandle = {
  update(lesson: Lesson, nextMedia?: Media[]): void;
  insertType(type: InsertMenuValue): void;
  revealPublishBlock(blockId: string, errorIds?: string[]): void;
  dispose(): void;
};

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

function trashIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM8 9h2v9H8V9z"/>';
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
  const rootMode: DropRootMode = options.allowCollectionAtRoot ? 'page' : 'lesson';

  const root = document.createElement('div');
  root.className = 'lesson-page lesson-page--blocks';
  host.append(root);

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
    return { ...options.editorContext, media };
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

  function createGap(index: number): HTMLElement {
    const gap = document.createElement('div');
    gap.className = 'lesson-page__gap';
    gap.dataset.index = String(index);
    gap.style.pointerEvents = 'auto';
    gap.addEventListener('dragover', (event) => handleDragOverAt(event, index));
    gap.addEventListener('dragenter', (event) => handleDragOverAt(event, index));
    gap.addEventListener('drop', (event) => handleDropAt(event, index));
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
    return grip;
  }

  function createBlockDelete(block: Block): HTMLElement {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'lesson-page__block-delete';
    remove.setAttribute('aria-label', 'Delete block');
    remove.title = 'Delete block';
    remove.append(trashIcon());
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedId = null;
      options.onSelect?.(null);
      emit(deleteBlocksById(blocks, [block.id]));
    });
    return remove;
  }

  function moveBy(blockId: string, delta: number): void {
    const from = blocks.findIndex((row) => row.id === blockId);
    if (from < 0) return;
    const to = from + delta;
    if (to < 0 || to >= blocks.length) return;
    const result = moveBlockTo(
      blocks,
      blockId,
      { kind: 'root' },
      delta > 0 ? to + 1 : to,
      { rootMode }
    );
    if (!result.ok) {
      setHint(result.message);
      return;
    }
    setHint('');
    pendingReveal = blockId;
    emit(result.blocks);
  }

  function createToolbar(block: Block): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'lesson-page__toolbar';

    const visibility = createVisibilitySelect(block, onBlockChange, latestBlock(block.id, block));

    const index = blocks.findIndex((row) => row.id === block.id);

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'btn btn--ghost lesson-page__move-up';
    up.textContent = 'Move up';
    up.disabled = index <= 0;
    up.addEventListener('click', (event) => {
      event.stopPropagation();
      moveBy(block.id, -1);
    });

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'btn btn--ghost lesson-page__move-down';
    down.textContent = 'Move down';
    down.disabled = index < 0 || index >= blocks.length - 1;
    down.addEventListener('click', (event) => {
      event.stopPropagation();
      moveBy(block.id, 1);
    });

    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = 'btn btn--ghost';
    duplicate.textContent = 'Duplicate';
    duplicate.addEventListener('click', (event) => {
      event.stopPropagation();
      const clone = cloneBlockWithNewIds(block, options.idFactory);
      const location = findBlockLocation(blocks, block.id);
      const parent = location?.parent ?? { kind: 'root' };
      const at = location ? location.index + 1 : blocks.length;
      const result = insertAt(blocks, parent, at, clone, { rootMode });
      if (result.ok) emit(result.blocks);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost';
    remove.textContent = 'Delete';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedId = null;
      options.onSelect?.(null);
      emit(deleteBlocksById(blocks, [block.id]));
    });

    bar.append(visibility, up, down, duplicate, remove);

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
    return options.renderPreview?.(block) ?? renderBlock(block, 'teacher');
  }

  function render(): void {
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
      row.append(createGrip(block, row), createBlockDelete(block));

      if (isLinkedSection(block)) {
        row.append(createLinkedChrome(block));
        row.append(
          options.renderLinkedPreview?.(block.content.link.source_composition_id) ?? preview(block)
        );
        row.addEventListener('click', (event) => {
          if ((event.target as HTMLElement | null)?.closest('button')) return;
          selectedId = block.id;
          options.onSelect?.(block.id);
        });
      } else if (isInlineEditor(block.block_type)) {
        if (selectedId === block.id) {
          const editor = createBlockEditor(block, onBlockChange, latestBlock(block.id, block), editorCtx());
          editor.querySelectorAll('.block-editor__move-up, .block-editor__move-down').forEach((el) => el.remove());
          row.append(editor);
          row.append(createToolbar(block));
        } else {
          row.append(preview(block));
        }
        row.addEventListener('click', () => select(block.id));
      } else {
        const previewHolder = document.createElement('div');
        previewHolder.className = 'lesson-page__preview';
        previewHolder.append(preview(block));
        row.append(previewHolder);
        row.addEventListener('click', (event) => {
          if ((event.target as HTMLElement | null)?.closest('.lesson-page__inspector')) return;
          if (selectedId === block.id) return;
          selectAndReveal(block.id);
        });
        if (selectedId === block.id) {
          const inspector = document.createElement('div');
          inspector.className = 'lesson-page__inspector';
          const editor = createBlockEditor(
            block,
            onBlockChange,
            latestBlock(block.id, block),
            editorCtx()
          );
          editor
            .querySelectorAll('.block-editor__move-up, .block-editor__move-down')
            .forEach((el) => el.remove());
          inspector.append(editor);
          row.append(inspector, createToolbar(block));
        }
      }

      list.append(row);
    });

    list.append(createGap(blocks.length));
    root.append(list);

    if (pendingReveal) {
      const target = pendingReveal;
      pendingReveal = null;
      const row = root.querySelector(`.lesson-page__block[data-block-id="${target}"]`);
      const editor = row?.querySelector('.lesson-page__inspector') ?? row;
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
      const block = createFromInsertMenu(type, options.idFactory());
      const target = insertTargetForSelection(blocks, selectedId);
      const result = insertAt(blocks, target.parent, target.index, block, { rootMode });
      if (!result.ok) {
        setHint(result.message);
        return;
      }
      setHint('');
      emit(result.blocks);
      selectAndReveal(block.id);
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

  const chrome = document.createElement('div');
  chrome.className = 'lesson-page__chrome';
  chrome.append(optionsMenu.el);

  const coverHost = document.createElement('div');
  coverHost.className = 'lesson-page__cover';

  const banner: EntityBannerHandle = renderEntityBanner(coverHost, {
    cover: lesson.cover ?? null,
    media,
    title: lesson.title,
    eyebrow: 'Lesson',
    entityId: lesson.id,
    editable: true,
    size: 'hero',
    fallback: 'marine',
    editButtonClass: 'entity-banner__edit entity-banner__edit--hero btn btn--ghost',
    onSave: (cover) => {
      emitLesson(cover ? { ...lesson, cover } : lessonWithoutCover(lesson));
    }
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'lesson-page__title';
  title.value = lesson.title;
  title.placeholder = 'Untitled lesson';
  title.setAttribute('aria-label', 'Lesson title');
  title.addEventListener('input', () => {
    // Retitling repaints the banner scrim only; remounting would drop the field.
    banner.update({ title: title.value });
    emitLesson({ ...lesson, title: title.value });
  });
  coverHost.append(title);

  const modeRow = document.createElement('label');
  modeRow.className = 'lesson-page__mode';
  const modeLabel = document.createElement('span');
  modeLabel.className = 'lesson-page__mode-label';
  modeLabel.textContent = 'Pedagogical mode';
  const modeSelect = document.createElement('select');
  modeSelect.className = 'lesson-page__mode-select';
  modeSelect.setAttribute('aria-label', 'Pedagogical mode');
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
  });
  modeRow.append(modeLabel, modeSelect);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'lesson-page__canvas';

  root.append(chrome, coverHost, modeRow, canvasHost);

  const canvas = mountBlockCanvas(canvasHost, {
    blocks: lesson.blocks,
    media,
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
        attachedOutcomes: publicOutcomesForPage(lesson, options.outcomesCatalog ?? [])
      })
  });

  const stripHost = document.createElement('div');
  root.insertBefore(stripHost, canvasHost);
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

  return {
    update(next: Lesson, nextMedia?: Media[]) {
      lesson = next;
      if (nextMedia) media = nextMedia;
      title.value = lesson.title;
      modeSelect.value = resolvePedagogicalMode(lesson.pedagogical_mode);
      banner.update({
        cover: lesson.cover ?? null,
        title: lesson.title,
        ...(nextMedia ? { media } : {})
      });
      canvas.update(lesson.blocks, media);
      strip?.update({ attached: lesson, catalog: options.outcomesCatalog ?? [] });
    },
    insertType(type: InsertMenuValue) {
      canvas.insertType(type);
    },
    revealPublishBlock(blockId: string, errorIds?: string[]) {
      canvas.revealPublishBlock(blockId, errorIds);
    },
    dispose() {
      canvas.dispose();
      strip?.dispose();
      banner.dispose();
      optionsMenu.dispose();
      root.remove();
    }
  };
}
