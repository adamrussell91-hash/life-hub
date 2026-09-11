import { assertRegisteredEntityRef, formatEntityRef } from './entity-ref.mjs';
import { endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import { validateUniversalLinkRecord } from './universal-link-schema.mjs';
import { bySourcePrefix, byTargetPrefix, getJSON, linkKey, listMembership } from './universal-link-blobs.mjs';

// Read-only half of the canonical Universal Link repository (Slice 1).
// Slice 2 adds createLink/endLink/suppressLink/deleteLink/repairOperation/
// rebuildIndexes to `universal-link-repository.mjs` — no handler or domain
// service may write Universal Link keys directly, including in later
// slices.
//
// `resolveEntity` is injected rather than imported, so this module's own
// logic (batching, sorting, membership validation, endpoint authorisation
// ordering) can be tested against synthetic resolvers, independent of
// which concrete entity kinds a production caller has wired in. In Slice 1
// the real `entity-resolvers.mjs` resolves Task only — Person, Organisation
// and Communication remain unavailable until their owning slices, so no
// production caller exists yet that could wire this repository up
// end-to-end. That is expected, not a gap in this slice.

const BATCH_SIZE = 10;

async function mapBounded(items, size, fn) {
  const out = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
  }
  return out;
}

function sortLinks(entries) {
  return [...entries].sort((a, b) => {
    const byUpdatedAt = String(b.link.updated_at ?? '').localeCompare(String(a.link.updated_at ?? ''));
    if (byUpdatedAt !== 0) return byUpdatedAt;
    return String(a.link.id ?? '').localeCompare(String(b.link.id ?? ''));
  });
}

export function createUniversalLinkReadRepository({ store, resolveEntity }) {
  if (!store) {
    throw new Error('createUniversalLinkReadRepository requires a store.');
  }
  if (typeof resolveEntity !== 'function') {
    throw new Error('createUniversalLinkReadRepository requires a resolveEntity function.');
  }

  // Loads one link by id and validates it against both the structural
  // schema and its current registry declaration (implementation
  // programme, "Validate each link against the schema and registry").
  // Returns null for anything malformed or invalid rather than throwing —
  // a corrupted record must not break reads of everything else.
  async function loadValidLink(linkId) {
    const raw = await getJSON(store, linkKey(linkId));
    try {
      return validateUniversalLinkRecord(raw);
    } catch {
      return null;
    }
  }

  // Applies link visibility, then resolves and authorises the *other*
  // endpoint. Returns null — never a labeled placeholder — when either
  // check fails, so a hidden or missing endpoint is indistinguishable from
  // one that never existed.
  async function toAccessibleEntry(record, otherRef, accessContext) {
    if (!isVisibilityAllowed(accessContext, record.visibility)) return null;
    try {
      const endpoint = await resolveEntity(otherRef, accessContext);
      return { link: record, endpoint };
    } catch {
      return null;
    }
  }

  async function listByPrefix({ requestedRefInput, prefixFor, matchField, otherField, accessContext }) {
    // 1. Parse and validate the requested EntityRef before any hashing or
    // lookup — a malformed query is a caller error (400), not a 404.
    const requestedRef = assertRegisteredEntityRef(requestedRefInput);
    const canonicalRef = formatEntityRef(requestedRef);

    // Authorise the requested endpoint itself before membership lookup.
    // A requested ref that cannot be resolved (missing, hidden, or an
    // unavailable resolver slot) yields an empty list — identical to a
    // valid, visible ref with zero memberships — rather than a 404 that
    // would confirm something about its existence.
    try {
      await resolveEntity(canonicalRef, accessContext);
    } catch {
      return [];
    }

    const prefix = prefixFor(canonicalRef);
    const membership = await listMembership(store, prefix, canonicalRef);
    const seen = new Set();

    const hydrated = await mapBounded(membership, BATCH_SIZE, async entry => {
      if (seen.has(entry.link_id)) return null;
      seen.add(entry.link_id);
      const record = await loadValidLink(entry.link_id);
      if (!record || record[matchField] !== canonicalRef) return null;
      return toAccessibleEntry(record, record[otherField], accessContext);
    });

    return sortLinks(hydrated.filter(Boolean));
  }

  return {
    async getLink(id, accessContext) {
      const record = await loadValidLink(id);
      if (!record) throw endpointNotFoundError();
      if (!isVisibilityAllowed(accessContext, record.visibility)) throw endpointNotFoundError();
      // getLink must resolve and authorise both endpoints, not just
      // return their refs.
      try {
        await resolveEntity(record.source_ref, accessContext);
        await resolveEntity(record.target_ref, accessContext);
      } catch {
        throw endpointNotFoundError();
      }
      return record;
    },

    async listOutgoing(sourceRefInput, accessContext) {
      return listByPrefix({
        requestedRefInput: sourceRefInput,
        prefixFor: bySourcePrefix,
        matchField: 'source_ref',
        otherField: 'target_ref',
        accessContext
      });
    },

    async listIncoming(targetRefInput, accessContext) {
      return listByPrefix({
        requestedRefInput: targetRefInput,
        prefixFor: byTargetPrefix,
        matchField: 'target_ref',
        otherField: 'source_ref',
        accessContext
      });
    },

    async listForEntity(refInput, accessContext) {
      const [outgoing, incoming] = await Promise.all([
        this.listOutgoing(refInput, accessContext),
        this.listIncoming(refInput, accessContext)
      ]);
      return { outgoing, incoming };
    }
  };
}
