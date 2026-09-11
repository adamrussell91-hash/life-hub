import { parseEntityRef, formatEntityRef } from './entity-ref.mjs';
import { endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import {
  personKey,
  organisationKey,
  getJSON as getUniversalLinkJSON,
  defaultGetUniversalLinkStore
} from './universal-link-blobs.mjs';
import { taskKey, getJSON as getTasksJSON, defaultGetTasksStore } from './tasks-blobs.mjs';

// Entity resolvers verify a record exists and is accessible, then return a
// safe display projection. This is the only shape a resolver may return —
// never the raw stored record (implementation programme, "Entity
// resolvers"). Communication's own store/schema land in Slice 5; this
// resolver's read shape may need to adjust once that record shape exists,
// but the interface contract (ref -> safe projection or 404) is fixed now.

const RESOLVABLE_LIFECYCLE = new Set(['active', 'inactive']);
const PROFESSIONAL_CONTENT_STORE = 'professional-hub-content';

async function defaultGetProfessionalStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(PROFESSIONAL_CONTENT_STORE);
}

// Deleted identities never resolve here, with or without `includeArchived`
// (deleted endpoints never expose former labels). Archived identities
// resolve only when the caller explicitly opts in — deliberate overview
// and archive workflows, not ordinary suggestions. Retained/deidentified
// states are out of scope until the lifecycle service (later slice) makes
// them reachable at all.
function projectIdentity(record, { ref, includeArchived }) {
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const status = record.lifecycle_status;
  if (status === 'archived') {
    if (!includeArchived) throw endpointNotFoundError();
  } else if (!RESOLVABLE_LIFECYCLE.has(status)) {
    throw endpointNotFoundError();
  }
  return {
    ref,
    kind: parseEntityRef(ref)?.kind ?? null,
    display_label: typeof record.display_name === 'string' ? record.display_name : '',
    supporting_label: null,
    href: null,
    lifecycle_status: status,
    visibility: 'operator'
  };
}

export async function resolvePerson(id, accessContext, { getStore = defaultGetUniversalLinkStore, includeArchived = false } = {}) {
  const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });
  if (!ref) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getUniversalLinkJSON(store, personKey(id));
  return projectIdentity(record, { ref, includeArchived });
}

export async function resolveOrganisation(id, accessContext, { getStore = defaultGetUniversalLinkStore, includeArchived = false } = {}) {
  const ref = formatEntityRef({ namespace: 'shared', kind: 'organisation', id });
  if (!ref) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getUniversalLinkJSON(store, organisationKey(id));
  return projectIdentity(record, { ref, includeArchived });
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

export async function resolveCommunication(id, accessContext, { getStore = defaultGetProfessionalStore } = {}) {
  const ref = formatEntityRef({ namespace: 'professional', kind: 'communication', id });
  if (!ref) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await store.get(`communications/${id}`, { type: 'json' });
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  return {
    ref,
    kind: 'communication',
    display_label: typeof record.subject === 'string' && record.subject ? record.subject : 'Communication',
    supporting_label: typeof record.channel === 'string' ? record.channel : null,
    href: null,
    lifecycle_status: 'active',
    visibility: 'operator'
  };
}

const RESOLVERS = {
  'shared:person': resolvePerson,
  'shared:organisation': resolveOrganisation,
  'tasks:task': resolveTask,
  'professional:communication': resolveCommunication
};

// Single entry point used by the read-only Universal Link repository.
// Unknown or unregistered namespace:kind pairs behave exactly like a
// missing record — no resolver means no way to ever expose that kind
// through generic Universal Link reads (this is how StudentReference
// stays absent from general resolution without special-casing it here).
export async function resolveEntity(refInput, accessContext, options = {}) {
  const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
  if (!ref) throw endpointNotFoundError();
  const resolver = RESOLVERS[`${ref.namespace}:${ref.kind}`];
  if (!resolver) throw endpointNotFoundError();
  return resolver(ref.id, accessContext, options);
}
