import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleEntityOverview } from '../../netlify/functions/_shared/entity-overview.mjs';
import { resolveOrganisation, resolvePerson } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { derivePersonId, deriveOrganisationId, resetProfessionalDataCache } from '../../netlify/functions/_shared/github-professional-data.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';

// Verifies entity-overview.mjs's read-only merge of the GitHub-canonical
// Professional import's employee_at/member_of relationships alongside the
// native Universal Link repository's own — for a Person/Organisation that
// exists ONLY in that import, never written to `universal-link-content`
// Blobs at all.

const GITHUB_ENV = { GITHUB_TOKEN: 'token' };

function githubFetch({ people, organisations, relationships, deletions = [] }) {
  return async (url) => {
    const href = String(url);
    // Contents mock must include sha/encoding/size — fetchDataFile (#531) rejects
    // content-only payloads and would otherwise null the whole professional bridge.
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
    if (href.endsWith('/data/professional/people-deletions.json')) return body(deletions);
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
const ORGANISATIONS = [{ legacy_id: 'leg-org-1', display_name: 'Tallowwood College', legal_name: null, aliases: [] }];
const RELATIONSHIPS = [{
  person_legacy_id: 'leg-person-1',
  organisation_legacy_id: 'leg-org-1',
  relationship_type: 'employee_at',
  role: 'Teacher',
  valid_from: null,
  valid_to: null
}];

test.beforeEach(() => resetProfessionalDataCache());

test('a corrected imported profile supersedes its stale adopted copy without losing Hub-only fields', async () => {
  const store = emptyStore();
  const id = derivePersonId('corrected-person');
  const native = { schema_version:1, id, kind:'person', display_name:'Old Given Name', sort_name:null, aliases:[], lifecycle_status:'active', is_self:false, retention_reason:null, retention_review_at:null, created_at:'2025-01-01T00:00:00Z', updated_at:'2026-01-01T00:00:00Z', hub_note:'keep this' };
  await store.setJSON(`entities/person/${id}`, native);
  const profile = {schema_version:1, source:{system:'hub',page_url:null,properties:{'First met':'2025-02'}},summary:'Verified educator',contact:{email:null,phone:null,linkedin_url:null},last_contacted:'2025-04-11',current_workplace:[],references:{},body_markdown:'Confirmed shared history.'};
  const fetchImpl = githubFetch({people:[{legacy_id:'corrected-person',display_name:'Correct Given Name',professional_profile:profile}],organisations:[],relationships:[]});
  const overview = await assembleEntityOverview(`shared:person:${id}`, {store,env:GITHUB_ENV,fetchImpl,resolveEntity:makeResolveEntity(store,fetchImpl)});
  assert.equal(overview.entity.display_name,'Correct Given Name');
  assert.equal(overview.entity.professional_profile.summary,'Verified educator');
  assert.equal(overview.entity.professional_profile.last_contacted,'2025-04-11');
  assert.equal((await store.get(`entities/person/${id}`)).hub_note,'keep this');
  assert.equal((await store.get(`entities/person/${id}`)).display_name,'Old Given Name','a read must not rewrite storage');
});

test('an imported deletion cannot be resurrected by an older adopted person record', async () => {
  const store = emptyStore();
  const id = derivePersonId('removed-person');
  await store.setJSON(`entities/person/${id}`, {schema_version:1,id,kind:'person',display_name:'Removed Educator',sort_name:null,aliases:[],lifecycle_status:'active',is_self:false,retention_reason:null,retention_review_at:null,created_at:'2025-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'});
  const fetchImpl=githubFetch({people:[],organisations:[],relationships:[],deletions:[{legacy_id:'removed-person'}]});
  await assert.rejects(assembleEntityOverview(`shared:person:${id}`,{store,env:GITHUB_ENV,fetchImpl,resolveEntity:makeResolveEntity(store,fetchImpl)}),error=>error.status===404);
});

test('intentional Hub edits survive unrelated source updates, while a corrected source field supersedes its old edit', async () => {
  const store=emptyStore(), id=derivePersonId('editable-import');
  const profile={schema_version:1,source:{system:'hub',page_url:null,properties:{}},summary:'Imported summary',contact:{email:null,phone:null,linkedin_url:null},last_contacted:null,current_workplace:[],references:{},body_markdown:'Original history'};
  const people=[{legacy_id:'editable-import',display_name:'Imported Name',professional_profile:profile}];
  const fetchImpl=githubFetch({people,organisations:[],relationships:[]});
  await store.setJSON(`entities/person/${id}`,{schema_version:1,id,kind:'person',display_name:'Old Name',sort_name:null,aliases:[],lifecycle_status:'active',is_self:false,retention_reason:null,retention_review_at:null,created_at:'2025-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'});
  const github={env:GITHUB_ENV,fetchImpl};
  const repo=createIdentityRepository({store,github,now:()=> '2026-02-01T00:00:00Z'});
  await repo.updateFields({ref:{namespace:'shared',kind:'person',id},patch:{display_name:'Chosen Name',professional_profile:{summary:'Personal note'}}});
  const read=()=>assembleEntityOverview(`shared:person:${id}`,{store,...github,resolveEntity:makeResolveEntity(store,fetchImpl)});
  assert.equal((await read()).entity.display_name,'Chosen Name');
  people[0].display_name='Corrected Source Name'; profile.body_markdown='Updated history'; resetProfessionalDataCache();
  const result=await read();
  assert.equal(result.entity.display_name,'Corrected Source Name');
  assert.equal(result.entity.professional_profile.summary,'Personal note');
  assert.equal(result.entity.professional_profile.body_markdown,'Updated history');
});

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
  assert.equal(relationship.endpoint.display_label, 'Tallowwood College');
  assert.equal(overview.linked_records.organisations.length, 1);
  assert.equal(overview.timeline.length, 1);
  assert.equal(overview.timeline[0].label, 'employee_at Tallowwood College');
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

  assert.equal(overview.entity.display_name, 'Tallowwood College');
  assert.equal(overview.current_relationships.length, 1);
  assert.equal(overview.current_relationships[0].endpoint.ref, `shared:person:${personId}`);
  assert.equal(overview.linked_records.people.length, 1);
});

test('a colleague who shares a current workplace with the imported self gets shared_contexts_with_self', async () => {
  const store = emptyStore();
  const fetchImpl = githubFetch({
    people: [
      { legacy_id: 'leg-self', display_name: 'Adam Russell', is_self: true },
      { legacy_id: 'leg-colleague', display_name: 'Yara Zephyrine' }
    ],
    organisations: ORGANISATIONS,
    relationships: [
      {
        person_legacy_id: 'leg-self',
        organisation_legacy_id: 'leg-org-1',
        relationship_type: 'employee_at',
        role: 'Gifted Education Teacher',
        valid_from: null,
        valid_to: null
      },
      {
        person_legacy_id: 'leg-colleague',
        organisation_legacy_id: 'leg-org-1',
        relationship_type: 'employee_at',
        role: null,
        valid_from: null,
        valid_to: null
      }
    ]
  });
  const colleagueId = derivePersonId('leg-colleague');
  const organisationId = deriveOrganisationId('leg-org-1');

  const overview = await assembleEntityOverview(`shared:person:${colleagueId}`, {
    store,
    env: GITHUB_ENV,
    fetchImpl,
    resolveEntity: makeResolveEntity(store, fetchImpl)
  });

  assert.equal(overview.entity.display_name, 'Yara Zephyrine');
  assert.deepEqual(overview.shared_contexts_with_self, [
    {
      ref: `shared:organisation:${organisationId}`,
      display_label: 'Tallowwood College',
      relationship_type: 'employee_at'
    }
  ]);

  const selfOverview = await assembleEntityOverview(`shared:person:${derivePersonId('leg-self')}`, {
    store,
    env: GITHUB_ENV,
    fetchImpl,
    resolveEntity: makeResolveEntity(store, fetchImpl)
  });
  assert.equal(selfOverview.entity.is_self, true);
  assert.deepEqual(selfOverview.shared_contexts_with_self, []);
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

test('a redacted Person overview omits imported professional profile material', async () => {
  const { generatePersonId, IDENTITY_SCHEMA_VERSION } = await import('../../netlify/functions/_shared/identity-schema.mjs');
  const { personKey } = await import('../../netlify/functions/_shared/universal-link-blobs.mjs');
  const store = emptyStore();
  const id = generatePersonId();
  await store.setJSON(personKey(id), {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'person',
    display_name: 'Removed Person',
    sort_name: 'Person, Removed',
    aliases: ['Former name'],
    lifecycle_status: 'deidentified',
    is_self: false,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    professional_profile: {
      schema_version: 1,
      source: { system: 'notion', page_url: null, properties: { Notes: 'Private source note' } },
      summary: 'Private source note',
      contact: { email: 'private@example.com', phone: null, linkedin_url: null },
      last_contacted: null,
      current_workplace: [],
      references: { communications: [], books: [], podcasts: [], notes: [] },
      body_markdown: 'Private source body'
    }
  });

  const overview = await assembleEntityOverview(`shared:person:${id}`, {
    store,
    resolveEntity: makeResolveEntity(store, githubFetch({ people: [], organisations: [], relationships: [] }))
  });

  assert.equal(overview.entity.display_name, 'Removed record');
  assert.equal('professional_profile' in overview.entity, false);
});

test('linked_records buckets every linked kind — notes, projects, teaching and other are never dropped', async () => {
  const store = emptyStore();
  const fetchImpl = githubFetch({ people: PEOPLE, organisations: ORGANISATIONS, relationships: [] });
  const personId = derivePersonId('leg-person-1');
  const personRef = `shared:person:${personId}`;
  const incoming = [
    ['knowledge:page:note-1', 'page', 'Coaching notes'],
    ['tasks:project:project-1', 'project', 'Literacy push'],
    ['tasks:goal:goal-1', 'goal', 'Lead a faculty'],
    ['teaching:lesson:lesson-1', 'lesson', 'Poetry 3'],
    ['teaching:unit:unit-1', 'unit', 'Year 9 poetry'],
    ['life:decision:decision-1', 'decision', 'Take the role'],
    ['tasks:task:task-1', 'task', 'Send reference']
  ].map(([ref, kind, label], index) => ({
    link: {
      id: `link-${index}`,
      source_ref: ref,
      target_ref: personRef,
      relationship_type: 'tagged_with',
      status: 'current',
      temporal_mode: 'timeless',
      created_at: '2026-09-01T00:00:00.000Z'
    },
    endpoint: { ref, kind, display_label: label, supporting_label: null, href: null }
  }));

  const overview = await assembleEntityOverview(personRef, {
    store,
    env: GITHUB_ENV,
    fetchImpl,
    resolveEntity: makeResolveEntity(store, fetchImpl),
    createRepository: () => ({
      listForEntity: async () => ({ outgoing: [], incoming })
    })
  });

  const labels = (bucket) => overview.linked_records[bucket].map((item) => item.display_label);
  assert.deepEqual(labels('notes'), ['Coaching notes']);
  assert.deepEqual(labels('projects'), ['Literacy push', 'Lead a faculty']);
  assert.deepEqual(labels('teaching'), ['Poetry 3', 'Year 9 poetry']);
  assert.deepEqual(labels('other'), ['Take the role']);
  assert.deepEqual(labels('tasks'), ['Send reference']);
});
