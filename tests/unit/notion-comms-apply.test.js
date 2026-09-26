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
