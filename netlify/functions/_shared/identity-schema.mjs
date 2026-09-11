import { randomBytes, randomUUID } from 'node:crypto';

// Person and Organisation record shapes for the shared identity service
// (implementation programme, "Entity records"). Both live in the same
// `universal-link-content` store as Universal Links (see
// `universal-link-blobs.mjs`'s `personKey`/`organisationKey`, already
// defined in Slice 1) — this module owns validation and id generation
// only, no storage access.

export const IDENTITY_SCHEMA_VERSION = 1;

// Generated identity IDs use crypto.randomUUID() with a non semantic
// prefix (implementation programme, entity-ref.mjs rule 2) — never a name,
// email, or other identifying value.
export function generatePersonId() {
  return `person_${randomUUID()}`;
}

export function generateOrganisationId() {
  return `organisation_${randomUUID()}`;
}

const PERSON_ID_PATTERN = /^person_[0-9a-f-]{36}$/;
const ORGANISATION_ID_PATTERN = /^organisation_[0-9a-f-]{36}$/;

export function isValidPersonId(id) {
  return typeof id === 'string' && PERSON_ID_PATTERN.test(id);
}

export function isValidOrganisationId(id) {
  return typeof id === 'string' && ORGANISATION_ID_PATTERN.test(id);
}

// Organisation's lifecycle enum intentionally omits `deidentified` — the
// implementation programme's Organisation shape lists only active,
// inactive, archived, retained, deleted. `deidentified` is a Person-only
// concept (replacing a person's identifying labels with a tombstone);
// an Organisation's `display_name` is not personal data in the same sense,
// so entity-lifecycle.mjs rejects a deidentify transition for this kind.
export const PERSON_LIFECYCLE_STATUSES = new Set([
  'active', 'inactive', 'archived', 'retained', 'deidentified', 'deleted'
]);
export const ORGANISATION_LIFECYCLE_STATUSES = new Set([
  'active', 'inactive', 'archived', 'retained', 'deleted'
]);

// A record's identifying labels are hidden behind this fixed, non
// disclosing string once it is deleted or deidentified — "Deleted identity
// responses never return the former name or aliases" (Person rule 6) and
// resolver rule 3, "Deleted endpoints never expose former labels."
export const TOMBSTONE_LABEL = 'Removed record';
const REDACTED_STATUSES = new Set(['deidentified', 'deleted']);

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

// --- Person ---

// Structural type guard, mirroring universal-link-schema.mjs's
// parseUniversalLink: returns a shallow copy or null, never throws.
export function parsePersonRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== IDENTITY_SCHEMA_VERSION) return null;
  if (!isValidPersonId(raw.id)) return null;
  if (raw.kind !== 'person') return null;
  if (typeof raw.display_name !== 'string' || !raw.display_name) return null;
  if (!isNullableString(raw.sort_name)) return null;
  if (!isStringArray(raw.aliases)) return null;
  if (!PERSON_LIFECYCLE_STATUSES.has(raw.lifecycle_status)) return null;
  if (typeof raw.is_self !== 'boolean') return null;
  if (!isNullableString(raw.retention_reason)) return null;
  if (!isNullableString(raw.retention_review_at)) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return { ...raw, aliases: [...raw.aliases] };
}

// Validates a *new* Person's client-supplied creation fields only —
// display_name required, aliases optional string array, sort_name and
// is_self optional. Server derives id/lifecycle_status/timestamps; those
// are never accepted from a caller here.
export function validatePersonCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Person creation requires a request body object.');
  }
  const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
  if (!displayName) {
    throw validationError('display_name_required', 'display_name is required for a Person.');
  }
  if (input.sort_name !== undefined && input.sort_name !== null && typeof input.sort_name !== 'string') {
    throw validationError('invalid_sort_name', 'sort_name must be a string or null.');
  }
  if (input.aliases !== undefined && !isStringArray(input.aliases)) {
    throw validationError('invalid_aliases', 'aliases must be an array of strings.');
  }
  if (input.is_self !== undefined && typeof input.is_self !== 'boolean') {
    throw validationError('invalid_is_self', 'is_self must be a boolean.');
  }
  return {
    display_name: displayName,
    sort_name: input.sort_name ?? null,
    aliases: input.aliases ? [...input.aliases] : [],
    is_self: input.is_self === true
  };
}

// Fields an ordinary PATCH may change. `is_self`, `id`, `kind`,
// `lifecycle_status`, `created_at`, and `updated_at` are never accepted
// here — lifecycle changes go through entity-lifecycle.mjs, and is_self is
// immutable after creation (Person rule 3).
export function validatePersonFieldUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A field update requires a request body object.');
  }
  const patch = {};
  if (input.display_name !== undefined) {
    const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
    if (!displayName) throw validationError('display_name_required', 'display_name cannot be empty.');
    patch.display_name = displayName;
  }
  if (input.sort_name !== undefined) {
    if (input.sort_name !== null && typeof input.sort_name !== 'string') {
      throw validationError('invalid_sort_name', 'sort_name must be a string or null.');
    }
    patch.sort_name = input.sort_name;
  }
  if (input.aliases !== undefined) {
    if (!isStringArray(input.aliases)) throw validationError('invalid_aliases', 'aliases must be an array of strings.');
    patch.aliases = [...input.aliases];
  }
  return patch;
}

// --- Organisation ---

export function parseOrganisationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== IDENTITY_SCHEMA_VERSION) return null;
  if (!isValidOrganisationId(raw.id)) return null;
  if (raw.kind !== 'organisation') return null;
  if (typeof raw.display_name !== 'string' || !raw.display_name) return null;
  if (!isNullableString(raw.legal_name)) return null;
  if (!isStringArray(raw.aliases)) return null;
  if (!ORGANISATION_LIFECYCLE_STATUSES.has(raw.lifecycle_status)) return null;
  if (!isNullableString(raw.retention_reason)) return null;
  if (!isNullableString(raw.retention_review_at)) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return { ...raw, aliases: [...raw.aliases] };
}

export function validateOrganisationCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Organisation creation requires a request body object.');
  }
  const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
  if (!displayName) {
    throw validationError('display_name_required', 'display_name is required for an Organisation.');
  }
  if (input.legal_name !== undefined && input.legal_name !== null && typeof input.legal_name !== 'string') {
    throw validationError('invalid_legal_name', 'legal_name must be a string or null.');
  }
  if (input.aliases !== undefined && !isStringArray(input.aliases)) {
    throw validationError('invalid_aliases', 'aliases must be an array of strings.');
  }
  return {
    display_name: displayName,
    legal_name: input.legal_name ?? null,
    aliases: input.aliases ? [...input.aliases] : []
  };
}

export function validateOrganisationFieldUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A field update requires a request body object.');
  }
  const patch = {};
  if (input.display_name !== undefined) {
    const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
    if (!displayName) throw validationError('display_name_required', 'display_name cannot be empty.');
    patch.display_name = displayName;
  }
  if (input.legal_name !== undefined) {
    if (input.legal_name !== null && typeof input.legal_name !== 'string') {
      throw validationError('invalid_legal_name', 'legal_name must be a string or null.');
    }
    patch.legal_name = input.legal_name;
  }
  if (input.aliases !== undefined) {
    if (!isStringArray(input.aliases)) throw validationError('invalid_aliases', 'aliases must be an array of strings.');
    patch.aliases = [...input.aliases];
  }
  return patch;
}

// --- Shared: redaction / tombstone projection ---

// A deleted or deidentified record's identifying labels must never reach a
// response, index, log, or resolver projection. Returns a shallow copy
// with display_name/sort_name/legal_name/aliases replaced by the fixed
// tombstone label (or emptied), for any other status the record is
// returned unchanged (still a copy).
export function redactIdentityRecord(record) {
  if (!record || !REDACTED_STATUSES.has(record.lifecycle_status)) return { ...record };
  const redacted = {
    ...record,
    display_name: TOMBSTONE_LABEL,
    aliases: []
  };
  if ('sort_name' in redacted) redacted.sort_name = null;
  if ('legal_name' in redacted) redacted.legal_name = null;
  return redacted;
}

export function displayLabelFor(record) {
  return REDACTED_STATUSES.has(record.lifecycle_status) ? TOMBSTONE_LABEL : record.display_name;
}

// --- Lifecycle event ids ---
//
// One event id per lifecycle transition, written to
// `entities/events/<entity_ref_hash>/<event_id>` (universal-link-blobs.mjs).
// Server-generated and path-safe only, mirroring the operation id pattern
// in universal-link-schema.mjs.
export const EVENT_ID_PATTERN = /^event_[0-9a-f]{32}$/;

export function isValidEventId(id) {
  return typeof id === 'string' && EVENT_ID_PATTERN.test(id);
}

export function generateEventId() {
  return `event_${randomBytes(16).toString('hex')}`;
}

// --- Identity index records ---
//
// A minimal, per-entity search/listing projection at
// `entities/index/<kind>/<id>` — one Blob per entity, mirroring Universal
// Link membership's "one Blob per link, never a shared array" pattern
// (universal-link-blobs.mjs) — so entity-search.mjs can list and filter
// without loading every full Person/Organisation record. Written by
// entities.mjs alongside the authoritative record; never the authoritative
// source of truth itself.
export const IDENTITY_INDEX_SCHEMA_VERSION = 1;

export function buildIdentityIndexRecord({ id, kind, displayLabel, sortName = null, lifecycleStatus, isSelf = false, updatedAt }) {
  return Object.freeze({
    schema_version: IDENTITY_INDEX_SCHEMA_VERSION,
    id,
    kind,
    display_label: displayLabel,
    sort_name: sortName,
    lifecycle_status: lifecycleStatus,
    is_self: isSelf,
    updated_at: updatedAt
  });
}

export function parseIdentityIndexRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== IDENTITY_INDEX_SCHEMA_VERSION) return null;
  if (raw.kind !== 'person' && raw.kind !== 'organisation') return null;
  if ((raw.kind === 'person' && !isValidPersonId(raw.id)) || (raw.kind === 'organisation' && !isValidOrganisationId(raw.id))) {
    return null;
  }
  if (typeof raw.display_label !== 'string') return null;
  const statuses = raw.kind === 'person' ? PERSON_LIFECYCLE_STATUSES : ORGANISATION_LIFECYCLE_STATUSES;
  if (!statuses.has(raw.lifecycle_status)) return null;
  return { ...raw };
}
