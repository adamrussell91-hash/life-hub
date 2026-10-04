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

/** Statuses the calendar may set, in display order (same columns as the Tasks board). */
export const STATUS_CHOICES = Object.freeze({
  task: Object.freeze([['open', 'To do'], ['in_progress', 'Doing'], ['done', 'Done']]),
  work_block: Object.freeze([['confirmed', 'Planned'], ['in_progress', 'Doing'], ['done', 'Done']])
});

/** Tasks and work blocks can be ticked off from any calendar view. */
export function canTickItem(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {};
  if (row.ghost || itemRecord(item).ghost) return false;
  const type = itemType(item);
  return (type === 'task' || type === 'work_block') && Boolean(itemId(item));
}

/** @param {unknown} item */
export function isItemDone(item) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {};
  return row.done === true || itemRecord(item).status === 'done';
}

/**
 * The status writes for one change, each with the value to restore on undo.
 * Ticking off a task's last open work block ticks the task too; reopening a block of
 * a done task reopens the task. A task with other open blocks stays open.
 * @param {unknown} item
 * @param {string} status
 * @returns {Array<{ path: string, method: 'PATCH', body: { status: string }, before: { status: string } }>}
 */
export function statusRequests(item, status) {
  const row = item && typeof item === 'object' ? /** @type {Record<string, any>} */ (item) : {};
  const record = itemRecord(item);
  const type = itemType(item);
  const id = itemId(item);
  const allowed = STATUS_CHOICES[type];
  if (!id || !allowed || !allowed.some(([value]) => value === status)) return [];
  const own = type === 'task'
    ? `/api/tasks?id=${encodeURIComponent(id)}`
    : `/api/work-blocks?id=${encodeURIComponent(id)}`;
  const before = typeof record.status === 'string' && record.status ? record.status : allowed[0][0];
  const out = [{ path: own, method: /** @type {const} */ ('PATCH'), body: { status }, before: { status: before } }];
  const taskId = type === 'work_block' && typeof record.task_id === 'string' ? record.task_id : '';
  if (taskId) {
    const taskBefore = typeof row.taskStatus === 'string' ? row.taskStatus : 'open';
    const ownOpen = before !== 'done' && before !== 'cancelled' ? 1 : 0;
    const othersOpen = Math.max(0, (Number(row.taskOpenBlocks) || 0) - ownOpen);
    const path = `/api/tasks?id=${encodeURIComponent(taskId)}`;
    if (status === 'done' && taskBefore !== 'done' && othersOpen === 0) {
      out.push({ path, method: 'PATCH', body: { status: 'done' }, before: { status: taskBefore } });
    } else if (status !== 'done' && taskBefore === 'done') {
      out.push({ path, method: 'PATCH', body: { status: 'open' }, before: { status: 'done' } });
    }
  }
  return out;
}

async function sendJson(apiFetch, request, body) {
  const fetcher = typeof apiFetch === 'function' ? apiFetch : globalThis.fetch;
  const response = await fetcher(request.path, {
    method: request.method,
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error?.message;
    throw new Error(typeof message === 'string' && message ? message : `Save failed (${response.status}).`);
  }
  return payload?.data ?? payload;
}

/**
 * Set a task or work block's status. Resolves to an undo function that restores
 * what was there before.
 * @param {(path: string, init?: RequestInit) => Promise<Response>} apiFetch
 */
export async function setItemStatus(apiFetch, item, status) {
  const requests = statusRequests(item, status);
  if (!requests.length) throw new Error('This item cannot be ticked off from the calendar.');
  for (const request of requests) await sendJson(apiFetch, request, request.body);
  return async () => {
    for (const request of [...requests].reverse()) await sendJson(apiFetch, request, request.before);
  };
}

/** One-tap tick: done ↔ back open. Resolves to undo. */
export function toggleItemDone(apiFetch, item) {
  const type = itemType(item);
  const reopen = type === 'work_block' ? 'confirmed' : 'open';
  return setItemStatus(apiFetch, item, isItemDone(item) ? reopen : 'done');
}

/** Items whose start and end can be dragged. Lessons run a fixed period; tasks have no end. */
export function canResizeItem(item) {
  return canMoveItem(item) && itemType(item) === 'work_block';
}

/**
 * Fields the item card may edit. Order is display order.
 * @returns {Array<'title'|'date'|'time'|'duration'|'bookmark'|'resumability'|'max_block'|'notes'>}
 */
export function editableFields(item) {
  if (!canMoveItem(item)) return [];
  const type = itemType(item);
  if (type === 'task') return ['title', 'date', 'time', 'bookmark', 'resumability', 'max_block', 'notes'];
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
  // "I've dropped this" on a repeating iCloud event: frees its weekly slot (advisory).
  if (patch?.freed && typeof itemRecord(item).series === 'string') {
    const record = itemRecord(item);
    const row = /** @type {Record<string, any>} */ (item);
    const start = TIME_KEY.test(record.time ?? '') ? record.time : null;
    const end = TIME_KEY.test(record.end_time ?? '') ? record.end_time : null;
    if (!start || !end || !DATE_KEY.test(record.date ?? row.date ?? '')) return null;
    return {
      path: '/api/calendar-freed',
      method: 'POST',
      body: {
        series: record.series,
        title: String(record.title || row.title || 'Dropped'),
        date: record.date ?? row.date,
        start,
        end,
        reason: typeof patch.freed.reason === 'string' ? patch.freed.reason.trim().slice(0, 160) : ''
      }
    };
  }
  if (!id || !canMoveItem(item)) return null;
  const body = {};
  const date = typeof patch.date === 'string' && DATE_KEY.test(patch.date) ? patch.date : undefined;
  const time = patch.start_time === null ? null
    : typeof patch.start_time === 'string' && TIME_KEY.test(patch.start_time) ? patch.start_time : undefined;
  const title = typeof patch.title === 'string' ? patch.title.trim() : undefined;
  if (type === 'task' && patch.block && typeof patch.block === 'object') {
    // Plan time for the task: a work block linked to it. The due date and time stay the deadline.
    const block = patch.block;
    const start = TIME_KEY.test(block.start_time ?? '') ? block.start_time : null;
    const end = TIME_KEY.test(block.end_time ?? '') ? block.end_time : null;
    const day = DATE_KEY.test(block.date ?? '') ? block.date : null;
    if (!start || !end || !day) return null;
    const minutes = (Number(end.slice(0, 2)) * 60 + Number(end.slice(3))) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
    if (!(minutes > 0)) return null;
    const record = itemRecord(item);
    return {
      path: '/api/work-blocks',
      method: 'POST',
      body: {
        title: String(record.title || 'Planned work'),
        date: day,
        start_time: start,
        duration_minutes: minutes,
        task_id: id,
        status: 'confirmed',
        source: 'manual'
      }
    };
  }
  if (type === 'task') {
    if (date) body.due_date = date;
    if (time !== undefined) body.due_time = time;
    if (title) body.title = title;
    if (STATUS_CHOICES.task.some(([value]) => value === patch.status)) body.status = patch.status;
    if (typeof patch.notes === 'string') body.description = patch.notes;
    if (typeof patch.bookmark === 'string') {
      const note = patch.bookmark.replace(/\s+/g, ' ').trim().slice(0, 280);
      body.bookmark = note ? { note, at: new Date().toISOString(), source: 'calendar' } : null;
    }
    if (patch.resumability !== undefined) body.resumability = patch.resumability === 'quick' || patch.resumability === 'runup' ? patch.resumability : null;
    if (patch.max_block_minutes !== undefined) {
      const minutes = Math.round(Number(patch.max_block_minutes));
      body.max_block_minutes = patch.max_block_minutes === null || !Number.isFinite(minutes) ? null : Math.min(240, Math.max(15, minutes));
    }
    for (const key of ['depends_on', 'dismissed_inferred']) {
      if (Array.isArray(patch[key])) body[key] = [...new Set(patch[key].filter((value) => typeof value === 'string' && value && value !== id))].slice(0, 20);
    }
    if (!Object.keys(body).length) return null;
    return { path: `/api/tasks?id=${encodeURIComponent(id)}`, method: 'PATCH', body };
  }
  if (type === 'work_block') {
    if (date) body.date = date;
    if (time) body.start_time = time;
    if (Number.isFinite(patch.duration_min) && patch.duration_min > 0) body.duration_minutes = Math.round(patch.duration_min);
    if (title) body.title = title;
    if (STATUS_CHOICES.work_block.some(([value]) => value === patch.status)) body.status = patch.status;
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
  if (patch && Object.keys(patch).length === 1 && typeof patch.status === 'string') {
    return setItemStatus(apiFetch, item, patch.status);
  }
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

