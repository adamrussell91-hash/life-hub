// Server-derived access context for Universal Links reads. The current
// application has one authenticated operator (implementation programme,
// "Authorisation model") — this makes workflow scope explicit without
// pretending to be a multi-tenant ACL system.

const KNOWN_WORKFLOWS = new Set(['professional', 'tasks', 'teaching', 'knowledge', 'life', 'administration']);
const KNOWN_VISIBILITIES = new Set(['operator', 'teaching_protected']);

// Build AccessContext on the server from the handler/route/verified
// session only. Never accept `actor`, `workflow`, or `allowed_visibility`
// from request JSON — a caller-supplied workflow would let a client widen
// its own access.
export function createAccessContext({ workflow, allowedEntityKinds = [] } = {}) {
  if (!KNOWN_WORKFLOWS.has(workflow)) {
    throw Object.assign(new Error(`Unknown workflow: ${workflow}`), { status: 400, code: 'invalid_workflow' });
  }
  const allowedVisibility = workflow === 'teaching' || workflow === 'administration'
    ? ['operator', 'teaching_protected']
    : ['operator'];
  return Object.freeze({
    actor: 'operator',
    workflow,
    allowed_visibility: Object.freeze(allowedVisibility),
    allowed_entity_kinds: Object.freeze([...allowedEntityKinds])
  });
}

export function isVisibilityAllowed(accessContext, visibility) {
  if (!accessContext || !KNOWN_VISIBILITIES.has(visibility)) return false;
  return accessContext.allowed_visibility.includes(visibility);
}

// Empty `allowed_entity_kinds` means "no kind restriction from this field"
// — kind-level exclusion (e.g. StudentReference having no general
// resolver at all) is enforced by which resolvers exist, not by this list.
export function isEntityKindAllowed(accessContext, kind) {
  if (!accessContext) return false;
  if (!accessContext.allowed_entity_kinds.length) return true;
  return accessContext.allowed_entity_kinds.includes(kind);
}

// A hidden target must behave as absent (implementation programme,
// "Authorisation and visibility"). Every resolver and read path throws
// this exact shape — never a distinct "forbidden" error — so a caller
// cannot distinguish "does not exist" from "exists but you can't see it."
export function endpointNotFoundError() {
  return Object.assign(new Error('Endpoint not found.'), { status: 404, code: 'endpoint_not_found' });
}
