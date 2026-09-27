import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCareerOverview } from '../../netlify/functions/_shared/career-overview.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import {
  deriveOrganisationId,
  derivePersonId,
  listGithubRelationshipEntries,
  resetProfessionalDataCache
} from '../../netlify/functions/_shared/github-professional-data.mjs';

function githubContents(body) {
  const text = JSON.stringify(body);
  return {
    sha: 'sha1',
    encoding: 'base64',
    content: Buffer.from(text).toString('base64'),
    size: Buffer.byteLength(text)
  };
}

function memoryFetch({ people = [], organisations = [], relationships = [] } = {}) {
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.endsWith('/data/professional/people.json')) {
      return { ok: true, status: 200, json: async () => githubContents(people) };
    }
    if (href.endsWith('/data/professional/organisations.json')) {
      return { ok: true, status: 200, json: async () => githubContents(organisations) };
    }
    if (href.endsWith('/data/professional/relationships.json')) {
      return { ok: true, status: 200, json: async () => githubContents(relationships) };
    }
    return { ok: false, status: 404 };
  };
  return fetchImpl;
}

test('GitHub career employment includes ended roles and stacked same-org roles', async () => {
  resetProfessionalDataCache();
  const people = [
    {
      legacy_id: 'derived:person:adam-russell',
      display_name: 'Adam Russell',
      sort_name: 'Russell, Adam',
      aliases: [],
      is_self: true
    }
  ];
  const organisations = [
    {
      legacy_id: 'derived:org:st-pius-x',
      display_name: 'St Pius X High School',
      aliases: []
    },
    {
      legacy_id: '154f794f-8476-8096-8d33-cb09f6411dc9',
      display_name: "St Aloysius' College",
      aliases: []
    }
  ];
  const relationships = [
    {
      person_legacy_id: 'derived:person:adam-russell',
      organisation_legacy_id: 'derived:org:st-pius-x',
      relationship_type: 'employee_at',
      role: 'English Teacher',
      valid_from: '2021-01-25',
      valid_to: '2024-08-16',
      relationship_notes: 'Previous'
    },
    {
      person_legacy_id: 'derived:person:adam-russell',
      organisation_legacy_id: 'derived:org:st-pius-x',
      relationship_type: 'employee_at',
      role: 'Psychology Teacher',
      valid_from: '2023-01-23',
      valid_to: '2024-08-16',
      relationship_notes: 'Previous'
    },
    {
      person_legacy_id: 'derived:person:adam-russell',
      organisation_legacy_id: '154f794f-8476-8096-8d33-cb09f6411dc9',
      relationship_type: 'employee_at',
      role: 'Gifted Education Teacher',
      valid_from: '2025-01-22',
      valid_to: null,
      relationship_notes: 'Current'
    }
  ];

  const fetchImpl = memoryFetch({ people, organisations, relationships });
  const env = { GITHUB_TOKEN: 'token' };
  const selfId = derivePersonId('derived:person:adam-russell');
  const piusId = deriveOrganisationId('derived:org:st-pius-x');
  const aloysiusId = deriveOrganisationId('154f794f-8476-8096-8d33-cb09f6411dc9');

  const entries = await listGithubRelationshipEntries('person', selfId, { env, fetchImpl });
  assert.equal(entries.filter((e) => e.link.relationship_type === 'employee_at').length, 3);
  assert.equal(entries.filter((e) => e.link.status === 'ended').length, 2);

  const overview = await assembleCareerOverview({
    professionalStore: {
      async get() {
        return null;
      },
      async list() {
        return { blobs: [] };
      }
    },
    universalStore: {
      async get() {
        return null;
      },
      async list() {
        return { blobs: [] };
      }
    },
    env,
    fetchImpl,
    resolveEntity: async (ref) => {
      const id = String(ref).split(':').pop();
      const orgId = id;
      const label =
        orgId === piusId ? 'St Pius X High School' : orgId === aloysiusId ? "St Aloysius' College" : orgId;
      return {
        ref: formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId }),
        kind: 'organisation',
        display_label: label,
        supporting_label: null,
        href: null,
        lifecycle_status: 'active'
      };
    },
    createApplicationRepository: () => ({
      listApplications: async () => []
    }),
    createEventRepository: () => ({
      listEvents: async () => []
    }),
    createCareerRepository: () => ({
      listAchievements: async () => [],
      listFutures: async () => [],
      listSteppingStones: async () => []
    }),
    createUniversalLinkRepository: () => ({
      listForEntity: async () => ({ outgoing: [], incoming: [] })
    })
  });

  assert.equal(overview.employment.status, 'ok');
  assert.equal(overview.employment.items.length, 3);
  assert.deepEqual(
    overview.employment.items.map((item) => item.role),
    ['English Teacher', 'Psychology Teacher', 'Gifted Education Teacher']
  );
  assert.equal(overview.employment.items[0].link_status, 'ended');
  assert.equal(overview.employment.items[2].link_status, 'current');
  assert.equal(overview.employment_items.length, 3);
});
