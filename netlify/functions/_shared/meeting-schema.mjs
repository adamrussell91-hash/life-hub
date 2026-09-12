import { createHash, randomUUID } from 'node:crypto';

// Meeting records for Professional Hub (`professional-hub-content`).
// Relationships live only as Universal Links — never store Person, Task,
// Organisation, or link IDs on the Meeting JSON.
//
// Attendee Universal Link roles (relationship key `attendee`): null, 'chair',
// or 'minute_taker' only — enforced in relationship-registry.mjs.

export const MEETING_SCHEMA_VERSION = 1;

export const MEETING_STATES = new Set([
  'scheduled',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show'
]);

export const MEETING_TERMINAL_STATES = new Set(['completed', 'cancelled', 'no_show']);

/** Allowed transitions. Reschedule is an action that lands in `rescheduled`. */
export const MEETING_STATE_TRANSITIONS = Object.freeze({
  scheduled: Object.freeze(['completed', 'cancelled', 'rescheduled', 'no_show']),
  rescheduled: Object.freeze(['completed', 'cancelled', 'rescheduled', 'no_show', 'scheduled']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
  no_show: Object.freeze([])
});

export const TITLE_MAX_LENGTH = 500;
export const LOCATION_MAX_LENGTH = 500;
export const AGENDA_MAX_LENGTH = 8000;
export const NOTES_MAX_LENGTH = 16000;
export const REASON_MAX_LENGTH = 500;

const MEETING_ID_PATTERN = /^meeting_[0-9a-f-]{36}$/;
export const MEETING_OPERATION_ID_PATTERN = /^mop_[0-9a-f]{32}$/;

export const PERMITTED_CREATE_LINK_TYPES = new Set(['attendee', 'related_to']);

export const ATTENDEE_ROLES = Object.freeze(['chair', 'minute_taker']);

export function generateMeetingId() {
  return `meeting_${randomUUID()}`;
}

export function isValidMeetingId(id) {
  return typeof id === 'string' && MEETING_ID_PATTERN.test(id);
}

export function isValidMeetingOperationId(id) {
  return typeof id === 'string' && MEETING_OPERATION_ID_PATTERN.test(id);
}

export function deriveMeetingOperationId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  return `mop_${digest}`;
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return Number.isFinite(Date.parse(value));
}

function trimBounded(value, field, max, { allowEmpty = true } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw validationError(`invalid_${field}`, `${field} must be a string or null.`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) {
    throw validationError(`invalid_${field}`, `${field} is required.`);
  }
  if (trimmed.length > max) {
    throw validationError(`${field}_too_long`, `${field} must be at most ${max} characters.`);
  }
  return trimmed || null;
}

function assertTimeOrder(start, end) {
  if (Date.parse(end) < Date.parse(start)) {
    throw validationError('invalid_time_range', 'scheduled_end cannot precede scheduled_start.');
  }
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'title',
  'scheduled_start',
  'scheduled_end',
  'time_zone',
  'location_text',
  'agenda',
  'notes',
  'state',
  'occurrence_history',
  'created_at',
  'updated_at'
]);

const HISTORY_KEYS = new Set([
  'scheduled_start',
  'scheduled_end',
  'time_zone',
  'changed_at',
  'reason'
]);

function parseOccurrenceHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!HISTORY_KEYS.has(key)) return null;
    }
    if (!isIsoTimestamp(entry.scheduled_start) || !isIsoTimestamp(entry.scheduled_end)) return null;
    if (typeof entry.time_zone !== 'string' || !entry.time_zone.trim()) return null;
    if (!isIsoTimestamp(entry.changed_at)) return null;
    if (entry.reason != null && typeof entry.reason !== 'string') return null;
    out.push({
      scheduled_start: entry.scheduled_start,
      scheduled_end: entry.scheduled_end,
      time_zone: entry.time_zone,
      changed_at: entry.changed_at,
      ...(entry.reason != null ? { reason: entry.reason } : {})
    });
  }
  return out;
}

export function parseMeetingRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== MEETING_SCHEMA_VERSION) return null;
  if (!isValidMeetingId(raw.id)) return null;
  if (typeof raw.title !== 'string') return null;
  if (!isIsoTimestamp(raw.scheduled_start) || !isIsoTimestamp(raw.scheduled_end)) return null;
  if (typeof raw.time_zone !== 'string' || !raw.time_zone.trim()) return null;
  if (raw.location_text != null && typeof raw.location_text !== 'string') return null;
  if (raw.agenda != null && typeof raw.agenda !== 'string') return null;
  if (raw.notes != null && typeof raw.notes !== 'string') return null;
  if (!MEETING_STATES.has(raw.state)) return null;
  const history = parseOccurrenceHistory(raw.occurrence_history);
  if (!history) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return {
    schema_version: raw.schema_version,
    id: raw.id,
    title: raw.title,
    scheduled_start: raw.scheduled_start,
    scheduled_end: raw.scheduled_end,
    time_zone: raw.time_zone,
    location_text: raw.location_text ?? null,
    agenda: raw.agenda ?? null,
    notes: raw.notes ?? null,
    state: raw.state,
    occurrence_history: history,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const CREATE_KEYS = new Set([
  'title',
  'scheduled_start',
  'scheduled_end',
  'time_zone',
  'location_text',
  'agenda',
  'notes',
  'links'
]);

export function validateMeetingCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Meeting creation requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const title = trimBounded(input.title, 'title', TITLE_MAX_LENGTH, { allowEmpty: false });
  if (!isIsoTimestamp(input.scheduled_start)) {
    throw validationError('invalid_scheduled_start', 'scheduled_start must be a valid ISO timestamp.');
  }
  if (!isIsoTimestamp(input.scheduled_end)) {
    throw validationError('invalid_scheduled_end', 'scheduled_end must be a valid ISO timestamp.');
  }
  assertTimeOrder(input.scheduled_start, input.scheduled_end);
  const time_zone = trimBounded(input.time_zone, 'time_zone', 120, { allowEmpty: false });
  const links = input.links === undefined ? [] : input.links;
  if (!Array.isArray(links)) {
    throw validationError('invalid_links', 'links must be an array.');
  }
  return {
    title,
    scheduled_start: input.scheduled_start,
    scheduled_end: input.scheduled_end,
    time_zone,
    location_text: trimBounded(input.location_text, 'location_text', LOCATION_MAX_LENGTH),
    agenda: trimBounded(input.agenda, 'agenda', AGENDA_MAX_LENGTH),
    notes: trimBounded(input.notes, 'notes', NOTES_MAX_LENGTH),
    links
  };
}

const UPDATE_KEYS = new Set(['title', 'location_text', 'agenda', 'notes']);

export function validateMeetingFieldUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A field update requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!UPDATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const patch = {};
  if (input.title !== undefined) {
    patch.title = trimBounded(input.title, 'title', TITLE_MAX_LENGTH, { allowEmpty: false });
  }
  if (input.location_text !== undefined) {
    patch.location_text = trimBounded(input.location_text, 'location_text', LOCATION_MAX_LENGTH);
  }
  if (input.agenda !== undefined) {
    patch.agenda = trimBounded(input.agenda, 'agenda', AGENDA_MAX_LENGTH);
  }
  if (input.notes !== undefined) {
    patch.notes = trimBounded(input.notes, 'notes', NOTES_MAX_LENGTH);
  }
  if (!Object.keys(patch).length) {
    throw validationError('empty_update', 'Update requires at least one field.');
  }
  return patch;
}

const RESCHEDULE_KEYS = new Set(['scheduled_start', 'scheduled_end', 'time_zone', 'reason']);

export function validateMeetingRescheduleInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Reschedule requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!RESCHEDULE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  if (!isIsoTimestamp(input.scheduled_start)) {
    throw validationError('invalid_scheduled_start', 'scheduled_start must be a valid ISO timestamp.');
  }
  if (!isIsoTimestamp(input.scheduled_end)) {
    throw validationError('invalid_scheduled_end', 'scheduled_end must be a valid ISO timestamp.');
  }
  assertTimeOrder(input.scheduled_start, input.scheduled_end);
  const time_zone = trimBounded(input.time_zone, 'time_zone', 120, { allowEmpty: false });
  return {
    scheduled_start: input.scheduled_start,
    scheduled_end: input.scheduled_end,
    time_zone,
    reason: trimBounded(input.reason, 'reason', REASON_MAX_LENGTH)
  };
}

export function assertMeetingStateTransition(from, to) {
  const allowed = MEETING_STATE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw validationError(
      'invalid_state_transition',
      `Cannot transition Meeting from ${from} to ${to}.`
    );
  }
}

export function meetingDisplayLabel(record) {
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  if (title) return title;
  const when = typeof record?.scheduled_start === 'string' ? record.scheduled_start.slice(0, 10) : '';
  return when ? `Meeting · ${when}` : 'Meeting';
}

export function projectMeeting(record, incompleteLinks = null) {
  const projection = {
    schema_version: record.schema_version,
    id: record.id,
    title: record.title,
    scheduled_start: record.scheduled_start,
    scheduled_end: record.scheduled_end,
    time_zone: record.time_zone,
    location_text: record.location_text ?? null,
    agenda: record.agenda ?? null,
    notes: record.notes ?? null,
    state: record.state,
    occurrence_history: record.occurrence_history ?? [],
    created_at: record.created_at,
    updated_at: record.updated_at
  };
  if (incompleteLinks) {
    projection.incomplete_links = incompleteLinks;
  }
  return projection;
}

export function meetingIndexRecord(record) {
  return {
    id: record.id,
    scheduled_start: record.scheduled_start,
    scheduled_end: record.scheduled_end,
    time_zone: record.time_zone,
    title: record.title,
    state: record.state
  };
}

export function compareMeetingsSoonestFirst(a, b) {
  const aTime = Date.parse(a.scheduled_start);
  const bTime = Date.parse(b.scheduled_start);
  if (aTime !== bTime) return aTime - bTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
