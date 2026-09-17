import { createAccessContext } from './entity-access.mjs';
import { mapBounded } from './blobs-list.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { parsePersonRecord } from './identity-schema.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  PERSON_PREFIX,
  getJSON,
  listAuthoritativePersonKeys,
  personKey
} from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';

// The single expensive full-population scan every People Home (Phase 2)
// aggregation function consumes — `people-home-signals.mjs` and
// `people-cohorts.mjs` both take this module's output as their sole input
// rather than re-scanning Person records or Universal Links themselves.
//
// Uses `listAuthoritativePersonKeys` (never the derived search index —
// see universal-link-blobs.mjs) because a data-completeness-sensitive
// dashboard must never silently drop a Person whose index write failed.

const PEOPLE_BATCH_SIZE = 10;

function personIdFromKey(key) {
  return key.startsWith(PERSON_PREFIX) ? key.slice(PERSON_PREFIX.length) : null;
}

/**
 * Loads every Person record, each paired with its full current + historical
 * relationship set (every Universal Link where the person is source or
 * target, of any relationship type — not just `professional_relationship`),
 * each entry carrying its resolved counterpart endpoint.
 *
 * Reuses `createUniversalLinkRepository(...).listForEntity(ref, ctx, {
 * includeArchived: true })` per person — the exact same read path
 * `entity-overview.mjs`'s `assembleEntityOverview` already uses for one
 * person's own overview (merging `outgoing`/`incoming`, tagging each with
 * `direction`) — rather than reimplementing membership-prefix listing,
 * status filtering, or endpoint resolution/authorisation a second time
 * slightly differently. `includeArchived: true` matches
 * `assembleEntityOverview`'s own choice: an archived Person's relationship
 * history must stay visible to this deliberate, admin-facing aggregation
 * even though ordinary Universal Link reads hide it.
 *
 * Returns `[{ person, relationships }]` where `person` is the hydrated
 * Person record plus its own canonical `ref`, and `relationships` is the
 * merged `[{ link, endpoint, direction }]` array (never deduped across
 * people — the same link between two people appears once under each of
 * them; callers that need a single global count/list dedupe by
 * `link.id` themselves, since different callers want different dedup
 * granularity — e.g. Signals needs it per relationship type, Cohorts needs
 * it per organisation).
 */
export async function loadAllPeopleWithRelationships({ store, now, resolveEntity, createRepository } = {}) {
  if (!store) {
    throw new Error('loadAllPeopleWithRelationships requires a store.');
  }
  const resolve = resolveEntity ?? defaultResolveEntity;
  const buildRepository = createRepository ?? createUniversalLinkRepository;
  const repo = buildRepository({ store, resolveEntity: resolve });
  const accessContext = createAccessContext({ workflow: 'life' });

  const personKeys = await listAuthoritativePersonKeys(store);
  const ids = [...new Set(personKeys.map(personIdFromKey).filter(Boolean))];

  const results = await mapBounded(ids, PEOPLE_BATCH_SIZE, async (id) => {
    const record = parsePersonRecord(await getJSON(store, personKey(id)));
    if (!record) return null;
    const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });

    const { outgoing, incoming } = await repo.listForEntity(ref, accessContext, { includeArchived: true });
    const relationships = [
      ...outgoing.map((entry) => ({ ...entry, direction: 'outgoing' })),
      ...incoming.map((entry) => ({ ...entry, direction: 'incoming' }))
    ];

    return { person: { ...record, ref }, relationships };
  });

  return results.filter(Boolean);
}
