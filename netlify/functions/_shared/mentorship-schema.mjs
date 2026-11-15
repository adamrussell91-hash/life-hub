import { randomUUID } from 'node:crypto';
import { validateBlocks } from './communication-schema.mjs';
import { isValidOrganisationId, isValidPersonId } from './identity-schema.mjs';

// A mentorship says how the operator mentors one person. Private notes live in
// `blocks`; `shared_blocks` are what a read-only sheet link shows the mentee.
// The person is a reference, never a copy. Nothing is deleted: a mentorship
// is completed and can be reopened.

export const MENTORSHIP_SCHEMA_VERSION = 1;
export const MENTORSHIP_KINDS = new Set(['accreditation', 'halt_highly_accomplished', 'halt_lead', 'coaching', 'other']);
export const MENTORSHIP_STATUSES = new Set(['active', 'completed']);
const MENTORSHIP_ID_PATTERN = /^mentorship_[0-9a-f-]{36}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LABEL_MAX = 60;
const TEXT_MAX = 300;

export function generateMentorshipId() {
  return `mentorship_${randomUUID()}`;
}

export function isValidMentorshipId(id) {
  return typeof id === 'string' && MENTORSHIP_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isPersonRef(value) {
  return typeof value === 'string' && value.startsWith('shared:person:') && isValidPersonId(value.slice('shared:person:'.length));
}

function isOrganisationRef(value) {
  return typeof value === 'string' && value.startsWith('shared:organisation:')
    && isValidOrganisationId(value.slice('shared:organisation:'.length));
}

function readPersonRef(value) {
  if (!isPersonRef(value)) throw validationError('invalid_person_ref', 'person_ref must be a shared:person reference.');
  return value;
}

function readKind(value) {
  if (!MENTORSHIP_KINDS.has(value)) {
    throw validationError('invalid_kind', 'kind must be accreditation, halt_highly_accomplished, halt_lead, coaching or other.');
  }
  return value;
}

function readStatus(value) {
  if (!MENTORSHIP_STATUSES.has(value)) throw validationError('invalid_status', 'status must be active or completed.');
  return value;
}

function readText(value, field, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw validationError(`invalid_${field}`, `${field} must be at most ${max} characters.`);
  }
  return value.trim() || null;
}

function readOrganisationRef(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!isOrganisationRef(value)) throw validationError('invalid_organisation_ref', 'organisation_ref must be a shared:organisation reference.');
  return value;
}

function readDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw validationError(`invalid_${field}`, `${field} must be YYYY-MM-DD.`);
  }
  return value;
}

const FIELD_READERS = {
  kind: readKind,
  label: (value) => readText(value, 'label', LABEL_MAX),
  organisation_ref: readOrganisationRef,
  focus: (value) => readText(value, 'focus', TEXT_MAX),
  status: readStatus,
  started_on: (value) => readDate(value, 'started_on'),
  completed_on: (value) => readDate(value, 'completed_on'),
  outcome: (value) => readText(value, 'outcome', TEXT_MAX),
  blocks: validateBlocks,
  shared_blocks: validateBlocks
};

const CREATE_KEYS = new Set(['person_ref', ...Object.keys(FIELD_READERS)]);
const PATCH_KEYS = new Set(Object.keys(FIELD_READERS));

const STORED_KEYS = new Set([
  'schema_version', 'id', 'person_ref', 'kind', 'label', 'organisation_ref', 'focus', 'status',
  'started_on', 'completed_on', 'outcome', 'blocks', 'shared_blocks', 'created_at', 'updated_at'
]);

export function parseMentorshipRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!STORED_KEYS.has(key)) return null;
  if (raw.schema_version !== MENTORSHIP_SCHEMA_VERSION || !isValidMentorshipId(raw.id)) return null;
  if (!isPersonRef(raw.person_ref) || !MENTORSHIP_KINDS.has(raw.kind) || !MENTORSHIP_STATUSES.has(raw.status)) return null;
  if (!Array.isArray(raw.blocks) || !Array.isArray(raw.shared_blocks)) return null;
  return { ...raw };
}

function rejectUnknown(input, allowed) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
  }
}

function assertBody(input, what) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', `${what} requires a body object.`);
  }
}

export function validateMentorshipCreateInput(input) {
  assertBody(input, 'Mentorship creation');
  rejectUnknown(input, CREATE_KEYS);
  const out = { person_ref: readPersonRef(input.person_ref), kind: readKind(input.kind) };
  for (const key of ['label', 'organisation_ref', 'focus', 'started_on', 'completed_on', 'outcome']) {
    out[key] = FIELD_READERS[key](input[key]);
  }
  out.status = input.status === undefined ? 'active' : readStatus(input.status);
  out.blocks = input.blocks === undefined ? [] : validateBlocks(input.blocks);
  out.shared_blocks = input.shared_blocks === undefined ? [] : validateBlocks(input.shared_blocks);
  return out;
}

export function validateMentorshipPatchInput(input) {
  assertBody(input, 'Mentorship patch');
  rejectUnknown(input, PATCH_KEYS);
  const patch = {};
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) continue;
    if ((key === 'kind' || key === 'status' || key === 'blocks' || key === 'shared_blocks') && input[key] === null) {
      throw validationError(`invalid_${key}`, `${key} cannot be null.`);
    }
    patch[key] = FIELD_READERS[key](input[key]);
  }
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
  return patch;
}

export function projectMentorship(record) {
  return { ...record };
}

export function projectMentorshipSummary(record) {
  const { blocks: _blocks, shared_blocks: _shared, ...summary } = record;
  return summary;
}

export const mentorshipSheetShareKey = (mentorshipId) => `mentorship-sheet-shares/${mentorshipId}`;
