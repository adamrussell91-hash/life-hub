import { createHash } from 'node:crypto';
import { formatEntityRef } from './entity-ref.mjs';

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
    href: `/professional/#/event/${encodeURIComponent(record.id)}`
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
      all_day: Boolean(projection.all_day)
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
