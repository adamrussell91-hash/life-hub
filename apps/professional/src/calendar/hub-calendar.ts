/**
 * Professional hub calendar adapter — default filter, band fills, routeFor, mount only.
 * No calendar CSS or renderer logic outside packages/design-kit.
 */
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from '../../design-kit/js/calendar/hub-calendar-zoom.js';
import { mountHubCalendar, type HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { eventRoute, meetingRoute } from '@/app/router';

export const PROFESSIONAL_CALENDAR_FILLS = {
  school: 'meetings'
} as const;

export function professionalRouteFor(item: unknown): string | null {
  const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  const record = row?.record && typeof row.record === 'object' ? (row.record as Record<string, unknown>) : null;
  const type = String(record?.type || row?.source || '');
  const href = typeof record?.href === 'string' ? record.href : typeof row?.href === 'string' ? row.href : null;
  if (href?.startsWith('#/') || href?.startsWith('/')) return href;
  const ref = String(record?.source_ref || record?.id || row?.id || '');
  const id = ref.includes(':') ? ref.split(':').pop()! : ref;
  if (type === 'professional_meeting' && id) return meetingRoute(id);
  if (type === 'professional_event' && id) return eventRoute(id);
  if ((type === 'task' || type === 'work_block') && id) return `/tasks/#/task/${encodeURIComponent(id)}`;
  if (type === 'scheduled_lesson' && id) return `/teaching/lessons/${encodeURIComponent(id)}`;
  if (type === 'knowledge_page' && id) return `/knowledge/#page/${encodeURIComponent(id)}`;
  return null;
}

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'include', ...(init ?? {}) });
}

let handle: HubCalendarHandle | null = null;

/** Mount the locked kit calendar. Zoom follows `#/calendar/<zoom>`. */
export function mountProfessionalCalendar(host: HTMLElement): HubCalendarHandle {
  handle?.destroy();
  handle = mountHubCalendar(host, {
    hub: 'professional',
    fills: { ...PROFESSIONAL_CALENDAR_FILLS },
    defaultFilter: defaultFilterForHub('professional'),
    routeFor: professionalRouteFor,
    apiFetch,
    getZoom: () =>
      parseCalendarZoom({ pathname: location.pathname, hash: location.hash }, 'professional') || 'week',
    setZoom: (zoom) => {
      const href = calendarZoomHref('professional', normalizeCalendarZoom(zoom));
      if (location.hash !== href) location.hash = href;
    }
  });
  return handle;
}

export function unmountProfessionalCalendar(): void {
  handle?.destroy();
  handle = null;
}
