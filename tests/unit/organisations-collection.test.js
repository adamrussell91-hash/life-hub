import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllOrganisationsWithRelationships } from '../../netlify/functions/_shared/organisations-collection.mjs';
import { assembleOrganisationsDirectory } from '../../netlify/functions/_shared/organisations-directory.mjs';
import {
  deriveOrganisationId,
  derivePersonId,
  resetProfessionalDataCache,
  STUDENT_ORIGINAL_CATEGORY
} from '../../netlify/functions/_shared/github-professional-data.mjs';
import { resolveOrganisation, resolvePerson } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { memoryStore } from '../support/people-fixtures.mjs';

function githubFetch({ people, organisations, relationships }) {
  return async (url) => {
    const href = String(url);
    const body = (data) => {
      const text = JSON.stringify(data);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: `sha-${Buffer.byteLength(text)}`,
          encoding: 'base64',
          content: Buffer.from(text).toString('base64'),
          size: Buffer.byteLength(text)
        })
      };
    };
    if (href.endsWith('/data/professional/people.json')) return body(people);
    if (href.endsWith('/data/professional/organisations.json')) return body(organisations);
    if (href.endsWith('/data/professional/relationships.json')) return body(relationships);
    return { ok: false, status: 404 };
  };
}

test('organisations collection excludes Communications students from member lists', async () => {
  resetProfessionalDataCache();
  const store = memoryStore();
  const env = { GITHUB_TOKEN: 'token' };
  const fetchImpl = githubFetch({
    people: [
      {
        legacy_id: 'leg-adult',
        display_name: 'Lauren Stuart',
        original_category: 'People (Professional Relationship Management)'
      },
      {
        legacy_id: 'leg-student',
        display_name: 'Year 10 Student',
        original_category: STUDENT_ORIGINAL_CATEGORY
      }
    ],
    organisations: [{ legacy_id: 'leg-org-1', display_name: 'St. Aloysius College' }],
    relationships: [
      {
        person_legacy_id: 'leg-adult',
        organisation_legacy_id: 'leg-org-1',
        relationship_type: 'employee_at',
        role: null,
        valid_from: null,
        valid_to: null
      },
      {
        person_legacy_id: 'leg-student',
        organisation_legacy_id: 'leg-org-1',
        relationship_type: 'employee_at',
        role: null,
        valid_from: null,
        valid_to: null
      }
    ]
  });
  const resolveEntity = async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    const withGithub = { ...options, env, fetchImpl, getStore: async () => store };
    if (ref.namespace === 'shared' && ref.kind === 'person') return resolvePerson(ref.id, accessContext, withGithub);
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, withGithub);
    }
    throw endpointNotFoundError();
  };

  const rows = await loadAllOrganisationsWithRelationships({ store, resolveEntity, env, fetchImpl });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organisation.id, deriveOrganisationId('leg-org-1'));
  assert.equal(rows[0].relationships.length, 1);
  assert.equal(rows[0].relationships[0].endpoint.display_label, 'Lauren Stuart');
  assert.ok(
    !rows[0].relationships.some((e) => e.endpoint?.display_label === 'Year 10 Student')
  );

  const directory = assembleOrganisationsDirectory(rows, { now: '2026-09-27T00:00:00.000Z' });
  assert.equal(directory.organisations[0].people_count, 1);
  assert.equal(directory.organisations[0].people[0].display_name, 'Lauren Stuart');
  assert.equal(directory.counts.people, 1);
  assert.ok(!directory.organisations[0].people.some((p) => p.id === derivePersonId('leg-student')));
});
