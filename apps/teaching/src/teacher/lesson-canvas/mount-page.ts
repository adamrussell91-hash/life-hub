import { refreshCalloutReferences } from '@/blocks/callout-reference';
import { questionForLesson } from '@/blocks/question-type';
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
  LESSON_BLOCK_GROUPS,
  pageBlockTypes,
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
import { attachCardSleeve, NO_SLEEVE_TARGET, SLEEVE_CONVERT_EVENT, type SleeveConvertDetail } from '@/blocks/lenses/sleeve-convert';
import { renderBlock } from '@/blocks/render';
import { teacherUnitAnthology } from '@/blocks/anthology-load';
import { mountLecturePanel, type LecturePanelHandle } from '@/lecture/teacher-panel';
import { addToScene } from '@/lecture/tree';
import { mapBlockById, setBlockPulseOff } from '@/blocks/block-pulse';
import { createTeacherBlockPulse } from '@/teacher/block-pulse';
import { mountPulseSummary } from '@/teacher/pulse-summary';
import { mountEndQuestions } from '@/teacher/end-questions';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import type { CurriculumOutcome } from '@/schemas/outcome';
import { mountOutcomeStrip, publicOutcomesForPage } from '@/outcomes/strip';
import { mountLineChips } from '@/network/line-chips';
import { mountLessonFlow, type FlowPeer } from '@/network/lesson-flow';
import { mountLessonDotPoints } from '@/alignment/lesson-dot-points';
import { mountLessonSyllabus } from '@/alignment/lesson-syllabus';
import { autoLineIds, syncAutoStops } from '@/alignment/auto-lines';
import { revealBlockFromHash } from '@/app/block-hash';
import type { LessonRouteRole, NetworkLine } from '@/schemas/block';
import {
  PEDAGOGICAL_MODES,
  PEDAGOGICAL_MODE_LABELS,
  pedagogicalModeLabel,
  quizRunsIn,
  resolvePedagogicalMode,
  type PedagogicalMode
} from '@/curriculum/pedagogical-mode';
import { visitBlocks } from '@/blocks/walk-blocks';
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
  type DropParent,
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
import { deckListBar, mountQuizDeck, quizRunLength, readDeckAsList, writeDeckAsList } from '@/blocks/quiz-deck';
import { createLectureEditorTools } from '@/lecture/editor-tools';
import { mountTutorialBoard, type TutorialBoardHandle } from '@/tutorial/board';
import { tutorialTeacherApi } from '@/tutorial/api';
import { createTutorialTabs, inTab, movedGroups, type TutorialTab } from '@/tutorial/editor-tabs';
import { groupSection, isGroupTab } from '@/tutorial/model';
import { mountKitEditor } from '@/sprint/kit-editor';
import { createSprintTabs, inSprintTab, type SprintTab } from '@/sprint/editor-tabs';
import { mountSprintMap, type SprintMapHandle } from '@/sprint/map';
import { sprintTeacherApi } from '@/sprint/api';
import { openPracticeRun } from '@/sprint/practice';
import { seedSprint, withGuidesSection, withPhaseSections } from '@/sprint/defaults';
import { isGuidesSection, phaseOfSection } from '@/sprint/model';
import { mountCaseEditor, type CaseEditorHandle } from '@/case-study/editor';
import { mountCaseBoard, type CaseBoardHandle } from '@/case-study/board';
import { caseTeacherApi } from '@/case-study/api';
import { casePartOf, findCasePartSection, isCaseBriefSection, isCaseOutcomeSection, seedCase } from '@/case-study/model';
import { inCaseTab, withCaseBriefSection, withCaseOutcomeSection, withCasePartSection } from '@/case-study/editor-tabs';
import { httpMarkbookApi } from '@/markbook/api';
import { todayInSydney } from '@/markbook/calc';
import { createGroupSetTools, groupSetBrief } from '@/quiz/group-set-tools';
import { activeMembers, joinWhy, newGroupId } from '@/evidence/groups';
import { codeLabel, loadInsightContext } from '@/evidence/context';
import { classEvidence } from '@/evidence/class-evidence';
import { moveKind, nextMoves } from '@/evidence/next-moves';
import { tagLabel } from '@/evidence/tags';
import { mixUps } from '@/evidence/patterns';
import { mixUpText } from '@/evidence/views/parts';
import { startAnn } from '@/evidence/follow-up';
import type { TagKind } from '@/evidence/types';
import { outcomeLabels } from '@/markbook/parse';
import { peekCurriculum } from '@/app/curriculum-state';
import { loadAlignment } from '@/alignment/api';
import { dotPointOutcomes } from '@/evidence/syllabus';
import type { NextStepJobs } from '@/blocks/next-step-run';

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
  /**
   * Where a new block goes when it isn't dropped beside or inside another
   * (a palette drop on a page gap, or Insert with nothing selected). Null
   * keeps the page-level place. A tutorial's group tab returns its section.
   * Moving an existing block is not affected.
   */
  rootInsertTarget?: () => { parent: DropParent; index: number } | null;
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
  /** Closes the open block editor, if any. */
  clearSelection(): void;
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
  /** Lines a lesson before this one on the unit map stops on; an auto stop on any other line is Introduced. */
  linesBefore?: ReadonlySet<string>;
  onFlowPeer?: (lessonId: string, after: string[]) => Promise<void>;
  /** The classes that teach the unit, with this lesson's date in each. */
  flowClasses?: Array<{ id: string; name: string; date?: string }>;
  /** The lesson's route when it has none of its own: a support or extension stop on the unit map. */
  flowRole?: LessonRouteRole;
  /** Dates this lesson for a class; resolves to the unit's lessons in their new order. */
  onFlowDate?: (classId: string, date: string) => Promise<FlowPeer[]>;
  /** Set when the subject is in the syllabus alignment: tag the dot points this lesson teaches. */
  dotPoints?: { unitTitle?: string; focusArea?: string };
  onToggleFullPage?: () => void;
  /** Saves pending edits before a page tool starts Ann, who reads the saved draft. */
  flushDraft?: () => Promise<void>;
  /** Make next steps for writing boxes: the job writes the draft, then the builder reloads it. */
  nextSteps?: NextStepJobs;
  /** A page tool started an Ann job: open the chat on it. */
  onAnnStarted?: () => void;
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
  /** The lesson was just published: panels that need a published lesson (the sprint map) can appear. */
  markPublished?(at: string): void;
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
  // Which card each quiz deck shows, so a re-render stays on it.
  let deckCards = new Set<string>();
  let deckAsList = readDeckAsList();
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

  // Turn into a sleeve: the old toolkit card's item goes onto the next block
  // that can wear it, then the card goes once the teacher confirms.
  root.addEventListener(SLEEVE_CONVERT_EVENT, event => {
    event.stopPropagation();
    if (!canEdit) return;
    const cardId = (event as CustomEvent<SleeveConvertDetail>).detail.blockId;
    const result = attachCardSleeve(blocks, cardId);
    if (!result) {
      setHint(NO_SLEEVE_TARGET);
      return;
    }
    emit(result.blocks);
    const where = blockTypeLabel(result.target);
    if (window.confirm(`${result.lens.label} is now a sleeve on the ${where} block below. Remove the old card?`)) {
      if (selectedId === cardId) {
        selectedId = null;
        options.onSelect?.(null);
      }
      emit(deleteBlocksById(blocks, [cardId]));
      setHint(`${result.lens.label} moved onto the ${where} block as a sleeve.`);
    } else {
      setHint(`${result.lens.label} added as a sleeve. The old card stays until you delete it.`);
    }
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

    const block = newBlock(payload.type as InsertMenuValue);
    const redirect = options.rootInsertTarget?.();
    if (redirect) {
      insertNew(block, redirect);
      return;
    }
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

  /**
   * Adds a new block at `target`. Only page-level rows can be selected, so a
   * block added inside a section, column or tab opens its container's editor,
   * scrolled to the new block; selecting the nested id itself left nothing
   * editable on the page.
   */
  function insertNew(block: Block, target: { parent: DropParent; index: number }): void {
    const result = insertAt(blocks, target.parent, target.index, block, { rootMode });
    if (!result.ok) {
      setHint(result.message);
      return;
    }
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

  /**
   * `render()` runs on every insert and selection. Rebuilding every preview each
   * time made blocks that load (Anthology, images, charts) blank and refill, so
   * the whole lesson flashed. A block whose object hasn't changed keeps its preview.
   */
  const previews = new Map<string, { block: Block; media: Media[]; el: HTMLElement }>();
  // These read other blocks or the page's outcomes, so they are drawn fresh.
  const PAGE_DEPENDENT = new Set<string>(['discern_confirm', 'outcomes']);

  /** A new Question in a lesson type with no quiz starts as a written question. */
  function newBlock(type: InsertMenuValue): Block {
    return questionForLesson(createFromInsertMenu(type, options.idFactory()), options.editorContext?.quizRuns?.() ?? true);
  }

  function preview(block: Block): HTMLElement {
    const kept = previews.get(block.id);
    if (kept && kept.block === block && kept.media === media) return kept.el;
    const el = options.renderPreview?.(block) ?? renderBlock(block, 'teacher', { pageBlocks: blocks });
    if (block.block_type === 'tabs') {
      el.querySelectorAll('[role="tab"]').forEach((btn, index) => {
        btn.addEventListener('click', () => rememberTabsPanel(block.id, index));
      });
      applyRememberedTabsPanel(el, block.id);
    }
    if (PAGE_DEPENDENT.has(block.block_type)) previews.delete(block.id);
    else previews.set(block.id, { block, media, el });
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

    const buildRow = (block: Block, index: number): HTMLElement => {
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
      return row;
    };

    const shownCards = new Set<string>();
    for (let index = 0; index < blocks.length; ) {
      const block = blocks[index]!;
      list.append(createGap(index));
      const run = quizRunLength(blocks, index);
      if (run < 2) {
        list.append(buildRow(block, index));
        index += 1;
        continue;
      }
      // A run of quiz questions is one deck, so the page stays short.
      const runBlocks = blocks.slice(index, index + run);
      const rows = runBlocks.map((b, i) => buildRow(b, index + i));
      const has = (id: string | null) => !!id && runBlocks.some((b) => b.id === id);
      if (deckAsList) {
        list.append(deckListBar(run, () => {
          deckAsList = false;
          writeDeckAsList(false);
          render();
        }));
        rows.forEach((row, i) => {
          if (i > 0) list.append(createGap(index + i));
          list.append(row);
        });
      } else {
        const remembered = [...deckCards].find((id) => has(id)) ?? null;
        const showId = [pendingReveal, selectedId, remembered].find((id) => has(id)) ?? runBlocks[0]!.id;
        shownCards.add(showId);
        list.append(mountQuizDeck({
          blocks: runBlocks,
          rows,
          showId,
          onShow: (id) => {
            for (const b of runBlocks) deckCards.delete(b.id);
            deckCards.add(id);
            // An editor left open on a card out of view would pull the deck back to it.
            if (has(selectedId) && selectedId !== id) select(null);
          },
          onList: () => {
            deckAsList = true;
            writeDeckAsList(true);
            render();
          }
        }));
      }
      index += run;
    }
    deckCards = shownCards;

    list.append(createGap(blocks.length));
    root.append(list);
    for (const [id, kept] of previews) if (!kept.el.isConnected) previews.delete(id);
    // A kept preview's callout links were drawn against the old page.
    refreshCalloutReferences(root, blocks, 'teacher');

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
      const block = newBlock(type);
      const target = (selectedId ? null : options.rootInsertTarget?.()) ?? insertTargetForSelection(blocks, selectedId);
      insertNew(block, target);
    },
    clearSelection() {
      select(null);
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

  // Set once the quiz panel exists: a quiz question added to any lesson brings the panel up.
  let afterEmit: () => void = () => {};
  function emitLesson(next: Lesson): void {
    lesson = next;
    options.onChange(next);
    afterEmit();
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

  // Lesson type sits as a quiet chip at the head of the meta row
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
    syncTutorialPanel();
    syncSprintPanel();
    syncCasePanel();
    syncFooterNote();
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
  /** A Quiz always has the panel; any other lesson that runs quiz questions gets it once it holds a question or group set. */
  function showsQuizPanel(): boolean {
    if (resolvePedagogicalMode(lesson.pedagogical_mode) === 'quiz') return true;
    if (!quizRunsIn(lesson.pedagogical_mode)) return false;
    let found = false;
    visitBlocks(lesson.blocks, (block) => {
      if (block.block_type === 'quiz_question' || (block.block_type === 'section' && block.content.group_set)) found = true;
    });
    return found;
  }
  function syncQuizPanel(): void {
    const isQuiz = showsQuizPanel();
    if (isQuiz && !quizPanel) {
      quizPanel = mountQuizPanel({
        getLesson: () => lesson,
        idFactory: options.idFactory,
        loadGroups: async (classId) => {
          const [view, context] = await Promise.all([httpMarkbookApi.load(classId), loadInsightContext()]);
          const { evidence } = classEvidence(view, context);
          const kind = moveKind(evidence);
          return { saved: view.markbook.groups ?? [], moves: kind ? nextMoves(evidence, kind) : [], label: (t) => tagLabel(t, context) };
        },
        saveSuggestion: async (classId, tags, students) => {
          const context = await loadInsightContext();
          const view = await httpMarkbookApi.load(classId);
          const { evidence } = classEvidence(view, context);
          const label = (t: string) => tagLabel(t, context);
          const titles = new Map(view.quizzes.map((q) => [q.id, q.title] as const));
          const id = newGroupId();
          const markbook = await httpMarkbookApi.saveGroup(
            classId,
            { id, name: tags.map(label).join(' · '), tags, members: students.map((s) => ({ student: s, why: joinWhy(s, tags, evidence, titles, label) })) },
            todayInSydney()
          );
          return markbook.groups.find((g) => g.id === id)!;
        },
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
        },
        onUpdateBlock: (updated) => {
          const blocks = replaceBlockInTree(lesson.blocks, updated);
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
          const blocks = addToScene(lesson.blocks, sceneId, callout);
          if (blocks === lesson.blocks) return;
          emitLesson({ ...lesson, blocks });
          canvas.update(blocks, media);
        },
        onImportSlides: () => {
          // pdf.js and the deck reader load only when a teacher imports slides.
          void import('@/lecture/slide-import/dialog').then(({ openSlideImport }) =>
            openSlideImport({
              newId: options.idFactory,
              onAdd: (scenes) => {
                const blocks = [...lesson.blocks, ...scenes];
                emitLesson({ ...lesson, blocks });
                canvas.update(blocks, media);
              }
            })
          );
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

  // A lesson set to Tutorial gets its board (groups, live board) and the part tabs.
  // Editor only: Focus view and student pages never mount this page.
  const tutorialHost = document.createElement('div');
  tutorialHost.className = 'lesson-page__tutorial';
  let tutorialBoard: TutorialBoardHandle | null = null;
  let selectedBlockId: string | null = null;
  let tutorialTabs: ReturnType<typeof createTutorialTabs> | null = null;
  function syncTutorialPanel(): void {
    const isTutorial = resolvePedagogicalMode(lesson.pedagogical_mode) === 'tutorial';
    if (isTutorial && !tutorialBoard) {
      tutorialBoard = mountTutorialBoard({
        getLesson: () => lesson,
        api: tutorialTeacherApi(lesson.id),
        // The server has already written the move into the draft. The editor
        // sends its whole lesson on every save, so it takes the new groups too:
        // otherwise the next autosave would put the student back.
        onMoved: (summary, move) => {
          if (!lesson.tutorial) return;
          emitLesson({ ...lesson, tutorial: movedGroups(lesson.tutorial, summary, move) });
          tutorialTabs?.repaint();
        }
      });
      tutorialTabs = createTutorialTabs({ getLesson: () => lesson, onTab: showTutorialTab });
      tutorialHost.append(tutorialBoard.root, tutorialTabs.root);
      void tutorialBoard.refresh();
    } else if (!isTutorial && tutorialBoard) {
      tutorialBoard.dispose();
      tutorialBoard = null;
      tutorialTabs = null;
      tutorialHost.replaceChildren();
    }
    tutorialTabs?.repaint();
    tutorialHost.hidden = !isTutorial;
  }

  /** The tutorial tab a page-level block belongs to: its group, else Common. */
  const tabOf = (block: Block): TutorialTab => groupSection(block)?.id ?? 'common';
  const rootOf = (blockId: string): Block | undefined => {
    const rootId = rootAncestorId(lesson.blocks, blockId);
    return rootId ? lesson.blocks.find((b) => b.id === rootId) : undefined;
  };
  /** The open block editor closes when its block isn't on the new tab. */
  function showTutorialTab(tab: TutorialTab): void {
    const open = selectedBlockId ? rootOf(selectedBlockId) : undefined;
    if (open && !inTab(open, tab)) canvas.clearSelection();
    canvas.update(lesson.blocks, media);
  }
  /** On a group's tab, new blocks go at the end of that group's tab section, so they stay in view. */
  function tutorialInsertTarget(): { parent: DropParent; index: number } | null {
    // On a case study's Brief tab, new blocks land in the Brief section.
    if (caseEditor?.tabs.current() === 'brief') {
      if (!lesson.blocks.some(isCaseBriefSection)) {
        emitLesson({ ...lesson, blocks: withCaseBriefSection(lesson.blocks, options.idFactory) });
        canvas.update(lesson.blocks, media);
      }
      const section = lesson.blocks.find(isCaseBriefSection);
      if (section && section.block_type === 'section') return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
    }
    // On the Outcome tab, new blocks land in the Outcome section.
    if (caseEditor?.tabs.current() === 'outcome') {
      if (!lesson.blocks.some(isCaseOutcomeSection)) {
        emitLesson({ ...lesson, blocks: withCaseOutcomeSection(lesson.blocks, options.idFactory) });
        canvas.update(lesson.blocks, media);
      }
      const section = lesson.blocks.find(isCaseOutcomeSection);
      if (section && section.block_type === 'section') return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
    }
    // On The case tab, new blocks land in the picked part's section.
    if (caseEditor?.tabs.current() === 'case') {
      const part = caseEditor.activePart();
      if (part) {
        ensureCasePartSection(part.id, part.title);
        const section = findCasePartSection(lesson.blocks, part.id);
        if (section && section.block_type === 'section') return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
      }
    }
    // On a sprint phase tab, new blocks land in that phase's section.
    const st = sprintTabs?.current();
    if (sprintTabs && st === 'guides') {
      if (!lesson.blocks.some(isGuidesSection)) {
        emitLesson({ ...lesson, blocks: withGuidesSection(lesson.blocks, options.idFactory) });
        canvas.update(lesson.blocks, media);
      }
      const section = lesson.blocks.find(isGuidesSection);
      if (section && section.block_type === 'section') return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
    }
    if (sprintTabs && st && st !== 'kit' && st !== 'brief' && st !== 'all') {
      let section = lesson.blocks.find((b) => phaseOfSection(b) === st);
      if (!section) {
        // The phase's section was deleted: put it back, so the block lands on this tab and not in the brief.
        emitLesson({ ...lesson, blocks: withPhaseSections(lesson.blocks, options.idFactory) });
        canvas.update(lesson.blocks, media);
        section = lesson.blocks.find((b) => phaseOfSection(b) === st);
      }
      if (section && section.block_type === 'section') return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
    }
    const tab = tutorialTabs?.current();
    if (!tutorialTabs || !tab || tab === 'common' || tab === 'all') return null;
    const section = lesson.blocks.find((b) => isGroupTab(b) && groupSection(b)?.id === tab);
    if (!section || section.block_type !== 'section') {
      // No tab section to put it in: show everything so the new block is seen.
      tutorialTabs.set('all');
      return null;
    }
    return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
  }

  // A lesson set to Design Sprint gets the progress map, the Kit and the phase tabs.
  const sprintHost = document.createElement('div');
  sprintHost.className = 'lesson-page__sprint';
  let sprintTabs: ReturnType<typeof createSprintTabs> | null = null;
  let sprintKit: ReturnType<typeof mountKitEditor> | null = null;
  let sprintMap: SprintMapHandle | null = null;
  const sprintOutcomes = async (): Promise<Array<{ id: string; label: string }>> => {
    const labels = outcomeLabels(peekCurriculum()?.outcomes ?? []);
    const alignment = await loadAlignment().catch(() => null);
    const tags = dotPointOutcomes(lesson.dot_points ?? [], alignment, labels).map((t) => t.slice(4));
    const pick = tags.length ? labels.filter((l) => tags.includes(l.id)) : labels;
    return pick.map((l) => ({ id: l.id, label: `${l.code} ${l.title}` }));
  };
  function syncSprintPanel(): void {
    const isSprint = resolvePedagogicalMode(lesson.pedagogical_mode) === 'design_sprint';
    const classes = options.flowClasses ?? [];
    // A new sprint starts with the default Kit and one guide section per phase; a phase that has lost its section gets it back.
    if (isSprint && (lesson.sprint || classes.length)) {
      const seeded = seedSprint(lesson, classes[0]?.id ?? '', options.idFactory);
      // emitLesson only records the lesson, so redraw the canvas for the new sections and carry on mounting.
      if (seeded !== lesson) {
        emitLesson(seeded);
        canvas.update(lesson.blocks, media);
      }
    }
    if (isSprint && !sprintTabs) {
      sprintTabs = createSprintTabs({ onTab: showSprintTab });
      sprintKit = mountKitEditor({
        getLesson: () => lesson,
        emit: emitLesson,
        classes,
        loadRoster: (classId) => httpMarkbookApi.load(classId).then((v) => v.students.filter((s) => !s.removed)),
        outcomes: sprintOutcomes
      });
      const tryIt = document.createElement('button');
      tryIt.type = 'button';
      tryIt.className = 'btn btn--secondary sprint-try';
      tryIt.textContent = 'Try it as a student';
      tryIt.title = 'Run the whole sprint with a practice group of two. Your class sees nothing.';
      tryIt.addEventListener('click', () => openPracticeRun({ getLesson: () => lesson }));
      const bar = document.createElement('div');
      bar.className = 'sprint-edit-bar';
      bar.append(sprintTabs.root, tryIt);
      sprintHost.append(bar, sprintKit.root);
    } else if (!isSprint && sprintTabs) {
      sprintMap?.dispose();
      sprintMap = null;
      sprintKit = null;
      sprintTabs = null;
      sprintHost.replaceChildren();
    }
    // The progress map needs a published sprint; it appears on the first publish too.
    if (isSprint && sprintTabs && !sprintMap && lesson.published_at) {
      sprintMap = mountSprintMap({ getLesson: () => lesson, api: sprintTeacherApi(lesson.id), emitLesson });
      sprintHost.prepend(sprintMap.root);
      void sprintMap.refresh();
    }
    showSprintPanel();
    sprintHost.hidden = !isSprint;
  }
  /** The Kit shows on its tab; each phase tab shows that phase's panel above its own blocks. */
  function showSprintPanel(): void {
    const tab = sprintTabs?.current();
    if (!sprintKit) return;
    sprintKit.root.hidden = !tab || tab === 'brief' || tab === 'guides' || tab === 'all';
    if (tab && tab !== 'brief' && tab !== 'guides' && tab !== 'all') sprintKit.show(tab);
  }
  function showSprintTab(_tab: SprintTab): void {
    showSprintPanel();
    canvas.clearSelection();
    canvas.update(lesson.blocks, media);
  }

  // A lesson set to Case Study gets the Kit and station tabs, and the board once published.
  const caseHost = document.createElement('div');
  caseHost.className = 'lesson-page__case';
  let caseEditor: CaseEditorHandle | null = null;
  let caseBoard: CaseBoardHandle | null = null;
  /** The canvas shows on Brief (the Brief section's blocks), Decide (every other block) and All. */
  function showCaseCanvas(): void {
    const tab = caseEditor?.tabs.current();
    canvasHost.hidden = !!caseEditor && tab !== 'brief' && tab !== 'case' && tab !== 'decide' && tab !== 'outcome' && tab !== 'all';
  }
  /** A part's blocks live in a top-level section tagged with its id; made the first time the teacher adds to that part. */
  function ensureCasePartSection(partId: string, title: string): void {
    if (findCasePartSection(lesson.blocks, partId)) return;
    emitLesson({ ...lesson, blocks: withCasePartSection(lesson.blocks, partId, title, options.idFactory) });
    canvas.update(lesson.blocks, media);
  }
  function syncCasePanel(): void {
    const isCase = resolvePedagogicalMode(lesson.pedagogical_mode) === 'case_study';
    if (isCase && !lesson.case) emitLesson({ ...lesson, case: seedCase({ route_role: lesson.route_role ?? options.flowRole }) });
    // The Brief tab needs a section to hold its blocks; emitLesson only records the lesson, so redraw the canvas.
    if (isCase && !lesson.blocks.some(isCaseBriefSection)) {
      emitLesson({ ...lesson, blocks: withCaseBriefSection(lesson.blocks, options.idFactory) });
      canvas.update(lesson.blocks, media);
    }
    if (isCase && !caseEditor) {
      caseEditor = mountCaseEditor({
        getLesson: () => lesson,
        emitLesson,
        classes: options.flowClasses ?? [],
        onTab: () => {
          showCaseCanvas();
          canvas.clearSelection();
          canvas.update(lesson.blocks, media);
        },
        onPartBlocks: (partId, title) => {
          ensureCasePartSection(partId, title);
          const section = findCasePartSection(lesson.blocks, partId);
          if (section) canvasHost.querySelector(`[data-block-id="${section.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      caseHost.append(caseEditor.root);
    } else if (!isCase && caseEditor) {
      caseBoard?.dispose();
      caseBoard = null;
      caseEditor.dispose();
      caseEditor = null;
      caseHost.replaceChildren();
    }
    if (isCase && caseEditor && !caseBoard && lesson.published_at) {
      caseBoard = mountCaseBoard({ api: caseTeacherApi(lesson.id), getLesson: () => lesson });
      caseHost.prepend(caseBoard.root);
      void caseBoard.refresh();
    }
    showCaseCanvas();
    caseHost.hidden = !isCase;
  }

  if (showPageMenu) root.append(chrome);
  // Students end every lesson on the footer (lesson-footer.ts), so no block is needed for it.
  const footerNote = document.createElement('p');
  footerNote.className = 'lesson-page__footer-note';
  function syncFooterNote(): void {
    footerNote.textContent =
      resolvePedagogicalMode(lesson.pedagogical_mode) === 'quiz'
        ? 'Students see Previous and Next under the quiz. Handing it in marks it done.'
        : 'Students see Previous, a tick to finish, and Next under every lesson.';
  }
  syncFooterNote();
  root.append(coverHost, metaRow, quizHost, lectureHost, tutorialHost, sprintHost, caseHost, canvasHost, footerNote);

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
  let rosterNames = new Map<string, string>();
  const groupSetTools = createGroupSetTools({
    getBlocks: () => lesson.blocks,
    onBlocks: (blocks) => {
      emitLesson({ ...lesson, blocks });
      canvas.update(blocks, media);
    },
    idFactory: options.idFactory,
    names: () => rosterNames,
    refreshMembers: async (config) => {
      const view = await httpMarkbookApi.load(config.class_id);
      rosterNames = new Map(view.students.map((s) => [s.id, s.initials] as const));
      const group = (view.markbook.groups ?? []).find((g) => g.id === config.group_id);
      return group ? activeMembers(group) : [];
    },
    onError: (error) => console.error(error),
    startAnn: async (sectionId, config) => {
      // Ann reads the saved draft, so a set added a moment ago must be saved first.
      await options.flushDraft?.();
      const context = await loadInsightContext();
      const view = await httpMarkbookApi.load(config.class_id);
      const { evidence } = classEvidence(view, context);
      const label = (t: string) => tagLabel(t, context);
      const inGroup = new Set(config.students);
      const mistakes = config.tags.flatMap((tag) =>
        mixUps(evidence.filter((e) => inGroup.has(e.student) && e.tags.includes(tag)), tag.slice(0, tag.indexOf(':')) as TagKind)
          .slice(0, 3)
          .map((m) => `- ${mixUpText(m, label, (id) => codeLabel(id, context.codes))} (${m.count} ${m.count === 1 ? 'student' : 'students'})`)
      );
      await startAnn(lesson.id, groupSetBrief({ sectionId, config, label, lessonTitle: lesson.title, mistakes }));
      // The job runs on the server; the chat shows it and carries Ann's draft to accept.
      options.onAnnStarted?.();
    }
  });
  const canvas = mountBlockCanvas(canvasHost, {
    decorateRow: (row, block) => {
      // Tabs hide page-level rows only; what's inside a section is left alone.
      if (tutorialTabs && lesson.blocks.some((b) => b.id === block.id)) row.hidden = !inTab(block, tutorialTabs.current());
      if (sprintTabs && lesson.blocks.some((b) => b.id === block.id)) row.hidden = !inSprintTab(block, sprintTabs.current());
      if (caseEditor && lesson.blocks.some((b) => b.id === block.id)) row.hidden = !inCaseTab(block, caseEditor.tabs.current());
      classExamples.decorate(row, block);
      pulse.decorate(row, block);
      lectureTools.decorate(row, block);
      if (showsQuizPanel()) groupSetTools.decorate(row, block);
    },
    blocks: lesson.blocks,
    media,
    editorContext: { lessonId: lesson.id, pageTypes: pageBlockTypes(LESSON_BLOCK_GROUPS), quizRuns: () => quizRunsIn(lesson.pedagogical_mode), ...(options.nextSteps ? { nextSteps: options.nextSteps } : {}) },
    onChange: (blocks) => {
      emitLesson({ ...lesson, blocks });
    },
    onSelect: (blockId) => {
      selectedBlockId = blockId;
      options.onSelect?.(blockId);
    },
    rootInsertTarget: tutorialInsertTarget,
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
        attachedOutcomes: publicOutcomesForPage(lesson, options.outcomesCatalog ?? []),
        loadAnthology: () => teacherUnitAnthology(lesson.unit_id)
      })
  });

  syncQuizPanel();
  afterEmit = syncQuizPanel;
  syncLecturePanel();
  syncTutorialPanel();
  syncSprintPanel();
  syncCasePanel();
  if (tutorialTabs || sprintTabs || caseEditor) canvas.update(lesson.blocks, media);

  // Dot points, lines, tagged outcomes and what they ask for, in one card under the meta row.
  const syllabus = mountLessonSyllabus(document.createElement('div'));
  metaRow.after(syllabus.element);
  const stripHost = syllabus.outcomes;

  // Every dot's counts in one panel above the canvas, opened from the meta row.
  // The questions after the finish tick sit at the foot of the same panel: settings, then answers.
  const endQuestions = mountEndQuestions({
    lessonId: lesson.id,
    getLesson: () => lesson,
    onChange: (next) => emitLesson({ ...lesson, end_questions: next })
  });
  const pulseSummary = mountPulseSummary({
    pulse,
    getBlocks: () => lesson.blocks,
    isLessonOff: () => lesson.feedback_off === true,
    extra: { element: endQuestions.element, onOpen: endQuestions.refresh }
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
    ? mountLineChips(syllabus.lines, {
        lines: networkLines,
        onPaint: (served) => syllabus.setSummary({ lines: served }),
        stops: lesson.line_stops,
        off: lesson.line_off,
        ...(options.linesBefore ? { linesBefore: options.linesBefore } : {}),
        onChange: (stops, off) => emitLesson({ ...lesson, line_stops: stops, line_off: off })
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
        role: lesson.route_role ?? options.flowRole,
        skipRule: lesson.skip_rule ?? undefined,
        branchFrom: lesson.branch_from ?? undefined,
        preUnit: lesson.pre_unit ?? undefined,
        onSelf: (patch) => emitLesson({ ...lesson, ...patch }),
        onPeer: options.onFlowPeer,
        ...(options.flowClasses ? { classes: options.flowClasses } : {}),
        ...(options.onFlowDate ? { onDate: options.onFlowDate } : {})
      })
    : null;

  const dotPoints = options.dotPoints
    ? mountLessonDotPoints(syllabus.points, {
        dotPoints: lesson.dot_points,
        ...options.dotPoints,
        planHost: syllabus.plan,
        covered: lesson.plan_covered,
        onCovered: (covered) => emitLesson({ ...lesson, plan_covered: covered }),
        onPaint: ({ points, outcomes, plan }) => syllabus.setSummary({ points, outcomes, plan }),
        // The dot points carry the lesson's lines; hand-set stops and lines taken off stay as they are.
        onChange: (refs, ctx) => {
          const stops = syncAutoStops(lesson.line_stops, lesson.line_off, autoLineIds(networkLines, ctx, refs));
          emitLesson({ ...lesson, dot_points: refs, line_stops: stops });
          lineChips?.update(stops, lesson.line_off);
        }
      })
    : null;
  if (!strip && !lineChips && !dotPoints) syllabus.element.hidden = true;

  return {
    update(next: Lesson, nextMedia?: Media[]) {
      lesson = next;
      dotPoints?.update(lesson.dot_points, lesson.plan_covered ?? []);
      lessonFlow?.update(lesson.after_lesson_ids ?? undefined, lesson.route_role ?? options.flowRole, lesson.skip_rule ?? undefined, lesson.branch_from ?? undefined, lesson.pre_unit ?? undefined);
      if (nextMedia) media = nextMedia;
      titleEditor.update(lesson.title);
      modeSelect.value = resolvePedagogicalMode(lesson.pedagogical_mode);
      syncQuizPanel();
      syncLecturePanel();
      syncTutorialPanel();
    syncSprintPanel();
      syncCasePanel();
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
      lineChips?.update(lesson.line_stops, lesson.line_off);
    },
    insertType(type: InsertMenuValue) {
      canvas.insertType(type);
    },
    markPublished(at: string) {
      lesson = { ...lesson, published_at: at };
      syncSprintPanel();
      syncCasePanel();
    },
    revealPublishBlock(blockId: string, errorIds?: string[]) {
      // A publish issue on another tutorial tab: open that tab first.
      const target = blockId ? rootOf(blockId) : undefined;
      if (tutorialTabs && target && !inTab(target, tutorialTabs.current())) tutorialTabs.set(tabOf(target));
      if (sprintTabs && target && !inSprintTab(target, sprintTabs.current())) sprintTabs.set(isGuidesSection(target) ? 'guides' : phaseOfSection(target) ?? 'brief');
      if (caseEditor && target && !inCaseTab(target, caseEditor.tabs.current())) caseEditor.tabs.set(isCaseBriefSection(target) ? 'brief' : casePartOf(target) ? 'case' : isCaseOutcomeSection(target) ? 'outcome' : 'decide');
      canvas.revealPublishBlock(blockId, errorIds);
    },
    dispose() {
      quizPanel?.dispose();
      lecturePanel?.dispose();
      tutorialBoard?.dispose();
      tutorialBoard = null;
      sprintMap?.dispose();
      sprintMap = null;
      caseBoard?.dispose();
      caseBoard = null;
      caseEditor?.dispose();
      classExamples.dispose();
      pulseSummary.dispose();
      pulse.dispose();
      canvas.dispose();
      strip?.dispose();
      lineChips?.dispose();
      lessonFlow?.dispose();
      dotPoints?.dispose();
      syllabus.dispose();
      titleEditor.dispose();
      banner.dispose();
      optionsMenu.dispose();
      root.remove();
    }
  };
}
