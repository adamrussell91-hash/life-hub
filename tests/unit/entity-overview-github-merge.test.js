import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleEntityOverview } from '../../netlify/functions/_shared/entity-overview.mjs';
import { resolveOrganisation, resolvePerson } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { derivePersonId, deriveOrganisationId, resetProfessionalDataCache } from '../../netlify/functions/_shared/github-professional-data.mjs';

// Verifies entity-overview.mjs's read-only merge of the GitHub-canonical
// Professional import's employee_at/member_of relationships alongside the
// native Universal Link repository's own — for a Person/Organisation that
// exists ONLY in that import, never written to `universal-link-content`
// Blobs at all.

const GITHUB_ENV = { GITHUB_TOKEN: 'token' };

function githubFetch({ people, organisations, relationships }) {
  return async (url) => {
    const href = String(url);
    const body = (data) => ({
      ok: true,
      status: 200,
      json: async () => ({ content: Buffer.from(JSON.stringify(data)).toString('base64') })
    });
    if (href.endsWith('/data/professional/people.json')) return body(people);
    if (href.endsWith('/data/professional/organisations.json')) return body(organisations);
    if (href.endsWith('/data/professional/relationships.json')) return body(relationships);
    return { ok: false, status: 404 };
  };
}

function emptyStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

// Same dispatch shape as the integration suite's makeResolveEntity, but
// threads env/fetchImpl through explicitly — production relies on
// `process.env`/global `fetch` defaults instead (see
// github-professional-data.mjs), which this test avoids mutating globally.
function makeResolveEntity(store, fetchImpl) {
  return async function resolveEntity(refInput, accessContext, options = {}) {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    const withGithub = { ...options, env: GITHUB_ENV, fetchImpl, getStore: async () => store };
    if (ref.namespace === 'shared' && ref.kind === 'person') return resolvePerson(ref.id, accessContext, withGithub);
    if (ref.namespace === 'shared' && ref.kind === 'organisation') return resolveOrganisation(ref.id, accessContext, withGithub);
    throw endpointNotFoundError();
  };
}

const PEOPLE = [{ legacy_id: 'leg-person-1', display_name: 'Lauren Stuart', sort_name: 'Stuart, Lauren', aliases: [] }];
const ORGANISATIONS = [{ legacy_id: 'leg-org-1', display_name: 'St. Aloysius College', legal_name: null, aliases: [] }];
const RELATIONSHIPS = [{
  person_legacy_id: 'leg-person-1',
  organisation_legacy_id: 'leg-org-1',
  relationship_type: 'employee_at',
  role: 'Teacher',
  valid_from: null,
  valid_to: null
}];

test.beforeEach(() => resetProfessionalDataCache());

test('a GitHub-only Person overview shows a current employee_at relationship to a GitHub-only Organisation', async () => {
  const store = emptyStore();
  const fetchImpl = githubFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const personId = derivePersonId('leg-person-1');
  const organisationId = deriveOrganisationId('leg-org-1');

  const overview = await assembleEntityOverview(`shared:person:${personId}`, {
    store,
    env: GITHUB_ENV,
    fetchImpl,
    resolveEntity: makeResolveEntity(store, fetchImpl)
  });

  assert.equal(overview.entity.display_name, 'Lauren Stuart');
  assert.equal(overview.current_relationships.length, 1);
  assert.equal(overview.historical_relationships.length, 0);
  const [relationship] = overview.current_relationships;
  assert.equal(relationship.link.relationship_type, 'employee_at');
  assert.equal(relationship.endpoint.ref, `shared:organisation:${organisationId}`);
  assert.equal(relationship.endpoint.display_label, 'St. Aloysius College');
  assert.equal(overview.linked_records.organisations.length, 1);
  assert.equal(overview.timeline.length, 1);
  assert.equal(overview.timeline[0].label, 'employee_at St. Aloysius College');
});

test('the reciprocal Organisation overview shows the same relationship as incoming', async () => {
  const store = emptyStore();
  const fetchImpl = githubFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const organisationId = deriveOrganisationId('leg-org-1');
  const personId = derivePersonId('leg-person-1');

  const overview = await assembleEntityOverview(`shared:organisation:${organisationId}`, {
    store,
    env: GITHUB_ENV,
    fetchImpl,
    resolveEntity: makeResolveEntity(store, fetchImpl)
  });

  assert.equal(overview.entity.display_name, 'St. Aloysius College');
  assert.equal(overview.current_relationships.length, 1);
  assert.equal(overview.current_relationships[0].endpoint.ref, `shared:person:${personId}`);
  assert.equal(overview.linked_records.people.length, 1);
});

test('a native Blob-backed Person keeps working unchanged when the GitHub import has nothing for it', async () => {
  const { generatePersonId, IDENTITY_SCHEMA_VERSION } = await import('../../netlify/functions/_shared/identity-schema.mjs');
  const { personKey } = await import('../../netlify/functions/_shared/universal-link-blobs.mjs');
  const store = emptyStore();
  const id = generatePersonId();
  await store.setJSON(personKey(id), {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'person',
    display_name: 'Native Only',
    sort_name: null,
    aliases: [],
    lifecycle_status: 'active',
    is_self: false,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z'
  });
  const fetchImpl = githubFetch({ people: [], organisations: [], relationships: [] });

  const overview = await assembleEntityOverview(`shared:person:${id}`, {
    store,
    resolveEntity: makeResolveEntity(store, fetchImpl)
  });
  assert.equal(overview.entity.display_name, 'Native Only');
  assert.equal(overview.current_relationships.length, 0);
});
