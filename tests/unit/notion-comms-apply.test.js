import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImportPlan } from '../../scripts/lib/notion-comms/apply.mjs';

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
