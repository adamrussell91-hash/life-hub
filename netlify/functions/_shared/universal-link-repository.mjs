import { formatEntityRef } from './entity-ref.mjs';
import { isVisibilityAllowed, endpointNotFoundError } from './entity-access.mjs';
import { resolveEntity } from './entity-resolvers.mjs';
import {
  linkKey,
  bySourcePrefix,
  byTargetPrefix,
  getJSON,
  defaultGetUniversalLinkStore,
  listMembership
} from './universal-link-blobs.mjs';
import { isValidLinkRecordShape } from './universal-link-schema.mjs';

// Read-only half of the canonical Universal Link repository (Slice 1).
// Slice 2 adds createLink/endLink/suppressLink/deleteLink/repairOperation/
// rebuildIndexes to this same module — no handler or domain service may
// write Universal Link keys directly, including in later slices.

// Ordinary reads exclude suppressed and deleted links. `ended` stays
// visible — it is queryable history, not a hidden state.
const ORDINARY_LIST_STATUSES = new Set(['current', 'ended']);

function refString(refInput) {
  return typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
}

async function loadLinkRecord(store, linkId) {
  const record = await getJSON(store, linkKey(linkId));
  if (!record || !isValidLinkRecordShape(record)) return null;
  return record;
}

// Resolves the *other* endpoint of a link and drops the link entirely if
// that endpoint is missing or inaccessible. Indexed lookups must apply
// authorisation before returning results rather than filtering protected
// records only in the interface (implementation programme, "Authorisation
// and visibility").
async function toAccessibleEntry(record, otherRef, accessContext, resolverOptions) {
  if (!isVisibilityAllowed(accessContext, record.visibility)) return null;
  try {
    const endpoint = await resolveEntity(otherRef, accessContext, resolverOptions);
    return { link: record, endpoint };
  } catch (error) {
    if (error?.code === 'endpoint_not_found') return null;
    throw error;
  }
}

export async function getLink(id, accessContext, { getStore = defaultGetUniversalLinkStore } = {}) {
  const store = await getStore();
  const record = await loadLinkRecord(store, id);
  if (!record) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, record.visibility)) throw endpointNotFoundError();
  return record;
}

export async function listOutgoing(
  sourceRefInput,
  accessContext,
  { getStore = defaultGetUniversalLinkStore, resolverOptions = {} } = {}
) {
  const sourceRef = refString(sourceRefInput);
  if (!sourceRef) return [];
  const store = await getStore();
  const membership = await listMembership(store, bySourcePrefix(sourceRef), sourceRef);
  const results = [];
  for (const entry of membership) {
    const record = await loadLinkRecord(store, entry.link_id);
    if (!record || record.source_ref !== sourceRef) continue;
    if (!ORDINARY_LIST_STATUSES.has(record.status)) continue;
    const accessible = await toAccessibleEntry(record, record.target_ref, accessContext, resolverOptions);
    if (accessible) results.push(accessible);
  }
  return results;
}

export async function listIncoming(
  targetRefInput,
  accessContext,
  { getStore = defaultGetUniversalLinkStore, resolverOptions = {} } = {}
) {
  const targetRef = refString(targetRefInput);
  if (!targetRef) return [];
  const store = await getStore();
  const membership = await listMembership(store, byTargetPrefix(targetRef), targetRef);
  const results = [];
  for (const entry of membership) {
    const record = await loadLinkRecord(store, entry.link_id);
    if (!record || record.target_ref !== targetRef) continue;
    if (!ORDINARY_LIST_STATUSES.has(record.status)) continue;
    const accessible = await toAccessibleEntry(record, record.source_ref, accessContext, resolverOptions);
    if (accessible) results.push(accessible);
  }
  return results;
}

export async function listForEntity(refInput, accessContext, options = {}) {
  const [outgoing, incoming] = await Promise.all([
    listOutgoing(refInput, accessContext, options),
    listIncoming(refInput, accessContext, options)
  ]);
  return { outgoing, incoming };
}
