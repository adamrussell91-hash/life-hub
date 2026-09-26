/**
 * Teaching hub calendar adapter — default filter, band fills, routeFor, mount only.
 * No calendar CSS or renderer logic outside packages/design-kit.
 */
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from '../../design-kit/js/calendar/hub-calendar-zoom.js';
import { mountHubCalendar, type HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { withAppBase } from '@/app/base-path';
import { navigate } from '@/app/router';

export const TEACHING_CALENDAR_FILLS = {
  school: 'periods'
} as const;

export function teachingRouteFor(item: unknown): string | null {
  const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  const record = row?.record && typeof row.record === 'object' ? (row.record as Record<string, unknown>) : null;
  const lessonId =
    (typeof row?.lesson_id === 'string' && row.lesson_id) ||
    (typeof record?.lesson_id === 'string' && record.lesson_id) ||
    null;
  if (lessonId) return `/lessons/${lessonId}`;
  const href = typeof row?.href === 'string' ? row.href : typeof record?.href === 'string' ? record.href : null;
  if (href?.startsWith('/')) return href;
  // Cross-hub full paths
  const type = String(record?.type || row?.source || row?.kind || '');
  const id = String(record?.id || row?.id || '');
  if ((type === 'task' || type === 'work_block') && id) return `/tasks/#/task/${encodeURIComponent(id)}`;
  if (type === 'professional_meeting' && id) return `/professional/#/meeting/${encodeURIComponent(id)}`;
  if (type === 'professional_event' && id) {
    const ref = String(record?.source_ref || id);
    const eventId = ref.includes(':') ? ref.split(':').pop()! : ref;
    return `/professional/#/event/${encodeURIComponent(eventId)}`;
  }
  if (type === 'knowledge_page' && id) return `/knowledge/#page/${encodeURIComponent(id)}`;
  return null;
}

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'include', ...(init ?? {}) });
}

let handle: HubCalendarHandle | null = null;

/** Mount the locked kit calendar. Zoom follows `/calendar/<zoom>` via the Teaching router. */
export function mountTeachingCalendar(host: HTMLElement): HubCalendarHandle {
  handle?.destroy();
  handle = mountHubCalendar(host, {
    hub: 'teaching',
    fills: { ...TEACHING_CALENDAR_FILLS },
    defaultFilter: defaultFilterForHub('teaching'),
    routeFor: teachingRouteFor,
    apiFetch,
    rootClass: 'class-calendar',
    getZoom: () =>
      parseCalendarZoom(
        { pathname: location.pathname, hash: location.hash },
        'teaching'
      ) || 'week',
    setZoom: (zoom) => {
      // Update the path without notifying the SPA router so the mount stays put and tweens.
      const path = calendarZoomHref('teaching', normalizeCalendarZoom(zoom));
      const full = withAppBase(path);
      if (`${location.pathname}${location.search}` !== full) {
        history.pushState(null, '', full);
      }
    },
    onNavigate: (href) => navigate(href)
  });
  return handle;
}

export function unmountTeachingCalendar(): void {
  handle?.destroy();
  handle = null;
}
