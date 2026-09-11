import { isIndexKey, listBlobKeys, mapBounded } from './blobs-list.mjs';
import { hashEntityRef } from './entity-ref.mjs';
import { isValidLinkId } from './universal-link-schema.mjs';

// Read-only storage adapter for the shared Universal Links / Person /
// Organisation store. This is a brand new store with no pre-fold legacy
// Netlify site — unlike `tasks-blobs.mjs` / `teaching-blobs.mjs`, it does
// not need the `*_SITE_ID` env override / cross-site token fallback those
// carry for historical reasons (see Slice 0 repository-map.md). It opens
// directly on the umbrella site.
//
// This slice exports no write capability at all: no `setJSON`, no
// `deleteKey`, no membership-record builder, no operation-journal key.
// Slice 2 adds the canonical write service on top of these same key
// builders.
export const UNIVERSAL_LINK_CONTENT_STORE = 'universal-link-content';

// Membership and link hydration are bounded to this many concurrent Blob
// reads at a time.
const MEMBERSHIP_BATCH_SIZE = 10;

export async function defaultGetUniversalLinkStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(UNIVERSAL_LINK_CONTENT_STORE);
}

export async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
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

// Every key builder that concatenates a link id validates it first — a
// malformed or path-like id (e.g. `../../secrets`) must never reach a Blob
// key, whether it came from a caller, a stored record, or a membership
// record read back from storage.
export function linkKey(id) {
  return `universal-links/links/${assertValidLinkId(id)}`;
}

export function bySourcePrefix(sourceRef) {
  return `universal-links/by-source/${hashEntityRef(sourceRef)}/`;
}

export function byTargetPrefix(targetRef) {
  return `universal-links/by-target/${hashEntityRef(targetRef)}/`;
}

export function byTypePrefix(relationshipType) {
  return `universal-links/by-type/${relationshipType}/`;
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
