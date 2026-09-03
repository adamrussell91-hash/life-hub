import { ApiClientError } from '@/api/client';
import {
  emptyMessageForCollection,
  resolveCollection,
  type CollectionResolveContext
} from '@/blocks/collection-resolve';
import {
  renderBlock,
  renderCollectionBlock,
  type BlockEditorContext
} from '@/blocks/registry';
import type { Block } from '@/schemas/block';
import type { Class, ClassHomepage } from '@/schemas/class';
import {
  mountHistoryPanel,
  type HistoryPanelHandle
} from '@/teacher/history-panel';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import {
  mountBlockCanvas,
  type BlockCanvasHandle
} from '@/teacher/lesson-canvas/mount-page';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountLessonPalette } from '@/teacher/lesson-canvas/mount-palette';
import { homepagePaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import { readBuilderChromePrefs } from '@/teacher/lesson-canvas/prefs';

export const HOMEPAGE_REGIONS = [
  { key: 'announcements', title: 'Announcements', emptyCopy: 'No announcements yet.' },
  { key: 'resources', title: 'Resources', emptyCopy: 'No resources yet.' },
  { key: 'custom', title: 'Custom blocks', emptyCopy: 'No custom blocks yet.' }
] as const satisfies ReadonlyArray<{
  key: keyof ClassHomepage;
  title: string;
  emptyCopy: string;
}>;

export function emptyHomepage(): ClassHomepage {
  return {
    announcements: [],
    resources: [],
    custom: []
  };
}

export function normalizeHomepage(homepage?: ClassHomepage): ClassHomepage {
  return {
    announcements: homepage?.announcements ?? [],
    resources: homepage?.resources ?? [],
    custom: homepage?.custom ?? []
  };
}

function cloneHomepage(homepage: ClassHomepage): ClassHomepage {
  return structuredClone(homepage);
}

function regionEmptyCopy(text: string): HTMLElement {
  const empty = document.createElement('p');
  empty.className = 'class-page__empty';
  empty.textContent = text;
  return empty;
}

function resolveCollectionBlock(
  block: Extract<Block, { block_type: 'collection' }>,
  resolveContext?: CollectionResolveContext
): { links: ReturnType<typeof resolveCollection>; emptyMessage?: string } {
  if (!resolveContext) {
    return { links: [], emptyMessage: 'Preview needs class context.' };
  }
  const links = resolveCollection(block.content, resolveContext, { publishedOnly: false });
  const emptyMessage = emptyMessageForCollection(block.content.source, {
    hasCurrentUnit: Boolean(resolveContext.currentUnitId),
    linkCount: links.length
  });
  return { links, emptyMessage };
}

function renderHomepageBlock(
  block: Block,
  resolveContext?: CollectionResolveContext
): HTMLElement {
  if (block.block_type === 'collection') {
    return renderCollectionBlock(block, 'teacher', resolveCollectionBlock(block, resolveContext));
  }
  return renderBlock(block, 'teacher');
}

export type HomepageRegionsViewOptions = {
  emptyCopy?: Partial<Record<keyof ClassHomepage, string>>;
  /** Omit the system region heading (e.g. fold custom blocks under teacher titles). */
  hideHeadingFor?: ReadonlyArray<keyof ClassHomepage>;
  /** Skip empty regions entirely (e.g. hide empty custom). */
  omitEmpty?: ReadonlyArray<keyof ClassHomepage>;
};

export function renderHomepageRegionsView(
  container: HTMLElement,
  homepage: ClassHomepage,
  resolveContext?: CollectionResolveContext,
  regionKeys: ReadonlyArray<keyof ClassHomepage> = HOMEPAGE_REGIONS.map((r) => r.key),
  options: HomepageRegionsViewOptions = {}
): void {
  container.replaceChildren();
  const normalized = normalizeHomepage(homepage);
  const hideHeading = new Set(options.hideHeadingFor ?? []);
  const omitEmpty = new Set(options.omitEmpty ?? []);

  for (const key of regionKeys) {
    const region = HOMEPAGE_REGIONS.find((entry) => entry.key === key);
    if (!region) continue;

    const blocks = normalized[region.key];
    if (blocks.length === 0 && omitEmpty.has(key)) continue;

    const section = document.createElement('section');
    section.className = 'class-page__section homepage-regions__section glass-panel';
    section.dataset.homepageRegion = region.key;

    if (!hideHeading.has(key)) {
      const heading = document.createElement('h2');
      heading.className = 'class-page__heading';
      heading.textContent = region.title;
      section.append(heading);
    }

    if (blocks.length === 0) {
      section.append(regionEmptyCopy(options.emptyCopy?.[key] ?? region.emptyCopy));
    } else {
      const list = document.createElement('div');
      list.className = 'homepage-regions__blocks';
      for (const block of blocks) {
        list.append(renderHomepageBlock(block, resolveContext));
      }
      section.append(list);
    }

    container.append(section);
  }
}

export interface HomepageEditorHandle {
  destroy(): void;
}

export function mountHomepageEditor(
  container: HTMLElement,
  initial: ClassHomepage,
  options: {
    classId: string;
    onSave: (homepage: ClassHomepage) => Promise<void>;
    onCancel: () => void;
    /** Called after a successful version restore so the parent class cache stays in sync. */
    onRestored?: (cls: Class) => void;
    resolveContext?: CollectionResolveContext;
  }
): HomepageEditorHandle {
  const homepage = cloneHomepage(normalizeHomepage(initial));
  let destroyed = false;
  let historyPanel: HistoryPanelHandle | null = null;

  const editorContext: BlockEditorContext = {
    resolveCollection: (block) => resolveCollectionBlock(block, options.resolveContext)
  };

  container.replaceChildren();

  const root = document.createElement('div');
  root.className = 'homepage-editor lesson-builder lesson-builder--no-chat';

  const errorBanner = document.createElement('p');
  errorBanner.className = 'homepage-editor__error class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const railHost = document.createElement('div');
  railHost.className = 'lesson-builder__rail';

  const pageCol = document.createElement('div');
  pageCol.className = 'lesson-builder__page';

  const toolbar = document.createElement('div');
  toolbar.className = 'homepage-editor__toolbar';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--primary homepage-editor__save';
  saveButton.textContent = 'Save homepage';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn--secondary homepage-editor__cancel';
  cancelButton.textContent = 'Cancel';

  const historyHost = document.createElement('div');
  historyHost.className = 'history-panel-host homepage-editor__history';

  const optionsMenu = mountPageOptionsMenu(
    [
      {
        label: 'History',
        className: 'homepage-editor__history-item',
        onSelect: () => {
          historyPanel?.open();
        }
      }
    ],
    { label: 'Homepage options' }
  );

  toolbar.append(saveButton, cancelButton, optionsMenu.el, historyHost);

  const regionsContainer = document.createElement('div');
  regionsContainer.className = 'homepage-editor__regions';

  pageCol.append(errorBanner, toolbar, regionsContainer);
  root.append(railHost, pageCol);
  container.append(root);

  let activeRegion: keyof ClassHomepage = 'announcements';
  const canvases = new Map<keyof ClassHomepage, BlockCanvasHandle>();

  function setActiveRegion(key: keyof ClassHomepage): void {
    activeRegion = key;
    regionsContainer.querySelectorAll<HTMLElement>('.homepage-editor__region').forEach((section) => {
      section.classList.toggle(
        'homepage-editor__region--active',
        section.dataset.homepageRegion === key
      );
    });
  }

  function renderPreview(block: Block): HTMLElement {
    return renderHomepageBlock(block, options.resolveContext);
  }

  for (const region of HOMEPAGE_REGIONS) {
    const regionSection = document.createElement('section');
    regionSection.className = 'homepage-editor__region';
    regionSection.dataset.homepageRegion = region.key;
    if (region.key === activeRegion) {
      regionSection.classList.add('homepage-editor__region--active');
    }
    regionSection.addEventListener('click', () => setActiveRegion(region.key));

    const canvasHost = document.createElement('div');
    regionSection.append(canvasHost);
    regionsContainer.append(regionSection);

    canvases.set(
      region.key,
      mountBlockCanvas(canvasHost, {
        blocks: homepage[region.key],
        heading: region.title,
        allowCollectionAtRoot: true,
        editorContext,
        renderPreview,
        idFactory: () => nextBlockIdFactory(`block_homepage_${region.key}`, homepage[region.key])(),
        onChange: (blocks) => {
          homepage[region.key] = blocks;
          setActiveRegion(region.key);
        }
      })
    );
  }

  const palette = mountLessonPalette(railHost, {
    families: homepagePaletteFamilies(),
    onInsert: (payload) => {
      if (payload.kind !== 'block') return;
      canvases.get(activeRegion)?.insertType(payload.type);
    },
    onShelved: (shelved) => {
      root.classList.toggle('lesson-builder--rail-shelved', shelved);
    }
  });

  if (readBuilderChromePrefs().rail === 'shelved') {
    palette.setShelved(true);
    root.classList.add('lesson-builder--rail-shelved');
  }

  saveButton.addEventListener('click', () => {
    if (destroyed) return;
    errorBanner.hidden = true;
    errorBanner.textContent = '';
    saveButton.disabled = true;
    cancelButton.disabled = true;

    void options
      .onSave(cloneHomepage(homepage))
      .catch((error: unknown) => {
        const message =
          error instanceof ApiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unable to save homepage.';
        errorBanner.hidden = false;
        errorBanner.textContent = message;
      })
      .finally(() => {
        saveButton.disabled = false;
        cancelButton.disabled = false;
      });
  });

  cancelButton.addEventListener('click', () => {
    if (destroyed) return;
    options.onCancel();
  });

  historyPanel = mountHistoryPanel({
    kind: 'class_homepage',
    parentId: options.classId,
    host: historyHost,
    hideToggle: true,
    onRestored: (live) => {
      const restoredClass = live as Class;
      const next = normalizeHomepage(restoredClass.homepage);
      homepage.announcements = next.announcements;
      homepage.resources = next.resources;
      homepage.custom = next.custom;
      canvases.get('announcements')?.update(homepage.announcements);
      canvases.get('resources')?.update(homepage.resources);
      canvases.get('custom')?.update(homepage.custom);
      options.onRestored?.(restoredClass);
    }
  });

  return {
    destroy() {
      destroyed = true;
      palette.dispose();
      for (const canvas of canvases.values()) canvas.dispose();
      canvases.clear();
      historyPanel?.dispose();
      historyPanel = null;
      optionsMenu.dispose();
      container.replaceChildren();
    }
  };
}
