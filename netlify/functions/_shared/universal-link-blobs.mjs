import { isIndexKey, listBlobKeys, mapBounded } from './blobs-list.mjs';
import { hashEntityRef } from './entity-ref.mjs';
import { isValidLinkId, isValidOperationId } from './universal-link-schema.mjs';

// Storage adapter for the shared Universal Links / Person / Organisation
// store. This is a brand new store with no pre-fold legacy Netlify site —
// unlike `tasks-blobs.mjs` / `teaching-blobs.mjs`, it does not need the
// `*_SITE_ID` env override / cross-site token fallback those carry for
// historical reasons (see Slice 0 repository-map.md). It opens directly on
// the umbrella site.
//
// Slice 1 exported read-only access. Slice 2 adds the write primitives,
// operation-journal key, and membership-record builders the canonical
// write service (`universal-link-repository.mjs`) needs — no handler or
// domain service may call `setJSON` here directly; only
// `universal-link-repository.mjs` writes Universal Link keys.
export const UNIVERSAL_LINK_CONTENT_STORE = 'universal-link-content';

export const LINKS_PREFIX = 'universal-links/links/';

// Membership and link hydration are bounded to this many concurrent Blob
// reads at a time.
const MEMBERSHIP_BATCH_SIZE = 10;

export async function defaultGetUniversalLinkStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(UNIVERSAL_LINK_CONTENT_STORE);
}

// `options` forwards straight to the Netlify Blobs `get` call — in
// particular `{ consistency: 'strong' }`, which the installed
// `@netlify/blobs` version (9.1.2) supports on `get`/`getMetadata`/
// `getWithMetadata` but not on `list` (confirmed against
// `node_modules/@netlify/blobs/dist/main.js`). The write path uses strong
// consistency for every existence check it makes before deciding whether a
// step is already done; ordinary reads (`universal-link-read-repository.mjs`)
// do not need it and keep calling this with no options, same as Slice 1.
export async function getJSON(store, key, options = {}) {
  return store.get(key, { type: 'json', ...options });
}

export async function setJSON(store, key, value) {
  return store.setJSON(key, value);
}

export function personKey(id) {
  return `entities/person/${id}`;
}

export function organisationKey(id) {
  return `entities/organisation/${id}`;
}

function assertValidLinkId(id) {
  if (!isValidLinkId(id)) {
    throw Object.assign(new Error(`Invalid Universal Link id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_link_id'
    });
  }
  return id;
}

function assertValidOperationId(id) {
  if (!isValidOperationId(id)) {
    throw Object.assign(new Error(`Invalid Universal Link operation id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_operation_id'
    });
  }
  return id;
}

// Relationship type keys are plain (not hashed) directory segments, so they
// are validated by character shape alone rather than by a hash-collision
// check. This module deliberately does not import `relationship-registry.mjs`
// — the storage layer stays decoupled from relationship semantics — so this
// is a key-safety pattern check only, matching every registered relationship
// key's actual shape, not a registry lookup.
const RELATIONSHIP_TYPE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function assertValidRelationshipTypeKey(relationshipType) {
  if (typeof relationshipType !== 'string' || !RELATIONSHIP_TYPE_KEY_PATTERN.test(relationshipType)) {
    throw Object.assign(new Error(`Invalid relationship type for storage key: ${JSON.stringify(relationshipType)}`), {
      status: 400,
      code: 'invalid_relationship_type'
    });
  }
  return relationshipType;
}

// Every key builder that concatenates a link id, operation id, or
// relationship type validates it first — a malformed or path-like value
// (e.g. `../../secrets`) must never reach a Blob key, whether it came from
// a caller, a stored record, or a membership record read back from storage.
export function linkKey(id) {
  return `${LINKS_PREFIX}${assertValidLinkId(id)}`;
}

export function bySourcePrefix(sourceRef) {
  return `universal-links/by-source/${hashEntityRef(sourceRef)}/`;
}

export function byTargetPrefix(targetRef) {
  return `universal-links/by-target/${hashEntityRef(targetRef)}/`;
}

export function byTypePrefix(relationshipType) {
  return `universal-links/by-type/${assertValidRelationshipTypeKey(relationshipType)}/`;
}

export function bySourceKey(sourceRef, linkId) {
  return `${bySourcePrefix(sourceRef)}${assertValidLinkId(linkId)}`;
}

export function byTargetKey(targetRef, linkId) {
  return `${byTargetPrefix(targetRef)}${assertValidLinkId(linkId)}`;
}

export function byTypeKey(relationshipType, linkId) {
  return `${byTypePrefix(relationshipType)}${assertValidLinkId(linkId)}`;
}

export function operationKey(operationId) {
  return `universal-links/operations/${assertValidOperationId(operationId)}`;
}

export const UNIVERSAL_LINK_SCHEMA_KEY = 'universal-links/schema';

export const MEMBERSHIP_SCHEMA_VERSION = 1;

// Source/target membership records: exactly `link_id`, `canonical_ref`,
// `created_at`, `schema_version` — no endpoint label or other domain data
// (implementation programme, "Storage layout").
export function buildEndpointMembershipRecord({ linkId, canonicalRef, createdAt }) {
  return Object.freeze({
    schema_version: MEMBERSHIP_SCHEMA_VERSION,
    link_id: assertValidLinkId(linkId),
    canonical_ref: canonicalRef,
    created_at: createdAt
  });
}

// A distinct, even more minimal record for `by-type` membership: no
// `canonical_ref` (there is no entity endpoint here, just the relationship
// type grouping) and no endpoint label or copied domain data.
export function buildTypeMembershipRecord({ linkId, relationshipType, createdAt }) {
  return Object.freeze({
    schema_version: MEMBERSHIP_SCHEMA_VERSION,
    link_id: assertValidLinkId(linkId),
    relationship_type: assertValidRelationshipTypeKey(relationshipType),
    created_at: createdAt
  });
}

// Authoritative link keys, for administrative rebuild only (implementation
// programme: "Full link scans are permitted only for authenticated
// administrative rebuild and migration operations"). Never call this from
// an ordinary read path.
export async function listAuthoritativeLinkKeys(store) {
  return (await listBlobKeys(store, LINKS_PREFIX)).filter(key => !isIndexKey(key));
}

function isPlausibleMembershipRecord(record, canonicalRef) {
  return Boolean(
    record &&
    typeof record === 'object' &&
    isValidLinkId(record.link_id) &&
    record.canonical_ref === canonicalRef
  );
}

// Reads every membership record under a prefix, verifying the retained
// canonical ref against the hash-derived prefix (protects against a hash
// collision silently returning the wrong link), rejecting any record whose
// link_id is not the canonical `ul_<64 hex>` form, and de-duplicating by
// link_id. One membership Blob per link (never a shared array) so
// concurrent writers cannot clobber each other's index additions — a
// deliberate deviation from the `tasks-blobs.mjs` `_index` array pattern.
// Reads are bounded to MEMBERSHIP_BATCH_SIZE concurrent Blob GETs.
export async function listMembership(store, prefix, canonicalRef) {
  const keys = (await listBlobKeys(store, prefix)).filter(key => !isIndexKey(key));
  const records = await mapBounded(keys, MEMBERSHIP_BATCH_SIZE, key => getJSON(store, key));
  const seen = new Set();
  const out = [];
  for (const record of records) {
    if (!isPlausibleMembershipRecord(record, canonicalRef)) continue;
    if (seen.has(record.link_id)) continue;
    seen.add(record.link_id);
    out.push(record);
  }
  return out;
}
