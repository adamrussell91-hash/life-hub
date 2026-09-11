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

// Requires the administration workflow specifically. `suppressLink`,
// `deleteLink`, `repairOperation`, and `rebuildIndexes` (Slice 2) are
// destructive or repository-wide operations gated to this workflow alone —
// unlike ordinary reads/creates/ends, which any known workflow may perform.
// Throws a 403, not the 404 non-disclosure shape: this is a scope check on
// the caller's own session, not a statement about whether something else
// exists.
export function assertAdministrationWorkflow(accessContext) {
  if (!accessContext || accessContext.workflow !== 'administration') {
    throw Object.assign(new Error('This action requires the administration workflow.'), {
      status: 403,
      code: 'administration_required'
    });
  }
}

// The visibility a workflow itself contributes to a link's derived
// visibility (Slice 2 `createLink` step 5), independent of either
// endpoint's own visibility. Every current workflow contributes only
// `operator` — no workflow can yet assert `teaching_protected` (see
// `createAccessContext` above) — so this is `operator` today for all six
// known workflows. Defined as its own function, rather than inlining
// `'operator'` at each call site, so Slice 8's College approval gate has
// one place to change when a teaching-scoped workflow starts contributing
// `teaching_protected`.
export function deriveWorkflowVisibility(accessContext) {
  if (!accessContext || !KNOWN_WORKFLOWS.has(accessContext.workflow)) {
    throw Object.assign(new Error('Cannot derive workflow visibility without a known workflow.'), {
      status: 400,
      code: 'invalid_workflow'
    });
  }
  return 'operator';
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
