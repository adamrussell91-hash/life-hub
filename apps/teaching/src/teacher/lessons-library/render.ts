import { navigate } from '@/app/router';
import {
  PEDAGOGICAL_MODES,
  PEDAGOGICAL_MODE_LABELS,
  pedagogicalModeLabel,
  type PedagogicalMode
} from '@/curriculum/pedagogical-mode';
import { selectTodaySchedule } from '@/teacher/home-model';
import { resolveScheduleToday } from '@/schedule/today';
import { applyCreatedEntity, applyEntityStatus } from '@/app/curriculum-state';
import {
  confirmAndArchive,
  confirmAndTrash,
  entityPath,
  patchStatus
} from '@/teacher/lifecycle-api';
import type { CurriculumResponse } from '@/teacher/nav';
import { fetchContentSearch } from '@/teacher/search/api';
import { readRecent } from '@/teacher/search/recent';
import { mountPublicLinkControl } from '@/teacher/public-link';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import { wireEntityCardExpand } from '@/teacher/entity-card-expand';
import { createHubFilter } from '../../../design-kit/js/hub-filter-menu.js';
import { duplicateLesson, patchLessonLibrary } from './api';
import { duplicateIdSet, findNearDuplicates } from './duplicates';
import { exportUnitPack } from './export-unit';
import { badgeLabel, el, formatLessonCount, formatRelativeTime } from './format';
import { lessonsNeedingAttention } from './health';
import {
  readCollapsedUnits,
  readPinnedIds,
  readPreferredDensity,
  readPreferredView,
  readSavedViews,
  togglePinned,
  writeCollapsedUnits,
  writePreferredDensity,
  writePreferredView,
  writeSavedViews
} from './prefs';
import { applyLessonsQuery, countActiveFilters, groupLessonsByUnit, lessonBadge } from './query';
import { parseLessonsSearch, writeLessonsSearch } from './state';
import { coverageGaps, HSC_ENGLISH_ADVANCED_OUTCOMES } from './syllabus';
import {
  DEFAULT_LESSONS_STATE,
  type LessonLibraryRow,
  type LessonStatusFilter,
  type LessonsListState,
  type LessonsViewMode,
  type SavedLessonView
} from './types';
import { mountVirtualList } from './virtual-list';

const SEARCH_DEBOUNCE_MS = 250;

export interface LessonsLibraryOptions {
  onMutated?: () => void | Promise<void>;
  search?: string;
  now?: Date;
}

function uniqueTags(lessons: LessonLibraryRow[]): string[] {
  const tags = new Set<string>();
  for (const lesson of lessons) for (const tag of lesson.tags ?? []) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function uniqueAuthors(lessons: LessonLibraryRow[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const lesson of lessons) {
    if (lesson.author_id) map.set(lesson.author_id, lesson.author_name ?? lesson.author_id);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

type FilterOption = { value: string; label: string };

type FilterControl = {
  el: HTMLButtonElement;
  getValue: () => string;
  setOptions: (options: FilterOption[], selected: string) => void;
  dispose: () => void;
};

function filterControl(
  key: string,
  label: string,
  defaultValue: string,
  onChange: (value: string) => void
): FilterControl {
  return createHubFilter({
    key,
    label,
    defaultValue,
    options: [{ value: defaultValue, label: key }],
    value: defaultValue,
    onChange
  });
}

function selectControl(label: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = el('select', 'lessons-lib__select');
  select.setAttribute('aria-label', label);
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function option(select: HTMLSelectElement, value: string, label: string, selected: boolean): void {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  select.append(node);
}

export function renderLessonsLibrary(
  host: HTMLElement,
  curriculum: CurriculumResponse,
  options: LessonsLibraryOptions = {}
): { dispose: () => void } {
  const now = options.now ?? new Date();
  const preferredView = readPreferredView();
  const preferredDensity = readPreferredDensity();
  let state: LessonsListState = {
    ...parseLessonsSearch(options.search ?? (typeof location !== 'undefined' ? location.search : '')),
    ...(preferredView && !(options.search || (typeof location !== 'undefined' && location.search))
      ? { view: preferredView }
      : {}),
    ...(preferredDensity && !(options.search || (typeof location !== 'undefined' && location.search.includes('density=')))
      ? { density: preferredDensity }
      : {})
  };

  let collapsed = readCollapsedUnits();
  let pins = readPinnedIds();
  let selected = new Set<string>();
  let bodyMatchIds = new Set<string>();
  let searchTimer: number | null = null;
  const disposers: Array<() => void> = [];

  const root = el('div', 'lessons-lib');
  host.replaceChildren(root);

  const countEl = el('p', 'lessons-lib__count');
  countEl.dataset.lessonsCount = '';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'hub-search lessons-lib__search';
  search.dataset.lessonsSearch = '';
  search.placeholder = 'Search titles, units, tags, notes…';
  search.setAttribute('aria-label', 'Search lessons');
  search.value = state.q;

  const toolbar = el('div', 'lessons-lib__toolbar');
  const filters = el('div', 'lessons-lib__filters');
  const views = el('div', 'hub-pills lessons-lib__views');
  views.setAttribute('role', 'tablist');
  views.setAttribute('aria-label', 'Lesson views');

  const bulk = el('div', 'lessons-lib__bulk');
  bulk.hidden = true;
  const listHost = el('div', 'lessons-lib__list');
  const side = el('aside', 'lessons-lib__side');
  side.hidden = true;

  const rail = el('div', 'lessons-lib__rail');

  root.append(countEl, rail, toolbar, bulk, listHost, side);

  const unitSelect = filterControl('Unit', 'Filter by unit', '', (value) => {
    selected = new Set();
    patchState({ units: value ? [value] : [] });
  });
  const subjectSelect = filterControl('Subject', 'Filter by subject', '', (value) => {
    selected = new Set();
    const subjects = value ? [value] : [];
    let units = state.units;
    if (value) {
      const allowed = new Set(
        curriculum.units.filter((unit) => unit.subject_id === value).map((unit) => unit.id)
      );
      units = units.filter((unitId) => allowed.has(unitId));
    }
    patchState({ subjects, units });
  });
  const modeSelect = filterControl('Mode', 'Filter by pedagogical mode', '', (value) => {
    selected = new Set();
    patchState({ modes: value ? [value as PedagogicalMode] : [] });
  });
  const statusSelect = filterControl('Status', 'Filter by status', '', (value) => {
    selected = new Set();
    patchState({ statuses: value ? [value as LessonStatusFilter] : [] });
  });
  const tagSelect = filterControl('Tags', 'Filter by tag', '', (value) => {
    selected = new Set();
    patchState({ tags: value ? [value] : [] });
  });
  const sortSelect = filterControl('Sort', 'Sort lessons', 'edited_desc', (value) => {
    patchState({ sort: value as LessonsListState['sort'] });
  });
  const smartSelect = filterControl('Lesson', 'Smart filter', '', (value) => {
    selected = new Set();
    patchState({
      smart: value === '' ? null : (value as NonNullable<LessonsListState['smart']>)
    });
  });

  const densitySelect = filterControl('Density', 'Card density', 'cards', (value) => {
    const density = value === 'compact' ? 'compact' : 'cards';
    writePreferredDensity(density);
    patchState({ density });
  });

  filters.append(
    subjectSelect.el,
    unitSelect.el,
    modeSelect.el,
    statusSelect.el,
    tagSelect.el,
    sortSelect.el,
    smartSelect.el,
    densitySelect.el
  );
  disposers.push(
    () => subjectSelect.dispose(),
    () => unitSelect.dispose(),
    () => modeSelect.dispose(),
    () => statusSelect.dispose(),
    () => tagSelect.dispose(),
    () => sortSelect.dispose(),
    () => smartSelect.dispose(),
    () => densitySelect.dispose()
  );
  toolbar.append(search, filters, views);

  const viewModes: Array<{ id: LessonsViewMode; label: string }> = [
    { id: 'library', label: 'Library' },
    { id: 'table', label: 'Table' },
    { id: 'map', label: 'Map' },
    { id: 'mine', label: 'My views' }
  ];
  for (const mode of viewModes) {
    const btn = el('button', 'hub-pills__btn lessons-lib__view-btn', mode.label);
    btn.type = 'button';
    btn.dataset.view = mode.id;
    btn.addEventListener('click', () => {
      writePreferredView(mode.id);
      patchState({ view: mode.id });
    });
    views.append(btn);
  }

  const onSlash = (event: KeyboardEvent): void => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    event.preventDefault();
    search.focus();
  };
  document.addEventListener('keydown', onSlash);
  disposers.push(() => document.removeEventListener('keydown', onSlash));

  search.addEventListener('input', () => {
    if (searchTimer !== null) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      selected = new Set();
      patchState({ q: search.value });
      void refreshBodyMatches(search.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  async function refreshBodyMatches(q: string): Promise<void> {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      bodyMatchIds = new Set();
      paintList();
      return;
    }
    try {
      const result = await fetchContentSearch(trimmed);
      bodyMatchIds = new Set(
        result.hits.filter((hit) => hit.type === 'lesson').map((hit) => hit.id)
      );
    } catch {
      bodyMatchIds = new Set();
    }
    paintList();
  }

  function patchState(partial: Partial<LessonsListState>): void {
    state = { ...state, ...partial, savedViewId: partial.savedViewId ?? null };
    writeLessonsSearch(state);
    paint();
  }

  function extraSets() {
    const recentIds = new Set(readRecent().filter((item) => item.type === 'lesson').map((item) => item.id));
    const healthIds = lessonsNeedingAttention(curriculum.lessons, now, recentIds);
    const duplicateIds = duplicateIdSet(findNearDuplicates(curriculum.lessons));
    const today = resolveScheduleToday(curriculum.schedule_anchor_date);
    const todayIds = new Set(
      selectTodaySchedule(curriculum.scheduled_lessons, today).map((row) => row.lesson_id)
    );
    return { healthIds, duplicateIds, todayIds, bodyMatchIds, recentIds };
  }

  function query() {
    return applyLessonsQuery(curriculum, state, extraSets());
  }

  function fillSelects(): void {
    const subjects: FilterOption[] = [
      { value: '', label: 'All subjects' },
      ...[...curriculum.subjects]
        .sort((a, b) => (a.display_title || a.title).localeCompare(b.display_title || b.title))
        .map((subject) => ({ value: subject.id, label: subject.display_title || subject.title }))
    ];
    subjectSelect.setOptions(subjects, state.subjects[0] ?? '');

    const subjectFilter = state.subjects[0];
    const units: FilterOption[] = [
      { value: '', label: 'All units' },
      ...[...curriculum.units]
        .filter((unit) => !subjectFilter || unit.subject_id === subjectFilter)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((unit) => ({ value: unit.id, label: unit.title }))
    ];
    unitSelect.setOptions(units, state.units[0] ?? '');

    modeSelect.setOptions(
      [
        { value: '', label: 'All modes' },
        ...PEDAGOGICAL_MODES.map((mode) => ({ value: mode, label: PEDAGOGICAL_MODE_LABELS[mode] }))
      ],
      state.modes[0] ?? ''
    );

    statusSelect.setOptions(
      [
        { value: '', label: 'Active (draft + published)' },
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'needs_review', label: 'Needs review' },
        { value: 'archived', label: 'Archived' }
      ],
      state.statuses[0] ?? ''
    );

    tagSelect.setOptions(
      [{ value: '', label: 'All tags' }, ...uniqueTags(curriculum.lessons).map((tag) => ({ value: tag, label: tag }))],
      state.tags[0] ?? ''
    );

    const sorts: FilterOption[] = [
      { value: 'edited_desc', label: 'Last edited · newest' },
      { value: 'edited_asc', label: 'Last edited · oldest' },
      { value: 'title_asc', label: 'Title A–Z' },
      { value: 'title_desc', label: 'Title Z–A' },
      { value: 'created_desc', label: 'Date created · newest' },
      { value: 'created_asc', label: 'Date created · oldest' },
      { value: 'status', label: 'Status' }
    ];
    sortSelect.setOptions(sorts, state.sort);

    smartSelect.setOptions(
      [
        { value: '', label: 'All lessons' },
        { value: 'health', label: 'Needs attention' },
        { value: 'duplicates', label: 'Possible duplicates' },
        { value: 'today', label: "On today's timetable" }
      ],
      state.smart ?? ''
    );

    densitySelect.setOptions(
      [
        { value: 'cards', label: 'Cards' },
        { value: 'compact', label: 'Compact' }
      ],
      state.density
    );
  }

  function paintRail(): void {
    rail.replaceChildren();
    const recent = readRecent()
      .filter((item) => item.type === 'lesson')
      .slice(0, 8);
    if (recent.length === 0) return;
    const heading = el('p', 'lessons-lib__rail-label', 'Recently opened');
    const strip = el('div', 'lessons-lib__recent');
    for (const item of recent) {
      const link = el('a', 'hub-chip lessons-lib__recent-chip', item.title);
      link.href = `/lessons/${item.id}`;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(`/lessons/${item.id}`);
      });
      strip.append(link);
    }
    rail.append(heading, strip);
  }

  function paintViews(): void {
    for (const btn of views.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      btn.setAttribute('aria-selected', btn.dataset.view === state.view ? 'true' : 'false');
    }
  }

  function paintBulk(rows: LessonLibraryRow[]): void {
    bulk.replaceChildren();
    const visible = new Set(rows.map((row) => row.id));
    selected = new Set([...selected].filter((id) => visible.has(id)));
    if (selected.size === 0) {
      bulk.hidden = true;
      return;
    }
    bulk.hidden = false;
    bulk.append(el('span', 'lessons-lib__bulk-count', `${selected.size} selected`));

    const actions: Array<{ label: string; run: () => void | Promise<void> }> = [
      {
        label: 'Archive',
        run: () => {
          if (!window.confirm(`Archive ${selected.size} lessons?`)) return;
          const ids = [...selected];
          for (const id of ids) applyEntityStatus('lesson', id, 'archived');
          selected = new Set();
          void options.onMutated?.();
          void Promise.all(ids.map((id) => patchStatus(entityPath('lesson', id), 'archived'))).catch(
            () => window.alert('Bulk action failed.')
          );
        }
      },
      {
        label: 'Trash',
        run: () => {
          if (!window.confirm(`Move ${selected.size} lessons to trash?`)) return;
          const ids = [...selected];
          for (const id of ids) applyEntityStatus('lesson', id, 'trashed');
          selected = new Set();
          void options.onMutated?.();
          void Promise.all(ids.map((id) => patchStatus(entityPath('lesson', id), 'trashed'))).catch(
            () => window.alert('Bulk action failed.')
          );
        }
      },
      {
        label: 'Mark needs review',
        run: async () => {
          for (const id of selected) await patchLessonLibrary(id, { review_status: 'needs_review' });
          selected = new Set();
          await options.onMutated?.();
        }
      }
    ];
    if (curriculum.units.length > 0) {
      const move = selectControl('Move selected to unit', (unitId) => {
        if (!unitId) return;
        void (async () => {
          for (const id of selected) await patchLessonLibrary(id, { unit_id: unitId });
          selected = new Set();
          await options.onMutated?.();
        })();
      });
      option(move, '', 'Move to unit…', true);
      for (const unit of curriculum.units) option(move, unit.id, unit.title, false);
      bulk.append(move);
    }
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'lessons-lib__tag-input';
    tagInput.placeholder = 'Add tag…';
    tagInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const tag = tagInput.value.trim();
      if (!tag) return;
      void (async () => {
        for (const id of selected) {
          const row = curriculum.lessons.find((lesson) => lesson.id === id);
          const tags = [...new Set([...(row?.tags ?? []), tag])];
          await patchLessonLibrary(id, { tags });
        }
        selected = new Set();
        await options.onMutated?.();
      })();
    });
    bulk.append(tagInput);
    for (const action of actions) {
      const btn = el('button', 'btn btn--ghost', action.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        void Promise.resolve(action.run()).catch(() => window.alert('Bulk action failed.'));
      });
      bulk.append(btn);
    }
  }

  function renderCard(row: LessonLibraryRow, compact: boolean): HTMLElement {
    const item = el('li', compact ? 'lesson-list__item lesson-list__item--compact' : 'lesson-list__item');
    item.classList.add('lesson-list__item--openable');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Expand ${row.title}`);

    const unit = curriculum.units.find((entry) => entry.id === row.unit_id);
    const badge = lessonBadge(row);
    const metaParts = [
      unit?.title ?? row.unit_id,
      pedagogicalModeLabel(row.pedagogical_mode),
      badgeLabel(badge),
      formatRelativeTime(row.updated_at, now)
    ];
    disposers.push(
      wireEntityCardExpand(
        item,
        {
          kind: 'lesson',
          id: row.id,
          title: row.title,
          eyebrow: unit?.title,
          media: curriculum.media,
          fullPagePath: `/lessons/${row.id}`,
          metaText: metaParts.join(' · '),
          previewText: row.excerpt,
          editableTitle: true
        },
        { onMutated: options.onMutated }
      ).dispose
    );

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'lessons-lib__check';
    check.checked = selected.has(row.id);
    check.setAttribute('aria-label', `Select ${row.title}`);
    check.addEventListener('click', (event) => event.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) selected.add(row.id);
      else selected.delete(row.id);
      paintBulk(query().rows);
    });

    const pin = el('button', 'lessons-lib__pin', pins.has(row.id) ? '★' : '☆');
    pin.type = 'button';
    pin.setAttribute('aria-label', pins.has(row.id) ? 'Unpin lesson' : 'Pin lesson');
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      pins = togglePinned(row.id);
      paint();
    });

    const info = el('div', 'lesson-list__info');
    info.append(el('p', 'lesson-list__title', row.title));
    const meta = el('p', 'lesson-list__meta');
    const pill = el('span', `status-badge status-badge--${badge}`, badgeLabel(badge));
    const modePill = el(
      'span',
      'lessons-lib__mode',
      pedagogicalModeLabel(row.pedagogical_mode)
    );
    meta.append(
      document.createTextNode(unit?.title ?? row.unit_id),
      document.createTextNode(' · '),
      modePill,
      document.createTextNode(' · '),
      pill,
      document.createTextNode(` · ${formatRelativeTime(row.updated_at, now)}`)
    );
    info.append(meta);
    if (row.tags && row.tags.length > 0) {
      const tagRow = el('p', 'lessons-lib__tags');
      for (const tag of row.tags) tagRow.append(el('span', 'lessons-lib__tag', tag));
      info.append(tagRow);
    }

    const actions = el('div', 'list-row-actions');
    actions.addEventListener('click', (event) => event.stopPropagation());

    const linkHost = el('div', 'lessons-lib__public-link');
    const linkControl = mountPublicLinkControl(linkHost, {
      kind: 'lesson',
      id: row.id,
      published: Boolean(row.published)
    });
    disposers.push(linkControl.dispose);

    const menu = mountPageOptionsMenu(
      [
        {
          label: 'Duplicate',
          onSelect: () => {
            void duplicateLesson(row.id)
              .then((copy) => {
                applyCreatedEntity('lesson', copy);
                return options.onMutated?.();
              })
              .catch(() => window.alert('Unable to duplicate lesson.'));
          }
        },
        {
          label: 'Archive',
          onSelect: () => {
            confirmAndArchive('lesson', row.id, row.title, () => {
              void options.onMutated?.();
            });
          }
        },
        {
          label: 'Move to trash',
          danger: true,
          onSelect: () => {
            confirmAndTrash('lesson', row.id, row.title, () => {
              void options.onMutated?.();
            });
          }
        }
      ],
      { label: `Options for ${row.title}` }
    );
    disposers.push(menu.dispose);
    actions.append(linkHost, menu.el);
    const lead = el('div', 'lessons-lib__lead');
    lead.append(check, pin);
    item.append(lead, info, actions);
    return item;
  }

  function renderEmpty(): HTMLElement {
    const empty = el('div', 'lessons-lib__empty');
    empty.dataset.lessonsEmpty = '';
    const filtered = countActiveFilters(state) > 0;
    empty.append(
      el('p', 'teacher-layout__canvas-status', filtered ? 'No lessons match these filters.' : 'No lessons yet.')
    );
    if (filtered) {
      const clear = el('button', 'btn btn--secondary', 'Clear filters');
      clear.type = 'button';
      clear.dataset.lessonsClearFilters = '';
      clear.addEventListener('click', () => {
        search.value = '';
        bodyMatchIds = new Set();
        patchState({
          ...DEFAULT_LESSONS_STATE,
          view: state.view,
          density: state.density
        });
      });
      empty.append(clear);
    }
    return empty;
  }

  function paintLibrary(rows: LessonLibraryRow[]): void {
    const pinnedRows = rows.filter((row) => pins.has(row.id));
    const rest = rows.filter((row) => !pins.has(row.id));
    const wrap = el('div', 'lessons-lib__groups');

    if (pinnedRows.length > 0) {
      wrap.append(el('h2', 'lessons-lib__group-title', `Pinned · ${pinnedRows.length}`));
      const list = el('ul', 'lesson-list');
      for (const row of pinnedRows) list.append(renderCard(row, state.density === 'compact'));
      wrap.append(list);
    }

    const groups = groupLessonsByUnit(rest, curriculum.units);
    if (collapsed.size === 0 && groups.length > 6) {
      const keep = new Set(groups.slice(0, 2).map((group) => group.unitId));
      collapsed = new Set(groups.filter((group) => !keep.has(group.unitId)).map((group) => group.unitId));
      writeCollapsedUnits(collapsed);
    }

    for (const group of groups) {
      const details = document.createElement('details');
      details.className = 'lesson-group';
      details.open = !collapsed.has(group.unitId);
      details.addEventListener('toggle', () => {
        if (details.open) collapsed.delete(group.unitId);
        else collapsed.add(group.unitId);
        writeCollapsedUnits(collapsed);
      });
      const summary = document.createElement('summary');
      summary.className = 'lesson-group__summary';
      const extra: string[] = [];
      if (group.needsReview) extra.push(`${group.needsReview} needs review`);
      if (group.archived) extra.push(`${group.archived} archived`);
      summary.textContent = `${group.unitTitle} · ${group.lessons.length} lessons · ${group.published} published, ${group.draft} draft${extra.length ? ` · ${extra.join(', ')}` : ''}`;
      details.append(summary);
      const list = el('ul', 'lesson-list');
      for (const row of group.lessons) list.append(renderCard(row, state.density === 'compact'));
      details.append(list);
      wrap.append(details);
    }
    listHost.append(wrap);
  }

  function paintTable(rows: LessonLibraryRow[]): void {
    const wrap = el('div', 'lessons-table-wrap');
    const virtualHost = el('div', 'lessons-table__scroll');
    const table = document.createElement('table');
    table.className = 'lessons-table';
    const colgroup = document.createElement('colgroup');
    for (const name of [
      'c-check',
      'c-title',
      'c-subject',
      'c-unit',
      'c-mode',
      'c-status',
      'c-edited',
      'c-created',
      'c-tags',
      'c-link'
    ]) {
      const col = document.createElement('col');
      col.className = name;
      colgroup.append(col);
    }
    table.append(colgroup);
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of [
      '',
      'Title',
      'Subject',
      'Unit',
      'Mode',
      'Status',
      'Last edited',
      'Created',
      'Tags',
      'Link'
    ]) {
      hr.append(el('th', undefined, label));
    }
    head.append(hr);
    table.append(head);
    const body = document.createElement('tbody');
    const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
    const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
    wrap.append(virtualHost);
    listHost.append(wrap);

    const renderRow = (index: number): HTMLElement => {
      const row = rows[index]!;
      const tr = document.createElement('tr');
      const checkCell = document.createElement('td');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(row.id);
      check.addEventListener('change', () => {
        if (check.checked) selected.add(row.id);
        else selected.delete(row.id);
        paintBulk(rows);
      });
      checkCell.append(check);
      const title = document.createElement('td');
      const link = el('a', 'lessons-table__title', row.title) as HTMLAnchorElement;
      link.href = `/lessons/${row.id}`;
      link.classList.add('lesson-list__open');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(`/lessons/${row.id}`);
      });
      title.append(link);
      const unit = unitsById.get(row.unit_id);
      const subject = unit ? subjectsById.get(unit.subject_id) : undefined;
      const badge = lessonBadge(row);
      const status = document.createElement('td');
      status.append(el('span', `status-badge status-badge--${badge}`, badgeLabel(badge)));
      const linkCell = document.createElement('td');
      const linkHost = el('div', 'lessons-lib__public-link');
      const linkControl = mountPublicLinkControl(linkHost, {
        kind: 'lesson',
        id: row.id,
        published: Boolean(row.published)
      });
      disposers.push(linkControl.dispose);
      linkCell.append(linkHost);
      tr.append(
        checkCell,
        title,
        el('td', undefined, subject ? subject.display_title || subject.title : '—'),
        el('td', undefined, unit?.title ?? row.unit_id),
        el('td', undefined, pedagogicalModeLabel(row.pedagogical_mode)),
        status,
        el('td', undefined, formatRelativeTime(row.updated_at, now)),
        el('td', undefined, row.created_at ? formatRelativeTime(row.created_at, now) : '—'),
        el('td', undefined, (row.tags ?? []).join(', ')),
        linkCell
      );
      return tr;
    };

    if (rows.length <= 80) {
      for (let i = 0; i < rows.length; i += 1) body.append(renderRow(i));
      table.append(body);
      virtualHost.append(table);
      return;
    }

    table.append(body);
    virtualHost.append(table);
    const virtual = mountVirtualList({
      host: virtualHost,
      itemCount: () => rows.length,
      itemHeight: 44,
      renderRow: (index) => {
        const tr = renderRow(index);
        const wrap = el('div');
        wrap.append(tr);
        return wrap;
      }
    });
    disposers.push(virtual.dispose);
  }

  function paintMap(): void {
    const tree = el('div', 'lessons-map');
    for (const year of curriculum.years) {
      const yearNode = el('details', 'lessons-map__node');
      yearNode.open = true;
      yearNode.append(el('summary', undefined, year.title));
      const subjects = curriculum.subjects.filter(
        (subject) =>
          year.subject_ids.includes(subject.id) ||
          curriculum.units.some((unit) => unit.subject_id === subject.id && unit.year_id === year.id)
      );
      for (const subject of subjects) {
        const subjectNode = el('details', 'lessons-map__node');
        subjectNode.open = true;
        subjectNode.append(el('summary', undefined, subject.title));
        const units = curriculum.units.filter((unit) => unit.subject_id === subject.id);
        for (const unit of units) {
          const unitNode = el('details', 'lessons-map__node');
          unitNode.open = false;
          const unitLessons = curriculum.lessons.filter(
            (lesson) => lesson.unit_id === unit.id && lesson.status === 'active'
          );
          unitNode.append(
            el('summary', undefined, `${unit.title} (${unitLessons.length})`)
          );
          const list = el('ul', 'lessons-map__lessons');
          for (const lesson of unitLessons) {
            const item = el('li');
            const link = el('a', 'lesson-list__open', lesson.title) as HTMLAnchorElement;
            link.href = `/lessons/${lesson.id}`;
            link.addEventListener('click', (event) => {
              event.preventDefault();
              navigate(`/lessons/${lesson.id}`);
            });
            item.append(link);
            list.append(item);
          }
          unitNode.append(list);
          subjectNode.append(unitNode);
        }
        yearNode.append(subjectNode);
      }
      tree.append(yearNode);
    }
    if (curriculum.years.length === 0) {
      tree.append(el('p', 'teacher-layout__canvas-status', 'No curriculum tree yet.'));
    }
    listHost.append(tree);
  }

  function paintMine(rows: LessonLibraryRow[]): void {
    const panel = el('div', 'lessons-mine');
    const saved = readSavedViews();
    panel.append(el('h2', 'lessons-lib__group-title', 'Saved views'));
    const saveBtn = el('button', 'btn btn--secondary', 'Save current filters');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      const name = window.prompt('Name this view');
      if (!name?.trim()) return;
      const view: SavedLessonView = {
        id: `view_${Date.now().toString(36)}`,
        name: name.trim(),
        state: {
          q: state.q,
          units: state.units,
          subjects: state.subjects,
          modes: state.modes,
          statuses: state.statuses,
          tags: state.tags,
          authors: state.authors,
          outcomes: state.outcomes,
          sort: state.sort,
          view: 'library',
          density: state.density,
          smart: state.smart
        }
      };
      writeSavedViews([...saved, view]);
      paint();
    });
    panel.append(saveBtn);
    for (const view of saved) {
      const row = el('div', 'lessons-mine__saved');
      const open = el('button', 'btn btn--ghost', view.name);
      open.type = 'button';
      open.addEventListener('click', () => {
        patchState({ ...view.state, savedViewId: view.id });
      });
      const remove = el('button', 'btn btn--ghost', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        writeSavedViews(readSavedViews().filter((entry) => entry.id !== view.id));
        paint();
      });
      row.append(open, remove);
      panel.append(row);
    }

    const extras = extraSets();
    panel.append(el('h2', 'lessons-lib__group-title', 'Today on the timetable'));
    const todayRows = curriculum.lessons.filter((lesson) => extras.todayIds.has(lesson.id));
    if (todayRows.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'Nothing scheduled for today.'));
    } else {
      const list = el('ul', 'lesson-list');
      for (const row of todayRows) list.append(renderCard(row, true));
      panel.append(list);
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Needs attention'));
    const healthRows = rows.filter((row) => extras.healthIds.has(row.id)).slice(0, 12);
    if (healthRows.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'Library looks healthy.'));
    } else {
      const list = el('ul', 'lesson-list');
      for (const row of healthRows) list.append(renderCard(row, true));
      panel.append(list);
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Possible duplicates'));
    const pairs = findNearDuplicates(curriculum.lessons).slice(0, 8);
    if (pairs.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'No near-duplicates detected.'));
    } else {
      for (const pair of pairs) {
        panel.append(
          el(
            'p',
            'lessons-lib__similar',
            `${pair.titles[0]} ↔ ${pair.titles[1]} (${Math.round(pair.score * 100)}%)`
          )
        );
      }
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Syllabus gaps (HSC English Advanced)'));
    const gaps = coverageGaps(curriculum.lessons);
    if (gaps.length === 0) {
      panel.append(el('p', 'teacher-layout__canvas-status', 'Every listed outcome has at least one tagged lesson.'));
    } else {
      for (const gap of gaps) {
        panel.append(el('p', 'lessons-lib__gap', `${gap.id} · ${gap.module} — ${gap.label}`));
      }
    }

    panel.append(el('h2', 'lessons-lib__group-title', 'Export unit pack'));
    const exportSelect = selectControl('Export unit', (unitId) => {
      if (!unitId) return;
      void exportUnitPack(curriculum, unitId);
    });
    option(exportSelect, '', 'Choose a unit…', true);
    for (const unit of curriculum.units) option(exportSelect, unit.id, unit.title, false);
    panel.append(exportSelect);

    const authors = uniqueAuthors(curriculum.lessons);
    if (authors.length > 0) {
      panel.append(el('h2', 'lessons-lib__group-title', 'Filter by author'));
      for (const author of authors) {
        const btn = el('button', 'btn btn--ghost', author.name);
        btn.type = 'button';
        btn.addEventListener('click', () => patchState({ authors: [author.id], view: 'library' }));
        panel.append(btn);
      }
    }

    const outcomeWrap = el('div', 'lessons-lib__outcomes');
    outcomeWrap.append(el('h2', 'lessons-lib__group-title', 'Filter by outcome'));
    for (const outcome of HSC_ENGLISH_ADVANCED_OUTCOMES) {
      const btn = el('button', 'lessons-lib__tag', outcome.id);
      btn.type = 'button';
      btn.title = outcome.label;
      btn.addEventListener('click', () => patchState({ outcomes: [outcome.id], view: 'library' }));
      outcomeWrap.append(btn);
    }
    panel.append(outcomeWrap);

    listHost.append(panel);
  }

  function paintList(): void {
    const result = query();
    countEl.textContent = formatLessonCount(result.totalInLibrary, result.shown, result.filtered);
    listHost.replaceChildren();
    paintBulk(result.rows);
    if (state.view === 'map') {
      paintMap();
      return;
    }
    if (state.view === 'mine') {
      paintMine(result.rows);
      return;
    }
    if (result.rows.length === 0) {
      listHost.append(renderEmpty());
      return;
    }
    if (state.view === 'table') paintTable(result.rows);
    else paintLibrary(result.rows);
  }

  function paint(): void {
    fillSelects();
    paintViews();
    paintRail();
    paintList();
    const filterCount = countActiveFilters(state);
    filters.dataset.activeCount = String(filterCount);
  }

  paint();
  if (state.q.trim().length >= 2) void refreshBodyMatches(state.q);

  return {
    dispose: () => {
      if (searchTimer !== null) window.clearTimeout(searchTimer);
      for (const dispose of disposers.splice(0).reverse()) dispose();
    }
  };
}
