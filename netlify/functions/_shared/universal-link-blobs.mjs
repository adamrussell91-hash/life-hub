import { listBlobKeys, isIndexKey } from './blobs-list.mjs';
import { hashEntityRef } from './entity-ref.mjs';

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

export function linkKey(id) {
  return `universal-links/links/${id}`;
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
  return `${bySourcePrefix(sourceRef)}${linkId}`;
}

export function byTargetKey(targetRef, linkId) {
  return `${byTargetPrefix(targetRef)}${linkId}`;
}

export function byTypeKey(relationshipType, linkId) {
  return `${byTypePrefix(relationshipType)}${linkId}`;
}

function isPlausibleMembershipRecord(record, canonicalRef) {
  return Boolean(
    record &&
    typeof record === 'object' &&
    typeof record.link_id === 'string' &&
    record.link_id &&
    record.canonical_ref === canonicalRef
  );
}

// Reads every membership record under a prefix, verifying the retained
// canonical ref against the hash-derived prefix (protects against a hash
// collision silently returning the wrong link) and de-duplicating by
// link_id. One membership Blob per link (never a shared array) so
// concurrent writers cannot clobber each other's index additions — a
// deliberate deviation from the `tasks-blobs.mjs` `_index` array pattern.
export async function listMembership(store, prefix, canonicalRef) {
  const keys = (await listBlobKeys(store, prefix)).filter(key => !isIndexKey(key));
  const records = await Promise.all(keys.map(key => getJSON(store, key)));
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
