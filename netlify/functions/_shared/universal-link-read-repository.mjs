import { mapBounded } from './blobs-list.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './entity-ref.mjs';
import { endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import { ORDINARY_READ_STATUSES, isValidLinkId, validateUniversalLinkRecord } from './universal-link-schema.mjs';
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

function isEndpointNotFound(error) {
  return Boolean(error) && error.code === 'endpoint_not_found';
}

function sortLinks(entries) {
  return [...entries].sort((a, b) => {
    const byUpdatedAt = String(b.link.updated_at ?? '').localeCompare(String(a.link.updated_at ?? ''));
    if (byUpdatedAt !== 0) return byUpdatedAt;
    return String(a.link.id ?? '').localeCompare(String(b.link.id ?? ''));
  });
}

function assertValidGetLinkId(id) {
  if (!isValidLinkId(id)) {
    throw Object.assign(new Error(`Invalid Universal Link id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_link_id'
    });
  }
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
  // a corrupted record must not break reads of everything else. Does NOT
  // filter by status — callers decide what statuses are disclosable.
  async function loadValidLink(linkId) {
    assertValidGetLinkId(linkId);
    const raw = await getJSON(store, linkKey(linkId));
    try {
      return validateUniversalLinkRecord(raw);
    } catch {
      return null;
    }
  }

  // Applies link visibility, then resolves and authorises the *other*
  // endpoint. Returns null — never a labeled placeholder — only when the
  // endpoint is genuinely absent to this caller (endpoint_not_found).
  // Every other error (an unimplemented resolver, a storage failure, an
  // unexpected exception) propagates: those are infrastructure faults, not
  // "this entity is hidden," and must stay visible and retryable rather
  // than being silently swallowed into a misleadingly-empty result.
  async function toAccessibleEntry(record, otherRef, accessContext) {
    if (!isVisibilityAllowed(accessContext, record.visibility)) return null;
    try {
      const endpoint = await resolveEntity(otherRef, accessContext);
      return { link: record, endpoint };
    } catch (error) {
      if (isEndpointNotFound(error)) return null;
      throw error;
    }
  }

  async function listByPrefix({ requestedRefInput, prefixFor, matchField, otherField, accessContext }) {
    // 1. Parse and validate the requested EntityRef before any hashing or
    // lookup — a malformed query is a caller error (400), not a 404.
    const requestedRef = assertRegisteredEntityRef(requestedRefInput);
    const canonicalRef = formatEntityRef(requestedRef);

    // Authorise the requested endpoint itself before membership lookup. A
    // requested ref this caller cannot see (endpoint_not_found) yields an
    // empty list — identical to a valid, visible ref with zero
    // memberships — rather than a 404 that would confirm something about
    // its existence. Any other failure (resolver_unavailable, a storage
    // fault) propagates rather than being reinterpreted as "no results."
    try {
      await resolveEntity(canonicalRef, accessContext);
    } catch (error) {
      if (isEndpointNotFound(error)) return [];
      throw error;
    }

    const prefix = prefixFor(canonicalRef);
    const membership = await listMembership(store, prefix, canonicalRef);
    const seen = new Set();

    const hydrated = await mapBounded(membership, BATCH_SIZE, async entry => {
      if (seen.has(entry.link_id)) return null;
      seen.add(entry.link_id);
      const record = await loadValidLink(entry.link_id);
      if (!record || record[matchField] !== canonicalRef) return null;
      if (!ORDINARY_READ_STATUSES.has(record.status)) return null;
      return toAccessibleEntry(record, record[otherField], accessContext);
    });

    return sortLinks(hydrated.filter(Boolean));
  }

  return {
    async getLink(id, accessContext) {
      const record = await loadValidLink(id);
      if (!record) throw endpointNotFoundError();
      // A suppressed or deleted link is not disclosed through this
      // ordinary read method — the same non-disclosure rule as list reads
      // — until an explicit administrative method exists.
      if (!ORDINARY_READ_STATUSES.has(record.status)) throw endpointNotFoundError();
      if (!isVisibilityAllowed(accessContext, record.visibility)) throw endpointNotFoundError();
      // getLink must resolve and authorise both endpoints, not just
      // return their refs. Only endpoint_not_found is non-disclosure;
      // anything else propagates.
      try {
        await resolveEntity(record.source_ref, accessContext);
        await resolveEntity(record.target_ref, accessContext);
      } catch (error) {
        if (isEndpointNotFound(error)) throw endpointNotFoundError();
        throw error;
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
