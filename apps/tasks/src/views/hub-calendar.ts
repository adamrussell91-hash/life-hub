/**
 * Tasks hub calendar adapter — default filter, band fills, routeFor, mount only.
 * No calendar CSS or renderer logic outside packages/design-kit.
 * Shell wiring (replace calendar.ts) is Step 6; this file is the Step 3 contract.
 */
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from '../../design-kit/js/calendar/hub-calendar-zoom.js';
import { mountHubCalendar, type HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { taskPageHash } from '@/domain/cards';

export const TASKS_CALENDAR_FILLS = {
  after: 'work'
} as const;

export function tasksRouteFor(item: unknown): string | null {
  const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  const record = row?.record && typeof row.record === 'object' ? (row.record as Record<string, unknown>) : null;
  const type = String(record?.type || row?.source || '');
  const id = String(record?.id || row?.id || '');
  if ((type === 'task' || type === 'work_block' || row?.kind === 'task') && id) return taskPageHash(id);
  if (type === 'scheduled_lesson' && id) return `/teaching/lessons/${encodeURIComponent(id)}`;
  if (type === 'professional_meeting' && id) return `/professional/#/meeting/${encodeURIComponent(id)}`;
  if (type === 'professional_event' && id) {
    const ref = String(record?.source_ref || id);
    const eventId = ref.includes(':') ? ref.split(':').pop()! : ref;
    return `/professional/#/event/${encodeURIComponent(eventId)}`;
  }
  if (type === 'knowledge_page' && id) return `/knowledge/#page/${encodeURIComponent(id)}`;
  const href = typeof record?.href === 'string' ? record.href : typeof row?.href === 'string' ? row.href : null;
  return href || null;
}

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'include', ...(init ?? {}) });
}

let handle: HubCalendarHandle | null = null;

/** Mount the locked kit calendar. Zoom follows `#/day|week|term|year|almanac`. */
export function mountTasksCalendar(host: HTMLElement): HubCalendarHandle {
  handle?.destroy();
  handle = mountHubCalendar(host, {
    hub: 'tasks',
    fills: { ...TASKS_CALENDAR_FILLS },
    defaultFilter: defaultFilterForHub('tasks'),
    routeFor: tasksRouteFor,
    apiFetch,
    getZoom: () =>
      parseCalendarZoom({ pathname: location.pathname, hash: location.hash }, 'tasks') || 'week',
    setZoom: (zoom) => {
      const href = calendarZoomHref('tasks', normalizeCalendarZoom(zoom));
      if (location.hash !== href) location.hash = href;
    }
  });
  return handle;
}

export function unmountTasksCalendar(): void {
  handle?.destroy();
  handle = null;
}
