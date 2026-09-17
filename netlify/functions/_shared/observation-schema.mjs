import { randomUUID } from 'node:crypto';
import { parseEntityRef } from './entity-ref.mjs';
import { compareTimelineOrder } from './entity-overview.mjs';

// Observation record shapes for Professional Hub (`professional-hub-content`).
// An Observation is a free-text note about a Person or Organisation, e.g.
// "Mentioned she's moving to a new role at UNSW next month." Unlike
// Communication, an Observation never creates a Universal Link — it is a
// plain, directly-written record. Do not add link-intent/journal/retry
// machinery here; that belongs to Communications only.

export const OBSERVATION_SCHEMA_VERSION = 1;

export const OBSERVATION_SOURCES = new Set(['meeting', 'communication', 'manual', 'imported']);

// Placeholder bound, same order of magnitude as Communication's
// SUMMARY_MAX_LENGTH — Observations are prose of similar scale.
export const OBSERVATION_TEXT_MAX_LENGTH = 8000;

const OBSERVATION_ID_PATTERN = /^observation_[0-9a-f-]{36}$/;

// about_ref must resolve to one of these two kinds — an Observation is
// always about a Person or an Organisation, nothing else.
const ABOUT_REF_KINDS = new Set(['shared:person', 'shared:organisation']);

export function generateObservationId() {
  return `observation_${randomUUID()}`;
}

export function isValidObservationId(id) {
  return typeof id === 'string' && OBSERVATION_ID_PATTERN.test(id);
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

function aboutRefKindKey(ref) {
  return `${ref.namespace}:${ref.kind}`;
}

// Exported so the repository can validate a caller-supplied about_ref
// (e.g. on list) with the exact same rule used at create time, rather than
// re-deriving it.
export function validateAboutRef(value) {
  const ref = parseEntityRef(value);
  if (!ref || !ABOUT_REF_KINDS.has(aboutRefKindKey(ref))) {
    throw validationError(
      'invalid_about_ref',
      'about_ref must be a shared:person or shared:organisation reference.'
    );
  }
  return value.trim();
}

function parseLinkedRef(value) {
  if (value === undefined || value === null) return null;
  const ref = parseEntityRef(value);
  if (!ref) {
    throw validationError('invalid_linked_ref', 'linked_ref must be a well-formed entity reference.');
  }
  return value.trim();
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'about_ref',
  'text',
  'occurred_at',
  'source',
  'linked_ref',
  'created_at',
  'updated_at'
]);

export function parseObservationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== OBSERVATION_SCHEMA_VERSION) return null;
  if (!isValidObservationId(raw.id)) return null;
  const aboutRef = typeof raw.about_ref === 'string' ? parseEntityRef(raw.about_ref) : null;
  if (!aboutRef || !ABOUT_REF_KINDS.has(aboutRefKindKey(aboutRef))) return null;
  if (typeof raw.text !== 'string' || !raw.text.trim()) return null;
  if (!isIsoTimestamp(raw.occurred_at)) return null;
  if (!OBSERVATION_SOURCES.has(raw.source)) return null;
  if (raw.linked_ref !== null && (typeof raw.linked_ref !== 'string' || !parseEntityRef(raw.linked_ref))) {
    return null;
  }
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return { ...raw };
}

const CREATE_KEYS = new Set(['about_ref', 'text', 'occurred_at', 'source', 'linked_ref']);

export function validateObservationCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Observation creation requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }

  const aboutRef = validateAboutRef(input.about_ref);

  // text is required, unlike Communication's optional subject/summary — an
  // Observation with no text is meaningless.
  if (typeof input.text !== 'string' || !input.text.trim()) {
    throw validationError('text_required', 'text is required.');
  }
  const text = trimBounded(input.text, 'text', OBSERVATION_TEXT_MAX_LENGTH);

  if (!isIsoTimestamp(input.occurred_at)) {
    throw validationError('invalid_occurred_at', 'occurred_at must be a valid ISO timestamp.');
  }

  if (!OBSERVATION_SOURCES.has(input.source)) {
    throw validationError('invalid_source', 'source is not a permitted value.');
  }

  const linkedRef = parseLinkedRef(input.linked_ref);

  return {
    about_ref: aboutRef,
    text,
    occurred_at: input.occurred_at,
    source: input.source,
    linked_ref: linkedRef
  };
}

export function projectObservation(record) {
  return {
    schema_version: record.schema_version,
    id: record.id,
    about_ref: record.about_ref,
    text: record.text,
    occurred_at: record.occurred_at,
    source: record.source,
    linked_ref: record.linked_ref,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

export function observationIndexRecord(record) {
  return {
    id: record.id,
    about_ref: record.about_ref,
    occurred_at: record.occurred_at,
    source: record.source
  };
}

// Reuses entity-overview.mjs's compareTimelineOrder (newest-date-first, ties
// broken by ascending id) rather than re-deriving the same tie-break rule —
// see BUILD-PLAN.md Feature 1.4. Note this tie-break is ASCENDING id, which
// deliberately differs from compareCommunicationsNewestFirst's DESCENDING
// id tie-break in communication-schema.mjs; Observations intentionally
// match the shared timeline ordering rule instead.
export function compareObservationsNewestFirst(a, b) {
  return compareTimelineOrder({ date: a.occurred_at, id: a.id }, { date: b.occurred_at, id: b.id });
}
