import { navigate } from '@/app/router';
import { apiGet, apiPost, ApiClientError } from '@/api/client';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { agentColour, readLastAgentSlug, type AgentSlug } from '@/ai/agents';
import type { AiProposal, AiScope } from '@/ai/proposals';
import { insertCompositionRoot } from '@/blocks/composition-insert';
import {
  createLinkedSectionStub,
  isCompositionUsable,
  isLinkedSection
} from '@/blocks/composition-link';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { createFromInsertMenu } from '@/blocks/create-block';
import { findBlockById } from '@/blocks/find-block';
import { openPrintLesson } from '@/print/open-print';
import { downloadPortableExport } from '@/teacher/export-api';
import type { CompositionSummary, CompositionTemplate } from '@/schemas/composition';
import { formatPublishBlockIssue, listPublishBlockIssues, type Lesson } from '@/schemas/lesson';
import type { Media } from '@/schemas/media';
import {
  mountHistoryPanel,
  type HistoryPanelHandle
} from '@/teacher/history-panel';
import { mountPublicLinkControl, publicStudentPath } from '@/teacher/public-link';
import {
  buildLinkedPreview,
  ensureCompositionCached,
  openEditSourceModal,
  type CompositionCache
} from '@/teacher/lesson-editor-compositions';
import { mountAiPanel, type AiPanelHandle } from '@/teacher/ai-panel';
import { mountAlchemyLabPanel, type AlchemyLabHandle } from '@/teacher/alchemy-lab-panel';
import { blockQueryText } from '@/alchemy/blockQueryText';
import {
  mountLessonPage,
  type LessonPageHandle
} from '@/teacher/lesson-canvas/mount-page';
import {
  mountLessonPalette,
  type LessonPaletteHandle,
  type PaletteInsertPayload
} from '@/teacher/lesson-canvas/mount-palette';
import { lessonPaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import {
  readBuilderChromePrefs,
  writeBuilderChromePrefs,
  type ShelfState
} from '@/teacher/lesson-canvas/prefs';
import {
  applyBuilderFullPageState,
  bindBuilderFullPage,
  fullPageExitHtml,
  shouldExitBuilderFullPage
} from '@/teacher/lesson-canvas/builderFullPage';
import { insertAt, nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { replaceBlockInTree } from '@/ai/block-tree';
import { openNameModal } from '@/teacher/create/name-modal';
import { createLessonTemplate } from '@/teacher/template-api';
import { fetchCurriculum } from '@/teacher/nav';
import { renderContextBar, type TeacherShellRefs } from '@/teacher/shell';
import { mountSavePublishControls, SaveController, type SavePublishHandle } from '@/teacher/save-publish';
import { confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';

export interface LessonEditorHandle {
  /**
   * Cancels any pending autosave debounce and, if there are unsaved (or
   * in-flight) edits, returns a promise that resolves once the draft has
   * been fully persisted. Callers must await this before calling `dispose`
   * — disposing while a flush is still pending can drop a queued resave.
   */
  flush(): Promise<void>;
  /** Tears down subscriptions/timers. Only call after awaiting `flush`. */
  dispose(): void;
  /** Triggers print for the current lesson. */
  openA4Preview(): void;
  /** Runs the existing save/publish control path when the editor is ready. */
  publish(): void;
}

export interface MountLessonEditorOptions {
  refs: TeacherShellRefs;
  lessonId: string;
  /** Returns true if this mount has been superseded by a newer route. */
  isStale: () => boolean;
  /** Image media for cover library picker. */
  media?: Media[];
}

function renderStatus(canvas: HTMLElement, text: string): void {
  canvas.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  canvas.append(status);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * Loads a lesson draft and renders the teacher builder: palette rail, page
 * canvas, and always-on AI chat, plus save/publish controls in the context bar.
 */
export function mountLessonEditor(options: MountLessonEditorOptions): LessonEditorHandle {
  const { refs, lessonId, isStale, media = [] } = options;

  let disposed = false;
  let saveController: SaveController | null = null;
  let savePublishHandle: SavePublishHandle | null = null;
  let historyPanel: HistoryPanelHandle | null = null;
  let publicLinkDispose: (() => void) | null = null;
  let closeEditSourceModal: (() => void) | null = null;
  let editSourceOpenSeq = 0;
  let aiPanel: AiPanelHandle | null = null;
  let alchemyLab: AlchemyLabHandle | null = null;
  let page: LessonPageHandle | null = null;
  let palette: LessonPaletteHandle | null = null;
  let removeChromeKeys: (() => void) | null = null;
  let printLesson: (() => void) | null = null;
  let exitFullPageMode: (() => void) | null = null;
  let pageOptionsDispose: (() => void) | null = null;

  renderStatus(refs.canvas, 'Loading lesson…');

  void Promise.all([apiGet<Lesson>(`/api/lessons/${lessonId}`), fetchCurriculum()])
    .then(([lesson, curriculum]) => {
      if (disposed || isStale()) return;
      renderEditor(lesson, curriculum);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Lesson not found.'
          : 'Unable to load lesson. Please refresh to try again.';
      renderStatus(refs.canvas, message);
    });

  function renderEditor(initialLesson: Lesson, curriculum: Awaited<ReturnType<typeof fetchCurriculum>>): void {
    const lesson: Lesson = initialLesson;
    let nextId = nextBlockIdFactory(`block_${lesson.id}`, lesson.blocks);
    let mediaList: Media[] = media;
    let selectedBlockId: string | null = null;
    let draftAt = lesson.updated_at;

    renderContextBar(refs, {
      title: 'Lesson',
      variant: 'editor'
    });
    refs.canvas.replaceChildren();

    const builder = document.createElement('div');
    builder.className = 'lesson-builder lesson-builder--chat-shelved';

    const railHost = document.createElement('div');
    railHost.className = 'lesson-builder__rail';

    const pageCol = document.createElement('div');
    pageCol.className = 'lesson-builder__page';

    const chatCol = document.createElement('div');
    chatCol.className = 'lesson-builder__chat';

    const chatFab = document.createElement('button');
    chatFab.type = 'button';
    chatFab.className = 'lesson-builder__chat-fab';
    chatFab.setAttribute('aria-label', 'Open chat');
    chatFab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.2V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"/></svg>';

    const aiHost = document.createElement('div');
    const labHost = document.createElement('div');
    labHost.hidden = true;

    const publishPanel = document.createElement('div');
    publishPanel.className = 'lesson-editor__publish-panel';
    publishPanel.hidden = true;

    const pageHost = document.createElement('div');

    const compositionStatus = document.createElement('p');
    compositionStatus.className = 'lesson-editor__composition-status';
    compositionStatus.hidden = true;

    pageCol.append(publishPanel, pageHost, compositionStatus);
    chatCol.append(aiHost, labHost);
    builder.append(railHost, pageCol, chatCol, chatFab);
    builder.insertAdjacentHTML('beforeend', fullPageExitHtml(false));
    refs.canvas.append(builder);

    function paintChatFab(slug: AgentSlug): void {
      chatFab.style.setProperty('--agent-accent', agentColour(slug));
      chatFab.dataset.agent = slug;
    }
    paintChatFab(readLastAgentSlug());

    function assignLesson(next: Lesson): void {
      lesson.title = next.title;
      lesson.blocks = next.blocks;
      if (next.pedagogical_mode) {
        lesson.pedagogical_mode = next.pedagogical_mode;
      } else {
        delete lesson.pedagogical_mode;
      }
      if (next.cover) {
        lesson.cover = next.cover;
      } else {
        delete lesson.cover;
      }
      if (next.outcome_ids) {
        lesson.outcome_ids = next.outcome_ids;
        lesson.syllabus_outcomes = next.outcome_ids;
      } else {
        delete lesson.outcome_ids;
      }
    }

    function bumpDraftClock(): void {
      const now = new Date().toISOString();
      draftAt = now > draftAt ? now : new Date(Date.parse(draftAt) + 1).toISOString();
    }

    function markDirty(): void {
      bumpDraftClock();
      saveController?.notifyChange();
    }

    function persistChrome(): void {
      writeBuilderChromePrefs({
        ...readBuilderChromePrefs(),
        rail: builder.classList.contains('lesson-builder--rail-shelved') ? 'shelved' : 'open',
        chat: builder.classList.contains('lesson-builder--chat-shelved') ? 'shelved' : 'open'
      });
    }

    function setRailShelved(shelved: boolean): void {
      builder.classList.toggle('lesson-builder--rail-shelved', shelved);
      palette?.setShelved(shelved);
      persistChrome();
    }

    let columnMode: 'chat' | 'lab' = 'chat';
    let fullPage = false;
    let shelfBeforeFullPage: { rail: ShelfState; chat: ShelfState } | null = null;
    const layout = refs.root.querySelector<HTMLElement>('.teacher-layout') ?? refs.root;

    function readShelfStates(): { rail: ShelfState; chat: ShelfState } {
      return {
        rail: builder.classList.contains('lesson-builder--rail-shelved') ? 'shelved' : 'open',
        chat: builder.classList.contains('lesson-builder--chat-shelved') ? 'shelved' : 'open'
      };
    }

    function applyFullPageState(): void {
      applyBuilderFullPageState(builder, layout, document.body, fullPage);
    }

    function setFullPage(on: boolean): void {
      if (on === fullPage) return;
      if (on) {
        shelfBeforeFullPage = readShelfStates();
        setRailShelved(true);
        setChatShelved(true);
        fullPage = true;
      } else {
        fullPage = false;
        const restore = shelfBeforeFullPage;
        shelfBeforeFullPage = null;
        if (restore) {
          setRailShelved(restore.rail === 'shelved');
          setChatShelved(restore.chat === 'shelved');
        }
      }
      applyFullPageState();
    }

    function toggleFullPage(): void {
      setFullPage(!fullPage);
    }

    exitFullPageMode = () => setFullPage(false);

    function selectedQuery(): { text: string; hasSelection: boolean } {
      const selected = selectedBlockId ? findBlockById(lesson.blocks, selectedBlockId) : null;
      return { text: blockQueryText(selected), hasSelection: Boolean(selected) };
    }

    function setChatShelved(shelved: boolean): void {
      builder.classList.toggle('lesson-builder--chat-shelved', shelved);
      aiPanel?.setShelved(shelved);
      chatFab.hidden = !shelved;
      persistChrome();
    }

    function showColumn(mode: 'chat' | 'lab'): void {
      columnMode = mode;
      aiHost.hidden = mode !== 'chat';
      labHost.hidden = mode !== 'lab';
      setChatShelved(false);
      if (mode === 'lab') {
        const query = selectedQuery();
        alchemyLab?.open(query.text);
        alchemyLab?.setSelectionText(query.text, query.hasSelection);
      }
    }

    function openAlchemyLab(): void {
      if (
        columnMode === 'lab' &&
        !builder.classList.contains('lesson-builder--chat-shelved')
      ) {
        labHost.querySelector('textarea')?.focus();
        return;
      }
      showColumn('lab');
    }

    function syncAiSelection(): void {
      const query = selectedQuery();
      alchemyLab?.setSelectionText(query.text, query.hasSelection);
      if (!selectedBlockId) {
        aiPanel?.setSelection({ blockId: null, blockType: null, scope: 'lesson' });
        return;
      }
      const block = findBlockById(lesson.blocks, selectedBlockId);
      const scope: AiScope = block?.block_type === 'section' ? 'section' : 'block';
      aiPanel?.setSelection({
        blockId: selectedBlockId,
        blockType: block?.block_type ?? null,
        scope
      });
    }

    const compositionCache: CompositionCache = new Map();
    const compositionFetchInFlight = new Set<string>();

    function setCompositionStatus(text: string | null): void {
      if (!text) {
        compositionStatus.hidden = true;
        compositionStatus.textContent = '';
        return;
      }
      compositionStatus.hidden = false;
      compositionStatus.textContent = text;
    }

    function queueCompositionFetch(compositionId: string): void {
      ensureCompositionCached({
        compositionId,
        cache: compositionCache,
        inFlight: compositionFetchInFlight,
        onSettled: () => {
          if (!disposed && !isStale()) {
            page?.update(lesson);
          }
        }
      });
    }

    function applyBlocks(nextBlocks: Lesson['blocks']): void {
      lesson.blocks = nextBlocks;
      page?.update(lesson);
      markDirty();
    }

    async function refreshCompositions(): Promise<void> {
      try {
        const data = await apiGet<{ compositions: CompositionSummary[] }>('/api/compositions');
        palette?.updateFamilies(lessonPaletteFamilies(data.compositions));
      } catch {
        palette?.updateFamilies(lessonPaletteFamilies([]));
        setCompositionStatus('Unable to load compositions.');
      }
    }

    async function saveBlockAsComposition(blockId: string): Promise<void> {
      const block = findBlockById(lesson.blocks, blockId);
      if (!block || block.block_type !== 'section' || isLinkedSection(block)) return;
      const defaultTitle = block.content.title.trim() || 'Composition';
      const title = window.prompt('Composition name', defaultTitle);
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed) {
        setCompositionStatus('Composition name is required.');
        return;
      }
      try {
        await apiPost<CompositionTemplate>('/api/compositions', {
          title: trimmed,
          root: block
        });
        setCompositionStatus(`Saved “${trimmed}” as a composition.`);
        await refreshCompositions();
      } catch {
        setCompositionStatus('Unable to save composition.');
      }
    }

    function saveLessonAsTemplate(): void {
      const suggested = lesson.title.trim() || 'Lesson template';
      openNameModal({
        title: 'Save as lesson template',
        label: 'Title',
        defaultValue: suggested,
        confirmLabel: 'Save',
        onConfirm: async (trimmed) => {
          try {
            await createLessonTemplate({
              title: trimmed,
              blocks: cloneBlocksWithNewIds(lesson.blocks)
            });
            setCompositionStatus(`Saved “${trimmed}” as a lesson template.`);
          } catch {
            setCompositionStatus('Unable to save lesson template.');
            throw new Error('Unable to save lesson template.');
          }
        }
      });
    }

    async function insertSelectedComposition(id: string): Promise<void> {
      if (!id) return;
      try {
        const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
        const clone = insertCompositionRoot(full.root, nextId);
        const result = insertAt(lesson.blocks, { kind: 'root' }, lesson.blocks.length, clone);
        if (!result.ok) {
          setCompositionStatus(result.message);
          return;
        }
        applyBlocks(result.blocks);
        setCompositionStatus(`Inserted “${full.title}”.`);
      } catch {
        setCompositionStatus('Unable to insert composition.');
      }
    }

    async function insertLinkedComposition(id: string): Promise<void> {
      if (!id) return;
      try {
        const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
        if (!isCompositionUsable(full)) {
          setCompositionStatus('Composition is not available to link.');
          return;
        }
        const stub = createLinkedSectionStub({
          id: nextId(),
          sourceCompositionId: full.id,
          titleHint: full.title
        });
        compositionCache.set(full.id, full);
        const result = insertAt(lesson.blocks, { kind: 'root' }, lesson.blocks.length, stub);
        if (!result.ok) {
          setCompositionStatus(result.message);
          return;
        }
        applyBlocks(result.blocks);
        setCompositionStatus(`Linked “${full.title}”.`);
      } catch {
        setCompositionStatus('Unable to link composition.');
      }
    }

    async function detachLinkedSection(blockId: string): Promise<void> {
      const block = findBlockById(lesson.blocks, blockId);
      if (!block || !isLinkedSection(block)) return;
      try {
        const full = await apiGet<CompositionTemplate>(
          `/api/compositions/${block.content.link.source_composition_id}`
        );
        if (!isCompositionUsable(full)) {
          setCompositionStatus('Unable to detach — composition missing or archived.');
          return;
        }
        const independent = insertCompositionRoot(full.root, nextId);
        applyBlocks(replaceBlockInTree(lesson.blocks, blockId, independent));
        setCompositionStatus('Detached composition into this lesson.');
      } catch {
        setCompositionStatus('Unable to detach composition.');
      }
    }

    function openEditSource(compositionId: string): void {
      closeEditSourceModal?.();
      closeEditSourceModal = null;
      const openSeq = ++editSourceOpenSeq;
      void openEditSourceModal({
        compositionId,
        media: mediaList,
        setStatus: setCompositionStatus,
        onSaved: (updated) => {
          compositionCache.set(updated.id, updated);
          setCompositionStatus(`Saved “${updated.title}”.`);
          page?.update(lesson);
        }
      }).then((modal) => {
        if (disposed || isStale() || openSeq !== editSourceOpenSeq) {
          modal.close();
          return;
        }
        closeEditSourceModal = () => {
          modal.close();
          closeEditSourceModal = null;
        };
      });
    }

    function onPaletteInsert(payload: PaletteInsertPayload): void {
      if (payload.kind === 'composition') {
        palette?.showCompositionConfirm(payload.id);
        return;
      }
      palette?.hideCompositionConfirm();
      if (page) {
        page.insertType(payload.type);
        return;
      }
      const block = createFromInsertMenu(payload.type, nextId());
      const result = insertAt(lesson.blocks, { kind: 'root' }, lesson.blocks.length, block);
      if (!result.ok) {
        setCompositionStatus(result.message);
        return;
      }
      applyBlocks(result.blocks);
    }

    palette = mountLessonPalette(railHost, {
      families: lessonPaletteFamilies([]),
      onInsert: onPaletteInsert,
      onCompositionChoice: (id, mode) => {
        if (mode === 'copy') void insertSelectedComposition(id);
        else void insertLinkedComposition(id);
      },
      onShelved: (shelved) => {
        builder.classList.toggle('lesson-builder--rail-shelved', shelved);
      }
    });

    page = mountLessonPage(pageHost, {
      lesson,
      media: mediaList,
      outcomesCatalog: curriculum.outcomes ?? [],
      subject: (() => {
        const unit = curriculum.units.find((entry) => entry.id === lesson.unit_id);
        return unit
          ? curriculum.subjects.find((entry) => entry.id === unit.subject_id)
          : undefined;
      })(),
      onChange: (next) => {
        assignLesson(next);
        markDirty();
        const titleEl = refs.contextBar.querySelector('.teacher-layout__context-bar-title');
        if (titleEl) titleEl.textContent = 'Lesson';
      },
      onPrint: () => openPrintLesson(lesson),
      onSelect: (blockId) => {
        selectedBlockId = blockId;
        syncAiSelection();
      },
      idFactory: nextId,
      onSaveTemplate: () => {
        void saveLessonAsTemplate();
      },
      onExport: () => {
        void downloadPortableExport('lesson', lesson.id, lesson.slug).catch(() => {
          window.alert('Unable to export this lesson.');
        });
      },
          onTrash: () => {
        confirmAndTrash('lesson', lesson.id, lesson.title, () => {
          navigate('/lessons');
        });
      },
      onSaveComposition: (blockId) => {
        void saveBlockAsComposition(blockId);
      },
      onEditSource: openEditSource,
      onDetachComposition: (blockId) => {
        void detachLinkedSection(blockId);
      },
      onCompositionDrop: (id) => {
        palette?.showCompositionConfirm(id);
      },
      renderLinkedPreview: (compositionId) =>
        buildLinkedPreview(compositionId, compositionCache, queueCompositionFetch),
      onToggleFullPage: toggleFullPage
    });

    printLesson = () => openPrintLesson(lesson);

    aiPanel = mountAiPanel(aiHost, {
      lessonId,
      getSnapshotAt: () => draftAt,
      onAcceptProposal: (proposal: AiProposal) => {
        const result = applyProposalToLesson(lesson, proposal, nextId);
        if (!result.ok) return result;
        assignLesson(result.lesson);
        nextId = nextBlockIdFactory(`block_${lesson.id}`, lesson.blocks);
        bumpDraftClock();
        page?.update(lesson);
        const titleEl = refs.contextBar.querySelector('.teacher-layout__context-bar-title');
        if (titleEl) titleEl.textContent = 'Lesson';
        void saveController?.saveNow({ checkpointReason: 'ai_accepted' });
        return { ok: true };
      },
      onStaleAccept: (apply) => {
        if (
          window.confirm(
            'You edited while the plan was built. Accept replaces the lesson with this plan.'
          )
        ) {
          apply();
        }
      },
      onWorkingChange: (working) => {
        chatFab.classList.toggle('lesson-builder__chat-fab--working', working);
      },
      onAgentChange: (slug) => {
        paintChatFab(slug);
      },
      onRequestShelve: () => setChatShelved(true),
      flushDraft: () => saveController?.flush() ?? Promise.resolve()
    });

    alchemyLab = mountAlchemyLabPanel(labHost, {
      onHide: () => setChatShelved(true)
    });

    syncAiSelection();

    const prefs = readBuilderChromePrefs();
    if (prefs.rail === 'shelved') setRailShelved(true);
    setChatShelved(prefs.chat === 'shelved');

    chatFab.addEventListener('click', () => showColumn('chat'));

    function onWindowKeydown(event: KeyboardEvent): void {
      if (disposed || isTypingTarget(event.target)) return;
      if (shouldExitBuilderFullPage(event.key, fullPage)) {
        event.preventDefault();
        if (!builder.classList.contains('lesson-builder--chat-shelved')) {
          setChatShelved(true);
          return;
        }
        setFullPage(false);
        return;
      }
      if (event.key === '[') {
        event.preventDefault();
        setRailShelved(!builder.classList.contains('lesson-builder--rail-shelved'));
      } else if (event.key === ']') {
        event.preventDefault();
        setChatShelved(!builder.classList.contains('lesson-builder--chat-shelved'));
      }
    }

    window.addEventListener('keydown', onWindowKeydown);
    removeChromeKeys = () => {
      window.removeEventListener('keydown', onWindowKeydown);
    };

    void refreshCompositions();

    void fetchCurriculum()
      .then((curriculum) => {
        if (disposed || isStale()) return;
        mediaList = curriculum.media;
        page?.update(lesson, mediaList);
        const unit = curriculum.units.find((row) => row.id === lesson.unit_id);
        const klass = curriculum.classes.find(
          (row) =>
            row.current_unit_id === lesson.unit_id || row.active_unit_ids.includes(lesson.unit_id)
        );
        const crumb = [klass?.code, unit?.title].filter(Boolean).join(' · ');
        const crumbEl = refs.contextBar.querySelector<HTMLElement>(
          '.teacher-layout__context-bar-crumb'
        );
        if (crumbEl && crumb) {
          crumbEl.textContent = crumb;
          crumbEl.hidden = false;
        }
      })
      .catch(() => {
        /* library picker stays empty */
      });

    function showPublishSuccess(_studentPath: string): void {
      const publishedAt = new Date().toISOString();
      lesson.published_at = publishedAt;

      publishPanel.replaceChildren();
      publishPanel.hidden = true;
      publishPanel.classList.remove(
        'lesson-editor__publish-panel--error',
        'lesson-editor__publish-panel--success'
      );
      refreshPublicLink();
      const preview = refs.contextBar.querySelector<HTMLAnchorElement>('.context-bar__preview');
      if (preview) {
        preview.href = publicStudentPath('lesson', lesson.id);
        preview.setAttribute('aria-disabled', 'false');
        preview.tabIndex = 0;
        preview.classList.remove('is-disabled');
      }
      page?.revealPublishBlock('', []);
    }

    const publicLinkHost = document.createElement('div');
    publicLinkHost.className = 'lesson-editor__public-link';

    function refreshPublicLink(): void {
      publicLinkDispose?.();
      publicLinkDispose = mountPublicLinkControl(publicLinkHost, {
        kind: 'lesson',
        id: lesson.id,
        published: Boolean(lesson.published_at),
        label: 'Share',
        trigger: 'labelled',
        lead: 'Currently live at (last published version):',
        copyLabel: 'Copy link',
        openLabel: 'Open student view'
      }).dispose;
    }

    function showPublishIssues(apiIssues: string[]): void {
      const local = listPublishBlockIssues(lesson.blocks);
      const errorIds = local.map((issue) => issue.blockId);

      publishPanel.replaceChildren();
      publishPanel.hidden = false;
      publishPanel.classList.remove('lesson-editor__publish-panel--success');
      publishPanel.classList.add('lesson-editor__publish-panel--error');

      const heading = document.createElement('p');
      heading.textContent = "This lesson can't be published yet:";

      const list = document.createElement('ul');
      list.className = 'lesson-editor__publish-issues';

      const titleIssues = apiIssues.filter((issue) => {
        const lower = issue.toLowerCase();
        return lower.includes('title is required') || issue.startsWith('title:');
      });
      const lines: Array<{ text: string; blockId?: string }> = [
        ...titleIssues.map((text) => ({ text })),
        ...local.map((issue) => ({
          text: formatPublishBlockIssue(issue),
          blockId: issue.blockId
        }))
      ];
      if (lines.length === 0) {
        for (const issue of apiIssues) lines.push({ text: issue });
      }

      for (const line of lines) {
        const item = document.createElement('li');
        if (line.blockId) {
          const jump = document.createElement('button');
          jump.type = 'button';
          jump.className = 'btn btn--ghost lesson-editor__publish-jump';
          jump.textContent = line.text;
          jump.addEventListener('click', () => {
            page?.revealPublishBlock(line.blockId!, errorIds);
          });
          item.append(jump);
        } else {
          item.textContent = line.text;
        }
        list.append(item);
      }

      publishPanel.append(heading, list);
      publishPanel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const first = local[0];
      if (first) page?.revealPublishBlock(first.blockId, errorIds);
    }

    saveController = new SaveController({
      lessonId: lesson.id,
      hasPublishedVersion: Boolean(lesson.published_at),
      debounceMs: 600,
      getLesson: () => lesson
    });

    savePublishHandle = mountSavePublishControls({
      contextBar: refs.contextBar,
      controller: saveController,
      onPublishSuccess: showPublishSuccess,
      onPublishFailure: showPublishIssues,
      getPublishMediaContext: () => ({
        blocks: lesson.blocks,
        media: mediaList
      })
    });

    const historyHost = document.createElement('div');
    historyHost.className = 'history-panel-host context-bar__history';
    const actions = refs.contextBar.querySelector('.context-bar__actions');
    const studentPath = publicStudentPath('lesson', lesson.id);
    const optionsMenu = mountPageOptionsMenu(
      [
        {
          label: 'Alchemy Lab',
          className: 'context-bar__alchemy-lab',
          onSelect: () => {
            openAlchemyLab();
          }
        },
        {
          label: 'Full screen',
          className: 'context-bar__fullscreen',
          dataset: { builderFullscreen: '' },
          onSelect: () => {
            setFullPage(!fullPage);
          }
        },
        {
          label: 'Student preview',
          className: 'context-bar__preview',
          href: studentPath,
          target: '_blank',
          onSelect: () => {
            if (!lesson.published_at) return;
            window.open(publicStudentPath('lesson', lesson.id), '_blank', 'noopener,noreferrer');
          }
        },
        {
          label: 'Share',
          className: 'context-bar__share',
          onSelect: () => {
            publicLinkHost.querySelector<HTMLButtonElement>('.public-link__trigger')?.click();
          }
        },
        {
          label: 'History',
          className: 'context-bar__history-item',
          onSelect: () => {
            historyPanel?.open();
          }
        }
      ],
      { label: 'Lesson options' }
    );
    pageOptionsDispose = optionsMenu.dispose;

    function syncPreviewLink(): void {
      const preview = optionsMenu.el.querySelector<HTMLAnchorElement>('.context-bar__preview');
      if (!preview) return;
      preview.href = publicStudentPath('lesson', lesson.id);
      const published = Boolean(lesson.published_at);
      preview.setAttribute('aria-disabled', published ? 'false' : 'true');
      preview.classList.toggle('is-disabled', !published);
    }
    syncPreviewLink();

    if (actions) {
      actions.append(optionsMenu.el, publicLinkHost, historyHost);
    } else {
      refs.contextBar.append(optionsMenu.el, publicLinkHost, historyHost);
    }
    bindBuilderFullPage(builder, {
      getActive: () => fullPage,
      setActive: setFullPage
    });
    refreshPublicLink();
    syncPreviewLink();

    function applyRestoredLesson(restored: Lesson): void {
      Object.assign(lesson, restored);
      nextId = nextBlockIdFactory(`block_${lesson.id}`, lesson.blocks);
      bumpDraftClock();
      page?.update(lesson);
      const titleEl = refs.contextBar.querySelector('.teacher-layout__context-bar-title');
      if (titleEl) titleEl.textContent = 'Lesson';
    }

    historyPanel = mountHistoryPanel({
      kind: 'lesson',
      parentId: lesson.id,
      host: historyHost,
      hideToggle: true,
      onRestored: (live) => {
        applyRestoredLesson(live as Lesson);
      }
    });
  }

  return {
    flush() {
      return saveController?.flush() ?? Promise.resolve();
    },
    dispose() {
      disposed = true;
      exitFullPageMode?.();
      exitFullPageMode = null;
      removeChromeKeys?.();
      removeChromeKeys = null;
      closeEditSourceModal?.();
      closeEditSourceModal = null;
      page?.dispose();
      page = null;
      palette?.dispose();
      palette = null;
      historyPanel?.dispose();
      historyPanel = null;
      pageOptionsDispose?.();
      pageOptionsDispose = null;
      publicLinkDispose?.();
      publicLinkDispose = null;
      aiPanel?.dispose();
      aiPanel = null;
      alchemyLab?.dispose();
      alchemyLab = null;
      savePublishHandle?.dispose();
      saveController?.dispose();
      printLesson = null;
    },
    openA4Preview() {
      if (disposed) return;
      const print = refs.canvas.querySelector<HTMLButtonElement>('[aria-label="Print"]');
      if (print) {
        print.click();
        return;
      }
      printLesson?.();
    },
    publish() {
      if (disposed) return;
      const publishButton = refs.contextBar.querySelector<HTMLButtonElement>(
        '.context-bar__publish'
      );
      if (publishButton) {
        publishButton.click();
        return;
      }
      void saveController?.publish();
    }
  };
}
