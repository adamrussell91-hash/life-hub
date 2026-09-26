import { createAccessContext } from './entity-access.mjs';
import { mapBounded, isIndexKey, listBlobKeys } from './blobs-list.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { parseOrganisationRecord } from './identity-schema.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  ORGANISATION_PREFIX,
  getJSON,
  organisationKey
} from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import {
  listGithubOrganisationCandidates,
  listGithubRelationshipEntries
} from './github-professional-data.mjs';

const ORG_BATCH_SIZE = 10;

export async function listAuthoritativeOrganisationKeys(store) {
  return (await listBlobKeys(store, ORGANISATION_PREFIX)).filter((key) => !isIndexKey(key));
}

function organisationIdFromKey(key) {
  return key.startsWith(ORGANISATION_PREFIX) ? key.slice(ORGANISATION_PREFIX.length) : null;
}

/**
 * Loads every Organisation with its Universal Links (Blob + GitHub import).
 * Mirrors `loadAllPeopleWithRelationships` for the organisations crest wall.
 */
export async function loadAllOrganisationsWithRelationships({
  store,
  resolveEntity,
  createRepository,
  env,
  fetchImpl
} = {}) {
  if (!store) throw new Error('loadAllOrganisationsWithRelationships requires a store.');
  const github = { env, fetchImpl };
  const resolve = (ref, ctx, options = {}) =>
    (resolveEntity ?? defaultResolveEntity)(ref, ctx, { ...github, ...options });
  const buildRepository = createRepository ?? createUniversalLinkRepository;
  const repo = buildRepository({ store, resolveEntity: resolve });
  const accessContext = createAccessContext({ workflow: 'life' });

  const orgKeys = await listAuthoritativeOrganisationKeys(store);
  const ids = [...new Set(orgKeys.map(organisationIdFromKey).filter(Boolean))];

  const results = await mapBounded(ids, ORG_BATCH_SIZE, async (id) => {
    const record = parseOrganisationRecord(await getJSON(store, organisationKey(id)));
    if (!record) return null;
    const ref = formatEntityRef({ namespace: 'shared', kind: 'organisation', id });
    const { outgoing, incoming } = await repo.listForEntity(ref, accessContext, {
      includeArchived: true
    });
    const relationships = [
      ...outgoing.map((entry) => ({ ...entry, direction: 'outgoing' })),
      ...incoming.map((entry) => ({ ...entry, direction: 'incoming' }))
    ];
    return { organisation: { ...record, ref }, relationships };
  });

  const native = results.filter(Boolean);
  const nativeIds = new Set(native.map((row) => row.organisation.id));
  const githubOrgs = await listGithubOrganisationCandidates(github);
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

  const imported = await mapBounded(
    githubOrgs.filter((record) => !nativeIds.has(record.id)),
    ORG_BATCH_SIZE,
    async (record) => {
      const ref = formatEntityRef({ namespace: 'shared', kind: 'organisation', id: record.id });
      const rows = await listGithubRelationshipEntries('organisation', record.id, github);
      const relationships = [];
      for (const { link, otherRef, direction } of rows) {
        const endpoint = await resolveGithubEndpoint(otherRef);
        if (!endpoint) continue;
        relationships.push({ link, endpoint, direction });
      }
      return { organisation: { ...record, ref, logo_key: record.logo_key ?? null }, relationships };
    }
  );

  return [...native, ...imported];
}
