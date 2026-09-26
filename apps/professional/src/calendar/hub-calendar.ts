/**
 * Professional hub calendar adapter — default filter, band fills, routeFor, mount.
 * No calendar CSS or renderer logic outside packages/design-kit.
 */
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from '../../design-kit/js/calendar/hub-calendar-zoom.js';
import { mountHubCalendar, type HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { getApiBaseUrl } from '@/api/config';
import { eventRoute, meetingRoute } from '@/app/router';

export const PROFESSIONAL_CALENDAR_FILLS = {
  school: 'meetings'
} as const;

export type ProfessionalCalendarMountOptions = {
  /** When true, zoom follows `#/calendar/<zoom>`. Home embed uses local zoom. */
  routeZoom?: boolean;
};

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
  if (type === 'scheduled_lesson' && (record?.lesson_id || id)) {
    const lessonId = typeof record?.lesson_id === 'string' ? record.lesson_id : id;
    return `/teaching/lessons/${encodeURIComponent(String(lessonId))}`;
  }
  if (type === 'knowledge_page' && id) return `/knowledge/#page/${encodeURIComponent(id)}`;
  return null;
}

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Pages host has no /api — Functions live on api.adam-russell.com (same as api/client).
  return fetch(`${getApiBaseUrl()}${path}`, { credentials: 'include', ...(init ?? {}) });
}

let handle: HubCalendarHandle | null = null;

export function mountProfessionalCalendar(
  host: HTMLElement,
  options: ProfessionalCalendarMountOptions = {}
): HubCalendarHandle {
  handle?.destroy();
  const routeZoom = options.routeZoom === true;
  let localZoom = 'week';

  handle = mountHubCalendar(host, {
    hub: 'professional',
    fills: { ...PROFESSIONAL_CALENDAR_FILLS },
    defaultFilter: defaultFilterForHub('professional'),
    routeFor: professionalRouteFor,
    apiFetch,
    getZoom: () =>
      routeZoom
        ? parseCalendarZoom({ pathname: location.pathname, hash: location.hash }, 'professional') ||
          'week'
        : localZoom,
    setZoom: (zoom) => {
      const next = normalizeCalendarZoom(zoom);
      if (routeZoom) {
        const href = calendarZoomHref('professional', next);
        if (location.hash !== href) location.hash = href;
      } else {
        localZoom = next;
      }
    },
    onNavigate: (href) => {
      if (href.startsWith('#')) location.hash = href;
      else location.assign(href);
    }
  });
  return handle;
}

export function unmountProfessionalCalendar(): void {
  handle?.destroy();
  handle = null;
}
