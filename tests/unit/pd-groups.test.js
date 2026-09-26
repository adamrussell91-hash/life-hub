import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPdGroupId, validatePdGroupCreateInput } from '../../netlify/functions/_shared/pd-group-schema.mjs';
import { createPdGroupRepository } from '../../netlify/functions/_shared/pd-group-repository.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) { return map.has(key) ? (type === 'json' ? structuredClone(map.get(key)) : map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) { return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }; },
    _map: map
  };
}

test('pd group validation', () => {
  assert.equal(isValidPdGroupId('pd_group_00000000-0000-4000-8000-000000000001'), true);
  const input = validatePdGroupCreateInput({ shape: 'series', title: 'Warlight: Critical Study of Literature', provider: 'Warlight' });
  assert.equal(input.shape, 'series');
  assert.throws(() => validatePdGroupCreateInput({ shape: 'one_off', title: 'x' }), { code: 'invalid_shape' });
});

test('pd group repository', async () => {
  const store = memoryStore();
  const repo = createPdGroupRepository({ store, now: () => '2026-09-26T00:00:00.000Z', generateId: () => 'pd_group_00000000-0000-4000-8000-000000000001' });
  const group = await repo.createGroup({ shape: 'program', title: 'HPGE Conference 2026', provider: null });
  assert.equal((await repo.getGroup(group.id)).shape, 'program');
  assert.equal((await repo.listGroups()).length, 1);
  assert.equal((await repo.patchGroup(group.id, { title: 'HPGE Conference' })).title, 'HPGE Conference');
});
