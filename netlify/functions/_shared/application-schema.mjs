import { createHash, randomUUID } from 'node:crypto';
import { assertValidTimeZone } from './wall-time.mjs';

// Job Application records for Professional Hub (`professional-hub-content`).
// Organisation, Person, Task, Knowledge, and Universal Link IDs live only as
// Universal Links — never on the Application JSON.

export const APPLICATION_SCHEMA_VERSION = 1;

export const APPLICATION_PIPELINE_STATUSES = new Set([
  'researching',
  'preparing',
  'submitted',
  'interview',
  'offered',
  'accepted',
  'declined',
  'withdrawn',
  'unsuccessful'
]);

export const APPLICATION_TERMINAL_STATUSES = new Set([
  'accepted',
  'declined',
  'withdrawn',
  'unsuccessful'
]);

/** Allowed pipeline transitions — Meeting-style explicit map. */
export const APPLICATION_PIPELINE_TRANSITIONS = Object.freeze({
  researching: Object.freeze(['preparing', 'withdrawn']),
  preparing: Object.freeze(['submitted', 'researching', 'withdrawn']),
  submitted: Object.freeze(['interview', 'unsuccessful', 'withdrawn']),
  interview: Object.freeze(['offered', 'unsuccessful', 'withdrawn']),
  offered: Object.freeze(['accepted', 'declined', 'withdrawn']),
  accepted: Object.freeze([]),
  declined: Object.freeze([]),
  withdrawn: Object.freeze([]),
  unsuccessful: Object.freeze([])
});

export const DOCUMENT_TYPES = new Set([
  'cover_letter',
  'resume',
  'selection_criteria',
  'portfolio',
  'other'
]);

export const DOCUMENT_STATUSES = new Set(['draft', 'ready', 'submitted']);

export const INTERVIEW_FORMATS = new Set(['in_person', 'video', 'phone', 'other']);

export const INTERVIEW_RESULTS = new Set([
  'pending',
  'progressed',
  'unsuccessful',
  'offer',
  'withdrawn'
]);

export const INTERVIEW_LIFECYCLE_STATES = new Set([
  'scheduled',
  'completed',
  'cancelled',
  'no_show'
]);

export const OUTCOME_STATUSES = new Set([
  'offered',
  'accepted',
  'declined',
  'unsuccessful',
  'withdrawn'
]);

export const POSITION_TITLE_MAX = 500;
export const AD_TITLE_MAX = 500;
export const AD_URL_MAX = 2000;
export const AD_SOURCE_MAX = 200;
export const AD_SUMMARY_MAX = 4000;
export const DOC_LABEL_MAX = 300;
export const DOC_REF_MAX = 500;
export const DOC_VERSION_MAX = 80;
export const CRITERION_MAX = 2000;
export const CRITERION_RESPONSE_MAX = 16000;
export const INTERVIEW_LOCATION_MAX = 500;
export const INTERVIEW_NOTES_MAX = 8000;
export const OUTCOME_DETAILS_MAX = 4000;
export const OUTCOME_REASON_MAX = 1000;
export const REFLECTION_MAX = 16000;
export const MAX_DOCUMENTS = 40;
export const MAX_CRITERIA = 60;
export const MAX_INTERVIEW_ROUNDS = 30;

const APPLICATION_ID_PATTERN = /^application_[0-9a-f-]{36}$/;
export const APPLICATION_OPERATION_ID_PATTERN = /^aop_[0-9a-f]{32}$/;

export const PERMITTED_CREATE_LINK_TYPES = new Set([
  'applicant_to',
  'application_contact',
  'referee',
  'related_to'
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function generateApplicationId() {
  return `application_${randomUUID()}`;
}

export function isValidApplicationId(id) {
  return typeof id === 'string' && APPLICATION_ID_PATTERN.test(id);
}

export function isValidApplicationOperationId(id) {
  return typeof id === 'string' && APPLICATION_OPERATION_ID_PATTERN.test(id);
}

export function deriveApplicationOperationId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  return `aop_${digest}`;
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return Number.isFinite(Date.parse(value));
}

function isDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed);
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

const ADVERTISEMENT_KEYS = new Set(['title', 'url', 'source', 'summary', 'captured_at']);

function emptyAdvertisement() {
  return { title: null, url: null, source: null, summary: null, captured_at: null };
}

function parseAdvertisement(raw) {
  if (raw === null || raw === undefined) return emptyAdvertisement();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!ADVERTISEMENT_KEYS.has(key)) return null;
  }
  if (raw.title != null && typeof raw.title !== 'string') return null;
  if (raw.url != null && typeof raw.url !== 'string') return null;
  if (raw.source != null && typeof raw.source !== 'string') return null;
  if (raw.summary != null && typeof raw.summary !== 'string') return null;
  if (raw.captured_at != null && !isIsoTimestamp(raw.captured_at)) return null;
  return {
    title: raw.title ?? null,
    url: raw.url ?? null,
    source: raw.source ?? null,
    summary: raw.summary ?? null,
    captured_at: raw.captured_at ?? null
  };
}

function validateAdvertisementInput(raw, { mergeWith = null } = {}) {
  if (raw === null) return emptyAdvertisement();
  if (raw === undefined) {
    return mergeWith ? { ...mergeWith } : emptyAdvertisement();
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationError('invalid_advertisement', 'advertisement must be an object or null.');
  }
  for (const key of Object.keys(raw)) {
    if (!ADVERTISEMENT_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown advertisement field "${key}".`);
    }
  }
  const base = mergeWith ? { ...mergeWith } : emptyAdvertisement();
  if (raw.title !== undefined) {
    base.title = trimBounded(raw.title, 'advertisement.title', AD_TITLE_MAX);
  }
  if (raw.url !== undefined) {
    base.url = trimBounded(raw.url, 'advertisement.url', AD_URL_MAX);
  }
  if (raw.source !== undefined) {
    base.source = trimBounded(raw.source, 'advertisement.source', AD_SOURCE_MAX);
  }
  if (raw.summary !== undefined) {
    base.summary = trimBounded(raw.summary, 'advertisement.summary', AD_SUMMARY_MAX);
  }
  if (raw.captured_at !== undefined) {
    if (raw.captured_at === null) base.captured_at = null;
    else if (!isIsoTimestamp(raw.captured_at)) {
      throw validationError('invalid_captured_at', 'advertisement.captured_at must be ISO.');
    } else base.captured_at = raw.captured_at;
  }
  return base;
}

const DOCUMENT_KEYS = new Set(['document_type', 'label', 'url_or_storage_ref', 'version', 'status']);

function parseDocuments(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_DOCUMENTS) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!DOCUMENT_KEYS.has(key)) return null;
    }
    if (!DOCUMENT_TYPES.has(entry.document_type)) return null;
    if (typeof entry.label !== 'string') return null;
    if (typeof entry.url_or_storage_ref !== 'string') return null;
    if (entry.version != null && typeof entry.version !== 'string') return null;
    if (!DOCUMENT_STATUSES.has(entry.status)) return null;
    out.push({
      document_type: entry.document_type,
      label: entry.label,
      url_or_storage_ref: entry.url_or_storage_ref,
      version: entry.version ?? null,
      status: entry.status
    });
  }
  return out;
}

function validateDocumentsInput(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw validationError('invalid_documents', 'documents must be an array.');
  }
  if (raw.length > MAX_DOCUMENTS) {
    throw validationError('documents_too_many', `documents must have at most ${MAX_DOCUMENTS} entries.`);
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw validationError('invalid_document', `documents[${index}] must be an object.`);
    }
    for (const key of Object.keys(entry)) {
      if (!DOCUMENT_KEYS.has(key)) {
        throw validationError('unknown_field', `Unknown document field "${key}".`);
      }
    }
    if (!DOCUMENT_TYPES.has(entry.document_type)) {
      throw validationError('invalid_document_type', `documents[${index}].document_type is not permitted.`);
    }
    if (!DOCUMENT_STATUSES.has(entry.status)) {
      throw validationError('invalid_document_status', `documents[${index}].status is not permitted.`);
    }
    return {
      document_type: entry.document_type,
      label: trimBounded(entry.label, `documents[${index}].label`, DOC_LABEL_MAX, { allowEmpty: false }),
      url_or_storage_ref: trimBounded(
        entry.url_or_storage_ref,
        `documents[${index}].url_or_storage_ref`,
        DOC_REF_MAX,
        { allowEmpty: false }
      ),
      version: trimBounded(entry.version, `documents[${index}].version`, DOC_VERSION_MAX),
      status: entry.status
    };
  });
}

const CRITERION_KEYS = new Set(['criterion', 'response', 'order', 'completed']);

function parseSelectionCriteria(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_CRITERIA) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!CRITERION_KEYS.has(key)) return null;
    }
    if (typeof entry.criterion !== 'string') return null;
    if (entry.response != null && typeof entry.response !== 'string') return null;
    if (typeof entry.order !== 'number' || !Number.isInteger(entry.order) || entry.order < 0) return null;
    if (typeof entry.completed !== 'boolean') return null;
    out.push({
      criterion: entry.criterion,
      response: entry.response ?? null,
      order: entry.order,
      completed: entry.completed
    });
  }
  return out;
}

function validateSelectionCriteriaInput(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw validationError('invalid_selection_criteria', 'selection_criteria must be an array.');
  }
  if (raw.length > MAX_CRITERIA) {
    throw validationError(
      'selection_criteria_too_many',
      `selection_criteria must have at most ${MAX_CRITERIA} entries.`
    );
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw validationError('invalid_criterion', `selection_criteria[${index}] must be an object.`);
    }
    for (const key of Object.keys(entry)) {
      if (!CRITERION_KEYS.has(key)) {
        throw validationError('unknown_field', `Unknown selection_criteria field "${key}".`);
      }
    }
    if (typeof entry.order !== 'number' || !Number.isInteger(entry.order) || entry.order < 0) {
      throw validationError('invalid_order', `selection_criteria[${index}].order must be a non-negative integer.`);
    }
    if (typeof entry.completed !== 'boolean') {
      throw validationError('invalid_completed', `selection_criteria[${index}].completed must be a boolean.`);
    }
    return {
      criterion: trimBounded(entry.criterion, `selection_criteria[${index}].criterion`, CRITERION_MAX, {
        allowEmpty: false
      }),
      response: trimBounded(entry.response, `selection_criteria[${index}].response`, CRITERION_RESPONSE_MAX),
      order: entry.order,
      completed: entry.completed
    };
  });
}

const INTERVIEW_KEYS = new Set([
  'date',
  'time_zone',
  'format',
  'location',
  'preparation_notes',
  'panel_notes',
  'result',
  'lifecycle_state'
]);

function parseInterviewRounds(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_INTERVIEW_ROUNDS) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!INTERVIEW_KEYS.has(key)) return null;
    }
    if (!isIsoTimestamp(entry.date)) return null;
    if (typeof entry.time_zone !== 'string' || !entry.time_zone.trim()) return null;
    if (!INTERVIEW_FORMATS.has(entry.format)) return null;
    if (entry.location != null && typeof entry.location !== 'string') return null;
    if (entry.preparation_notes != null && typeof entry.preparation_notes !== 'string') return null;
    if (entry.panel_notes != null && typeof entry.panel_notes !== 'string') return null;
    if (!INTERVIEW_RESULTS.has(entry.result)) return null;
    if (!INTERVIEW_LIFECYCLE_STATES.has(entry.lifecycle_state)) return null;
    out.push({
      date: entry.date,
      time_zone: entry.time_zone,
      format: entry.format,
      location: entry.location ?? null,
      preparation_notes: entry.preparation_notes ?? null,
      panel_notes: entry.panel_notes ?? null,
      result: entry.result,
      lifecycle_state: entry.lifecycle_state
    });
  }
  return out;
}

function validateInterviewRoundsInput(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw validationError('invalid_interview_rounds', 'interview_rounds must be an array.');
  }
  if (raw.length > MAX_INTERVIEW_ROUNDS) {
    throw validationError(
      'interview_rounds_too_many',
      `interview_rounds must have at most ${MAX_INTERVIEW_ROUNDS} entries.`
    );
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw validationError('invalid_interview_round', `interview_rounds[${index}] must be an object.`);
    }
    for (const key of Object.keys(entry)) {
      if (!INTERVIEW_KEYS.has(key)) {
        throw validationError('unknown_field', `Unknown interview_rounds field "${key}".`);
      }
    }
    if (!isIsoTimestamp(entry.date)) {
      throw validationError('invalid_interview_date', `interview_rounds[${index}].date must be ISO.`);
    }
    const time_zone = assertValidTimeZone(
      trimBounded(entry.time_zone, `interview_rounds[${index}].time_zone`, 120, { allowEmpty: false })
    );
    if (!INTERVIEW_FORMATS.has(entry.format)) {
      throw validationError('invalid_interview_format', `interview_rounds[${index}].format is not permitted.`);
    }
    if (!INTERVIEW_RESULTS.has(entry.result)) {
      throw validationError('invalid_interview_result', `interview_rounds[${index}].result is not permitted.`);
    }
    if (!INTERVIEW_LIFECYCLE_STATES.has(entry.lifecycle_state)) {
      throw validationError(
        'invalid_interview_lifecycle',
        `interview_rounds[${index}].lifecycle_state is not permitted.`
      );
    }
    return {
      date: entry.date,
      time_zone,
      format: entry.format,
      location: trimBounded(entry.location, `interview_rounds[${index}].location`, INTERVIEW_LOCATION_MAX),
      preparation_notes: trimBounded(
        entry.preparation_notes,
        `interview_rounds[${index}].preparation_notes`,
        INTERVIEW_NOTES_MAX
      ),
      panel_notes: trimBounded(
        entry.panel_notes,
        `interview_rounds[${index}].panel_notes`,
        INTERVIEW_NOTES_MAX
      ),
      result: entry.result,
      lifecycle_state: entry.lifecycle_state
    };
  });
}

const OUTCOME_KEYS = new Set(['status', 'date', 'offer_details', 'reason']);

function parseOutcome(raw) {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!OUTCOME_KEYS.has(key)) return null;
  }
  if (!OUTCOME_STATUSES.has(raw.status)) return null;
  if (raw.date != null && !isDateString(raw.date)) return null;
  if (raw.offer_details != null && typeof raw.offer_details !== 'string') return null;
  if (raw.reason != null && typeof raw.reason !== 'string') return null;
  return {
    status: raw.status,
    date: raw.date ?? null,
    offer_details: raw.offer_details ?? null,
    reason: raw.reason ?? null
  };
}

function validateOutcomeInput(raw, { mergeWith = null } = {}) {
  if (raw === null) return null;
  if (raw === undefined) return mergeWith ?? null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationError('invalid_outcome', 'outcome must be an object or null.');
  }
  for (const key of Object.keys(raw)) {
    if (!OUTCOME_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown outcome field "${key}".`);
    }
  }
  const base = mergeWith ? { ...mergeWith } : { status: null, date: null, offer_details: null, reason: null };
  if (raw.status !== undefined) {
    if (!OUTCOME_STATUSES.has(raw.status)) {
      throw validationError('invalid_outcome_status', 'outcome.status is not permitted.');
    }
    base.status = raw.status;
  }
  if (raw.date !== undefined) {
    if (raw.date === null) base.date = null;
    else if (!isDateString(raw.date)) {
      throw validationError('invalid_outcome_date', 'outcome.date must be YYYY-MM-DD or null.');
    } else base.date = raw.date;
  }
  if (raw.offer_details !== undefined) {
    base.offer_details = trimBounded(raw.offer_details, 'outcome.offer_details', OUTCOME_DETAILS_MAX);
  }
  if (raw.reason !== undefined) {
    base.reason = trimBounded(raw.reason, 'outcome.reason', OUTCOME_REASON_MAX);
  }
  if (!base.status) {
    throw validationError('invalid_outcome_status', 'outcome.status is required when setting outcome.');
  }
  return {
    status: base.status,
    date: base.date ?? null,
    offer_details: base.offer_details ?? null,
    reason: base.reason ?? null
  };
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'position_title',
  'advertisement',
  'closing_date',
  'pipeline_status',
  'documents',
  'selection_criteria',
  'interview_rounds',
  'outcome',
  'reflection',
  'created_at',
  'updated_at'
]);

export function parseApplicationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== APPLICATION_SCHEMA_VERSION) return null;
  if (!isValidApplicationId(raw.id)) return null;
  if (typeof raw.position_title !== 'string') return null;
  const advertisement = parseAdvertisement(raw.advertisement);
  if (!advertisement) return null;
  if (raw.closing_date != null && !isDateString(raw.closing_date)) return null;
  if (!APPLICATION_PIPELINE_STATUSES.has(raw.pipeline_status)) return null;
  const documents = parseDocuments(raw.documents);
  if (!documents) return null;
  const selection_criteria = parseSelectionCriteria(raw.selection_criteria);
  if (!selection_criteria) return null;
  const interview_rounds = parseInterviewRounds(raw.interview_rounds);
  if (!interview_rounds) return null;
  const outcome = parseOutcome(raw.outcome);
  if (raw.outcome !== null && raw.outcome !== undefined && outcome === null) return null;
  if (raw.reflection != null && typeof raw.reflection !== 'string') return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return {
    schema_version: raw.schema_version,
    id: raw.id,
    position_title: raw.position_title,
    advertisement,
    closing_date: raw.closing_date ?? null,
    pipeline_status: raw.pipeline_status,
    documents,
    selection_criteria,
    interview_rounds,
    outcome: outcome ?? null,
    reflection: raw.reflection ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const CREATE_KEYS = new Set([
  'position_title',
  'advertisement',
  'closing_date',
  'documents',
  'selection_criteria',
  'interview_rounds',
  'links'
]);

export function validateApplicationCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Application creation requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const position_title = trimBounded(input.position_title, 'position_title', POSITION_TITLE_MAX, {
    allowEmpty: false
  });
  let closing_date = null;
  if (input.closing_date !== undefined && input.closing_date !== null) {
    if (!isDateString(input.closing_date)) {
      throw validationError('invalid_closing_date', 'closing_date must be YYYY-MM-DD or null.');
    }
    closing_date = input.closing_date;
  }
  const links = input.links === undefined ? [] : input.links;
  if (!Array.isArray(links)) {
    throw validationError('invalid_links', 'links must be an array.');
  }
  return {
    position_title,
    advertisement: validateAdvertisementInput(input.advertisement),
    closing_date,
    documents: validateDocumentsInput(input.documents) ?? [],
    selection_criteria: validateSelectionCriteriaInput(input.selection_criteria) ?? [],
    interview_rounds: validateInterviewRoundsInput(input.interview_rounds) ?? [],
    links
  };
}

const UPDATE_KEYS = new Set([
  'position_title',
  'advertisement',
  'closing_date',
  'documents',
  'selection_criteria',
  'interview_rounds',
  'outcome',
  'reflection'
]);

/**
 * Partial field update. Nested advertisement/outcome merge with existing
 * values so unspecified nested keys are preserved. Array fields replace
 * wholly when provided.
 */
export function validateApplicationFieldUpdate(input, existing = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A field update requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!UPDATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const patch = {};
  if (input.position_title !== undefined) {
    patch.position_title = trimBounded(input.position_title, 'position_title', POSITION_TITLE_MAX, {
      allowEmpty: false
    });
  }
  if (input.advertisement !== undefined) {
    patch.advertisement = validateAdvertisementInput(input.advertisement, {
      mergeWith: existing?.advertisement ?? null
    });
  }
  if (input.closing_date !== undefined) {
    if (input.closing_date === null) patch.closing_date = null;
    else if (!isDateString(input.closing_date)) {
      throw validationError('invalid_closing_date', 'closing_date must be YYYY-MM-DD or null.');
    } else patch.closing_date = input.closing_date;
  }
  if (input.documents !== undefined) {
    patch.documents = validateDocumentsInput(input.documents);
  }
  if (input.selection_criteria !== undefined) {
    patch.selection_criteria = validateSelectionCriteriaInput(input.selection_criteria);
  }
  if (input.interview_rounds !== undefined) {
    patch.interview_rounds = validateInterviewRoundsInput(input.interview_rounds);
  }
  if (input.outcome !== undefined) {
    patch.outcome = validateOutcomeInput(input.outcome, { mergeWith: existing?.outcome ?? null });
  }
  if (input.reflection !== undefined) {
    patch.reflection = trimBounded(input.reflection, 'reflection', REFLECTION_MAX);
  }
  if (!Object.keys(patch).length) {
    throw validationError('empty_update', 'Update requires at least one field.');
  }
  return patch;
}

export function assertApplicationPipelineTransition(from, to) {
  const allowed = APPLICATION_PIPELINE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw validationError(
      'invalid_pipeline_transition',
      `Cannot transition Application from ${from} to ${to}.`
    );
  }
}

export function applicationDisplayLabel(record) {
  const title = typeof record?.position_title === 'string' ? record.position_title.trim() : '';
  if (title) return title;
  return 'Application';
}

export function projectApplication(record, incompleteLinks = null) {
  const projection = {
    schema_version: record.schema_version,
    id: record.id,
    position_title: record.position_title,
    advertisement: record.advertisement ?? emptyAdvertisement(),
    closing_date: record.closing_date ?? null,
    pipeline_status: record.pipeline_status,
    documents: record.documents ?? [],
    selection_criteria: record.selection_criteria ?? [],
    interview_rounds: record.interview_rounds ?? [],
    outcome: record.outcome ?? null,
    reflection: record.reflection ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
  if (incompleteLinks) {
    projection.incomplete_links = incompleteLinks;
  }
  return projection;
}

export function applicationIndexRecord(record) {
  return {
    id: record.id,
    position_title: record.position_title,
    pipeline_status: record.pipeline_status,
    closing_date: record.closing_date ?? null,
    updated_at: record.updated_at
  };
}

export function compareApplicationsNewestFirst(a, b) {
  const aTime = Date.parse(a.updated_at);
  const bTime = Date.parse(b.updated_at);
  if (aTime !== bTime) return bTime - aTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
