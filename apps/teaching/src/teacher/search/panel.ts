import type { CurriculumResponse } from '@/teacher/nav';
import { filterActions, listSearchActions } from './actions';
import { lessonHierarchy, searchCurriculumTitles, unitSearchHierarchy } from './client-search';
import { readRecent } from './recent';
import { mergeAndRankHits } from './rank';
import type { ContentSearchHit, SearchHit } from './types';

const DEBOUNCE_MS = 150;
const PANEL_ROOT_SELECTOR = '.search-palette-backdrop';

export interface SearchPanelOptions {
  curriculum: CurriculumResponse;
  compositions: Array<{ id: string; title: string }>;
  path: string;
  hasLessonEditor: boolean;
  todayClassId?: string;
  onNavigate: (path: string) => void;
  onAction: (actionId: string) => void;
  fetchContentSearch: (q: string) => Promise<{ hits: ContentSearchHit[] }>;
}

type ListRow =
  | { kind: 'heading'; label: string }
  | { kind: 'hit'; hit: SearchHit };

let openRoot: HTMLElement | null = null;
let openInput: HTMLInputElement | null = null;

function recentHref(type: 'lesson' | 'unit' | 'class', id: string): string {
  if (type === 'lesson') return `/lessons/${id}`;
  if (type === 'unit') return `/units/${id}`;
  return `/classes/${id}`;
}

function actionToHit(action: { id: string; title: string }): SearchHit {
  return {
    type: 'action',
    id: action.id,
    title: action.title,
    match: 'action',
    actionId: action.id
  };
}

function enrichBodyHit(
  hit: ContentSearchHit,
  curriculum: CurriculumResponse,
  compositions: Array<{ id: string; title: string }>
): SearchHit {
  if (hit.type === 'lesson') {
    const lesson = curriculum.lessons.find((l) => l.id === hit.id);
    return {
      type: 'lesson',
      id: hit.id,
      title: lesson?.title ?? hit.id,
      hierarchy: lesson ? lessonHierarchy(curriculum, lesson) : undefined,
      match: 'body',
      snippet: hit.snippet,
      href: `/lessons/${hit.id}`
    };
  }
  if (hit.type === 'unit') {
    const unit = curriculum.units.find((u) => u.id === hit.id);
    return {
      type: 'unit',
      id: hit.id,
      title: unit?.title ?? hit.id,
      hierarchy: unit ? unitSearchHierarchy(curriculum, unit.id) : undefined,
      match: 'body',
      snippet: hit.snippet,
      href: `/units/${hit.id}`
    };
  }
  const composition = compositions.find((c) => c.id === hit.id);
  return {
    type: 'composition',
    id: hit.id,
    title: composition?.title ?? hit.id,
    match: 'body',
    snippet: hit.snippet,
    href: '/templates'
  };
}

function typeLabel(type: SearchHit['type']): string {
  switch (type) {
    case 'lesson':
      return 'Lesson';
    case 'unit':
      return 'Unit';
    case 'class':
      return 'Class';
    case 'subject':
      return 'Subject';
    case 'year':
      return 'Year';
    case 'scope_sequence':
      return 'Scope & Sequence';
    case 'scope_note':
      return 'Note';
    case 'resource':
      return 'Resource';
    case 'composition':
      return 'Composition';
    case 'action':
      return 'Action';
    default:
      return type;
  }
}

export function openSearchPanel(options: SearchPanelOptions): void {
  if (openRoot && document.body.contains(openRoot) && openInput) {
    openInput.focus();
    openInput.select();
    return;
  }

  const existing = document.querySelector(PANEL_ROOT_SELECTOR);
  existing?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'search-palette-backdrop';

  const panel = document.createElement('div');
  panel.className = 'search-palette glass-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Search');

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-palette__input';
  input.placeholder = 'Search lessons, units, classes…';
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'search-palette-list');
  input.autocomplete = 'off';

  const status = document.createElement('div');
  status.className = 'search-palette__status';
  status.setAttribute('aria-live', 'polite');

  const list = document.createElement('div');
  list.id = 'search-palette-list';
  list.className = 'search-palette__list';
  list.setAttribute('role', 'listbox');

  panel.append(input, status, list);
  backdrop.append(panel);
  document.body.append(backdrop);

  openRoot = backdrop;
  openInput = input;

  let selectedIndex = 0;
  let activatableHits: SearchHit[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let searchGeneration = 0;

  const close = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    document.removeEventListener('keydown', onDocumentKeydown, true);
    backdrop.remove();
    if (openRoot === backdrop) {
      openRoot = null;
      openInput = null;
    }
  };

  const activateHit = (hit: SearchHit): void => {
    if (hit.actionId) {
      options.onAction(hit.actionId);
      close();
      return;
    }
    if (hit.href) {
      options.onNavigate(hit.href);
      close();
    }
  };

  const updateSelection = (): void => {
    const rows = list.querySelectorAll<HTMLElement>('.search-palette__row');
    rows.forEach((row, index) => {
      const selected = index === selectedIndex;
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const renderRows = (rows: ListRow[], statusText = ''): void => {
    status.textContent = statusText;
    list.replaceChildren();
    activatableHits = [];

    for (const row of rows) {
      if (row.kind === 'heading') {
        const heading = document.createElement('div');
        heading.className = 'search-palette__heading';
        heading.textContent = row.label;
        list.append(heading);
        continue;
      }

      const hitIndex = activatableHits.length;
      activatableHits.push(row.hit);

      const option = document.createElement('div');
      option.className = 'search-palette__row';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', hitIndex === selectedIndex ? 'true' : 'false');
      option.dataset.hitIndex = String(hitIndex);

      const title = document.createElement('div');
      title.className = 'search-palette__title';
      title.textContent = row.hit.title;

      const meta = document.createElement('div');
      meta.className = 'search-palette__meta';

      const typeBadge = document.createElement('span');
      typeBadge.className = 'search-palette__type';
      typeBadge.textContent = typeLabel(row.hit.type);
      meta.append(typeBadge);

      if (row.hit.hierarchy) {
        const hierarchy = document.createElement('span');
        hierarchy.className = 'search-palette__hierarchy';
        hierarchy.textContent = row.hit.hierarchy;
        meta.append(hierarchy);
      }

      option.append(title, meta);

      if (row.hit.snippet) {
        const snippet = document.createElement('div');
        snippet.className = 'search-palette__snippet';
        snippet.textContent = row.hit.snippet;
        option.append(snippet);
      }

      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        selectedIndex = hitIndex;
        updateSelection();
        activateHit(row.hit);
      });

      list.append(option);
    }

    if (activatableHits.length === 0) {
      selectedIndex = 0;
    } else if (selectedIndex >= activatableHits.length) {
      selectedIndex = activatableHits.length - 1;
    }
    updateSelection();
  };

  const renderEmptyState = (): void => {
    const rows: ListRow[] = [];
    const recent = readRecent();
    if (recent.length > 0) {
      rows.push({ kind: 'heading', label: 'Recent' });
      for (const item of recent) {
        rows.push({
          kind: 'hit',
          hit: {
            type: item.type,
            id: item.id,
            title: item.title,
            match: 'title',
            href: recentHref(item.type, item.id)
          }
        });
      }
    }

    const actions = listSearchActions({
      path: options.path,
      hasLessonEditor: options.hasLessonEditor,
      todayClassId: options.todayClassId
    });
    if (actions.length > 0) {
      rows.push({ kind: 'heading', label: 'Actions' });
      for (const action of actions) {
        rows.push({ kind: 'hit', hit: actionToHit(action) });
      }
    }

    selectedIndex = 0;
    renderRows(rows);
  };

  const runSearch = async (rawQuery: string): Promise<void> => {
    const q = rawQuery.trim();
    if (!q) {
      renderEmptyState();
      return;
    }

    const generation = ++searchGeneration;
    const clientHits = searchCurriculumTitles(options.curriculum, q, options.compositions);
    const allActions = listSearchActions({
      path: options.path,
      hasLessonEditor: options.hasLessonEditor,
      todayClassId: options.todayClassId
    });
    const actionHits = filterActions(allActions, q).map(actionToHit);
    const baseHits = [...clientHits, ...actionHits];

    if (q.length < 2) {
      selectedIndex = 0;
      renderRows(
        baseHits.map((hit) => ({ kind: 'hit' as const, hit })),
        baseHits.length === 0 ? 'No matches' : ''
      );
      return;
    }

    selectedIndex = 0;
    renderRows(
      baseHits.map((hit) => ({ kind: 'hit' as const, hit })),
      'Searching content…'
    );

    try {
      const response = await options.fetchContentSearch(q);
      if (generation !== searchGeneration) return;
      const merged = mergeAndRankHits(baseHits, response.hits, (hit) =>
        enrichBodyHit(hit, options.curriculum, options.compositions)
      );
      renderRows(
        merged.map((hit) => ({ kind: 'hit' as const, hit })),
        merged.length === 0 ? 'No matches' : ''
      );
    } catch {
      if (generation !== searchGeneration) return;
      renderRows(
        baseHits.map((hit) => ({ kind: 'hit' as const, hit })),
        'Content search unavailable'
      );
    }
  };

  const scheduleSearch = (): void => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runSearch(input.value);
    }, DEBOUNCE_MS);
  };

  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!document.body.contains(backdrop)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (event.key === 'ArrowDown') {
      if (activatableHits.length === 0) return;
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % activatableHits.length;
      updateSelection();
      return;
    }

    if (event.key === 'ArrowUp') {
      if (activatableHits.length === 0) return;
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + activatableHits.length) % activatableHits.length;
      updateSelection();
      return;
    }

    if (event.key === 'Enter') {
      const hit = activatableHits[selectedIndex];
      if (!hit) return;
      event.preventDefault();
      activateHit(hit);
    }
  };

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  input.addEventListener('input', () => {
    scheduleSearch();
  });

  document.addEventListener('keydown', onDocumentKeydown, true);

  renderEmptyState();
  input.focus();
}
