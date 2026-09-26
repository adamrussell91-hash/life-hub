import { createHash, randomUUID } from 'node:crypto';
import { sanitizeBlocksDeep } from './teaching-student.mjs';

// Communication record shapes for Professional Hub
// (`professional-hub-content`). Relationships live only as Universal Links —
// this schema never stores Person, Task, or link IDs on the record.

export const COMMUNICATION_SCHEMA_VERSION = 2;
const READABLE_COMMUNICATION_VERSIONS = new Set([1, 2]);
export const AGENDA_SOURCES = new Set(['clare', 'carried', 'you']);
export const PURPOSE_TAG_MAX_LENGTH = 60;
export const AGENDA_MAX_ITEMS = 30;
export const BLOCKS_MAX_JSON_LENGTH = 400_000;

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

function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function readScheduledWindow(input) {
  const start = input.scheduled_start ?? null;
  const end = input.scheduled_end ?? null;
  if (start !== null && !isIsoTimestamp(start)) {
    throw validationError('invalid_scheduled_window', 'scheduled_start must be an ISO timestamp.');
  }
  if (end !== null && (!isIsoTimestamp(end) || start === null || Date.parse(end) < Date.parse(start))) {
    throw validationError('invalid_scheduled_window', 'scheduled_end must be an ISO timestamp after scheduled_start.');
  }
  const time_zone = input.time_zone ?? null;
  if (time_zone !== null && !isValidTimeZone(time_zone)) {
    throw validationError('invalid_time_zone', 'time_zone must be an IANA time zone.');
  }
  return { scheduled_start: start, scheduled_end: end, time_zone };
}

function readPurposeTag(value) {
  if (value === undefined || value === null || value === '') return null;
  const tag = trimBounded(value, 'purpose_tag', PURPOSE_TAG_MAX_LENGTH).toLowerCase();
  return tag || null;
}

export function validateAgenda(value) {
  if (!Array.isArray(value) || value.length > AGENDA_MAX_ITEMS) {
    throw validationError('invalid_agenda', `agenda must be an array of at most ${AGENDA_MAX_ITEMS} items.`);
  }
  return value.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.text !== 'string' || !AGENDA_SOURCES.has(item.source)) {
      throw validationError('invalid_agenda', 'agenda items need id, text and source (clare, carried or you).');
    }
    return { id: item.id, text: item.text.trim().slice(0, 300), source: item.source, done: item.done === true };
  });
}

export function validateBlocks(value) {
  if (!Array.isArray(value) || value.some((block) => !block || typeof block.id !== 'string' || typeof block.block_type !== 'string')) {
    throw validationError('invalid_blocks', 'blocks must be an array of blocks with id and block_type.');
  }
  if (JSON.stringify(value).length > BLOCKS_MAX_JSON_LENGTH) {
    throw validationError('blocks_too_large', 'blocks are too large for one page.');
  }
  return sanitizeBlocksDeep(value);
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
  'updated_at',
  'scheduled_start',
  'scheduled_end',
  'time_zone',
  'purpose_tag',
  'agenda',
  'blocks'
]);

export function parseCommunicationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (!READABLE_COMMUNICATION_VERSIONS.has(raw.schema_version)) return null;
  if (!isValidCommunicationId(raw.id)) return null;
  if (!COMMUNICATION_DIRECTIONS.has(raw.direction)) return null;
  if (!COMMUNICATION_CHANNELS.has(raw.channel)) return null;
  if (!isIsoTimestamp(raw.occurred_at)) return null;
  if (typeof raw.subject !== 'string') return null;
  if (typeof raw.summary !== 'string') return null;
  if (!COMMUNICATION_STATUSES.has(raw.status)) return null;
  if (raw.status !== statusForDirection(raw.direction)) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return {
    ...raw,
    scheduled_start: raw.scheduled_start ?? null,
    scheduled_end: raw.scheduled_end ?? null,
    time_zone: raw.time_zone ?? null,
    purpose_tag: raw.purpose_tag ?? null,
    agenda: Array.isArray(raw.agenda) ? raw.agenda : [],
    blocks: Array.isArray(raw.blocks) ? raw.blocks : []
  };
}

const CREATE_KEYS = new Set([
  'direction',
  'channel',
  'occurred_at',
  'subject',
  'summary',
  'links',
  'scheduled_start',
  'scheduled_end',
  'time_zone',
  'purpose_tag'
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
  const window = readScheduledWindow(input);
  const purpose_tag = readPurposeTag(input.purpose_tag);
  return {
    direction: input.direction,
    channel: input.channel,
    occurred_at: input.occurred_at,
    subject,
    summary,
    status: statusForDirection(input.direction),
    links,
    ...window,
    purpose_tag
  };
}

const UPDATE_KEYS = new Set([
  'subject', 'summary', 'scheduled_start', 'scheduled_end', 'time_zone', 'purpose_tag', 'agenda', 'blocks'
]);

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
  if (input.subject !== undefined) patch.subject = trimBounded(input.subject, 'subject', SUBJECT_MAX_LENGTH);
  if (input.summary !== undefined) patch.summary = trimBounded(input.summary, 'summary', SUMMARY_MAX_LENGTH);
  if (input.scheduled_start !== undefined || input.scheduled_end !== undefined || input.time_zone !== undefined) {
    Object.assign(patch, readScheduledWindow(input));
  }
  if (input.purpose_tag !== undefined) patch.purpose_tag = readPurposeTag(input.purpose_tag);
  if (input.agenda !== undefined) patch.agenda = validateAgenda(input.agenda);
  if (input.blocks !== undefined) patch.blocks = validateBlocks(input.blocks);
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
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
    updated_at: record.updated_at,
    scheduled_start: record.scheduled_start ?? null,
    scheduled_end: record.scheduled_end ?? null,
    time_zone: record.time_zone ?? null,
    purpose_tag: record.purpose_tag ?? null,
    agenda: record.agenda ?? [],
    blocks: record.blocks ?? []
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
