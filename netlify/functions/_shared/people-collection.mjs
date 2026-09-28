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
import {
  isImportedStudentPerson,
  listGithubImportedStudentPeople,
  listGithubPersonCandidates,
  listGithubRelationshipEntries
} from './github-professional-data.mjs';
import { dedupeIdentityRows, identityNameKey } from './identity-display-name.mjs';

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


function personIdFromRef(ref) {
  if (typeof ref !== 'string') return null;
  const parts = ref.split(':');
  return parts.length === 3 && parts[0] === 'shared' && parts[1] === 'person' ? parts[2] : null;
}

/** Drop Communications students and Blob name-twins of GitHub students. */
function isNetworkExcludedPerson(person, studentIds, studentNameKeys) {
  if (!person) return true;
  if (isImportedStudentPerson(person) || studentIds.has(person.id)) return true;
  const key = identityNameKey(person.display_name);
  return Boolean(key && studentNameKeys.has(key));
}

function withoutStudentPersonEndpoints(relationships, studentIds) {
  return (relationships ?? []).filter((entry) => {
    if (entry?.endpoint?.kind !== 'person') return true;
    const id = personIdFromRef(entry.endpoint.ref);
    return !id || !studentIds.has(id);
  });
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
 *
 * Also merges the GitHub-canonical Professional import (Notion People +
 * workspace owner). Communications-database students are excluded by
 * `listGithubPersonCandidates`, and Blob name-twins of those students are
 * dropped before identity dedupe so they never appear on People / Ecology
 * network surfaces. Search and Person pages already fall back to that
 * import; People Home / cohorts / network ecology previously scanned Blobs
 * only and therefore could not see anyone imported, or who the operator
 * is. Same derived id → Blob record wins. Same human under different ids
 * (Blob UUID vs `derivePersonId(legacy_id)`) → identity-name dedupe keeps
 * the richer twin (usually GitHub, which carries `employee_at`). A missing
 * or unbound GitHub token degrades to the Blob-only set, same as
 * entity-search.mjs.
 *
 * Blobs `listForEntity` runs only for identity-dedupe survivors. GitHub
 * rows are hydrated first (in-memory after one Contents/blob fetch) so
 * `preferIdentityTwin` still sees their relationship counts; discarded
 * Blob twins never pay the membership scan. That N× scan was hanging
 * Network Ecology when hundreds of relationship-empty Blob copies sat
 * beside the import.
 */
export async function loadAllPeopleWithRelationships({
  store,
  now,
  resolveEntity,
  createRepository,
  env,
  fetchImpl
} = {}) {
  if (!store) {
    throw new Error('loadAllPeopleWithRelationships requires a store.');
  }
  const github = { env, fetchImpl };
  const resolve = (ref, ctx, options = {}) =>
    (resolveEntity ?? defaultResolveEntity)(ref, ctx, { ...github, ...options });
  const buildRepository = createRepository ?? createUniversalLinkRepository;
  const repo = buildRepository({ store, resolveEntity: resolve });
  const accessContext = createAccessContext({ workflow: 'life' });

  const personKeys = await listAuthoritativePersonKeys(store);
  const ids = [...new Set(personKeys.map(personIdFromKey).filter(Boolean))];

  const githubStudents = await listGithubImportedStudentPeople(github);
  const studentIds = new Set(githubStudents.map((p) => p.id));
  const studentNameKeys = new Set(
    githubStudents.map((p) => identityNameKey(p.display_name)).filter(Boolean)
  );

  // Cheap Blob pass: person JSON only. listForEntity waits until after
  // identity dedupe so discarded twins never hit the membership scan.
  // Also drop Blob twins of Communications students before dedupe / scan.
  const nativeStubs = (
    await mapBounded(ids, PEOPLE_BATCH_SIZE, async (id) => {
      const record = parsePersonRecord(await getJSON(store, personKey(id)));
      if (!record) return null;
      if (isNetworkExcludedPerson(record, studentIds, studentNameKeys)) return null;
      const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });
      return { person: { ...record, ref }, relationships: [], _source: 'blob' };
    })
  ).filter(Boolean);

  const nativeIds = new Set(nativeStubs.map((row) => row.person.id));
  const githubPeople = await listGithubPersonCandidates(github);
  const githubIds = new Set(githubPeople.map((record) => record.id));
  const endpointCache = new Map();

  async function resolveGithubEndpoint(otherRef) {
    if (endpointCache.has(otherRef)) return endpointCache.get(otherRef);
    try {
      const endpoint = await resolve(otherRef, accessContext);
      endpointCache.set(otherRef, endpoint);
      return endpoint;
    } catch (error) {
      if (error?.code === 'endpoint_not_found') {
        endpointCache.set(otherRef, null);
        return null;
      }
      throw error;
    }
  }

  // Hydrate GitHub before dedupe so relationship counts inform twin preference.
  const imported = await mapBounded(
    githubPeople.filter((record) => !nativeIds.has(record.id)),
    PEOPLE_BATCH_SIZE,
    async (record) => {
      const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id: record.id });
      const rows = await listGithubRelationshipEntries('person', record.id, github);
      const relationships = [];
      for (const { link, otherRef, direction } of rows) {
        const endpoint = await resolveGithubEndpoint(otherRef);
        if (!endpoint) continue;
        relationships.push({ link, endpoint, direction });
      }
      return { person: { ...record, ref }, relationships, _source: 'github' };
    }
  );

  const survivors = dedupeIdentityRows(
    [...nativeStubs, ...imported],
    (row) => row.person,
    (row, person) => ({ person, relationships: row.relationships, _source: row._source }),
    (row) => row._source
  );

  return mapBounded(survivors, PEOPLE_BATCH_SIZE, async (row) => {
    if (row._source === 'github') {
      return {
        person: row.person,
        relationships: withoutStudentPersonEndpoints(row.relationships, studentIds)
      };
    }

    const { outgoing, incoming } = await repo.listForEntity(row.person.ref, accessContext, {
      includeArchived: true
    });
    const native = [
      ...outgoing.map((entry) => ({ ...entry, direction: 'outgoing' })),
      ...incoming.map((entry) => ({ ...entry, direction: 'incoming' }))
    ];
    // A Person adopted from the Notion import keeps its GitHub id, and its
    // imported relationships still live only in GitHub. Merge them in so an
    // edit never drops a Person's history from the network.
    const nativeLinkIds = new Set(native.map((entry) => entry.link?.id).filter(Boolean));
    const imported = [];
    if (githubIds.has(row.person.id)) {
      for (const { link, otherRef, direction } of await listGithubRelationshipEntries('person', row.person.id, github)) {
        if (nativeLinkIds.has(link?.id)) continue;
        const endpoint = await resolveGithubEndpoint(otherRef);
        if (endpoint) imported.push({ link, endpoint, direction });
      }
    }
    return {
      person: row.person,
      relationships: withoutStudentPersonEndpoints([...native, ...imported], studentIds)
    };
  });
}
