import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePersonId,
  deriveOrganisationId,
  getGithubActiveSelfPerson,
  getGithubOrganisation,
  getGithubPerson,
  isProfessionalDataRepoBound,
  listGithubOrganisationCandidates,
  listGithubPersonCandidates,
  listGithubRelationshipEntries,
  resetProfessionalDataCache
} from '../../netlify/functions/_shared/github-professional-data.mjs';
import { isValidOrganisationId, isValidPersonId } from '../../netlify/functions/_shared/identity-schema.mjs';
import { isValidLinkId } from '../../netlify/functions/_shared/universal-link-schema.mjs';

function githubContents(body) {
  const text = JSON.stringify(body);
  return { sha: 'sha1', encoding: 'base64', content: Buffer.from(text).toString('base64'), size: Buffer.byteLength(text) };
}

function memoryFetch({ people = [], organisations = [], relationships = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/data/professional/people.json')) {
      return { ok: true, status: 200, json: async () => githubContents(people) };
    }
    if (String(url).endsWith('/data/professional/organisations.json')) {
      return { ok: true, status: 200, json: async () => githubContents(organisations) };
    }
    if (String(url).endsWith('/data/professional/relationships.json')) {
      return { ok: true, status: 200, json: async () => githubContents(relationships) };
    }
    return { ok: false, status: 404 };
  };
  return { fetchImpl, calls };
}

const PEOPLE = [
  {
    legacy_id: 'leg-person-1',
    display_name: 'Lauren Stuart',
    sort_name: 'Stuart, Lauren',
    aliases: [],
    professional_profile: {
      schema_version: 1,
      source: {
        system: 'notion',
        page_url: 'https://www.notion.so/lauren',
        properties: {
          'AI summary': 'A rich imported summary.',
          'Future Notion column': 'Preserve me'
        }
      },
      summary: 'A rich imported summary.',
      contact: {
        email: 'lauren@example.com',
        phone: null,
        linkedin_url: 'javascript:alert(1)'
      },
      last_contacted: null,
      current_workplace: ['Example University'],
      references: {
        communications: [{ label: 'Planning note', source_url: 'https://www.notion.so/note', hub_href: null }],
        books: [],
        podcasts: [],
        notes: []
      },
      body_markdown: '<script>not markup</script>\n\n# Profile'
    }
  },
  { legacy_id: 'leg-person-2', display_name: 'Notion Import', sort_name: null, aliases: ['Notey'] }
];
const ORGANISATIONS = [
  { legacy_id: 'leg-org-1', display_name: 'St. Aloysius College', legal_name: null, aliases: [] }
];
const RELATIONSHIPS = [
  {
    person_legacy_id: 'leg-person-1',
    organisation_legacy_id: 'leg-org-1',
    relationship_type: 'employee_at',
    role: 'Teacher',
    valid_from: null,
    valid_to: null
  },
  {
    person_legacy_id: 'leg-person-2',
    organisation_legacy_id: 'leg-org-1',
    relationship_type: 'member_of',
    role: null,
    valid_from: '2020-01-01',
    valid_to: '2021-06-30'
  }
];

test.beforeEach(() => resetProfessionalDataCache());

test('isProfessionalDataRepoBound is false without a token and true with one', () => {
  assert.equal(isProfessionalDataRepoBound({}), false);
  assert.equal(isProfessionalDataRepoBound({ GITHUB_TOKEN: 'x' }), true);
});

test('derivePersonId/deriveOrganisationId are deterministic and match the native id shape', () => {
  const a = derivePersonId('leg-person-1');
  const b = derivePersonId('leg-person-1');
  const c = derivePersonId('leg-person-2');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(isValidPersonId(a));
  assert.ok(isValidOrganisationId(deriveOrganisationId('leg-org-1')));
});

test('listGithubPersonCandidates/listGithubOrganisationCandidates normalize into schema-valid records', async () => {
  const { fetchImpl } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const env = { GITHUB_TOKEN: 'token' };

  const people = await listGithubPersonCandidates({ env, fetchImpl });
  assert.equal(people.length, 2);
  assert.ok(people.every(record => isValidPersonId(record.id)));
  assert.ok(people.every(record => record.lifecycle_status === 'active' && record.schema_version === 1));
  assert.equal(people.find(record => record.display_name === 'Lauren Stuart').id, derivePersonId('leg-person-1'));

  const organisations = await listGithubOrganisationCandidates({ env, fetchImpl });
  assert.equal(organisations.length, 1);
  assert.ok(isValidOrganisationId(organisations[0].id));
});

test('getGithubPerson/getGithubOrganisation return null for an id with no matching legacy record', async () => {
  const { fetchImpl } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const env = { GITHUB_TOKEN: 'token' };
  assert.equal(await getGithubPerson('person_00000000-0000-0000-0000-000000000000', { env, fetchImpl }), null);
  assert.equal(await getGithubOrganisation('organisation_00000000-0000-0000-0000-000000000000', { env, fetchImpl }), null);
  const found = await getGithubPerson(derivePersonId('leg-person-1'), { env, fetchImpl });
  assert.equal(found.display_name, 'Lauren Stuart');
});

test('getGithubPerson preserves a lossless imported profile while normalising unsafe links', async () => {
  const { fetchImpl } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const person = await getGithubPerson(derivePersonId('leg-person-1'), { env: { GITHUB_TOKEN: 'token' }, fetchImpl });

  assert.deepEqual(person.professional_profile.source.properties, {
    'AI summary': 'A rich imported summary.',
    'Future Notion column': 'Preserve me'
  });
  assert.equal(person.professional_profile.summary, 'A rich imported summary.');
  assert.equal(person.professional_profile.contact.linkedin_url, null);
  assert.deepEqual(person.professional_profile.references.communications, [
    { label: 'Planning note', source_url: 'https://www.notion.so/note', hub_href: null }
  ]);
  assert.equal(person.professional_profile.body_markdown, '<script>not markup</script>\n\n# Profile');
});

test('without a token, every reader degrades to empty/null rather than throwing', async () => {
  const { fetchImpl } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const env = {};
  assert.deepEqual(await listGithubPersonCandidates({ env, fetchImpl }), []);
  assert.equal(await getGithubPerson(derivePersonId('leg-person-1'), { env, fetchImpl }), null);
  assert.deepEqual(await listGithubRelationshipEntries('person', derivePersonId('leg-person-1'), { env, fetchImpl }), []);
});

test('listGithubRelationshipEntries indexes employee_at/member_of by both sides, with correct direction and status', async () => {
  const { fetchImpl } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const env = { GITHUB_TOKEN: 'token' };
  const personId = derivePersonId('leg-person-1');
  const orgId = deriveOrganisationId('leg-org-1');

  const outgoingFromPerson = await listGithubRelationshipEntries('person', personId, { env, fetchImpl });
  assert.equal(outgoingFromPerson.length, 1);
  assert.equal(outgoingFromPerson[0].direction, 'outgoing');
  assert.equal(outgoingFromPerson[0].otherRef, `shared:organisation:${orgId}`);
  assert.equal(outgoingFromPerson[0].link.relationship_type, 'employee_at');
  assert.equal(outgoingFromPerson[0].link.role, 'Teacher');
  assert.equal(outgoingFromPerson[0].link.status, 'current');
  assert.ok(isValidLinkId(outgoingFromPerson[0].link.id));

  const incomingToOrg = await listGithubRelationshipEntries('organisation', orgId, { env, fetchImpl });
  assert.equal(incomingToOrg.length, 2);
  assert.ok(incomingToOrg.every(entry => entry.direction === 'incoming'));
  const memberEntry = incomingToOrg.find(entry => entry.link.relationship_type === 'member_of');
  assert.equal(memberEntry.link.status, 'ended');
  assert.equal(memberEntry.link.valid_to, '2021-06-30');
});

test('caches parsed data for repeated calls within the TTL, issuing only one set of GitHub requests', async () => {
  const { fetchImpl, calls } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const env = { GITHUB_TOKEN: 'token' };
  await listGithubPersonCandidates({ env, fetchImpl });
  await listGithubPersonCandidates({ env, fetchImpl });
  await listGithubOrganisationCandidates({ env, fetchImpl });
  assert.equal(calls.length, 3);
});

test('honors a single is_self flag and ignores a second self-claim', async () => {
  const { fetchImpl } = memoryFetch({
    people: [
      { legacy_id: 'leg-self', display_name: 'Adam Russell', is_self: true },
      { legacy_id: 'leg-other', display_name: 'Lauren Stuart', is_self: true },
      { legacy_id: 'leg-plain', display_name: 'Kate Jones' }
    ],
    organisations: ORGANISATIONS,
    relationships: []
  });
  const env = { GITHUB_TOKEN: 'token' };
  const people = await listGithubPersonCandidates({ env, fetchImpl });
  const self = people.find((record) => record.display_name === 'Adam Russell');
  const other = people.find((record) => record.display_name === 'Lauren Stuart');
  assert.equal(self.is_self, true);
  assert.equal(other.is_self, false);
  const found = await getGithubActiveSelfPerson({ env, fetchImpl });
  assert.equal(found.id, derivePersonId('leg-self'));
  assert.equal(found.display_name, 'Adam Russell');
});

test('getGithubActiveSelfPerson returns null when no imported person is self', async () => {
  const { fetchImpl } = memoryFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: RELATIONSHIPS });
  const env = { GITHUB_TOKEN: 'token' };
  assert.equal(await getGithubActiveSelfPerson({ env, fetchImpl }), null);
});

test('a relationship whose legacy id does not resolve to a known person/organisation is dropped, not thrown', async () => {
  const { fetchImpl } = memoryFetch({
    people: PEOPLE,
    organisations: ORGANISATIONS,
    relationships: [{ person_legacy_id: 'leg-person-1', organisation_legacy_id: 'leg-org-missing', relationship_type: 'employee_at', role: null, valid_from: null, valid_to: null }]
  });
  const env = { GITHUB_TOKEN: 'token' };
  const entries = await listGithubRelationshipEntries('person', derivePersonId('leg-person-1'), { env, fetchImpl });
  assert.deepEqual(entries, []);
});
