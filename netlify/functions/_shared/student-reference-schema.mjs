const ID_PATTERN = /^student_ref_[0-9a-f-]{36}$/;
const DISPLAY_CODE_PATTERN = /^[A-Z]{1,3}(?:[1-9][0-9]*)?$/;
const INITIALS_PATTERN = /^[A-Z]{1,3}$/;
const CONTEXT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const STUDENT_REFERENCE_LIFECYCLE = Object.freeze(['active', 'inactive', 'archived', 'deleted']);
export const STUDENT_CONTEXT_TYPES = Object.freeze(['class', 'program', 'excursion', 'coaching']);
export const PERMISSION_STATUSES = Object.freeze(['pending', 'submitted', 'approved', 'declined']);

export function studentReferenceError(code = 'invalid_student_reference', status = 400) {
  return Object.assign(new Error('Student reference request is invalid.'), { status, code });
}

export function normalizeInitials(value) {
  const initials = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!INITIALS_PATTERN.test(initials)) throw studentReferenceError('invalid_display_code');
  return initials;
}

export function isStudentReferenceId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw studentReferenceError('invalid_participation_date');
  }
  return new Date(value).toISOString();
}

export function parseStudentReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    value.schema_version !== 1 ||
    value.kind !== 'student_reference' ||
    !isStudentReferenceId(value.id) ||
    !DISPLAY_CODE_PATTERN.test(value.display_code) ||
    !STUDENT_REFERENCE_LIFECYCLE.includes(value.lifecycle_status) ||
    typeof value.created_at !== 'string' ||
    Number.isNaN(Date.parse(value.created_at)) ||
    typeof value.updated_at !== 'string' ||
    Number.isNaN(Date.parse(value.updated_at))
  ) return null;
  return {
    schema_version: 1,
    id: value.id,
    kind: 'student_reference',
    display_code: value.display_code,
    lifecycle_status: value.lifecycle_status,
    created_at: new Date(value.created_at).toISOString(),
    updated_at: new Date(value.updated_at).toISOString()
  };
}

export function parseStudentContextInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw studentReferenceError('invalid_context');
  }
  const context_type = value.context_type;
  const context_id = typeof value.context_id === 'string' ? value.context_id.trim() : '';
  if (!STUDENT_CONTEXT_TYPES.includes(context_type) || !CONTEXT_ID_PATTERN.test(context_id)) {
    throw studentReferenceError('invalid_context');
  }
  const permission_status = value.permission_status ?? null;
  if (permission_status !== null && !PERMISSION_STATUSES.includes(permission_status)) {
    throw studentReferenceError('invalid_permission_status');
  }
  const valid_from = isoOrNull(value.valid_from);
  const valid_to = isoOrNull(value.valid_to);
  if (valid_from && valid_to && Date.parse(valid_to) < Date.parse(valid_from)) {
    throw studentReferenceError('invalid_participation_date');
  }
  return { context_type, context_id, permission_status, valid_from, valid_to };
}
