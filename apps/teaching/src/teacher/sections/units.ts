import { mountAnnReview } from '@/alchemy/ann-review';
import { mountUnitNotesPanel } from '@/alchemy/unit-notes-panel';
import { askSelectCard, askTextCard } from '@/teacher/confirm-dialog';
import { openScheduleTimetableModal } from '@/teacher/sections/schedule-timetable-modal';
import { navigate } from '@/app/router';
import { withAppBase } from '@/app/base-path';
import { applyCreatedEntity, replaceCurriculum } from '@/app/curriculum-state';
import { withCreatedEntity } from '@/curriculum/with-created-entity';
import { DEFAULT_PEDAGOGICAL_MODE } from '@/curriculum/pedagogical-mode';
import { postLesson } from '@/teacher/create/api';
import {
  collectAnthology,
  type AnthologyData,
  type AnthologySnapshot
} from '@/blocks/anthology-collect';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { createBlock } from '@/blocks/create-block';
import {
  chunkItems,
  composeQuoteToTechniqueCards,
  findAnnotationInBlocks,
  FLASHCARDS_CAP
} from '@/blocks/flashcard-from-annotation';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { isActiveLibraryStatus } from '@/curriculum/with-entity-status';
import type { Block, Lesson } from '@/schemas';
import { resolveCoverUrl } from '@/schemas';
import { mountCreateControl } from '@/teacher/create/control';
import type { EntityCreatedHandler } from '@/teacher/create/types';
import type { CurriculumResponse } from '@/teacher/nav';
import { createUnitTemplate } from '@/teacher/template-api';
import { mountHistoryPanel, type HistoryPanelHandle } from '@/teacher/history-panel';
import type { Subject, Unit, Year } from '@/schemas';
import { patchUnit } from '@/teacher/unit-api';
import { apiGet, apiPut, ApiClientError } from '@/api/client';
import { renderPageHeader } from '@/teacher/page-header';
import { downloadPortableExport } from '@/teacher/export-api';
import { gradientForEntityId, renderEntityBanner } from '@/teacher/entity-banner';
import { confirmAndArchive, confirmAndTrash } from '@/teacher/lifecycle-api';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { wireEntityCardExpand } from '@/teacher/entity-card-expand';
import { mountEntityPageTitle } from '@/teacher/entity-page-title';
import {
  mountBlockCanvas,
  type BlockCanvasHandle
} from '@/teacher/lesson-canvas/mount-page';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountLessonPalette } from '@/teacher/lesson-canvas/mount-palette';
import { unitPaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import { readBuilderChromePrefs } from '@/teacher/lesson-canvas/prefs';
import { mountOutcomeStrip, publicOutcomesForPage } from '@/outcomes/strip';
import { mountTagAnythingSection } from '@/teacher/entity-tagger';
import { renderBlock } from '@/blocks/render';
import { unitNetworkContext } from '@/teacher/network-context';

export const UNITS_INDEX_GROUP_STORAGE_KEY = 'teaching-hub.units-index-group';
export type UnitsIndexGroupBy = 'subject' | 'year';

function readUnitsIndexGroupBy(): UnitsIndexGroupBy {
  try {
    return localStorage.getItem(UNITS_INDEX_GROUP_STORAGE_KEY) === 'year'
      ? 'year'
      : 'subject';
  } catch {
    return 'subject';
  }
}

function writeUnitsIndexGroupBy(value: UnitsIndexGroupBy): void {
  try {
    localStorage.setItem(UNITS_INDEX_GROUP_STORAGE_KEY, value);
  } catch {
    // Persistence is convenience; ignore quota / private-mode failures.
  }
}

export interface UnitsIndexOptions {
  onCreated?: EntityCreatedHandler;
  onMutated?: () => void | Promise<void>;
}

export interface UnitPageOptions {
  onMutated?: () => void | Promise<void>;
  /** Cover-only invalidation; must not remount the page or its editors. */
  onCoverMutated?: () => void | Promise<void>;
}

export function renderUnitsIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: UnitsIndexOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();

  const disposers: Array<() => void> = [];

  const createHost = document.createElement('div');
  createHost.className = 'units-index__create create-control';
  createHost.dataset.createHost = '';

  const groupByHost = document.createElement('div');
  groupByHost.className = 'hub-pills units-index__group-by';
  groupByHost.setAttribute('role', 'group');
  groupByHost.setAttribute('aria-label', 'Group units by');

  renderPageHeader(canvas, {
    eyebrow: 'Teaching Hub',
    title: 'Units',
    actions: [groupByHost, createHost]
  });

  const createControl = mountCreateControl(createHost, {
    context: 'units',
    curriculum,
    onCreated: options.onCreated ?? (() => undefined)
  });
  disposers.push(createControl.dispose);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const units = curriculum.units
    .filter((unit) => unit.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title));

  const root = document.createElement('div');
  root.className = 'units-index';
  canvas.append(root);

  if (units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No units yet.';
    root.append(empty);
    return {
      dispose: () => {
        for (const dispose of disposers.splice(0).reverse()) dispose();
      }
    };
  }

  let groupBy = readUnitsIndexGroupBy();

  const subjectBtn = document.createElement('button');
  subjectBtn.type = 'button';
  subjectBtn.className = 'hub-pills__btn units-index__group-by-btn';
  subjectBtn.dataset.unitsGroup = 'subject';
  subjectBtn.textContent = 'Subject';

  const yearBtn = document.createElement('button');
  yearBtn.type = 'button';
  yearBtn.className = 'hub-pills__btn units-index__group-by-btn';
  yearBtn.dataset.unitsGroup = 'year';
  yearBtn.textContent = 'Year level';

  groupByHost.append(subjectBtn, yearBtn);

  const listHost = document.createElement('div');
  listHost.className = 'units-index__list';
  root.append(listHost);
  const cardDisposers: Array<() => void> = [];
  disposers.push(() => {
    for (const dispose of cardDisposers.splice(0).reverse()) dispose();
  });

  function syncGroupButtons(): void {
    subjectBtn.setAttribute('aria-pressed', groupBy === 'subject' ? 'true' : 'false');
    yearBtn.setAttribute('aria-pressed', groupBy === 'year' ? 'true' : 'false');
    subjectBtn.classList.toggle('units-index__group-by-btn--active', groupBy === 'subject');
    yearBtn.classList.toggle('units-index__group-by-btn--active', groupBy === 'year');
  }

  function renderGroupedList(): void {
    for (const dispose of cardDisposers.splice(0).reverse()) dispose();
    listHost.replaceChildren();
    const groups = groupUnits(units, groupBy, yearsById, subjectsById);
    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'units-index__group';

      const heading = document.createElement('h2');
      heading.className = 'units-index__group-title';

      heading.textContent = group.label;

      const grid = document.createElement('div');
      grid.className = 'home-classes units-index__grid';

      for (const unit of group.units) {
        const card = renderUnitCard(unit, yearsById, subjectsById, curriculum.media, {
          onMutated: options.onMutated
        });
        cardDisposers.push(card.dispose);
        grid.append(card.el);
      }

      section.append(heading, grid);
      listHost.append(section);
    }
  }

  subjectBtn.addEventListener('click', () => {
    if (groupBy === 'subject') return;
    groupBy = 'subject';
    writeUnitsIndexGroupBy(groupBy);
    syncGroupButtons();
    renderGroupedList();
  });
  yearBtn.addEventListener('click', () => {
    if (groupBy === 'year') return;
    groupBy = 'year';
    writeUnitsIndexGroupBy(groupBy);
    syncGroupButtons();
    renderGroupedList();
  });

  syncGroupButtons();
  renderGroupedList();

  return {
    dispose: () => {
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}

type UnitGroup = { key: string; label: string; sort: number; units: Unit[] };

function groupUnits(
  units: Unit[],
  groupBy: UnitsIndexGroupBy,
  yearsById: Map<string, Year>,
  subjectsById: Map<string, Subject>
): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();

  for (const unit of units) {
    const year = yearsById.get(unit.year_id);
    const subject = subjectsById.get(unit.subject_id);
    const key =
      groupBy === 'year'
        ? (year?.id ?? 'ungrouped')
        : subject?.title.trim() || 'Ungrouped';
    const label =
      groupBy === 'year' ? (year?.title ?? 'Ungrouped') : subject?.title.trim() || 'Ungrouped';
    const sort = groupBy === 'year' ? (year?.year_level ?? Number.MAX_SAFE_INTEGER) : 0;
    const existing = groups.get(key);
    if (existing) {
      existing.units.push(unit);
    } else {
      groups.set(key, { key, label, sort, units: [unit] });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.label.localeCompare(b.label);
  });

  for (const group of ordered) {
    group.units.sort((a, b) => {
      if (groupBy === 'subject') {
        const yearA = yearsById.get(a.year_id)?.year_level ?? 0;
        const yearB = yearsById.get(b.year_id)?.year_level ?? 0;
        if (yearA !== yearB) return yearA - yearB;
      }
      return a.title.localeCompare(b.title);
    });
  }

  return ordered;
}

function renderUnitCard(
  unit: Unit,
  yearsById: Map<string, Year>,
  subjectsById: Map<string, Subject>,
  media: CurriculumResponse['media'],
  options: { onMutated?: () => void | Promise<void> }
): { el: HTMLElement; dispose: () => void } {
  const subject = subjectsById.get(unit.subject_id);
  const year = yearsById.get(unit.year_id);
  const path = `/units/${unit.id}`;
  const metaText = [year?.title, subject?.title].filter(Boolean).join(' · ');

  const card = document.createElement('div');
  card.className = 'units-index__card';

  const tile = document.createElement('a');
  tile.className = 'glass-tile home-class-tile entity-cover-tile units-index__tile';
  tile.href = path;
  wireEntityCardExpand(
    tile,
    {
      kind: 'unit',
      id: unit.id,
      title: unit.title,
      eyebrow: subject?.title,
      cover: unit.cover ?? null,
      media,
      fullPagePath: path,
      metaText
    },
    { onMutated: options.onMutated }
  );

  const mediaEl = document.createElement('div');
  mediaEl.className = 'entity-cover-tile__media';
  const coverUrl = resolveCoverUrl(unit.cover, media);
  if (coverUrl) {
    const img = document.createElement('img');
    img.src = coverUrl;
    img.alt = '';
    mediaEl.append(img);
  } else {
    mediaEl.style.background = gradientForEntityId(unit.id);
  }

  const body = document.createElement('div');
  body.className = 'entity-cover-tile__body';

  const title = document.createElement('p');
  title.className = 'units-index__title';
  title.textContent = unit.title;

  const meta = document.createElement('p');
  meta.className = 'units-index__meta';
  meta.textContent = [year?.title, subject?.title].filter(Boolean).join(' · ');

  body.append(title, meta);
  tile.append(mediaEl, body);

  const menu = mountPageOptionsMenu(
    [
      {
        label: 'Archive',
        onSelect: () => {
          void confirmAndArchive('unit', unit.id, unit.title, () => {
            void options.onMutated?.();
          });
        }
      },
      {
        label: 'Move to trash',
        danger: true,
        onSelect: () => {
          void confirmAndTrash('unit', unit.id, unit.title, () => {
            void options.onMutated?.();
          });
        }
      }
    ],
    { label: `Options for ${unit.title}` }
  );

  card.append(tile, menu.el);
  return { el: card, dispose: menu.dispose };
}

/** @deprecated Prefer renderUnitPage */
export function renderUnitStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string
): void {
  renderUnitPage(canvas, curriculum, unitId);
}

export function renderUnitPage(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string,
  options: UnitPageOptions = {}
): { dispose: () => void } {
  canvas.replaceChildren();
  const unit = curriculum.units.find((entry) => entry.id === unitId);

  if (!unit) {
    renderPageHeader(canvas, { eyebrow: 'Units', title: 'Unit not found' });
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Unit not found.';
    canvas.append(status);
    return { dispose: () => undefined };
  }

  const historyHost = document.createElement('div');
  historyHost.className = 'history-panel-host unit-stub__history';
  let historyPanel: HistoryPanelHandle;
  const rowDisposers: Array<() => void> = [];
  let disposed = false;
  let creatingLesson = false;

  const optionsMenu = mountPageOptionsMenu(
    [
      {
        label: 'Schedule lessons',
        onSelect: () => { openScheduleTimetableModal({ curriculum, unitId, onSuccess: () => options.onMutated?.() }); }
      },
      {
        label: 'History',
        onSelect: () => {
          historyPanel.open();
        }
      },
      {
        label: 'Export JSON',
        onSelect: () => {
          void downloadPortableExport('unit', unit.id, unit.slug).catch(() => {
            window.alert('Unable to export this unit.');
          });
        }
      },
      {
        label: 'Save as unit template',
        onSelect: () => {
          void saveUnitAsTemplate(unit);
        }
      },
      {
        label: 'Archive',
        onSelect: () => {
          void confirmAndArchive('unit', unit.id, unit.title, () => {
            navigate('/units');
          });
        }
      },
      {
        label: 'Move to trash',
        danger: true,
        onSelect: () => {
          void confirmAndTrash('unit', unit.id, unit.title, () => {
            navigate('/units');
          });
        }
      }
    ],
    { label: `Options for ${unit.title}` }
  );
  const exportItem = [...optionsMenu.el.querySelectorAll<HTMLButtonElement>('.page-options__item')].find(
    (item) => item.textContent === 'Export JSON'
  );
  if (exportItem) exportItem.dataset.export = 'unit';

  renderPageHeader(canvas, {
    actions: [historyHost, optionsMenu.el]
  });

  const root = document.createElement('div');
  root.className = 'unit-page';

  const coverHost = document.createElement('div');
  coverHost.className = 'unit-page__cover';
  const yearTitle = curriculum.years.find((entry) => entry.id === unit.year_id)?.title;
  const subjectTitle = curriculum.subjects.find((entry) => entry.id === unit.subject_id)?.title;
  const banner = renderEntityBanner(coverHost, {
    cover: unit.cover,
    media: curriculum.media,
    title: unit.title,
    eyebrow: [yearTitle, subjectTitle].filter(Boolean).join(' · '),
    entityId: unit.id,
    editable: true,
    onSave: async (cover) => {
      const saved = await patchUnit(unit.id, { cover });
      if (saved.cover) unit.cover = saved.cover;
      else delete unit.cover;
      await options.onCoverMutated?.();
    }
  });

  const titleEditor = mountEntityPageTitle(coverHost, {
    value: unit.title,
    ariaLabel: 'Unit name',
    onPreview: (title) => {
      banner.update({ title });
    },
    onSave: async (title) => {
      const saved = await patchUnit(unit.id, { title });
      unit.title = saved.title || title;
    },
    onSaved: (title) => {
      unit.title = title;
      banner.update({ title });
    }
  });

  const planSection = document.createElement('section');
  planSection.className = 'unit-page__plan glass-panel';
  planSection.dataset.unitSection = 'plan';

  const planHeading = document.createElement('h2');
  planHeading.className = 'class-page__heading';
  planHeading.textContent = 'Unit plan';

  const planHost = document.createElement('div');
  planHost.className = 'unit-page__plan-editor';

  const planEditor = mountUnitPlanEditor(planHost, unit.blocks ?? [], {
    unit,
    curriculum,
    onSave: async (blocks, refresh = false) => {
      const saved = await patchUnit(unit.id, { blocks });
      unit.blocks = saved.blocks;
      if (refresh) await options.onMutated?.();
    },
    attachedOutcomes: publicOutcomesForPage(unit, curriculum.outcomes ?? [])
  });

  const subject = curriculum.subjects.find((entry) => entry.id === unit.subject_id);
  const stripHost = document.createElement('div');
  const outcomeStrip = subject
    ? mountOutcomeStrip(stripHost, {
        catalog: curriculum.outcomes ?? [],
        subject,
        attached: unit,
        editable: true,
        onChange: async (ids) => {
          const saved = await patchUnit(unit.id, { outcome_ids: ids });
          unit.outcome_ids = saved.outcome_ids;
          planEditor.updateOutcomes(publicOutcomesForPage(unit, curriculum.outcomes ?? []));
        },
        onCatalogChange: (created) => {
          curriculum.outcomes = [...(curriculum.outcomes ?? []), created];
          subject.outcome_ids = [...subject.outcome_ids, created.id];
        }
      })
    : null;

  planSection.append(planHeading, planHost);

  const tagsHost = document.createElement('div');
  tagsHost.className = 'unit-page__tags';
  mountTagAnythingSection(tagsHost, `teaching:unit:${unit.id}`);

  const lessonsSection = document.createElement('section');
  lessonsSection.className = 'unit-page__lessons glass-panel';
  lessonsSection.dataset.unitSection = 'lessons';

  const lessonsHeading = document.createElement('h2');
  lessonsHeading.className = 'class-page__heading';
  lessonsHeading.textContent = 'Lessons';

  const lessonsHeader = document.createElement('div');
  lessonsHeader.className = 'unit-page__lessons-header';
  const addLessonButton = document.createElement('button');
  addLessonButton.type = 'button';
  addLessonButton.className = 'icon-plus-btn unit-page__add-lesson';
  addLessonButton.title = 'New lesson';
  addLessonButton.setAttribute('aria-label', 'New lesson');
  // Match the outline plus used by Tasks' New Task button.
  const plus = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  plus.setAttribute('viewBox', '0 0 24 24');
  plus.setAttribute('fill', 'none');
  plus.setAttribute('stroke', 'currentColor');
  plus.setAttribute('stroke-width', '1.75');
  plus.setAttribute('stroke-linecap', 'round');
  plus.setAttribute('stroke-linejoin', 'round');
  plus.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 5v14', 'M5 12h14']) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    plus.append(path);
  }
  addLessonButton.append(plus);

  const lessonError = document.createElement('p');
  lessonError.className = 'class-page__error';
  lessonError.setAttribute('role', 'alert');
  lessonError.hidden = true;

  addLessonButton.addEventListener('click', async () => {
    if (creatingLesson || disposed) return;
    creatingLesson = true;
    addLessonButton.disabled = true;
    addLessonButton.setAttribute('aria-busy', 'true');
    lessonError.hidden = true;
    try {
      const created = await postLesson({
        title: 'Untitled lesson',
        unit_id: unit.id,
        pedagogical_mode: DEFAULT_PEDAGOGICAL_MODE
      });
      // Seed the shared snapshot before routing, as the existing create flow does.
      if (!applyCreatedEntity('lesson', created)) {
        replaceCurriculum(withCreatedEntity(curriculum, 'lesson', created));
      }
      if (!disposed) navigate(`/lessons/${created.id}`);
    } catch (error: unknown) {
      if (!disposed) {
        lessonError.textContent = error instanceof Error ? error.message : 'Unable to create lesson. Please try again.';
        lessonError.hidden = false;
      }
    } finally {
      creatingLesson = false;
      if (!disposed) {
        addLessonButton.disabled = false;
        addLessonButton.removeAttribute('aria-busy');
      }
    }
  });

  lessonsHeader.append(lessonsHeading, addLessonButton);
  lessonsSection.append(lessonsHeader, lessonError);

  historyPanel = mountHistoryPanel({
    kind: 'unit',
    parentId: unitId,
    host: historyHost,
    hideToggle: true,
    onRestored: (live) => {
      const restored = live as Unit;
      Object.assign(unit, restored);
      // Object.assign cannot clear an optional key the restored unit omits,
      // which would otherwise leave a phantom cover behind.
      if (restored.cover) unit.cover = restored.cover;
      else delete unit.cover;
      banner.update({ title: unit.title, cover: unit.cover ?? null });
      titleEditor.update(unit.title);
    }
  });

  const lessons = curriculum.lessons
    .filter((lesson) => lesson.unit_id === unitId && isActiveLibraryStatus(lesson.status))
    .sort((a, b) => a.sequence - b.sequence);

  if (lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'class-page__empty';
    empty.textContent = 'No lessons in this unit yet.';
    lessonsSection.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'lesson-list';

    for (const lesson of lessons) {
      const item = document.createElement('li');
      item.className = 'lesson-list__item lesson-list__item--openable';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Expand ${lesson.title}`);

      const path = `/lessons/${lesson.id}`;
      wireEntityCardExpand(
        item,
        {
          kind: 'lesson',
          id: lesson.id,
          title: lesson.title,
          eyebrow: unit.title,
          media: curriculum.media,
          fullPagePath: path,
          metaText: lesson.published ? 'Published' : 'Draft',
          previewText: lesson.excerpt
        },
        { onMutated: options.onMutated }
      );

      const info = document.createElement('div');
      info.className = 'lesson-list__info';

      const title = document.createElement('p');
      title.className = 'lesson-list__title';
      title.textContent = lesson.title;

      const meta = document.createElement('p');
      meta.className = 'lesson-list__meta';
      meta.textContent = lesson.published ? 'Published' : 'Draft';
      const sessions = sessionsPerClass(curriculum.scheduled_lessons ?? [], lesson.id);
      if (sessions > 1) meta.textContent += ` · taught over ${sessions} sessions`;

      info.append(title, meta);

      const rowMenu = mountPageOptionsMenu(
        [
          {
            label: 'Open',
            className: 'lesson-list__open',
            href: path,
            onSelect: () => {
              navigate(path);
            }
          }
        ],
        { label: `Options for ${lesson.title}` }
      );
      rowDisposers.push(rowMenu.dispose);

      item.append(info, rowMenu.el);
      list.append(item);
    }

    lessonsSection.append(list);
  }

  root.append(coverHost, stripHost, planSection, tagsHost, lessonsSection);
  canvas.append(root);

  return {
    dispose: () => {
      for (const dispose of rowDisposers.splice(0).reverse()) dispose();
      optionsMenu.dispose();
      historyPanel.dispose();
      titleEditor.dispose();
      banner.dispose();
      planEditor.dispose();
      outcomeStrip?.dispose();
      disposed = true;
    }
  };
}

/** Most slots any one class spends on this lesson (a poem over Thursday and Friday = 2). */
function sessionsPerClass(rows: Array<{ lesson_id: string; class_id: string }>, lessonId: string): number {
  const byClass = new Map<string, number>();
  for (const row of rows) {
    if (row.lesson_id === lessonId) byClass.set(row.class_id, (byClass.get(row.class_id) ?? 0) + 1);
  }
  return Math.max(0, ...byClass.values());
}

async function saveUnitAsTemplate(unit: Unit): Promise<void> {
  const suggested = unit.title.trim() || 'Unit template';
  const title = await askTextCard({ title: 'Save as unit template', value: suggested });
  if (title === null) return;
  const trimmed = title.trim();
  if (!trimmed) {
    window.alert('Unit template name is required.');
    return;
  }
  try {
    await createUnitTemplate({
      title: trimmed,
      description: unit.description,
      blocks: unit.blocks ? cloneBlocksWithNewIds(unit.blocks) : undefined
    });
    window.alert(`Saved “${trimmed}” as a unit template.`);
  } catch {
    window.alert('Unable to save unit template.');
  }
}

function mountUnitPlanEditor(
  host: HTMLElement,
  initialBlocks: Block[],
  options: {
    unit: Unit;
    curriculum: CurriculumResponse;
    onSave: (blocks: Block[], refresh?: boolean) => Promise<void>;
    attachedOutcomes?: ReturnType<typeof publicOutcomesForPage>;
  }
): { dispose: () => void; updateOutcomes: (next: ReturnType<typeof publicOutcomesForPage>) => void } {
  let blocks = structuredClone(initialBlocks);
  let nextId = nextBlockIdFactory('block_unit', blocks);
  let destroyed = false;
  let attachedOutcomes = options.attachedOutcomes ?? [];
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveChain = Promise.resolve();
  let revision = 0;
  let savedRevision = 0;
  let assistant: ReturnType<typeof mountAnnReview> | null = null;
  let lastSaveError: unknown = null;
  let anthologyData: AnthologyData = { items: [], texts: [] };
  let anthologySnapshots: AnthologySnapshot[] = [];

  const root = document.createElement('div');
  root.className = 'unit-plan-editor lesson-builder lesson-builder--no-chat';

  const errorBanner = document.createElement('p');
  errorBanner.className = 'class-page__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const railHost = document.createElement('div');
  railHost.className = 'lesson-builder__rail';

  const pageCol = document.createElement('div');
  pageCol.className = 'lesson-builder__page';

  const toolbar = document.createElement('div');
  toolbar.className = 'unit-plan-editor__toolbar';
  toolbar.hidden = true;

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn btn--primary';
  saveButton.textContent = 'Save plan';

  toolbar.append(saveButton);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'unit-plan-editor__blocks';

  pageCol.append(errorBanner, toolbar, canvasHost);
  root.append(railHost, pageCol);
  host.replaceChildren(root);
  const unitNotes = mountUnitNotesPanel(pageCol, options.unit.id);

  function saveErrorMessage(error: unknown): string {
    return error instanceof ApiClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Unable to save unit plan.';
  }

  function persistLatest(refresh = false): Promise<void> {
    const targetRevision = revision;
    const snapshot = structuredClone(blocks);
    if (!refresh && targetRevision <= savedRevision) return saveChain;

    saveChain = saveChain.then(async () => {
      if (!refresh && targetRevision <= savedRevision) return;
      try {
        await options.onSave(snapshot, refresh);
        lastSaveError = null;
        savedRevision = Math.max(savedRevision, targetRevision);
        if (!destroyed) errorBanner.hidden = true;
      } catch (error: unknown) {
        lastSaveError = error;
        if (!destroyed) {
          errorBanner.hidden = false;
          errorBanner.textContent = saveErrorMessage(error);
        }
      }
    });

    return saveChain;
  }

  function scheduleSave(): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistLatest();
    }, 400);
  }

  async function refreshAnthology(): Promise<void> {
    const snapshots: AnthologySnapshot[] = [];
    await Promise.all(
      options.unit.lesson_ids.map(async (lessonId) => {
        try {
          const lesson = await apiGet<Lesson>(`/api/lessons/${lessonId}`);
          const summary = options.curriculum.lessons.find((row) => row.id === lessonId);
          snapshots.push({
            lesson_id: lessonId,
            lesson_title: lesson.title,
            published: summary?.published === true,
            blocks: filterBlocksForStudent(lesson.blocks ?? [])
          });
        } catch {
          // Preview stays empty for lessons that fail to load.
        }
      })
    );
    if (destroyed) return;
    anthologySnapshots = snapshots;
    anthologyData = collectAnthology(snapshots, {
      includeUnpublished: true,
      lessonOrder: options.unit.lesson_ids
    });
    canvas.update(blocks);
  }

  async function makeCardsFromAnthology(request: {
    items: AnthologyData['items'];
  }): Promise<void> {
    const withTechnique = request.items.filter((item) => item.technique_id);
    if (withTechnique.length === 0) {
      window.alert('No technique-tagged notes in this view.');
      return;
    }
    const choices = options.unit.lesson_ids.map((lessonId) => {
      const summary = options.curriculum.lessons.find((row) => row.id === lessonId);
      return { value: lessonId, label: summary?.title ?? lessonId };
    });
    if (choices.length === 0) {
      window.alert('Add a lesson to this unit first.');
      return;
    }
    const lessonId = await askSelectCard({
      title: 'Add flashcards to lesson',
      choices
    });
    if (!lessonId) return;

    const cards = await composeQuoteToTechniqueCards(
      withTechnique,
      (item) => {
        const snapshot = anthologySnapshots.find((row) => row.lesson_id === item.lesson_id);
        if (!snapshot) return null;
        return findAnnotationInBlocks(snapshot.blocks, item.block_id, item.annotation_id);
      },
      () => nextId()
    );
    if (cards.length === 0) {
      window.alert('Could not compose cards from this view.');
      return;
    }

    const chunks = chunkItems(cards, FLASHCARDS_CAP);
    const lesson = await apiGet<Lesson>(`/api/lessons/${lessonId}`);
    const nextBlocks = [...(lesson.blocks ?? [])];
    for (const chunk of chunks) {
      const fresh = createBlock('flashcards', nextId());
      if (fresh.block_type !== 'flashcards') continue;
      fresh.content.cards = chunk;
      nextBlocks.push(fresh);
    }
    await apiPut(`/api/lessons/${lessonId}`, { ...lesson, blocks: nextBlocks });
    window.alert(
      `Made ${chunks.length} flashcards block${chunks.length === 1 ? '' : 's'} (${cards.length} cards).`
    );
  }

  const unitLessons = options.unit.lesson_ids
    .map((lessonId) => options.curriculum.lessons.find((row) => row.id === lessonId))
    .filter((row): row is NonNullable<typeof row> => Boolean(row) && row!.status !== 'trashed')
    .map((row) => ({ id: row.id, title: row.title, href: withAppBase(`/lessons/${row.id}`) }));

  const network = unitNetworkContext(options.curriculum, options.unit);

  const canvas: BlockCanvasHandle = mountBlockCanvas(canvasHost, {
    blocks,
    allowCollectionAtRoot: true,
    editorContext: { unitLessons, network },
    idFactory: () => nextId(),
    renderPreview: (block) =>
      renderBlock(block, 'teacher', {
        pageBlocks: blocks,
        unitLessons,
        network: unitNetworkContext(options.curriculum, options.unit),
        attachedOutcomes,
        anthology: anthologyData,
        onMakeAnthologyCards: (request) => {
          void makeCardsFromAnthology(request);
        }
      }),
    onChange: (next) => {
      blocks = next;
      nextId = nextBlockIdFactory('block_unit', blocks);
      revision += 1;
      scheduleSave();
      assistant?.changed();
    }
  });

  void refreshAnthology();

  assistant = mountAnnReview({
    host: root, kind: 'unit', id: options.unit.id,
    getEntity: () => ({ ...options.unit, blocks }),
    flush: async () => { await persistLatest(); if (lastSaveError) throw lastSaveError; },
    apply: async (next) => {
      blocks = next.blocks ?? []; revision += 1; canvas.update(blocks);
      await persistLatest(true); if (lastSaveError) throw lastSaveError;
    }
  });

  const palette = mountLessonPalette(railHost, {
    families: unitPaletteFamilies(),
    onInsert: (payload) => {
      if (payload.kind !== 'block') return;
      canvas.insertType(payload.type);
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
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void persistLatest(true);
  });

  return {
    updateOutcomes(next) {
      attachedOutcomes = next;
      canvas.update(blocks);
    },
    dispose: () => {
      assistant?.dispose();
      unitNotes.dispose();
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      void persistLatest();
      destroyed = true;
      palette.dispose();
      canvas.dispose();
      host.replaceChildren();
    }
  };
}
