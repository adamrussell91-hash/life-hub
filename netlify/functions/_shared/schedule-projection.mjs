import { createHash } from 'node:crypto';
import { formatEntityRef } from './entity-ref.mjs';
import { wallLocalToUtcIso } from './wall-time.mjs';

// Shared schedule projection contract for Professional Meetings and Events
// (and future domain owners). Life calendar merges these projections; source
// records stay in their owning store.

export const SCHEDULE_PROJECTION_OCCURRENCE_KEY = 'primary';

/**
 * Deterministic projection id from source_ref + occurrence key.
 * One primary occurrence per Meeting/Event avoids duplicate calendar rows
 * after updates, cancellations, or reschedules.
 */
export function deriveProjectionId(sourceRef, occurrenceKey = SCHEDULE_PROJECTION_OCCURRENCE_KEY) {
  const digest = createHash('sha256')
    .update(`${sourceRef}\0${occurrenceKey}`)
    .digest('hex')
    .slice(0, 32);
  return `proj_${digest}`;
}

export function meetingSourceRef(id) {
  return formatEntityRef({ namespace: 'professional', kind: 'meeting', id });
}

export function eventSourceRef(id) {
  return formatEntityRef({ namespace: 'professional', kind: 'event', id });
}

export function communicationSourceRef(id) {
  return formatEntityRef({ namespace: 'professional', kind: 'communication', id });
}

/**
 * @returns {{
 *   projection_id: string,
 *   source_ref: string,
 *   kind: 'meeting'|'event',
 *   title: string,
 *   start: string,
 *   end: string,
 *   time_zone: string,
 *   all_day: boolean,
 *   status: string,
 *   href?: string|null
 * }}
 */
export function projectMeetingSchedule(record) {
  const source_ref = meetingSourceRef(record.id);
  return {
    projection_id: deriveProjectionId(source_ref),
    source_ref,
    kind: 'meeting',
    title: record.title,
    start: record.scheduled_start,
    end: record.scheduled_end,
    time_zone: record.time_zone,
    all_day: false,
    status: record.state,
    href: `/professional/#/meeting/${encodeURIComponent(record.id)}`
  };
}

export function projectEventSchedule(record) {
  const source_ref = eventSourceRef(record.id);
  return {
    projection_id: deriveProjectionId(source_ref),
    source_ref,
    kind: 'event',
    title: record.title,
    start: record.start,
    end: record.end,
    time_zone: record.time_zone,
    all_day: Boolean(record.all_day),
    status: record.occurrence_state,
    event_type: typeof record.event_type === 'string' ? record.event_type : null,
    href: `/professional/#/event/${encodeURIComponent(record.id)}`
  };
}

/** Timed comms are blocks; comms without a window (an email, a text) are pins on their hour. */
export function projectCommunicationSchedule(record) {
  const source_ref = communicationSourceRef(record.id);
  const start = record.scheduled_start ?? record.occurred_at;
  const pin = !record.scheduled_start || !record.scheduled_end;
  return {
    projection_id: deriveProjectionId(source_ref),
    source_ref,
    kind: 'communication',
    title: record.subject || record.channel.replace(/_/g, ' '),
    start,
    end: pin ? start : record.scheduled_end,
    time_zone: record.time_zone || 'Australia/Sydney',
    all_day: false,
    status: record.status,
    channel: record.channel,
    pin,
    href: `/professional/#/communication/${encodeURIComponent(record.id)}`
  };
}

const NOTION_METHOD_CHANNELS = {
  'In-person Meeting': 'in_person',
  'Phone Call': 'phone',
  Email: 'email',
  'Video Call': 'video',
  'Text Message': 'message',
  Chat: 'message',
  Mail: 'other'
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `communications.json` row (Notion Communications, in life-hub-data) as a
 * calendar comm. A date-only row pins at 09:00 Sydney; a timed row without a
 * later end is a pin at its time. No date → null (not placed). Opens the
 * Notion page, since there is no hub comm page for it.
 */
export function projectNotionCommunicationSchedule(row) {
  const notionId = typeof row?.notion_id === 'string' ? row.notion_id.replace(/-/g, '') : '';
  if (!/^[0-9a-f]{32}$/i.test(notionId)) return null;
  const rawStart = typeof row.date_start === 'string' ? row.date_start.trim() : '';
  if (!rawStart) return null;

  let start;
  let end = null;
  if (DATE_ONLY.test(rawStart)) {
    try {
      start = wallLocalToUtcIso(`${rawStart}T09:00`, 'Australia/Sydney');
    } catch {
      return null;
    }
  } else {
    const startMs = Date.parse(rawStart);
    if (!Number.isFinite(startMs)) return null;
    start = new Date(startMs).toISOString();
    const endMs = typeof row.date_end === 'string' && !DATE_ONLY.test(row.date_end) ? Date.parse(row.date_end) : NaN;
    if (Number.isFinite(endMs) && endMs > startMs) end = new Date(endMs).toISOString();
  }

  const source_ref = communicationSourceRef(`notion_${notionId}`);
  const channel = NOTION_METHOD_CHANNELS[row.method] ?? 'other';
  const title =
    [row.title, row.meeting_type, row.method].find((value) => typeof value === 'string' && value.trim())?.trim() ??
    'Comm';
  return {
    projection_id: deriveProjectionId(source_ref),
    source_ref,
    kind: 'communication',
    title,
    start,
    end: end ?? start,
    time_zone: 'Australia/Sydney',
    all_day: false,
    status: 'completed',
    channel,
    pin: end === null,
    href: `https://www.notion.so/${notionId}`
  };
}

export function compareScheduleProjections(a, b) {
  const aTime = Date.parse(a.start);
  const bTime = Date.parse(b.start);
  if (aTime !== bTime) return aTime - bTime;
  return a.projection_id < b.projection_id ? -1 : a.projection_id > b.projection_id ? 1 : 0;
}

/**
 * Deduplicate by projection_id (last write wins). Used when merging feeds.
 */
export function mergeScheduleProjections(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!item?.projection_id) continue;
      byId.set(item.projection_id, item);
    }
  }
  return [...byId.values()].sort(compareScheduleProjections);
}

/**
 * Convert a schedule projection into a Life calendar event row.
 * Types: professional_meeting | professional_event.
 */
export function lifeCalendarEventFromProjection(projection) {
  if (!projection?.projection_id || !projection.start) return null;
  const type = projection.kind === 'meeting' ? 'professional_meeting' : 'professional_event';
  const start = new Date(projection.start);
  if (Number.isNaN(start.getTime())) return null;
  // Calendar date key from the instant in Australia/Sydney (Life shell TZ).
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: projection.time_zone || 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(start);
  const get = (typeName) => dateParts.find((p) => p.type === typeName)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  let time;
  if (!projection.all_day) {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: projection.time_zone || 'Australia/Sydney',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(start);
    const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
    time = `${hour}:${minute}`;
  }
  const endMs = Date.parse(projection.end);
  const durationMin =
    Number.isFinite(endMs) && endMs > start.getTime()
      ? Math.max(1, Math.round((endMs - start.getTime()) / 60_000))
      : 60;
  return {
    path: `professional:${projection.projection_id}`,
    record: {
      type,
      id: projection.projection_id,
      date,
      ...(time ? { time } : {}),
      duration_min: durationMin,
      title: projection.title,
      status: projection.status,
      source_ref: projection.source_ref,
      href: projection.href ?? null,
      all_day: Boolean(projection.all_day),
      event_type: projection.event_type ?? null
    },
    body: ''
  };
}

export function lifeCalendarEventsFromProjections(projections) {
  const out = [];
  const seen = new Set();
  for (const projection of projections ?? []) {
    if (seen.has(projection.projection_id)) continue;
    seen.add(projection.projection_id);
    const event = lifeCalendarEventFromProjection(projection);
    if (event) out.push(event);
  }
  return out;
}
