import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrganisationProposal,
  buildPeopleProposal,
  createPeopleWriteExecutor,
  proposeOrganisationChangesSchema,
  proposePeopleChangesSchema,
  searchPeopleSchema
} from '../../netlify/functions/_shared/people-agent.mjs';
import { buildObservationProposal } from '../../netlify/functions/_shared/observation-agent.mjs';
import { buildRememberFactProposal } from '../../netlify/functions/_shared/remember-fact-agent.mjs';
import { observationKey, rememberFactKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import {
  classifyWriteTarget,
  executeProposeActionWrites,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  buildAgentTools,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import { IDENTITY_SCHEMA_VERSION, parsePersonRecord } from '../../netlify/functions/_shared/identity-schema.mjs';
import { formatEntityRef, parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { personKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';

function createMemoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
    _raw(key) {
      const value = map.get(key);
      return value ? JSON.parse(value) : null;
    },
    _keys() {
      return [...map.keys()];
    }
  };
}

const JO = 'shared:person:person_11111111-1111-1111-1111-111111111111';
const IMPORTED_ID = 'person_22222222-2222-2222-2222-222222222222';
const IMPORTED = `shared:person:${IMPORTED_ID}`;
const SCHOOL = 'shared:organisation:organisation_33333333-3333-3333-3333-333333333333';

const NAMES = new Map([
  [JO, 'Jo Example'],
  [IMPORTED, 'Pat Imported'],
  [SCHOOL, 'Example College']
]);
const nameForRef = async ref => NAMES.get(ref) ?? null;

function importedRecord() {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id: IMPORTED_ID,
    kind: 'person',
    display_name: 'Pat Imported',
    sort_name: null,
    aliases: [],
    lifecycle_status: 'active',
    is_self: false,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    professional_profile: { schema_version: 1, body: 'Imported profile' }
  };
}

// Resolves the fixed test entities plus any Person written to the store.
function resolverFor(store) {
  return async (refInput) => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const parsed = parseEntityRef(ref);
    if (NAMES.has(ref)) {
      return { ref, kind: parsed.kind, display_label: NAMES.get(ref), supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
    }
    const record = parsed?.kind === 'person' ? parsePersonRecord(await store.get(personKey(parsed.id), { type: 'json' })) : null;
    if (!record) throw Object.assign(new Error('not found'), { code: 'endpoint_not_found', status: 404 });
    return { ref, kind: 'person', display_label: record.display_name, supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
  };
}

test('people tools are offered to Clare, Hammond and Ann only', () => {
  resetCapabilityCaches();
  for (const slug of ['clare', 'hammond', 'ann']) {
    const names = buildAgentTools({ slug }).map(tool => tool.name);
    assert.ok(names.includes('search_people'), slug);
    assert.ok(names.includes('propose_people_changes'), slug);
    assert.ok(names.includes('propose_organisation_changes'), slug);
    assert.ok(names.includes('propose_observation'), slug);
    assert.ok(names.includes('propose_remember_fact'), slug);
    assert.equal(isPathAllowedForAgent(slug, 'people:person:new-sam', { mode: 'write' }), true, slug);
    assert.equal(isPathAllowedForAgent(slug, 'people:organisation:new-x', { mode: 'write' }), true, slug);
    assert.equal(isPathAllowedForAgent(slug, 'people:observation:new-1', { mode: 'write' }), true, slug);
    assert.equal(isPathAllowedForAgent(slug, 'people:remember:new-1', { mode: 'write' }), true, slug);
    assert.equal(isPathAllowedForAgent(slug, 'people:link:new-1', { mode: 'write' }), true, slug);
  }
  for (const slug of ['brisket', 'sara', 'vera', 'clementine']) {
    const names = buildAgentTools({ slug }).map(tool => tool.name);
    assert.ok(!names.includes('propose_people_changes'), slug);
    assert.ok(!names.includes('propose_observation'), slug);
    assert.equal(isPathAllowedForAgent(slug, 'people:person:new-sam', { mode: 'write' }), false, slug);
  }
  assert.equal(searchPeopleSchema().name, 'search_people');
  assert.equal(proposePeopleChangesSchema().name, 'propose_people_changes');
  assert.equal(proposeOrganisationChangesSchema().name, 'propose_organisation_changes');
});

test('classifyWriteTarget recognises people paths and rejects malformed ones', () => {
  assert.deepEqual(classifyWriteTarget('people:person:new-sam'), { store: 'people', kind: 'person', id: 'new-sam', path: 'people:person:new-sam' });
  assert.equal(classifyWriteTarget(`people:person:${IMPORTED_ID}`).store, 'people');
  assert.equal(classifyWriteTarget('people:link:new-2').kind, 'link');
  assert.equal(classifyWriteTarget('people:link:ul_abc').store, 'unknown');
  assert.equal(classifyWriteTarget('people:organisation:new-x').kind, 'organisation');
  assert.equal(classifyWriteTarget('people:observation:new-1').kind, 'observation');
  assert.equal(classifyWriteTarget('people:remember:new-1').kind, 'remember');
});

test('buildPeopleProposal turns add, edit and link into one Confirm proposal with readable lines', async () => {
  const built = await buildPeopleProposal({
    summary: 'Add Sam and link her to Jo; fix Pat\'s aliases',
    add_people: [{ key: 'sam', display_name: 'Sam Lee', aliases: ['Samantha Lee'] }],
    update_people: [{ ref: IMPORTED, aliases: ['Patrick', 'Pat'] }],
    links: [
      { from: 'new:sam', to: JO, relationship_type: 'professional_relationship', role: 'colleague' },
      { from: JO, to: SCHOOL, relationship_type: 'employee_at', role: 'Head of English' }
    ]
  }, { nameForRef });

  assert.equal(built.ok, true);
  const { writes } = built.proposal;
  assert.deepEqual(writes.map(write => write.path), [
    'people:person:new-sam',
    `people:person:${IMPORTED_ID}`,
    'people:link:new-1',
    'people:link:new-2'
  ]);
  assert.equal(writes[0].diff, 'Add person: Sam Lee');
  assert.match(writes[1].diff, /^Edit Pat Imported: aliases → Patrick, Pat$/);
  assert.equal(writes[2].diff, 'Link Sam Lee → Jo Example: colleague');
  assert.equal(writes[3].diff, 'Link Jo Example → Example College: employee at (Head of English)');
  assert.deepEqual(JSON.parse(writes[2].content), {
    source_ref: 'people:person:new-sam',
    target_ref: JO,
    relationship_type: 'professional_relationship',
    role: 'colleague'
  });
  const validated = validateProposeActionInput(built.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);
  const handedOff = validateProposeActionInput(built.proposal, { agentSlug: 'brisket' });
  assert.equal(handedOff.ok, true, handedOff.error);
  assert.ok(handedOff.proposal.writes.every(w => w.on_behalf_of));
});

test('buildPeopleProposal refuses unknown people, bad roles and wrong endpoint kinds', async () => {
  const cases = [
    [{ summary: 's' }, 'no_changes'],
    [{ summary: 's', update_people: [{ ref: 'shared:person:person_99999999-9999-9999-9999-999999999999', display_name: 'X' }] }, 'person_not_found'],
    [{ summary: 's', update_people: [{ ref: JO }] }, 'no_fields_to_update'],
    [{ summary: 's', links: [{ from: JO, to: IMPORTED, relationship_type: 'professional_relationship', role: 'best_friend' }] }, 'invalid_role'],
    [{ summary: 's', links: [{ from: JO, to: IMPORTED, relationship_type: 'professional_relationship' }] }, 'role_required'],
    [{ summary: 's', links: [{ from: JO, to: IMPORTED, relationship_type: 'employee_at' }] }, 'invalid_link_target_kind'],
    [{ summary: 's', links: [{ from: SCHOOL, to: JO, relationship_type: 'employee_at' }] }, 'invalid_link_source_kind'],
    [{ summary: 's', links: [{ from: 'new:ghost', to: JO, relationship_type: 'professional_relationship', role: 'colleague' }] }, 'invalid_link_from'],
    [{ summary: 's', links: [{ from: JO, to: JO, relationship_type: 'professional_relationship', role: 'colleague' }] }, 'self_link'],
    [{ summary: 's', links: [{ from: JO, to: IMPORTED, relationship_type: 'tagged_with' }] }, 'unsupported_relationship_type']
  ];
  for (const [input, error] of cases) {
    const built = await buildPeopleProposal(input, { nameForRef });
    assert.equal(built.ok, false, JSON.stringify(input));
    assert.equal(built.error, error, JSON.stringify(input));
  }
});

test('Confirm creates the new person, adopts and edits an imported person, and links through the new person', async () => {
  const store = createMemoryStore();
  const built = await buildPeopleProposal({
    summary: 'Add Sam, fix Pat, link Sam to Jo',
    add_people: [{ key: 'sam', display_name: 'Sam Lee' }],
    update_people: [{ ref: IMPORTED, display_name: 'Patrick Imported' }],
    links: [{ from: 'new:sam', to: JO, relationship_type: 'professional_relationship', role: 'mentor' }]
  }, { nameForRef });
  const people = createPeopleWriteExecutor({
    store,
    env: {},
    now: () => '2026-09-28T00:00:00.000Z',
    resolveEntity: resolverFor(store),
    getImportedPerson: async id => (id === IMPORTED_ID ? importedRecord() : null)
  });

  const result = await executeProposeActionWrites(null, { agent: 'clare', ...built.proposal }, { blobStores: { people } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const [created, edited, linked] = result.results;

  const samId = parseEntityRef(created.ref).id;
  assert.equal(store._raw(personKey(samId)).display_name, 'Sam Lee');

  assert.equal(edited.name, 'Patrick Imported');
  const adopted = store._raw(personKey(IMPORTED_ID));
  assert.equal(adopted.display_name, 'Patrick Imported');
  assert.equal(adopted.professional_profile.body, 'Imported profile', 'the imported profile survives adoption');

  assert.equal(linked.created, true);
  assert.match(linked.link_id, /^ul_/);
});

test('a link to a person whose Add line was unticked fails clearly instead of writing half a link', async () => {
  const store = createMemoryStore();
  const built = await buildPeopleProposal({
    summary: 'Add Sam and link her',
    add_people: [{ key: 'sam', display_name: 'Sam Lee' }],
    links: [{ from: 'new:sam', to: JO, relationship_type: 'professional_relationship', role: 'colleague' }]
  }, { nameForRef });
  const people = createPeopleWriteExecutor({ store, env: {}, resolveEntity: resolverFor(store) });
  const onlyLink = { agent: 'clare', ...built.proposal, writes: built.proposal.writes.filter(write => write.path.startsWith('people:link:')) };
  const result = await executeProposeActionWrites(null, onlyLink, { blobStores: { people } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'link_endpoint_not_created');
});

test('people writes without a bound people executor fail closed', async () => {
  const result = await executeProposeActionWrites(null, {
    agent: 'clare',
    intent: 'x',
    writes: [{ path: 'people:person:new-sam', mode: 'create', content: '{"display_name":"Sam"}' }]
  }, { blobStores: {} });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'people_store_unbound');
});

test('adoptImportedIdentity keeps the imported id, is idempotent, and refuses the self person', async () => {
  const store = createMemoryStore();
  const repo = createIdentityRepository({ store, now: () => '2026-09-28T00:00:00.000Z' });
  const first = await repo.adoptImportedIdentity({ kind: 'person', record: importedRecord() });
  assert.equal(first.adopted, true);
  assert.equal(first.ref, IMPORTED);
  const second = await repo.adoptImportedIdentity({ kind: 'person', record: importedRecord() });
  assert.equal(second.adopted, false);
  await assert.rejects(
    repo.adoptImportedIdentity({ kind: 'person', record: { ...importedRecord(), id: 'person_44444444-4444-4444-4444-444444444444', is_self: true } }),
    error => error.code === 'self_not_adoptable'
  );
});

test('search_people finds app-created people by name and returns refs the proposal tool accepts', async () => {
  const { searchPeopleForAgent } = await import('../../netlify/functions/_shared/people-agent.mjs');
  const store = createMemoryStore();
  const repo = createIdentityRepository({ store, now: () => '2026-09-28T00:00:00.000Z' });
  const { ref } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Sam Lee', aliases: ['Samantha'] } });
  await repo.createIdentity({ kind: 'person', input: { display_name: 'Jo Example' } });

  const found = await searchPeopleForAgent({ query: 'sam', store, env: {} });
  assert.equal(found.ok, true);
  assert.deepEqual(found.results.map(row => row.ref), [ref]);
  assert.equal(found.results[0].name, 'Sam Lee');

  assert.equal((await searchPeopleForAgent({ query: '  ', store, env: {} })).error, 'query_required');
});

test('buildPeopleProposal maps notes, LinkedIn and workplace into professional_profile', async () => {
  const built = await buildPeopleProposal({
    summary: 'Add notes for Jo',
    update_people: [{
      ref: JO,
      summary: 'Met at APST workshop',
      linkedin_url: 'https://www.linkedin.com/in/jo-example',
      current_workplace: ['Example College']
    }]
  }, { nameForRef });
  assert.equal(built.ok, true, built.error);
  const patch = JSON.parse(built.proposal.writes[0].content);
  assert.deepEqual(patch.professional_profile, {
    summary: 'Met at APST workshop',
    linkedin_url: 'https://www.linkedin.com/in/jo-example',
    current_workplace: ['Example College']
  });
  assert.match(built.proposal.writes[0].diff, /notes updated/);
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'clare' }).ok, true);
});

test('Confirm applies professional_profile on create', async () => {
  const store = createMemoryStore();
  const built = await buildPeopleProposal({
    summary: 'Add Sam with notes',
    add_people: [{
      key: 'sam',
      display_name: 'Sam Lee',
      summary: 'New hire',
      linkedin_url: 'https://www.linkedin.com/in/sam-lee',
      current_workplace: ['Example College']
    }]
  }, { nameForRef });
  const people = createPeopleWriteExecutor({
    store,
    env: {},
    now: () => '2026-09-28T00:00:00.000Z',
    resolveEntity: resolverFor(store)
  });
  const result = await executeProposeActionWrites(null, { agent: 'clare', ...built.proposal }, { blobStores: { people } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const samId = parseEntityRef(result.results[0].ref).id;
  const record = store._raw(personKey(samId));
  assert.equal(record.professional_profile.summary, 'New hire');
  assert.equal(record.professional_profile.contact.linkedin_url, 'https://www.linkedin.com/in/sam-lee');
  assert.deepEqual(record.professional_profile.current_workplace, ['Example College']);
});

test('buildOrganisationProposal and Confirm create an organisation', async () => {
  const built = await buildOrganisationProposal({
    summary: 'Add Example Uni',
    add_organisations: [{ key: 'uni', display_name: 'Example University', aliases: ['EU'] }]
  }, { nameForRef });
  assert.equal(built.ok, true, built.error);
  assert.equal(built.proposal.writes[0].path, 'people:organisation:new-uni');
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'ann' }).ok, true);

  const store = createMemoryStore();
  const people = createPeopleWriteExecutor({
    store,
    env: {},
    now: () => '2026-09-28T00:00:00.000Z',
    resolveEntity: resolverFor(store)
  });
  const result = await executeProposeActionWrites(null, { agent: 'ann', ...built.proposal }, { blobStores: { people } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.results[0].ref, /^shared:organisation:/);
});

test('propose_observation Confirm writes through professional store', async () => {
  const built = await buildObservationProposal({
    summary: 'Note about Jo',
    about_ref: JO,
    text: 'Considering a move next term.',
    source: 'manual'
  }, { nameForRef, nowIso: '2026-09-28T01:00:00.000Z' });
  assert.equal(built.ok, true, built.error);
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'hammond' }).ok, true);

  const identityStore = createMemoryStore();
  const professionalStore = createMemoryStore();
  const people = createPeopleWriteExecutor({
    store: identityStore,
    professionalStore,
    env: {},
    now: () => '2026-09-28T01:00:00.000Z',
    resolveEntity: resolverFor(identityStore)
  });
  const result = await executeProposeActionWrites(null, { agent: 'hammond', ...built.proposal }, { blobStores: { people } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const observationId = result.results[0].observation_id;
  assert.match(observationId, /^observation_/);
  assert.equal(professionalStore._raw(observationKey(observationId)).text, 'Considering a move next term.');
});

test('propose_remember_fact Confirm creates an Adam-authored fact', async () => {
  const built = await buildRememberFactProposal({
    summary: 'Remember Jo prefers email',
    person_ref: JO,
    text: 'Prefers email over phone'
  }, { nameForRef });
  assert.equal(built.ok, true, built.error);
  assert.equal(JSON.parse(built.proposal.writes[0].content).author, 'adam');
  assert.equal(validateProposeActionInput(built.proposal, { agentSlug: 'ann' }).ok, true);

  const identityStore = createMemoryStore();
  const professionalStore = createMemoryStore();
  const people = createPeopleWriteExecutor({
    store: identityStore,
    professionalStore,
    env: {},
    now: () => '2026-09-28T01:00:00.000Z',
    resolveEntity: resolverFor(identityStore)
  });
  const result = await executeProposeActionWrites(null, { agent: 'ann', ...built.proposal }, { blobStores: { people } });
  assert.equal(result.ok, true, JSON.stringify(result));
  const rememberId = result.results[0].remember_id;
  assert.equal(professionalStore._raw(rememberFactKey(rememberId)).author, 'adam');
  assert.equal(professionalStore._raw(rememberFactKey(rememberId)).text, 'Prefers email over phone');
});

test('people:person delete walks the lifecycle to deleted (redacted tombstone)', async () => {
  const store = createMemoryStore();
  const people = createPeopleWriteExecutor({ store, env: {}, resolveEntity: resolverFor(store), getImportedPerson: async () => null });
  const created = await executeProposeActionWrites(null, {
    agent: 'ann', intent: 'add', writes: [{ path: 'people:person:new-sam', mode: 'create', content: '{"display_name":"Sam Lee"}' }]
  }, { blobStores: { people } });
  assert.equal(created.ok, true, created.error);
  const ref = created.results[0].ref;
  const id = String(ref).split(':').pop();
  const deleted = await executeProposeActionWrites(null, {
    agent: 'ann', intent: 'delete Sam', writes: [{ path: `people:person:${id}`, mode: 'delete', content: '' }]
  }, { blobStores: { people } });
  assert.equal(deleted.ok, true, `${deleted.error} ${deleted.detail ?? ''}`);
  const repo = createIdentityRepository({ store });
  const record = await repo.loadEntity({ namespace: 'shared', kind: 'person', id });
  assert.equal(record.lifecycle_status, 'deleted');
  assert.notEqual(record.display_name, 'Sam Lee');
});
