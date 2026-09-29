// Meeting / PD-event propose tools for Clare, Hammond, Ann.
// Writes use professional:meeting:* / professional:event:* Confirm paths.
// Timed proposals also enqueue calendar ghosts (pro_meeting / pro_event).

import { wallLocalToUtcIso } from './wall-time.mjs';
import { createMeetingRepository } from './meeting-repository.mjs';
import { createEventRepository } from './event-repository.mjs';
import { clean, makeProposal, parseWriteBody, writeError } from './agent-propose-helpers.mjs';

export const MEETING_EVENT_AGENT_SLUGS = new Set(['clare', 'hammond', 'ann']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const NEW_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i;
const DEFAULT_TZ = 'Australia/Sydney';

function parseLocalParts(isoOrLocal) {
  const raw = clean(isoOrLocal, 40);
  if (!raw) return null;
  // Accept full ISO or datetime-local / space-separated.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  return { date: m[1], time: m[2] };
}

function toUtcIso(date, time, timeZone) {
  return wallLocalToUtcIso(`${date}T${time}`, timeZone || DEFAULT_TZ);
}

function resolveSchedule(startRaw, endRaw, timeZone) {
  const startParts = parseLocalParts(startRaw);
  const endParts = parseLocalParts(endRaw);
  if (!startParts || !endParts) {
    return { ok: false, error: 'invalid_schedule', detail: 'start/end need a date and time' };
  }
  let startIso;
  let endIso;
  try {
    startIso = toUtcIso(startParts.date, startParts.time, timeZone);
    endIso = toUtcIso(endParts.date, endParts.time, timeZone);
  } catch (error) {
    return { ok: false, error: 'invalid_time_zone', detail: error?.message };
  }
  if (Date.parse(endIso) < Date.parse(startIso)) {
    return { ok: false, error: 'invalid_time_range' };
  }
  return { ok: true, startParts, endParts, startIso, endIso };
}

export function proposeMeetingSchema() {
  return {
    name: 'propose_meeting',
    description:
      'Propose booking a Professional Hub meeting. Nothing is saved until Adam taps Confirm. When the start has a day and time, also queues a dashed calendar ghost — Accept on the calendar or Confirm both create the meeting.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card.' },
        title: { type: 'string' },
        scheduled_start: { type: 'string', description: 'ISO or YYYY-MM-DDTHH:MM local' },
        scheduled_end: { type: 'string', description: 'ISO or YYYY-MM-DDTHH:MM local' },
        time_zone: { type: 'string', description: 'IANA tz (default Australia/Sydney)' },
        location_text: { type: 'string' },
        agenda: { type: 'string' },
        notes: { type: 'string' },
        attendee_refs: {
          type: 'array',
          items: { type: 'string' },
          description: 'shared:person:… refs from search_people'
        },
        key: { type: 'string', description: 'Optional short handle for the Confirm path id' }
      },
      required: ['summary', 'title', 'scheduled_start', 'scheduled_end'],
      additionalProperties: false
    }
  };
}

export function proposeEventSchema() {
  return {
    name: 'propose_event',
    description:
      'Propose booking a Professional Hub event (PD or general). Nothing is saved until Adam taps Confirm. Timed starts also queue a dashed calendar ghost.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO or YYYY-MM-DDTHH:MM local' },
        end: { type: 'string', description: 'ISO or YYYY-MM-DDTHH:MM local' },
        time_zone: { type: 'string' },
        event_type: { type: 'string', enum: ['professional_development', 'general'] },
        all_day: { type: 'boolean' },
        location_text: { type: 'string' },
        hours: { type: 'number' },
        attendance_state: { type: 'string' },
        accreditation_category: { type: 'string' },
        priority_area: { type: 'string' },
        attendee_refs: { type: 'array', items: { type: 'string' } },
        key: { type: 'string' }
      },
      required: ['summary', 'title', 'start', 'end'],
      additionalProperties: false
    }
  };
}

function attendeeLinks(refs) {
  if (!Array.isArray(refs)) return [];
  return refs
    .map(ref => clean(ref, 120))
    .filter(Boolean)
    .map(target_ref => ({ relationship_type: 'attendee', target_ref }));
}

/**
 * Build Confirm proposal writes for a meeting. Also returns ghostInput when timed.
 */
export function buildMeetingProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 500);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!title) return { ok: false, error: 'title_required' };

  const timeZone = clean(input.time_zone, 80) || DEFAULT_TZ;
  const schedule = resolveSchedule(input.scheduled_start, input.scheduled_end, timeZone);
  if (!schedule.ok) {
    return schedule.error === 'invalid_schedule'
      ? { ok: false, error: 'invalid_schedule', detail: 'scheduled_start/end need a date and time' }
      : schedule;
  }
  const { startParts, endParts, startIso: scheduled_start, endIso: scheduled_end } = schedule;

  const key = clean(input.key, 31) || `m${Date.now().toString(36)}`;
  if (!NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_key' };
  const path = `professional:meeting:new-${key.toLowerCase()}`;
  const body = {
    title,
    scheduled_start,
    scheduled_end,
    time_zone: timeZone,
    location_text: clean(input.location_text, 500) || null,
    agenda: typeof input.agenda === 'string' ? input.agenda.trim().slice(0, 8000) || null : null,
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 16000) || null : null,
    links: attendeeLinks(input.attendee_refs)
  };

  const ghostInput = {
    kind: 'pro_meeting',
    date: startParts.date,
    start: startParts.time,
    end: endParts.time,
    title,
    time_zone: timeZone,
    ...(body.location_text ? { location_text: body.location_text } : {}),
    ...(body.agenda ? { agenda: body.agenda } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
    ...(body.links.length ? { attendee_refs: body.links.map(l => l.target_ref) } : {}),
    scheduled_start,
    scheduled_end,
    reason: summary
  };

  return {
    ok: true,
    ghostInput,
    proposal: makeProposal(summary, [{
      path,
      mode: 'create',
      content: JSON.stringify(body),
      diff: `Book meeting: ${title} (${startParts.date} ${startParts.time})`
    }], { surfaces: ['confirm_card', 'governance_log', 'calendar'] })
  };
}

export function buildEventProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 500);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!title) return { ok: false, error: 'title_required' };

  const timeZone = clean(input.time_zone, 80) || DEFAULT_TZ;
  const schedule = resolveSchedule(input.start, input.end, timeZone);
  if (!schedule.ok) return schedule;
  const { startParts, endParts, startIso: start, endIso: end } = schedule;

  const key = clean(input.key, 31) || `e${Date.now().toString(36)}`;
  if (!NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_key' };
  const path = `professional:event:new-${key.toLowerCase()}`;
  const event_type = input.event_type === 'general' ? 'general' : 'professional_development';
  const body = {
    title,
    event_type,
    start,
    end,
    time_zone: timeZone,
    all_day: input.all_day === true,
    location_text: clean(input.location_text, 500) || null,
    hours: typeof input.hours === 'number' && Number.isFinite(input.hours) ? input.hours : null,
    attendance_state: clean(input.attendance_state, 40) || null,
    accreditation_category: clean(input.accreditation_category, 120) || null,
    priority_area: clean(input.priority_area, 120) || null,
    links: attendeeLinks(input.attendee_refs)
  };

  const ghostInput = HHMM_RE.test(startParts.time) && DATE_RE.test(startParts.date)
    ? {
      kind: 'pro_event',
      date: startParts.date,
      start: startParts.time,
      end: endParts.time,
      title,
      time_zone: timeZone,
      event_type,
      all_day: body.all_day,
      ...(body.location_text ? { location_text: body.location_text } : {}),
      ...(body.hours != null ? { hours: body.hours } : {}),
      ...(body.links.length ? { attendee_refs: body.links.map(l => l.target_ref) } : {}),
      start_iso: start,
      end_iso: end,
      reason: summary
    }
    : null;

  return {
    ok: true,
    ghostInput,
    proposal: makeProposal(summary, [{
      path,
      mode: 'create',
      content: JSON.stringify(body),
      diff: `Book event: ${title} (${startParts.date} ${startParts.time})`
    }], { surfaces: ['confirm_card', 'governance_log', 'calendar'] })
  };
}

/** Confirm-time executor for professional:meeting / professional:event writes. */
export function createMeetingEventWriteExecutor({ store, env, now } = {}) {
  if (!store) throw new Error('createMeetingEventWriteExecutor requires a professional store.');
  const meetingRepo = createMeetingRepository({ store, env, ...(now ? { now } : {}) });
  const eventRepo = createEventRepository({ store, env, ...(now ? { now } : {}) });

  async function apply(write, target) {
    const body = parseWriteBody(write);
    if (!body) return writeError('invalid_professional_write', write.path);
    try {
      if (target.kind === 'meeting' && write.mode === 'create') {
        const { meeting } = await meetingRepo.createMeeting(body);
        return { ok: true, result: { path: write.path, mode: 'create', id: meeting.id, title: meeting.title } };
      }
      if (target.kind === 'event' && write.mode === 'create') {
        const { event } = await eventRepo.createEvent(body);
        return { ok: true, result: { path: write.path, mode: 'create', id: event.id, title: event.title } };
      }
      return writeError('unknown_write_target', write.path);
    } catch (error) {
      return writeError(typeof error?.code === 'string' ? error.code : 'professional_write_failed', error?.message);
    }
  }

  return { apply };
}
