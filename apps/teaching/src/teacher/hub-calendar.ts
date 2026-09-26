/**
 * Teaching hub calendar adapter — default filter, band fills, routeFor, mount.
 * No calendar CSS or renderer logic outside packages/design-kit.
 */
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from '../../design-kit/js/calendar/hub-calendar-zoom.js';
import { mountHubCalendar, type HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { withAppBase } from '@/app/base-path';
import { navigate } from '@/app/router';
import { patchScheduledLesson } from '@/teacher/schedule-api';

export const TEACHING_CALENDAR_FILLS = { school: 'periods' } as const;
/** Below this host width, dashboard embeds a link to the full Calendar page. */
export const TEACHING_CALENDAR_MIN_EMBED_PX = 720;

export type TeachingCalendarMountOptions = {
  classId?: string;
  today?: string;
  /** When true, zoom follows `/calendar/<zoom>` (Calendar page). Default for embeds: local zoom. */
  routeZoom?: boolean;
  onQuickAdd?: () => void;
  quickAddLabel?: string;
  onReschedule?: (
    scheduledId: string,
    patch: { date?: string; start_time?: string | null }
  ) => void | Promise<void>;
};

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

export function mountTeachingCalendar(
  host: HTMLElement,
  options: TeachingCalendarMountOptions = {}
): HubCalendarHandle {
  handle?.destroy();
  const routeZoom = options.routeZoom === true;
  let localZoom = 'week';
  const reschedule =
    options.onReschedule ??
    ((scheduledId, patch) => {
      void patchScheduledLesson(scheduledId, patch);
    });

  handle = mountHubCalendar(host, {
    hub: 'teaching',
    fills: { ...TEACHING_CALENDAR_FILLS },
    defaultFilter: defaultFilterForHub('teaching'),
    routeFor: teachingRouteFor,
    apiFetch,
    rootClass: 'class-calendar',
    today: options.today,
    classId: options.classId,
    onQuickAdd: options.onQuickAdd,
    quickAddLabel: options.quickAddLabel,
    onReschedule: (item, patch) => {
      const id = item && typeof item === 'object' ? String((item as { id?: string }).id || '') : '';
      if (!id) return;
      return reschedule(id, patch);
    },
    getZoom: () =>
      routeZoom
        ? parseCalendarZoom({ pathname: location.pathname, hash: location.hash }, 'teaching') || 'week'
        : localZoom,
    setZoom: (zoom) => {
      const next = normalizeCalendarZoom(zoom);
      if (routeZoom) {
        const full = withAppBase(calendarZoomHref('teaching', next));
        if (`${location.pathname}${location.search}` !== full) history.pushState(null, '', full);
      } else {
        localZoom = next;
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
