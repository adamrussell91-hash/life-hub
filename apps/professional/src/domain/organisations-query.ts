/**
 * Organisations crest-wall filter/sort/group state in the URL query (V2).
 */

export type OrgsFilter =
  | 'all'
  | 'work'
  | 'study'
  | 'events'
  | 'bodies'
  | 'prospects';

export type OrgsSort = 'most_active' | 'newest' | 'az' | 'most_people';
export type OrgsGroup = 'none' | 'relationship';

export interface OrgsQueryState {
  filter: OrgsFilter;
  sort: OrgsSort;
  group: OrgsGroup;
  q: string;
}

export const FILTER_LABELS: Record<OrgsFilter, string> = {
  all: 'All',
  work: 'Work',
  study: 'Study & placement',
  events: 'Events & PD',
  bodies: 'Professional bodies',
  prospects: 'Prospects'
};

export const SORT_LABELS: Record<OrgsSort, string> = {
  most_active: 'Most active',
  newest: 'Newest',
  az: 'A–Z',
  most_people: 'Most people'
};

export const GROUP_LABELS: Record<OrgsGroup, string> = {
  none: 'none',
  relationship: 'relationship'
};

const FILTERS = new Set<OrgsFilter>(['all', 'work', 'study', 'events', 'bodies', 'prospects']);
const SORTS = new Set<OrgsSort>(['most_active', 'newest', 'az', 'most_people']);
const GROUPS = new Set<OrgsGroup>(['none', 'relationship']);

export function defaultOrgsQuery(): OrgsQueryState {
  return { filter: 'all', sort: 'most_active', group: 'none', q: '' };
}

export function parseOrgsQuery(search: string): OrgsQueryState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const filterRaw = params.get('filter') ?? 'all';
  const sortRaw = params.get('sort') ?? 'most_active';
  const groupRaw = params.get('group') ?? 'none';
  return {
    filter: FILTERS.has(filterRaw as OrgsFilter) ? (filterRaw as OrgsFilter) : 'all',
    sort: SORTS.has(sortRaw as OrgsSort) ? (sortRaw as OrgsSort) : 'most_active',
    group: GROUPS.has(groupRaw as OrgsGroup) ? (groupRaw as OrgsGroup) : 'none',
    q: params.get('q') ?? ''
  };
}

/** Omit defaults so the hash stays clean (V2). */
export function serializeOrgsQuery(state: OrgsQueryState): string {
  const params = new URLSearchParams();
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.sort !== 'most_active') params.set('sort', state.sort);
  if (state.group !== 'none') params.set('group', state.group);
  if (state.q.trim()) params.set('q', state.q.trim());
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function activeOrgsFilterCount(state: OrgsQueryState): number {
  let n = 0;
  if (state.filter !== 'all') n += 1;
  if (state.sort !== 'most_active') n += 1;
  if (state.group !== 'none') n += 1;
  return n;
}
