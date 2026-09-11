import { parseEntityRef, formatEntityRef } from './entity-ref.mjs';
import { assertEntityKindAllowed, endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import { taskKey, getJSON as getTasksJSON, defaultGetTasksStore } from './tasks-blobs.mjs';

// Entity resolvers verify a record exists and is accessible, then return a
// safe display projection: { ref, kind, display_label, supporting_label,
// href, lifecycle_status, visibility }. This is the only shape a resolver
// may return — never the raw stored record.
//
// In Slice 1, only Task resolves for real, against the existing
// `tasks-hub-content` adapter. Person, Organisation, and Communication have
// no store yet — this slice defines their resolver *slots* so the registry
// and dispatch shape are already correct, but each slot throws a distinctly
// named `resolver_unavailable` error rather than reading from a store that
// does not exist. Do not create empty identity stores to make them resolve
// early.

export function resolverUnavailableError(kind) {
  return Object.assign(new Error(`Resolution for kind "${kind}" is not available until its owning slice.`), {
    status: 501,
    code: 'resolver_unavailable',
    kind
  });
}

export async function resolveTask(id, accessContext, { getStore = defaultGetTasksStore } = {}) {
  const ref = formatEntityRef({ namespace: 'tasks', kind: 'task', id });
  if (!ref) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTasksJSON(store, taskKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  return {
    ref,
    kind: 'task',
    display_label: typeof record.title === 'string' ? record.title : '',
    supporting_label: typeof record.status === 'string' ? record.status : null,
    href: null,
    lifecycle_status: typeof record.status === 'string' ? record.status : null,
    visibility: 'operator'
  };
}

async function resolvePersonSlot() {
  throw resolverUnavailableError('person');
}

async function resolveOrganisationSlot() {
  throw resolverUnavailableError('organisation');
}

async function resolveCommunicationSlot() {
  throw resolverUnavailableError('communication');
}

// Exported so a future slice's tests (and this slice's own) can assert
// each slot's kind without depending on dispatch internals.
export const RESOLVER_SLOTS = Object.freeze({
  'shared:person': resolvePersonSlot,
  'shared:organisation': resolveOrganisationSlot,
  'tasks:task': resolveTask,
  'professional:communication': resolveCommunicationSlot
});

// Single entry point used by the read-only Universal Link repository.
// Enforces `allowed_entity_kinds` once, here, rather than duplicating the
// check in every resolver. Unknown or unregistered namespace:kind pairs —
// and kinds no resolver is registered for at all — behave exactly like a
// missing record, never a distinct error shape.
export async function resolveEntity(refInput, accessContext, options = {}) {
  const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
  if (!ref) throw endpointNotFoundError();
  assertEntityKindAllowed(accessContext, ref.kind);
  const resolver = RESOLVER_SLOTS[`${ref.namespace}:${ref.kind}`];
  if (!resolver) throw endpointNotFoundError();
  return resolver(ref.id, accessContext, options);
}
