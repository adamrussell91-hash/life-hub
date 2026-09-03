import {
  isPedagogicalMode,
  type PedagogicalMode
} from '@/curriculum/pedagogical-mode';
import {
  DEFAULT_LESSONS_STATE,
  type LessonSortKey,
  type LessonStatusFilter,
  type LessonsDensity,
  type LessonsListState,
  type LessonsSmartFilter,
  type LessonsViewMode
} from './types';
import { withAppBase } from '@/app/base-path';

const SORT_KEYS: ReadonlySet<string> = new Set([
  'edited_desc',
  'edited_asc',
  'title_asc',
  'title_desc',
  'created_desc',
  'created_asc',
  'status'
]);

const STATUS_KEYS: ReadonlySet<string> = new Set(['draft', 'published', 'archived', 'needs_review']);
const VIEW_KEYS: ReadonlySet<string> = new Set(['library', 'table', 'map', 'mine']);
const DENSITY_KEYS: ReadonlySet<string> = new Set(['cards', 'compact']);
const SMART_KEYS: ReadonlySet<string> = new Set(['health', 'duplicates', 'today']);

function csv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function setCsv(params: URLSearchParams, key: string, values: string[]): void {
  if (values.length > 0) params.set(key, values.join(','));
}

export function parseLessonsSearch(search: string): LessonsListState {
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(trimmed);
  const sortRaw = params.get('sort') ?? '';
  const viewRaw = params.get('view') ?? '';
  const densityRaw = params.get('density') ?? '';
  const smartRaw = params.get('smart') ?? '';
  const statuses = csv(params.get('status')).filter((value): value is LessonStatusFilter =>
    STATUS_KEYS.has(value)
  );
  const modes = csv(params.get('mode')).filter((value): value is PedagogicalMode =>
    isPedagogicalMode(value)
  );

  return {
    q: (params.get('q') ?? '').trim(),
    units: csv(params.get('unit')),
    subjects: csv(params.get('subject')),
    modes,
    statuses,
    tags: csv(params.get('tag')),
    authors: csv(params.get('author')),
    outcomes: csv(params.get('outcome')),
    sort: SORT_KEYS.has(sortRaw) ? (sortRaw as LessonSortKey) : DEFAULT_LESSONS_STATE.sort,
    view: VIEW_KEYS.has(viewRaw) ? (viewRaw as LessonsViewMode) : DEFAULT_LESSONS_STATE.view,
    density: DENSITY_KEYS.has(densityRaw)
      ? (densityRaw as LessonsDensity)
      : DEFAULT_LESSONS_STATE.density,
    smart: SMART_KEYS.has(smartRaw) ? (smartRaw as Exclude<LessonsSmartFilter, null>) : null,
    savedViewId: params.get('saved') || null
  };
}

export function serializeLessonsSearch(state: LessonsListState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  setCsv(params, 'unit', state.units);
  setCsv(params, 'subject', state.subjects);
  setCsv(params, 'mode', state.modes);
  setCsv(params, 'status', state.statuses);
  setCsv(params, 'tag', state.tags);
  setCsv(params, 'author', state.authors);
  setCsv(params, 'outcome', state.outcomes);
  if (state.sort !== DEFAULT_LESSONS_STATE.sort) params.set('sort', state.sort);
  if (state.view !== DEFAULT_LESSONS_STATE.view) params.set('view', state.view);
  if (state.density !== DEFAULT_LESSONS_STATE.density) params.set('density', state.density);
  if (state.smart) params.set('smart', state.smart);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function writeLessonsSearch(state: LessonsListState): void {
  try {
    const next = `${withAppBase('/lessons')}${serializeLessonsSearch(state)}`;
    if (`${location.pathname}${location.search}` === next) return;
    history.replaceState(null, '', next);
  } catch {
    // tests / restricted history
  }
}
