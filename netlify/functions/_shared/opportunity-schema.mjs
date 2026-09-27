import { randomUUID } from 'node:crypto';
import { parseEntityRef } from './entity-ref.mjs';

// Potential opportunity records for Professional Hub Organisations
// (BUILD-PLAN Phase 4). One Blob each under opportunities/.

export const OPPORTUNITY_SCHEMA_VERSION = 1;

export const OPPORTUNITY_KINDS = new Set([
  'scholarship',
  'pd',
  'program',
  'role',
  'call_for_presenters',
  'grant',
  'event',
  'other'
]);

export const OPPORTUNITY_STATUSES = new Set([
  'open',
  'interested',
  'applied',
  'dismissed',
  'expired'
]);

export const OPPORTUNITY_FOUND_BY = new Set(['adam', 'sweep', 'ann']);

export const CLOSES_PRECISION = new Set(['day', 'month', 'none']);

export const TITLE_MAX = 500;
export const SUMMARY_MAX = 4000;
export const URL_MAX = 2000;
export const SOURCE_EXCERPT_MAX = 2000;
export const MAX_SOURCES = 20;

const OPPORTUNITY_ID_PATTERN = /^opportunity_[0-9a-f-]{36}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

export function generateOpportunityId() {
  return `opportunity_${randomUUID()}`;
}

export function isValidOpportunityId(id) {
  return typeof id === 'string' && OPPORTUNITY_ID_PATTERN.test(id);
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

function validateOrganisationRef(value) {
  const ref = parseEntityRef(value);
  if (!ref || ref.namespace !== 'shared' || ref.kind !== 'organisation') {
    throw validationError(
      'invalid_organisation_ref',
      'organisation_ref must be a shared:organisation reference.'
    );
  }
  return value.trim();
}

function validateClosesOn(value, precision) {
  if (precision === 'none') {
    if (value != null && value !== '') {
      throw validationError('invalid_closes_on', 'closes_on must be null when precision is none.');
    }
    return null;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError('invalid_closes_on', 'closes_on is required for day or month precision.');
  }
  const trimmed = value.trim();
  if (precision === 'month') {
    if (!MONTH_PATTERN.test(trimmed) && !DATE_PATTERN.test(trimmed)) {
      throw validationError('invalid_closes_on', 'closes_on for month precision must be YYYY-MM or YYYY-MM-DD.');
    }
    return trimmed.length === 7 ? `${trimmed}-01` : trimmed;
  }
  if (!DATE_PATTERN.test(trimmed) && !isIsoTimestamp(trimmed)) {
    throw validationError('invalid_closes_on', 'closes_on must be an ISO date.');
  }
  return DATE_PATTERN.test(trimmed) ? trimmed : trimmed.slice(0, 10);
}

const SOURCE_KEYS = new Set(['ref', 'url', 'excerpt']);

function parseSources(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_SOURCES) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!SOURCE_KEYS.has(key)) return null;
    }
    if (entry.ref != null && (typeof entry.ref !== 'string' || !parseEntityRef(entry.ref))) return null;
    if (entry.url != null && typeof entry.url !== 'string') return null;
    if (entry.excerpt != null && typeof entry.excerpt !== 'string') return null;
    if (!entry.ref && !entry.url) return null;
    out.push({
      ref: entry.ref ?? null,
      url: entry.url ?? null,
      excerpt: entry.excerpt ?? null
    });
  }
  return out;
}

function validateSourcesInput(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw validationError('invalid_sources', 'sources must be an array.');
  }
  if (raw.length > MAX_SOURCES) {
    throw validationError('sources_too_many', `sources must have at most ${MAX_SOURCES} entries.`);
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw validationError('invalid_source', `sources[${index}] must be an object.`);
    }
    for (const key of Object.keys(entry)) {
      if (!SOURCE_KEYS.has(key)) {
        throw validationError('unknown_field', `Unknown source field "${key}".`);
      }
    }
    let ref = null;
    if (entry.ref !== undefined && entry.ref !== null) {
      if (typeof entry.ref !== 'string' || !parseEntityRef(entry.ref)) {
        throw validationError('invalid_source_ref', `sources[${index}].ref is not a valid entity ref.`);
      }
      ref = entry.ref.trim();
    }
    const url = trimBounded(entry.url, `sources[${index}].url`, URL_MAX);
    if (!ref && !url) {
      throw validationError('source_location_required', `sources[${index}] requires ref or url.`);
    }
    return {
      ref,
      url,
      excerpt: trimBounded(entry.excerpt, `sources[${index}].excerpt`, SOURCE_EXCERPT_MAX)
    };
  });
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'organisation_ref',
  'kind',
  'title',
  'summary',
  'closes_on',
  'closes_precision',
  'url',
  'sources',
  'found_by',
  'status',
  'created_at',
  'updated_at'
]);

export function parseOpportunityRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== OPPORTUNITY_SCHEMA_VERSION) return null;
  if (!isValidOpportunityId(raw.id)) return null;
  const orgRef = typeof raw.organisation_ref === 'string' ? parseEntityRef(raw.organisation_ref) : null;
  if (!orgRef || orgRef.namespace !== 'shared' || orgRef.kind !== 'organisation') return null;
  if (!OPPORTUNITY_KINDS.has(raw.kind)) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  if (raw.summary != null && typeof raw.summary !== 'string') return null;
  if (!CLOSES_PRECISION.has(raw.closes_precision)) return null;
  if (raw.closes_precision === 'none') {
    if (raw.closes_on != null) return null;
  } else if (typeof raw.closes_on !== 'string' || !raw.closes_on) {
    return null;
  }
  if (raw.url != null && typeof raw.url !== 'string') return null;
  const sources = parseSources(raw.sources);
  if (!sources) return null;
  if (!OPPORTUNITY_FOUND_BY.has(raw.found_by)) return null;
  if (!OPPORTUNITY_STATUSES.has(raw.status)) return null;
  if (typeof raw.created_at !== 'string' || !isIsoTimestamp(raw.created_at)) return null;
  if (typeof raw.updated_at !== 'string' || !isIsoTimestamp(raw.updated_at)) return null;
  return {
    schema_version: raw.schema_version,
    id: raw.id,
    organisation_ref: raw.organisation_ref,
    kind: raw.kind,
    title: raw.title,
    summary: raw.summary ?? null,
    closes_on: raw.closes_on ?? null,
    closes_precision: raw.closes_precision,
    url: raw.url ?? null,
    sources,
    found_by: raw.found_by,
    status: raw.status,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const CREATE_KEYS = new Set([
  'organisation_ref',
  'kind',
  'title',
  'summary',
  'closes_on',
  'closes_precision',
  'url',
  'sources',
  'found_by'
]);

export function validateOpportunityCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Opportunity creation requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const closes_precision = input.closes_precision ?? 'none';
  if (!CLOSES_PRECISION.has(closes_precision)) {
    throw validationError('invalid_closes_precision', 'closes_precision is not permitted.');
  }
  const kind = input.kind;
  if (!OPPORTUNITY_KINDS.has(kind)) {
    throw validationError('invalid_kind', 'kind is not permitted.');
  }
  const found_by = input.found_by ?? 'adam';
  if (!OPPORTUNITY_FOUND_BY.has(found_by)) {
    throw validationError('invalid_found_by', 'found_by is not permitted.');
  }
  return {
    organisation_ref: validateOrganisationRef(input.organisation_ref),
    kind,
    title: trimBounded(input.title, 'title', TITLE_MAX, { allowEmpty: false }),
    summary: trimBounded(input.summary, 'summary', SUMMARY_MAX),
    closes_on: validateClosesOn(input.closes_on, closes_precision),
    closes_precision,
    url: trimBounded(input.url, 'url', URL_MAX),
    sources: validateSourcesInput(input.sources),
    found_by
  };
}

const PATCH_KEYS = new Set(['status', 'title', 'summary', 'closes_on', 'closes_precision', 'url', 'kind']);

export function validateOpportunityPatch(input, existing = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A patch requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!PATCH_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const patch = {};
  if (input.status !== undefined) {
    if (!OPPORTUNITY_STATUSES.has(input.status)) {
      throw validationError('invalid_status', 'status is not permitted.');
    }
    patch.status = input.status;
  }
  if (input.kind !== undefined) {
    if (!OPPORTUNITY_KINDS.has(input.kind)) {
      throw validationError('invalid_kind', 'kind is not permitted.');
    }
    patch.kind = input.kind;
  }
  if (input.title !== undefined) {
    patch.title = trimBounded(input.title, 'title', TITLE_MAX, { allowEmpty: false });
  }
  if (input.summary !== undefined) {
    patch.summary = trimBounded(input.summary, 'summary', SUMMARY_MAX);
  }
  if (input.url !== undefined) {
    patch.url = trimBounded(input.url, 'url', URL_MAX);
  }
  const precision =
    input.closes_precision !== undefined
      ? input.closes_precision
      : existing?.closes_precision ?? 'none';
  if (input.closes_precision !== undefined) {
    if (!CLOSES_PRECISION.has(input.closes_precision)) {
      throw validationError('invalid_closes_precision', 'closes_precision is not permitted.');
    }
    patch.closes_precision = input.closes_precision;
  }
  if (input.closes_on !== undefined || input.closes_precision !== undefined) {
    const closesValue = input.closes_on !== undefined ? input.closes_on : existing?.closes_on;
    patch.closes_on = validateClosesOn(closesValue, precision);
    if (input.closes_precision === undefined) patch.closes_precision = precision;
  }
  if (!Object.keys(patch).length) {
    throw validationError('empty_update', 'Update requires at least one field.');
  }
  return patch;
}

/** D1: month-only → "closes Oct 2026"; day → "closes dd/mm/yy"; none → null. */
export function formatOpportunityClosesLabel(record) {
  if (!record || record.closes_precision === 'none' || !record.closes_on) return null;
  const raw = record.closes_on;
  if (record.closes_precision === 'month') {
    const d = new Date(raw.length === 7 ? `${raw}-01T00:00:00.000Z` : `${raw.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    return `closes ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const d = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  return `closes ${dd}/${mm}/${yy}`;
}

/**
 * D2: open items sorted by closes_on ascending, undated last.
 * Tie-break by id for stability.
 */
export function compareOpportunitiesByCloses(a, b) {
  const aDate = a.closes_on && a.closes_precision !== 'none' ? Date.parse(a.closes_on) : null;
  const bDate = b.closes_on && b.closes_precision !== 'none' ? Date.parse(b.closes_on) : null;
  const aHas = Number.isFinite(aDate);
  const bHas = Number.isFinite(bDate);
  if (aHas && bHas && aDate !== bDate) return aDate - bDate;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Past close date marks the item expired on read (BUILD-PLAN Phase 4). */
export function applyExpiredOnRead(record, nowIso = new Date().toISOString()) {
  if (!record) return record;
  if (record.status === 'dismissed' || record.status === 'applied' || record.status === 'expired') {
    return record;
  }
  if (record.closes_precision === 'none' || !record.closes_on) return record;
  const closeMs = Date.parse(
    record.closes_precision === 'month' && record.closes_on.length === 7
      ? `${record.closes_on}-01T00:00:00.000Z`
      : record.closes_on
  );
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(closeMs) || !Number.isFinite(nowMs)) return record;
  // Month precision: expire after the last day of that month.
  let expireMs = closeMs;
  if (record.closes_precision === 'month') {
    const d = new Date(closeMs);
    expireMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999);
  }
  if (nowMs > expireMs) {
    return { ...record, status: 'expired' };
  }
  return record;
}

export function projectOpportunity(record, nowIso) {
  const live = applyExpiredOnRead(record, nowIso);
  return {
    ...live,
    closes_label: formatOpportunityClosesLabel(live)
  };
}

/**
 * Intent shape for Add to Applications — creates an application with
 * applies_to the organisation (BUILD-PLAN Phase 4). Pure; no I/O.
 */
export function buildAppliesToApplicationIntent(opportunity) {
  if (!opportunity?.organisation_ref || !opportunity?.title) {
    throw validationError('invalid_opportunity', 'Opportunity requires organisation_ref and title.');
  }
  return {
    position_title: opportunity.title,
    advertisement: {
      title: opportunity.title,
      url: opportunity.url ?? null,
      source: 'opportunity',
      summary: opportunity.summary ?? null,
      captured_at: null
    },
    closing_date: opportunity.closes_on ?? null,
    links: [
      {
        target_ref: opportunity.organisation_ref,
        relationship_type: 'applies_to',
        metadata: {
          from_opportunity_id: opportunity.id,
          opportunity_kind: opportunity.kind
        }
      }
    ]
  };
}

/**
 * Intent shape for Add to Events — creates an event with provider the
 * organisation (BUILD-PLAN Phase 4). Pure; no I/O.
 */
export function buildProviderEventIntent(opportunity, nowIso = new Date().toISOString()) {
  if (!opportunity?.organisation_ref || !opportunity?.title) {
    throw validationError('invalid_opportunity', 'Opportunity requires organisation_ref and title.');
  }
  const start = opportunity.closes_on
    ? `${String(opportunity.closes_on).slice(0, 10)}T09:00:00.000Z`
    : nowIso;
  const endMs = Date.parse(start) + 60 * 60 * 1000;
  return {
    title: opportunity.title,
    event_type: opportunity.kind === 'pd' ? 'pd' : 'other',
    start,
    end: new Date(endMs).toISOString(),
    time_zone: 'Australia/Sydney',
    all_day: false,
    links: [
      {
        target_ref: opportunity.organisation_ref,
        relationship_type: 'provider',
        metadata: {
          from_opportunity_id: opportunity.id,
          opportunity_kind: opportunity.kind
        }
      }
    ]
  };
}

export function opportunityIndexRecord(record) {
  return {
    id: record.id,
    organisation_ref: record.organisation_ref,
    status: record.status,
    closes_on: record.closes_on ?? null,
    updated_at: record.updated_at
  };
}
