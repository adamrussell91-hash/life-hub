// Server-derived access context for Universal Links reads. The current
// application has one authenticated operator (implementation programme,
// "Authorisation model") — this makes workflow scope explicit without
// pretending to be a multi-tenant ACL system.

const KNOWN_WORKFLOWS = new Set(['professional', 'tasks', 'teaching', 'knowledge', 'life', 'administration']);
const KNOWN_VISIBILITIES = new Set(['operator', 'teaching_protected']);

// Strictest-first order: a higher index is a narrower, more restrictive
// visibility. `teaching_protected` is narrower than `operator` because it
// additionally requires a teaching-scoped workflow, not merely the single
// operator's session.
const VISIBILITY_STRICTNESS = ['operator', 'teaching_protected'];

// Build AccessContext on the server from the handler/route/verified
// session only. Never accept `actor`, `workflow`, or `allowed_visibility`
// from request JSON — a caller-supplied workflow would let a client widen
// its own access.
//
// No workflow grants `teaching_protected` yet. The implementation
// programme requires a recorded College approval gate (Slice 8) before
// any teaching_protected data exists or is reachable — granting the
// visibility label pre-emptively, even with nothing behind it yet, is out
// of scope here and stays out until that gate lands.
export function createAccessContext({ workflow, allowedEntityKinds = [] } = {}) {
  if (!KNOWN_WORKFLOWS.has(workflow)) {
    throw Object.assign(new Error(`Unknown workflow: ${workflow}`), { status: 400, code: 'invalid_workflow' });
  }
  return Object.freeze({
    actor: 'operator',
    workflow,
    allowed_visibility: Object.freeze(['operator']),
    allowed_entity_kinds: Object.freeze([...allowedEntityKinds])
  });
}

export function isVisibilityAllowed(accessContext, visibility) {
  if (!accessContext || !KNOWN_VISIBILITIES.has(visibility)) return false;
  return accessContext.allowed_visibility.includes(visibility);
}

// Returns whichever of the given visibility labels is the most
// restrictive. Used by the create protocol (Slice 2) to derive a link's
// visibility as the strictest of its endpoints' and workflow's visibility.
// Defined now, as a pure function, because it grants nothing on its own.
export function strictestVisibility(...visibilities) {
  const known = visibilities.filter(value => VISIBILITY_STRICTNESS.includes(value));
  if (!known.length) {
    throw Object.assign(new Error('strictestVisibility requires at least one known visibility value.'), {
      status: 400,
      code: 'invalid_visibility'
    });
  }
  return known.reduce((strictest, value) => (
    VISIBILITY_STRICTNESS.indexOf(value) > VISIBILITY_STRICTNESS.indexOf(strictest) ? value : strictest
  ));
}

// A hidden target must behave as absent (implementation programme,
// "Authorisation and visibility"). Every resolver and read path throws
// this exact shape — never a distinct "forbidden" error — so a caller
// cannot distinguish "does not exist" from "exists but you can't see it."
export function endpointNotFoundError() {
  return Object.assign(new Error('Endpoint not found.'), { status: 404, code: 'endpoint_not_found' });
}

// Empty `allowed_entity_kinds` means "no kind restriction from this
// context." A non-empty list restricts resolution to exactly those kinds.
// Throws the same non-disclosure shape as a missing entity — a disallowed
// kind must not read differently from one that simply does not exist.
export function assertEntityKindAllowed(accessContext, kind) {
  if (!accessContext) throw endpointNotFoundError();
  if (accessContext.allowed_entity_kinds.length && !accessContext.allowed_entity_kinds.includes(kind)) {
    throw endpointNotFoundError();
  }
}
