// Reserved StudentReference schema (implementation programme, "Entity
// records" > "StudentReference"; comms-hub-people-unification.md ยง6).
// StudentReference is Teaching-owned and protected: it is not a Person
// subtype, never appears in general identity search, and its class/
// program/excursion/coaching *relationships* are not stored here — those
// live in the canonical Universal Link repository via the
// `participates_in` relationship (relationship-registry.mjs), resolved
// only through `student-reference-repository.mjs`'s Teaching-scoped
// resolver. This module owns only the StudentReference identity record
// itself: id/code shape, lifecycle transitions, and structural validation.
//
// No real student data may enter this repository (docs/proposals/
// comms-hub-people-unification.md ยง6.3). Every fixture and test using this
// module must use synthetic codes such as `STUDENT_A1`/`AR1`, clearly
// marked as synthetic.

const ID_PATTERN = /^student_ref_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INITIALS_PATTERN = /^[A-Z]{1,4}$/;
// A duplicate suffix is a plain small integer appended to initials (AR,
// AR2, AR3, ...) — never a student number, date of birth, year group, or
// class (ยง6.1 "Duplicate initials use a neutral suffix such as AR1 and
// AR2. Codes must not contain a student number, date of birth, year group,
// initials plus class, or another embedded identifier."). The first
// allocation keeps the bare initials; only the second and later
// allocations for the same initials append a suffix starting at 2.
const DISPLAY_CODE_PATTERN = /^[A-Z]{1,4}(?:[2-9]|[1-9][0-9]+)?$/;

export const STUDENT_REFERENCE_LIFECYCLE = Object.freeze(['active', 'archived', 'deleted']);

export const STUDENT_REFERENCE_TRANSITIONS = Object.freeze({
  active: new Set(['archived']),
  archived: new Set(['active', 'deleted']),
  deleted: new Set()
});

export const PERMISSION_STATUSES = Object.freeze(['pending', 'submitted', 'approved', 'declined']);

// The four membership kinds a StudentReference `participates_in` link may
// carry, and the single Universal Link target kind each requires. Excursion
// and coaching-group membership reuse existing entity kinds (a Tasks
// project of type `excursion`, and a Tasks program respectively) rather
// than inventing dedicated entity types the codebase has no other use for
// yet (implementation programme, "Absolute exclusions": "add speculative
// entity types before a real workflow uses them").
export const STUDENT_CONTEXT_TARGET_KIND = Object.freeze({
  class: 'teaching:class',
  program: 'tasks:program',
  excursion: 'tasks:project',
  coaching: 'tasks:program'
});

export const STUDENT_CONTEXT_TYPES = Object.freeze(Object.keys(STUDENT_CONTEXT_TARGET_KIND));

export function studentReferenceError(code = 'invalid_student_reference', status = 400) {
  return Object.assign(new Error('Student reference request is invalid.'), { status, code });
}

export function isStudentReferenceId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function normalizeInitials(value) {
  const initials = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!INITIALS_PATTERN.test(initials)) throw studentReferenceError('invalid_initials');
  return initials;
}

export function isValidDisplayCode(value) {
  return typeof value === 'string' && DISPLAY_CODE_PATTERN.test(value);
}

// Structural parse only — a type guard, mirroring universal-link-schema's
// `parseUniversalLink`. Returns null (never throws) for anything that is
// not a plausible StudentReference record, so a corrupted record cannot
// break reads of everything else.
const STUDENT_REFERENCE_KEYS = new Set([
  'schema_version',
  'id',
  'kind',
  'display_code',
  'lifecycle_status',
  'created_at',
  'updated_at'
]);

export function parseStudentReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !STUDENT_REFERENCE_KEYS.has(key))) return null;
  if (
    value.schema_version !== 1 ||
    value.kind !== 'student_reference' ||
    !isStudentReferenceId(value.id) ||
    !isValidDisplayCode(value.display_code) ||
    !STUDENT_REFERENCE_LIFECYCLE.includes(value.lifecycle_status) ||
    typeof value.created_at !== 'string' ||
    Number.isNaN(Date.parse(value.created_at)) ||
    typeof value.updated_at !== 'string' ||
    Number.isNaN(Date.parse(value.updated_at))
  ) {
    return null;
  }
  return {
    schema_version: 1,
    id: value.id,
    kind: 'student_reference',
    display_code: value.display_code,
    lifecycle_status: value.lifecycle_status,
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

export function assertLifecycleTransitionAllowed(fromStatus, toStatus) {
  const allowed = STUDENT_REFERENCE_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.has(toStatus)) {
    throw Object.assign(
      new Error(`Cannot transition a student reference from ${fromStatus} to ${toStatus}.`),
      { status: 409, code: 'invalid_lifecycle_transition' }
    );
  }
}

export function validateContextType(contextType) {
  if (!STUDENT_CONTEXT_TYPES.includes(contextType)) {
    throw studentReferenceError('invalid_context_type');
  }
  return contextType;
}

export function validatePermissionStatus(value) {
  if (value === null || value === undefined) return null;
  if (!PERMISSION_STATUSES.includes(value)) throw studentReferenceError('invalid_permission_status');
  return value;
}
