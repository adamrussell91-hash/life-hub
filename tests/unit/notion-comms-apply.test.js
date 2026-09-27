import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportPlan } from '../../scripts/lib/notion-comms/apply.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import { createCommunicationRepository } from '../../netlify/functions/_shared/communication-repository.mjs';
import { createThreadRepository } from '../../netlify/functions/_shared/thread-repository.mjs';
import { createLedgerItemRepository } from '../../netlify/functions/_shared/ledger-repository.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';
import { resolveEntity as defaultResolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';

function memoryStore() {
  const values = new Map();
  return {
    async get(key, { type } = {}) { const value = values.get(key) ?? null; return type === 'json' && value ? structuredClone(value) : value; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) { return { blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('applyImportPlan writes people before records and records each import mapping', async () => {
  const calls = []; const maps = new Map();
  await applyImportPlan({ peopleToCreate: [{ display_name: 'Sam K.', aliases: [] }], records: [{ notionId: 'a'.repeat(32), kind: 'comm', subject: 'Check-in', channel: 'email', direction: 'outbound', date: { start: '2026-09-01T00:00:00.000Z' }, people: [] }], threads: [], promises: [] }, {
    identityRepo: { createIdentity: async () => { calls.push('person'); return { ref: 'shared:person:p_1' }; } },
    communicationRepo: { createCommunication: async () => { calls.push('comm'); return { communication: { id: 'c_1' } }; }, updateCommunication: async () => {} },
    setMap: async (key, value) => maps.set(key, value), sleep: async () => {}
  });
  assert.deepEqual(calls, ['person', 'comm']);
  assert.deepEqual(maps.get(`imports/notion-comms/pages/${'a'.repeat(32)}`), { kind: 'comm', id: 'c_1' });
});

test('applyImportPlan annotates record failures with the safe source identifier', async () => {
  const notionId = 'b'.repeat(32);
  await assert.rejects(
    applyImportPlan({
      peopleToCreate: [],
      records: [{ notionId, kind: 'comm', subject: 'Fixture only', channel: 'email', direction: 'outbound', date: { start: '2026-09-01T00:00:00.000Z' }, people: [] }],
      threads: [], promises: []
    }, {
      communicationRepo: { createCommunication: async () => { throw new Error('store unavailable'); } },
      setMap: async () => {}, sleep: async () => {}
    }),
    (error) => error.importStage === 'record' && error.notionId === notionId
  );
});

test('applyImportPlan patches dismissed promises after creation and retains normalised pending refs', async () => {
  const created = []; const patched = [];
  const identityRepo = { createIdentity: async ({ input }) => ({ ref: `shared:person:${input.display_name}` }) };
  const communicationRepo = { createCommunication: async () => ({ communication: { id: 'c_2' } }), updateCommunication: async () => {} };
  const ledgerRepo = { createItem: async (item) => { created.push(item); return { item: { id: 'ledger_1' }, created: true }; }, patchItem: async (id, patch) => patched.push({ id, patch }) };
  await applyImportPlan({
    peopleToCreate: [{ display_name: 'Avery P.', aliases: [], sourceKey: 'avery p.' }],
    records: [{ notionId: 'd'.repeat(32), kind: 'comm', subject: 'Hello', title: 'Hello', people: ['pending:avery p.'], date: { start: '2026-09-20T00:00:00.000Z' }, channel: 'email', direction: 'outbound', blocks: [], summary: '' }],
    threads: [],
    promises: [{ commNotionId: 'd'.repeat(32), personRef: 'pending:avery p.', direction: 'you_owe', text: 'Follow up', due: null, status: 'dismissed', source_key: 'source' }]
  }, { identityRepo, communicationRepo, meetingRepo: {}, eventRepo: {}, threadRepo: { createThread: async () => ({ id: 'thread_1' }) }, ledgerRepo, setMap: async () => {}, sleep: async () => {} });
  assert.equal(created[0].person_ref, 'shared:person:Avery P.');
  assert.deepEqual(patched, [{ id: 'ledger_1', patch: { status: 'dismissed' } }]);
});

test('applyImportPlan writes schedule and blocks, then links records to their selected threads', async () => {
  const creations = []; const patches = []; const links = [];
  await applyImportPlan({
    peopleToCreate: [],
    records: [{ notionId: 'e'.repeat(32), kind: 'comm', subject: 'Update', channel: 'email', direction: 'outbound', date: { start: '2026-09-01T00:00:00.000Z', end: '2026-09-01T01:00:00.000Z', timeZone: 'Australia/Sydney' }, people: ['shared:person:p_1'], blocks: [{ id: 'notion_0' }], summary: 'Summary', purpose_tag: 'case management' }],
    threads: [{ key: 'case:sam k.', kind: 'case', title: 'Sam K. · case management', purpose_tag: 'case management' }],
    recordThreadKeys: new Map([['e'.repeat(32), 'case:sam k.']]), promises: []
  }, {
    communicationRepo: { createCommunication: async (input) => { creations.push(input); return { communication: { id: 'comm_1' } }; }, updateCommunication: async (id, input) => patches.push({ id, input }) },
    threadRepo: { createThread: async () => ({ id: 'thread_1' }) },
    linkRepo: { createLink: async (input) => links.push(input) }, setMap: async () => {}, sleep: async () => {}
  });
  assert.equal(creations[0].scheduled_start, '2026-09-01T00:00:00.000Z');
  assert.equal(creations[0].purpose_tag, 'case management');
  assert.deepEqual(patches, [{ id: 'comm_1', input: { blocks: [{ id: 'notion_0' }], summary: 'Summary' } }]);
  assert.deepEqual(links, [{ source_ref: 'professional:communication:comm_1', target_ref: 'professional:thread:thread_1', relationship_type: 'in_thread' }]);
});

test('applyImportPlan uses the real repositories and a second planned run creates nothing', async () => {
  const professional = memoryStore(); const universal = memoryStore(); const context = createAccessContext({ workflow: 'professional' });
  const resolveEntity = (ref, accessContext) => defaultResolveEntity(ref, accessContext, { getStore: async () => (typeof ref === 'string' && ref.startsWith('shared:')) ? universal : professional });
  const linkRepo = createUniversalLinkRepository({ store: universal, resolveEntity, now: () => '2026-09-27T00:00:00.000Z' });
  const communicationRepo = createCommunicationRepository({ store: professional, now: () => '2026-09-27T00:00:00.000Z', generateId: () => 'communication_00000000-0000-4000-8000-000000000001', resolveEntity, getUniversalLinkStore: async () => universal });
  const threadRepo = createThreadRepository({ store: professional, now: () => '2026-09-27T00:00:00.000Z', generateId: () => 'thread_00000000-0000-4000-8000-000000000001' });
  const maps = new Map(); const setMap = async (key, value) => maps.set(key, value);
  const first = {
    peopleToCreate: [{ display_name: 'Sam K.', aliases: [], sourceKey: 'sam k.' }],
    records: [{ notionId: 'f'.repeat(32), kind: 'comm', subject: 'Case update', channel: 'email', direction: 'outbound', date: { start: '2026-09-20T00:00:00.000Z', end: null, timeZone: 'Australia/Sydney' }, people: ['pending:sam k.'], blocks: [{ id: 'notion_0', block_type: 'rich_text', variant: 'medium', content: { html: '<p>Imported</p>' } }], summary: 'Invented fixture' }],
    threads: [{ key: 'case:sam k.', kind: 'case', title: 'Sam K. · case management', purpose_tag: 'case management' }], recordThreadKeys: new Map([['f'.repeat(32), 'case:sam k.']]),
    promises: [{ commNotionId: 'f'.repeat(32), personRef: 'pending:sam k.', direction: 'you_owe', text: 'Follow up', due: null, status: 'open' }]
  };
  const deps = { identityRepo: createIdentityRepository({ store: universal }), communicationRepo, threadRepo, ledgerRepo: createLedgerItemRepository({ store: professional }), linkRepo, accessContext: context, setMap, sleep: async () => {} };
  const result = await applyImportPlan(first, deps);
  assert.deepEqual(result, { createdRecords: 1, createdPeople: 1 });
  const comm = await communicationRepo.getCommunication('communication_00000000-0000-4000-8000-000000000001');
  assert.equal(comm.blocks[0].content.html, '<p>Imported</p>');
  const outgoing = await linkRepo.listOutgoing('professional:communication:communication_00000000-0000-4000-8000-000000000001', context);
  assert.deepEqual(new Set(outgoing.map(({ link }) => link.relationship_type)), new Set(['recipient', 'in_thread']));
  const second = { ...first, peopleToCreate: [], records: [], threads: [{ ...first.threads[0], reuse: 'thread_00000000-0000-4000-8000-000000000001' }], existingRecordRefs: new Map([['f'.repeat(32), 'professional:communication:communication_00000000-0000-4000-8000-000000000001']]), recordThreadKeys: first.recordThreadKeys };
  assert.deepEqual(await applyImportPlan(second, deps), { createdRecords: 0, createdPeople: 0 });
});
