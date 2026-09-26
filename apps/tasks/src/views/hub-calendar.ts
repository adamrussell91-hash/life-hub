/**
 * Tasks hub calendar adapter — default filter, band fills, routeFor, mount only.
 * KEEP chrome (plan-work, lens, agenda, pinch, keys, rail) lives in hub-calendar-chrome.ts.
 */
import { defaultFilterForHub } from '../../design-kit/js/calendar/calendar-filter.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from '../../design-kit/js/calendar/hub-calendar-zoom.js';
import { mountHubCalendar, type HubCalendarHandle } from '../../design-kit/js/calendar/mount-hub-calendar.js';
import { getApiBaseUrl } from '@/api/config';
import { taskPageHash } from '@/domain/cards';
import { tasksApi } from '@/services/client-api';
import {
  isPlanWorkMode,
  mountTasksCalendarChrome,
  type TasksChromeMount
} from '@/views/hub-calendar-chrome';

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
  // Pages host has no /api — Functions live on api.adam-russell.com (same as api/client).
  return fetch(`${getApiBaseUrl()}${path}`, { credentials: 'include', ...(init ?? {}) });
}

function itemType(item: unknown): string {
  const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  const record = row?.record && typeof row.record === 'object' ? (row.record as Record<string, unknown>) : null;
  return String(record?.type || row?.source || row?.kind || '');
}

function itemId(item: unknown): string {
  const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
  const record = row?.record && typeof row.record === 'object' ? (row.record as Record<string, unknown>) : null;
  return String(record?.id || row?.id || '');
}

async function rescheduleItem(
  item: unknown,
  patch: { date: string; start_time?: string | null }
): Promise<void> {
  const id = itemId(item);
  if (!id || !patch.date) return;
  const type = itemType(item);
  if (isPlanWorkMode() && (type === 'task' || type === 'deadline')) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const record = row?.record && typeof row.record === 'object' ? (row.record as Record<string, unknown>) : null;
    await tasksApi.createWorkBlock({
      title: String(record?.title || row?.title || 'Work block'),
      date: patch.date,
      start_time: patch.start_time || '09:00',
      duration_minutes: Number(record?.estimated_duration ?? 60),
      task_id: id,
      status: 'confirmed',
      source: 'manual'
    });
    return;
  }
  if (type === 'work_block') {
    await tasksApi.updateWorkBlock(id, {
      date: patch.date,
      ...(patch.start_time !== undefined ? { start_time: patch.start_time } : {})
    });
    return;
  }
  if (type === 'task' || type === 'deadline') {
    await tasksApi.updateTask(id, {
      due_date: patch.date,
      ...(patch.start_time !== undefined ? { due_time: patch.start_time } : {})
    });
  }
}

let handle: HubCalendarHandle | null = null;
let chrome: TasksChromeMount | null = null;

/** Mount the locked kit calendar with Tasks KEEP chrome around it. */
export function mountTasksCalendar(host: HTMLElement): HubCalendarHandle {
  handle?.destroy();
  chrome?.destroy();
  chrome = mountTasksCalendarChrome(host);
  handle = mountHubCalendar(chrome.calendarHost, {
    hub: 'tasks',
    fills: { ...TASKS_CALENDAR_FILLS },
    defaultFilter: defaultFilterForHub('tasks'),
    routeFor: tasksRouteFor,
    apiFetch,
    onReschedule: (item, patch) => rescheduleItem(item, patch),
    getZoom: () =>
      parseCalendarZoom({ pathname: location.pathname, hash: location.hash }, 'tasks') || 'week',
    setZoom: (zoom) => {
      const href = calendarZoomHref('tasks', normalizeCalendarZoom(zoom));
      if (location.hash !== href) location.hash = href;
      void chrome?.refresh({ zoom: normalizeCalendarZoom(zoom) });
    },
    onNavigate: (href) => {
      if (href.startsWith('#')) location.hash = href;
      else location.assign(href);
    }
  });
  return handle;
}

export function unmountTasksCalendar(): void {
  handle?.destroy();
  handle = null;
  chrome?.destroy();
  chrome = null;
}
