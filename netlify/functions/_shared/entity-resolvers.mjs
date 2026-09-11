import { parseEntityRef, formatEntityRef } from './entity-ref.mjs';
import { assertEntityKindAllowed, endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import { taskKey, getJSON as getTasksJSON, defaultGetTasksStore } from './tasks-blobs.mjs';
import { displayLabelFor, isValidOrganisationId, isValidPersonId, parseOrganisationRecord, parsePersonRecord } from './identity-schema.mjs';
import { defaultGetUniversalLinkStore, getJSON as getIdentityJSON, organisationKey, personKey } from './universal-link-blobs.mjs';

// Entity resolvers verify a record exists and is accessible, then return a
// safe display projection: { ref, kind, display_label, supporting_label,
// href, lifecycle_status, visibility }. This is the only shape a resolver
// may return — never the raw stored record.
//
// In Slice 1, only Task resolved for real, against the existing
// `tasks-hub-content` adapter; Person, Organisation, and Communication had
// no store yet and threw a distinctly named `resolver_unavailable` error.
// Slice 3 supplies the Person and Organisation stores (`identity-schema.mjs`
// + `universal-link-blobs.mjs`'s `personKey`/`organisationKey`), so those two
// slots now resolve for real. Communication remains unavailable until its
// owning slice (5) creates `professional-hub-content`.

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

// Resolution rules (implementation programme, "Entity resolvers"):
// 1. A missing endpoint produces 404 endpoint_not_found.
// 2. An inaccessible endpoint behaves as absent and also 404s.
// 3. Deleted (and deidentified) endpoints never expose former labels —
//    `displayLabelFor` returns the fixed tombstone label instead.
// 4. Archived entities resolve only for deliberate overview and archive
//    workflows — ordinary resolution (Universal Link create/read) never
//    passes `includeArchived`, so an archived Person/Organisation is
//    absent everywhere except entity-overview.mjs and entity-search.mjs's
//    deliberate archive-search mode, which pass `includeArchived: true`
//    explicitly.
//
// An id that does not even match the expected `person_<uuid>` /
// `organisation_<uuid>` shape is treated as "missing," not as a 400 —
// resolution never discloses whether a malformed id would otherwise exist.
export async function resolvePerson(id, accessContext, { getStore = defaultGetUniversalLinkStore, includeArchived = false } = {}) {
  if (!isValidPersonId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parsePersonRecord(await getIdentityJSON(store, personKey(id)));
  if (!record) throw endpointNotFoundError();
  if (record.lifecycle_status === 'archived' && !includeArchived) throw endpointNotFoundError();
  return {
    ref,
    kind: 'person',
    display_label: displayLabelFor(record),
    supporting_label: record.is_self ? 'self' : null,
    href: null,
    lifecycle_status: record.lifecycle_status,
    visibility: 'operator'
  };
}

export async function resolveOrganisation(id, accessContext, { getStore = defaultGetUniversalLinkStore, includeArchived = false } = {}) {
  if (!isValidOrganisationId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'shared', kind: 'organisation', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parseOrganisationRecord(await getIdentityJSON(store, organisationKey(id)));
  if (!record) throw endpointNotFoundError();
  if (record.lifecycle_status === 'archived' && !includeArchived) throw endpointNotFoundError();
  return {
    ref,
    kind: 'organisation',
    display_label: displayLabelFor(record),
    supporting_label: null,
    href: null,
    lifecycle_status: record.lifecycle_status,
    visibility: 'operator'
  };
}

async function resolveCommunicationSlot() {
  throw resolverUnavailableError('communication');
}

// Exported so a future slice's tests (and this slice's own) can assert
// each slot's kind without depending on dispatch internals.
export const RESOLVER_SLOTS = Object.freeze({
  'shared:person': resolvePerson,
  'shared:organisation': resolveOrganisation,
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
