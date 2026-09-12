import { createHash, randomUUID } from 'node:crypto';

// Communication record shapes for Professional Hub
// (`professional-hub-content`). Relationships live only as Universal Links —
// this schema never stores Person, Task, or link IDs on the record.

export const COMMUNICATION_SCHEMA_VERSION = 1;

export const COMMUNICATION_DIRECTIONS = new Set(['outbound', 'inbound']);
export const COMMUNICATION_CHANNELS = new Set([
  'email',
  'phone',
  'message',
  'in_person',
  'video',
  'other'
]);
export const COMMUNICATION_STATUSES = new Set(['completed', 'received']);

export const SUBJECT_MAX_LENGTH = 500;
export const SUMMARY_MAX_LENGTH = 8000;

const COMMUNICATION_ID_PATTERN = /^communication_[0-9a-f-]{36}$/;
export const COMMUNICATION_OPERATION_ID_PATTERN = /^cop_[0-9a-f]{32}$/;

export const PERMITTED_CREATE_LINK_TYPES = new Set([
  'recipient',
  'about_person',
  'follows_from'
]);

export function generateCommunicationId() {
  return `communication_${randomUUID()}`;
}

export function isValidCommunicationId(id) {
  return typeof id === 'string' && COMMUNICATION_ID_PATTERN.test(id);
}

export function isValidCommunicationOperationId(id) {
  return typeof id === 'string' && COMMUNICATION_OPERATION_ID_PATTERN.test(id);
}

export function deriveCommunicationOperationId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  return `cop_${digest}`;
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function trimBounded(value, field, max) {
  if (typeof value !== 'string') {
    throw validationError(`invalid_${field}`, `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw validationError(`${field}_too_long`, `${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

function statusForDirection(direction) {
  return direction === 'outbound' ? 'completed' : 'received';
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'direction',
  'channel',
  'occurred_at',
  'subject',
  'summary',
  'status',
  'created_at',
  'updated_at'
]);

export function parseCommunicationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== COMMUNICATION_SCHEMA_VERSION) return null;
  if (!isValidCommunicationId(raw.id)) return null;
  if (!COMMUNICATION_DIRECTIONS.has(raw.direction)) return null;
  if (!COMMUNICATION_CHANNELS.has(raw.channel)) return null;
  if (!isIsoTimestamp(raw.occurred_at)) return null;
  if (typeof raw.subject !== 'string') return null;
  if (typeof raw.summary !== 'string') return null;
  if (!COMMUNICATION_STATUSES.has(raw.status)) return null;
  if (raw.status !== statusForDirection(raw.direction)) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return { ...raw };
}

const CREATE_KEYS = new Set([
  'direction',
  'channel',
  'occurred_at',
  'subject',
  'summary',
  'links'
]);

export function validateCommunicationCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Communication creation requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  if (!COMMUNICATION_DIRECTIONS.has(input.direction)) {
    throw validationError('invalid_direction', 'direction must be outbound or inbound.');
  }
  if (!COMMUNICATION_CHANNELS.has(input.channel)) {
    throw validationError('invalid_channel', 'channel is not a permitted value.');
  }
  if (!isIsoTimestamp(input.occurred_at)) {
    throw validationError('invalid_occurred_at', 'occurred_at must be a valid ISO timestamp.');
  }
  const subject = input.subject === undefined ? '' : trimBounded(input.subject, 'subject', SUBJECT_MAX_LENGTH);
  const summary = input.summary === undefined ? '' : trimBounded(input.summary, 'summary', SUMMARY_MAX_LENGTH);
  const links = input.links === undefined ? [] : input.links;
  if (!Array.isArray(links)) {
    throw validationError('invalid_links', 'links must be an array.');
  }
  return {
    direction: input.direction,
    channel: input.channel,
    occurred_at: input.occurred_at,
    subject,
    summary,
    status: statusForDirection(input.direction),
    links
  };
}

const UPDATE_KEYS = new Set(['subject', 'summary']);

export function validateCommunicationFieldUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A field update requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!UPDATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const patch = {};
  if (input.subject !== undefined) {
    patch.subject = trimBounded(input.subject, 'subject', SUBJECT_MAX_LENGTH);
  }
  if (input.summary !== undefined) {
    patch.summary = trimBounded(input.summary, 'summary', SUMMARY_MAX_LENGTH);
  }
  if (!Object.keys(patch).length) {
    throw validationError('empty_update', 'Update requires subject and/or summary.');
  }
  return patch;
}

export function communicationDisplayLabel(record) {
  const subject = typeof record?.subject === 'string' ? record.subject.trim() : '';
  if (subject) return subject;
  const channel = typeof record?.channel === 'string' ? record.channel.replace(/_/g, ' ') : 'communication';
  const when = typeof record?.occurred_at === 'string' ? record.occurred_at.slice(0, 10) : '';
  return when ? `${channel} · ${when}` : channel;
}

export function projectCommunication(record, incompleteLinks = null) {
  const projection = {
    schema_version: record.schema_version,
    id: record.id,
    direction: record.direction,
    channel: record.channel,
    occurred_at: record.occurred_at,
    subject: record.subject,
    summary: record.summary,
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
  if (incompleteLinks) {
    projection.incomplete_links = incompleteLinks;
  }
  return projection;
}

export function communicationIndexRecord(record) {
  return {
    id: record.id,
    occurred_at: record.occurred_at,
    direction: record.direction,
    channel: record.channel,
    subject: record.subject,
    status: record.status
  };
}

export function compareCommunicationsNewestFirst(a, b) {
  const aTime = Date.parse(a.occurred_at);
  const bTime = Date.parse(b.occurred_at);
  if (aTime !== bTime) return bTime - aTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
