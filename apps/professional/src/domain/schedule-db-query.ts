/**
 * Filter / sort / group state for Comms · Meetings · Events database views.
 * Mirrors Organisations query shape (URL-backed, defaults omitted from hash).
 */

export type ScheduleDbKind = 'comms' | 'meetings' | 'events';

export type CommsFilter = 'all' | 'outbound' | 'inbound' | 'email' | 'phone' | 'message' | 'in_person';
export type MeetingsFilter = 'all' | 'scheduled' | 'completed' | 'cancelled';
export type EventsFilter = 'all' | 'general' | 'professional_development' | 'scheduled' | 'completed';

export type ScheduleSort = 'newest' | 'oldest' | 'az';
export type ScheduleGroup = 'none' | 'month' | 'channel' | 'state' | 'type';

export interface ScheduleDbQueryState {
  filter: string;
  sort: ScheduleSort;
  group: ScheduleGroup;
  q: string;
}

export const SORT_LABELS: Record<ScheduleSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  az: 'A–Z'
};

export const GROUP_LABELS: Record<ScheduleDbKind, Record<string, string>> = {
  comms: { none: 'none', month: 'month', channel: 'channel' },
  meetings: { none: 'none', month: 'month', state: 'state' },
  events: { none: 'none', month: 'month', type: 'type' }
};

export const FILTER_LABELS: Record<ScheduleDbKind, Record<string, string>> = {
  comms: {
    all: 'All',
    outbound: 'Outbound',
    inbound: 'Inbound',
    email: 'Email',
    phone: 'Phone',
    message: 'Message',
    in_person: 'In person'
  },
  meetings: {
    all: 'All',
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled'
  },
  events: {
    all: 'All',
    general: 'General',
    professional_development: 'PD',
    scheduled: 'Scheduled',
    completed: 'Completed'
  }
};

export const FILTER_ORDER: Record<ScheduleDbKind, string[]> = {
  comms: ['all', 'outbound', 'inbound', 'email', 'phone', 'message', 'in_person'],
  meetings: ['all', 'scheduled', 'completed', 'cancelled'],
  events: ['all', 'general', 'professional_development', 'scheduled', 'completed']
};

export const GROUP_ORDER: Record<ScheduleDbKind, ScheduleGroup[]> = {
  comms: ['none', 'month', 'channel'],
  meetings: ['none', 'month', 'state'],
  events: ['none', 'month', 'type']
};

const SORTS = new Set<ScheduleSort>(['newest', 'oldest', 'az']);

export function defaultScheduleDbQuery(): ScheduleDbQueryState {
  return { filter: 'all', sort: 'newest', group: 'none', q: '' };
}

export function parseScheduleDbQuery(
  search: string,
  kind: ScheduleDbKind
): ScheduleDbQueryState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const filterRaw = params.get('filter') ?? 'all';
  const sortRaw = params.get('sort') ?? 'newest';
  const groupRaw = params.get('group') ?? 'none';
  const filters = new Set(FILTER_ORDER[kind]);
  const groups = new Set(GROUP_ORDER[kind]);
  return {
    filter: filters.has(filterRaw) ? filterRaw : 'all',
    sort: SORTS.has(sortRaw as ScheduleSort) ? (sortRaw as ScheduleSort) : 'newest',
    group: groups.has(groupRaw as ScheduleGroup) ? (groupRaw as ScheduleGroup) : 'none',
    q: params.get('q') ?? ''
  };
}

export function serializeScheduleDbQuery(state: ScheduleDbQueryState): string {
  const params = new URLSearchParams();
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.group !== 'none') params.set('group', state.group);
  if (state.q.trim()) params.set('q', state.q.trim());
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function activeScheduleFilterCount(state: ScheduleDbQueryState): number {
  let n = 0;
  if (state.filter !== 'all') n += 1;
  if (state.sort !== 'newest') n += 1;
  if (state.group !== 'none') n += 1;
  return n;
}
