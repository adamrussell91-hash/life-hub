import { createHash, randomUUID } from 'node:crypto';

// Event records for Professional Hub (`professional-hub-content`).
// Relationships (venue, provider, related Knowledge, learning Tasks) live only
// as Universal Links — never store Organisation/Task/page/link IDs here.

export const EVENT_SCHEMA_VERSION = 1;

export const EVENT_TYPES = new Set(['professional_development']);

export const EVENT_OCCURRENCE_STATES = new Set([
  'scheduled',
  'completed',
  'cancelled',
  'rescheduled'
]);

export const EVENT_STATE_TRANSITIONS = Object.freeze({
  scheduled: Object.freeze(['completed', 'cancelled', 'rescheduled']),
  rescheduled: Object.freeze(['completed', 'cancelled', 'rescheduled', 'scheduled']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([])
});

export const ATTENDANCE_STATES = new Set(['registered', 'attended', 'partial', 'absent']);

export const TITLE_MAX_LENGTH = 500;
export const LOCATION_MAX_LENGTH = 500;
export const ACCREDITATION_MAX_LENGTH = 200;
export const CERTIFICATE_NAME_MAX = 300;
export const CERTIFICATE_REF_MAX = 200;

const EVENT_ID_PATTERN = /^event_[0-9a-f-]{36}$/;
export const EVENT_OPERATION_ID_PATTERN = /^eop_[0-9a-f]{32}$/;

export const PERMITTED_CREATE_LINK_TYPES = new Set([
  'venue',
  'provider',
  'related_to'
]);

export function generateEventId() {
  return `event_${randomUUID()}`;
}

export function isValidEventId(id) {
  return typeof id === 'string' && EVENT_ID_PATTERN.test(id);
}

export function isValidEventOperationId(id) {
  return typeof id === 'string' && EVENT_OPERATION_ID_PATTERN.test(id);
}

export function deriveEventOperationId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  return `eop_${digest}`;
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
    throw validationError('invalid_time_range', 'end cannot precede start.');
  }
}

function parseCertificate(raw) {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const allowed = new Set(['name', 'issued_at', 'reference']);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) return null;
  }
  if (raw.name != null && typeof raw.name !== 'string') return null;
  if (raw.reference != null && typeof raw.reference !== 'string') return null;
  if (raw.issued_at != null && !isIsoTimestamp(raw.issued_at)) return null;
  return {
    name: raw.name ?? undefined,
    issued_at: raw.issued_at ?? null,
    reference: raw.reference ?? undefined
  };
}

function validateCertificateInput(raw) {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationError('invalid_certificate', 'certificate must be an object or null.');
  }
  const allowed = new Set(['name', 'issued_at', 'reference']);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw validationError('unknown_field', `Unknown certificate field "${key}".`);
    }
  }
  const name = raw.name === undefined ? undefined : trimBounded(raw.name, 'certificate.name', CERTIFICATE_NAME_MAX);
  const reference =
    raw.reference === undefined
      ? undefined
      : trimBounded(raw.reference, 'certificate.reference', CERTIFICATE_REF_MAX);
  let issued_at = null;
  if (raw.issued_at !== undefined && raw.issued_at !== null) {
    if (!isIsoTimestamp(raw.issued_at)) {
      throw validationError('invalid_certificate_issued_at', 'certificate.issued_at must be ISO.');
    }
    issued_at = raw.issued_at;
  }
  return { name, issued_at, reference };
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'title',
  'event_type',
  'start',
  'end',
  'time_zone',
  'all_day',
  'occurrence_state',
  'location_text',
  'accreditation_category',
  'hours',
  'attendance_state',
  'certificate',
  'created_at',
  'updated_at'
]);

export function parseEventRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== EVENT_SCHEMA_VERSION) return null;
  if (!isValidEventId(raw.id)) return null;
  if (typeof raw.title !== 'string') return null;
  if (!EVENT_TYPES.has(raw.event_type)) return null;
  if (!isIsoTimestamp(raw.start) || !isIsoTimestamp(raw.end)) return null;
  if (typeof raw.time_zone !== 'string' || !raw.time_zone.trim()) return null;
  if (typeof raw.all_day !== 'boolean') return null;
  if (!EVENT_OCCURRENCE_STATES.has(raw.occurrence_state)) return null;
  if (raw.location_text != null && typeof raw.location_text !== 'string') return null;
  if (raw.accreditation_category != null && typeof raw.accreditation_category !== 'string') return null;
  if (raw.hours != null && (typeof raw.hours !== 'number' || !Number.isFinite(raw.hours) || raw.hours < 0)) {
    return null;
  }
  if (raw.attendance_state != null && !ATTENDANCE_STATES.has(raw.attendance_state)) return null;
  const certificate = parseCertificate(raw.certificate);
  if (raw.certificate !== undefined && raw.certificate !== null && certificate === null) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return {
    schema_version: raw.schema_version,
    id: raw.id,
    title: raw.title,
    event_type: raw.event_type,
    start: raw.start,
    end: raw.end,
    time_zone: raw.time_zone,
    all_day: raw.all_day,
    occurrence_state: raw.occurrence_state,
    location_text: raw.location_text ?? null,
    accreditation_category: raw.accreditation_category ?? null,
    hours: raw.hours ?? null,
    attendance_state: raw.attendance_state ?? null,
    certificate: certificate,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const CREATE_KEYS = new Set([
  'title',
  'event_type',
  'start',
  'end',
  'time_zone',
  'all_day',
  'location_text',
  'accreditation_category',
  'hours',
  'attendance_state',
  'certificate',
  'links'
]);

export function validateEventCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Event creation requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const title = trimBounded(input.title, 'title', TITLE_MAX_LENGTH, { allowEmpty: false });
  const event_type = input.event_type ?? 'professional_development';
  if (!EVENT_TYPES.has(event_type)) {
    throw validationError('invalid_event_type', 'event_type is not a permitted value.');
  }
  if (!isIsoTimestamp(input.start)) {
    throw validationError('invalid_start', 'start must be a valid ISO timestamp.');
  }
  if (!isIsoTimestamp(input.end)) {
    throw validationError('invalid_end', 'end must be a valid ISO timestamp.');
  }
  assertTimeOrder(input.start, input.end);
  const time_zone = trimBounded(input.time_zone, 'time_zone', 120, { allowEmpty: false });
  const all_day = input.all_day === undefined ? false : input.all_day;
  if (typeof all_day !== 'boolean') {
    throw validationError('invalid_all_day', 'all_day must be a boolean.');
  }
  let hours = null;
  if (input.hours !== undefined && input.hours !== null) {
    if (typeof input.hours !== 'number' || !Number.isFinite(input.hours) || input.hours < 0) {
      throw validationError('invalid_hours', 'hours must be a non-negative number or null.');
    }
    hours = input.hours;
  }
  let attendance_state = null;
  if (input.attendance_state !== undefined && input.attendance_state !== null) {
    if (!ATTENDANCE_STATES.has(input.attendance_state)) {
      throw validationError('invalid_attendance_state', 'attendance_state is not permitted.');
    }
    attendance_state = input.attendance_state;
  }
  const links = input.links === undefined ? [] : input.links;
  if (!Array.isArray(links)) {
    throw validationError('invalid_links', 'links must be an array.');
  }
  return {
    title,
    event_type,
    start: input.start,
    end: input.end,
    time_zone,
    all_day,
    location_text: trimBounded(input.location_text, 'location_text', LOCATION_MAX_LENGTH),
    accreditation_category: trimBounded(
      input.accreditation_category,
      'accreditation_category',
      ACCREDITATION_MAX_LENGTH
    ),
    hours,
    attendance_state,
    certificate: validateCertificateInput(input.certificate),
    links
  };
}

const UPDATE_KEYS = new Set([
  'title',
  'location_text',
  'accreditation_category',
  'hours',
  'attendance_state',
  'certificate',
  'all_day'
]);

export function validateEventFieldUpdate(input) {
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
  if (input.accreditation_category !== undefined) {
    patch.accreditation_category = trimBounded(
      input.accreditation_category,
      'accreditation_category',
      ACCREDITATION_MAX_LENGTH
    );
  }
  if (input.hours !== undefined) {
    if (input.hours === null) patch.hours = null;
    else if (typeof input.hours !== 'number' || !Number.isFinite(input.hours) || input.hours < 0) {
      throw validationError('invalid_hours', 'hours must be a non-negative number or null.');
    } else patch.hours = input.hours;
  }
  if (input.attendance_state !== undefined) {
    if (input.attendance_state === null) patch.attendance_state = null;
    else if (!ATTENDANCE_STATES.has(input.attendance_state)) {
      throw validationError('invalid_attendance_state', 'attendance_state is not permitted.');
    } else patch.attendance_state = input.attendance_state;
  }
  if (input.certificate !== undefined) {
    patch.certificate = validateCertificateInput(input.certificate);
  }
  if (input.all_day !== undefined) {
    if (typeof input.all_day !== 'boolean') {
      throw validationError('invalid_all_day', 'all_day must be a boolean.');
    }
    patch.all_day = input.all_day;
  }
  if (!Object.keys(patch).length) {
    throw validationError('empty_update', 'Update requires at least one field.');
  }
  return patch;
}

const RESCHEDULE_KEYS = new Set(['start', 'end', 'time_zone', 'all_day']);

export function validateEventRescheduleInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Reschedule requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!RESCHEDULE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  if (!isIsoTimestamp(input.start)) {
    throw validationError('invalid_start', 'start must be a valid ISO timestamp.');
  }
  if (!isIsoTimestamp(input.end)) {
    throw validationError('invalid_end', 'end must be a valid ISO timestamp.');
  }
  assertTimeOrder(input.start, input.end);
  const time_zone = trimBounded(input.time_zone, 'time_zone', 120, { allowEmpty: false });
  const all_day = input.all_day === undefined ? false : input.all_day;
  if (typeof all_day !== 'boolean') {
    throw validationError('invalid_all_day', 'all_day must be a boolean.');
  }
  return { start: input.start, end: input.end, time_zone, all_day };
}

export function assertEventStateTransition(from, to) {
  const allowed = EVENT_STATE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw validationError(
      'invalid_state_transition',
      `Cannot transition Event from ${from} to ${to}.`
    );
  }
}

export function eventDisplayLabel(record) {
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  if (title) return title;
  const when = typeof record?.start === 'string' ? record.start.slice(0, 10) : '';
  return when ? `Event · ${when}` : 'Event';
}

export function projectEvent(record, incompleteLinks = null) {
  const projection = {
    schema_version: record.schema_version,
    id: record.id,
    title: record.title,
    event_type: record.event_type,
    start: record.start,
    end: record.end,
    time_zone: record.time_zone,
    all_day: record.all_day,
    occurrence_state: record.occurrence_state,
    location_text: record.location_text ?? null,
    accreditation_category: record.accreditation_category ?? null,
    hours: record.hours ?? null,
    attendance_state: record.attendance_state ?? null,
    certificate: record.certificate ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
  if (incompleteLinks) {
    projection.incomplete_links = incompleteLinks;
  }
  return projection;
}

export function eventIndexRecord(record) {
  return {
    id: record.id,
    start: record.start,
    end: record.end,
    time_zone: record.time_zone,
    title: record.title,
    event_type: record.event_type,
    occurrence_state: record.occurrence_state,
    all_day: record.all_day
  };
}

export function compareEventsSoonestFirst(a, b) {
  const aTime = Date.parse(a.start);
  const bTime = Date.parse(b.start);
  if (aTime !== bTime) return aTime - bTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
