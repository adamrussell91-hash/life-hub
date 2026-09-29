/**
 * What a calendar item is, what the calendar may change on it, and how to save it.
 * Shared by Tideline (week / linear day), Day Dial and Term River in every hub.
 *
 * Writes go straight to the owning hub's API through the adapter's apiFetch, so a
 * task dragged in Life, Teaching or Professional lands in the same record Tasks reads.
 */
import { hubDomainForItem, openInHubHref, openInHubLabel } from './open-in-hub.js';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const TYPE_LABEL = Object.freeze({
  task: 'Task',
  work_block: 'Work block',
  scheduled_lesson: 'Class',
  professional_meeting: 'Meeting',
  professional_event: 'Event',
  professional_communication: 'Comms',
  ledger_item: 'Promise',
  calendar_block: 'Block',
  workout: 'Workout',
  medical: 'Health',
  knowledge_page: 'Note',
  meal: 'Meal',
  diary: 'Diary',
  sleep: 'Sleep',
  skincare: 'Skincare'
});

/** Life sections that own each log type (umbrella hash routes). */
const LIFE_SECTION = Object.freeze({
  meal: '/#/nutrition',
  workout: '/#/fitness',
  diary: '/#/mind',
  skincare: '/#/skincare',
  sleep: '/#/body',
  medical: '/#/body-medical',
  calendar_block: '/#/calendar'
});

/** @param {unknown} item */
export function itemRecord(item) {
  if (!item || typeof item !== 'object') return {};
  const row = /** @type {Record<string, any>} */ (item);
  return row.record && typeof row.record === 'object' ? row.record : row;
}

/** @param {unknown} item */
export function itemType(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {};
  const record = itemRecord(item);
  const type = String(record.type || row.source || '');
  if (type) return type;
  if (row.kind === 'promise') return 'ledger_item';
  // Due rows are tasks by kind; a timed grid chip must name its source to be written.
  if (row.kind === 'task' && row.start == null) return 'task';
  return '';
}

/** @param {unknown} item */
export function itemId(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {};
  const record = itemRecord(item);
  return String(record.id || row.id || '');
}

/** @param {unknown} item */
export function itemTypeLabel(item) {
  const record = itemRecord(item);
  // iCloud rows name their calendar ("Family", "Health appointments").
  if (typeof record.source_calendar === 'string' && record.source_calendar) return record.source_calendar;
  return TYPE_LABEL[itemType(item)] || '';
}

/** Items the calendar can move to another day (and time, when timed). */
export function canMoveItem(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {};
  if (row.ghost || itemRecord(item).ghost) return false;
  const type = itemType(item);
  return type === 'task' || type === 'work_block' || type === 'scheduled_lesson';
}

/** Items whose start and end can be dragged. Lessons run a fixed period; tasks have no end. */
export function canResizeItem(item) {
  return canMoveItem(item) && itemType(item) === 'work_block';
}

/**
 * Fields the item card may edit. Order is display order.
 * @returns {Array<'title'|'date'|'time'|'duration'|'notes'>}
 */
export function editableFields(item) {
  if (!canMoveItem(item)) return [];
  const type = itemType(item);
  if (type === 'task') return ['title', 'date', 'time', 'bookmark', 'notes'];
  if (type === 'work_block') return ['title', 'date', 'time', 'duration'];
  if (type === 'scheduled_lesson') return ['date', 'time'];
  return [];
}

function umbrellaPath(item) {
  const record = itemRecord(item);
  const type = itemType(item);
  const id = itemId(item);
  if (!id) return null;
  if (type === 'task' || type === 'work_block') {
    const taskId = type === 'work_block' && typeof record.task_id === 'string' && record.task_id ? record.task_id : id;
    return `/tasks/#/task/${encodeURIComponent(taskId)}`;
  }
  if (type === 'scheduled_lesson') {
    const lessonId = typeof record.lesson_id === 'string' && record.lesson_id ? record.lesson_id : null;
    return lessonId ? `/teaching/lessons/${encodeURIComponent(lessonId)}` : '/teaching/calendar';
  }
  const href = typeof record.href === 'string' ? record.href : '';
  if (href.startsWith('/')) return href;
  if (type.startsWith('professional_')) {
    if (href.startsWith('#/')) return `/professional/${href}`;
    const ref = String(record.source_ref || id);
    const tail = encodeURIComponent(ref.includes(':') ? ref.split(':').pop() : ref);
    if (type === 'professional_meeting') return `/professional/#/meeting/${tail}`;
    if (type === 'professional_event') return `/professional/#/event/${tail}`;
    return '/professional/#/calendar';
  }
  if (type === 'ledger_item') return '/professional/#/people';
  if (LIFE_SECTION[type]) return LIFE_SECTION[type];
  if (type === 'knowledge_page') return `/knowledge/#page/${encodeURIComponent(id)}`;
  return null;
}

/**
 * Absolute same-origin URL for "open in a new tab". A new tab has no SPA router
 * state, so hub-relative routes ("#/task/x", "/lessons/x") are resolved to the
 * umbrella path of the item's owning hub first.
 * @param {unknown} item
 * @param {{ routeFor?: (item: unknown) => string | null | undefined, location?: { href: string } | null }} [opts]
 */
export function newTabHref(item, opts = {}) {
  const base = opts.location?.href || globalThis.location?.href || 'https://life-hub.adam-russell.com/';
  const direct = umbrellaPath(item);
  let href = direct;
  if (!href) {
    const routed = openInHubHref(item, opts.routeFor);
    if (typeof routed === 'string' && routed) href = routed;
  }
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/** Label for the new-tab control ("Open in Tasks"). */
export function newTabLabel(item) {
  return openInHubLabel(hubDomainForItem(item) || hubDomainForItem({ source: itemType(item) }));
}

/**
 * Normalised patch → the owning API's request.
 * @param {unknown} item
 * @param {{ date?: string, start_time?: string | null, duration_min?: number, title?: string, notes?: string }} patch
 * @returns {{ path: string, method: string, body: Record<string, unknown> } | null}
 */
export function itemPatchRequest(item, patch) {
  const type = itemType(item);
  const id = itemId(item);
  if (!id || !canMoveItem(item)) return null;
  const body = {};
  const date = typeof patch.date === 'string' && DATE_KEY.test(patch.date) ? patch.date : undefined;
  const time = patch.start_time === null ? null
    : typeof patch.start_time === 'string' && TIME_KEY.test(patch.start_time) ? patch.start_time : undefined;
  const title = typeof patch.title === 'string' ? patch.title.trim() : undefined;
  if (type === 'task') {
    if (date) body.due_date = date;
    if (time !== undefined) body.due_time = time;
    if (title) body.title = title;
    if (typeof patch.notes === 'string') body.description = patch.notes;
    if (typeof patch.bookmark === 'string') {
      const note = patch.bookmark.replace(/\s+/g, ' ').trim().slice(0, 280);
      body.bookmark = note ? { note, at: new Date().toISOString(), source: 'calendar' } : null;
    }
    if (!Object.keys(body).length) return null;
    return { path: `/api/tasks?id=${encodeURIComponent(id)}`, method: 'PATCH', body };
  }
  if (type === 'work_block') {
    if (date) body.date = date;
    if (time) body.start_time = time;
    if (Number.isFinite(patch.duration_min) && patch.duration_min > 0) body.duration_minutes = Math.round(patch.duration_min);
    if (title) body.title = title;
    if (!Object.keys(body).length) return null;
    return { path: `/api/work-blocks?id=${encodeURIComponent(id)}`, method: 'PATCH', body };
  }
  if (type === 'scheduled_lesson') {
    if (date) body.date = date;
    if (time !== undefined) body.start_time = time;
    if (!Object.keys(body).length) return null;
    return { path: `/api/scheduled-lessons/${encodeURIComponent(id)}`, method: 'PATCH', body };
  }
  return null;
}

/**
 * Save a calendar edit through the owning hub's API.
 * @param {(path: string, init?: RequestInit) => Promise<Response>} apiFetch
 */
export async function saveCalendarItem(apiFetch, item, patch) {
  const request = itemPatchRequest(item, patch);
  if (!request) throw new Error('This item cannot be changed from the calendar.');
  const fetcher = typeof apiFetch === 'function' ? apiFetch : globalThis.fetch;
  const response = await fetcher(request.path, {
    method: request.method,
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(request.body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error?.message;
    throw new Error(typeof message === 'string' && message ? message : `Save failed (${response.status}).`);
  }
  return payload?.data ?? payload;
}

/**
 * Patch for a drag. Timed items keep their length; untimed tasks stay untimed
 * unless dropped on the time grid.
 * @param {unknown} item
 * @param {{ date: string, start_time?: string | null, end_time?: string | null }} target
 */
export function dragPatch(item, target) {
  const record = itemRecord(item);
  const patch = { date: target.date };
  if (target.start_time !== undefined) patch.start_time = target.start_time;
  if (target.end_time && patch.start_time) {
    const [sh, sm] = patch.start_time.split(':').map(Number);
    const [eh, em] = target.end_time.split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes > 0) patch.duration_min = minutes;
  } else if (itemType(item) === 'work_block' && patch.start_time) {
    const duration = Number(record.duration_min) || 60;
    patch.duration_min = duration;
  }
  return patch;
}

