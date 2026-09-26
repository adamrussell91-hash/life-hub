/**
 * Directory filter/sort/group state in the URL query (Phase 1.2, V2).
 */

export type DirectorySort =
  | 'needs_attention'
  | 'seeing_soon'
  | 'going_cold'
  | 'recently_in_touch'
  | 'newest'
  | 'az'
  | 'organisation';

export type DirectoryGroup = 'organisation' | 'relationship' | 'none';

export type WarmthFilter = 'all' | 'warm' | 'cooling' | 'cold';
export type OrgScopeFilter = 'all' | 'current' | 'former';

export interface DirectoryQueryState {
  sort: DirectorySort;
  group: DirectoryGroup;
  role: string | null;
  org: string | null;
  orgScope: OrgScopeFilter;
  warmth: WarmthFilter;
  hasOpen: boolean;
  q: string;
}

export const SORT_LABELS: Record<DirectorySort, string> = {
  needs_attention: 'Needs attention',
  seeing_soon: 'Seeing soon',
  going_cold: 'Going cold',
  recently_in_touch: 'Recently in touch',
  newest: 'Newest connections',
  az: 'Name A–Z',
  organisation: 'Organisation'
};

export const GROUP_LABELS: Record<DirectoryGroup, string> = {
  organisation: 'By organisation',
  relationship: 'By relationship',
  none: 'No grouping'
};

const SORTS = new Set<DirectorySort>([
  'needs_attention',
  'seeing_soon',
  'going_cold',
  'recently_in_touch',
  'newest',
  'az',
  'organisation'
]);

const GROUPS = new Set<DirectoryGroup>(['organisation', 'relationship', 'none']);

export function defaultDirectoryQuery(): DirectoryQueryState {
  return {
    sort: 'needs_attention',
    group: 'organisation',
    role: null,
    org: null,
    orgScope: 'all',
    warmth: 'all',
    hasOpen: false,
    q: ''
  };
}

export function parseDirectoryQuery(search: string): DirectoryQueryState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const sortRaw = params.get('sort') ?? 'needs_attention';
  const groupRaw = params.get('group') ?? 'organisation';
  const warmthRaw = params.get('warmth') ?? 'all';
  const orgScopeRaw = params.get('orgScope') ?? 'all';
  return {
    sort: SORTS.has(sortRaw as DirectorySort) ? (sortRaw as DirectorySort) : 'needs_attention',
    group: GROUPS.has(groupRaw as DirectoryGroup) ? (groupRaw as DirectoryGroup) : 'organisation',
    role: params.get('role'),
    org: params.get('org'),
    orgScope:
      orgScopeRaw === 'current' || orgScopeRaw === 'former' || orgScopeRaw === 'all'
        ? orgScopeRaw
        : 'all',
    warmth:
      warmthRaw === 'warm' || warmthRaw === 'cooling' || warmthRaw === 'cold' || warmthRaw === 'all'
        ? warmthRaw
        : 'all',
    hasOpen: params.get('open') === '1',
    q: params.get('q') ?? ''
  };
}

export function serializeDirectoryQuery(state: DirectoryQueryState): string {
  const params = new URLSearchParams();
  if (state.sort !== 'needs_attention') params.set('sort', state.sort);
  if (state.group !== 'organisation') params.set('group', state.group);
  if (state.role) params.set('role', state.role);
  if (state.org) params.set('org', state.org);
  if (state.orgScope !== 'all') params.set('orgScope', state.orgScope);
  if (state.warmth !== 'all') params.set('warmth', state.warmth);
  if (state.hasOpen) params.set('open', '1');
  if (state.q.trim()) params.set('q', state.q.trim());
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function activeFilterCount(state: DirectoryQueryState): number {
  let n = 0;
  if (state.role) n += 1;
  if (state.org || state.orgScope !== 'all') n += 1;
  if (state.warmth !== 'all') n += 1;
  if (state.hasOpen) n += 1;
  return n;
}
