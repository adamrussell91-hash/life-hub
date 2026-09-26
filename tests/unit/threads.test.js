import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidThreadId,
  parseThreadRecord,
  validateThreadCreateInput,
  validateThreadPatchInput
} from '../../netlify/functions/_shared/thread-schema.mjs';
import { createThreadRepository } from '../../netlify/functions/_shared/thread-repository.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      return type === 'json' ? structuredClone(map.get(key)) : map.get(key);
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

test('thread ids and create validation', () => {
  assert.equal(isValidThreadId('thread_00000000-0000-4000-8000-000000000001'), true);
  assert.equal(isValidThreadId('thread_x'), false);
  const input = validateThreadCreateInput({ kind: 'case', title: 'Fletcher W. · case management', purpose_tag: 'Case Management' });
  assert.equal(input.purpose_tag, 'case management');
  assert.deepEqual(input.goals, []);
  assert.throws(() => validateThreadCreateInput({ kind: 'saga', title: 'x' }), { code: 'invalid_kind' });
  assert.throws(() => validateThreadCreateInput({ kind: 'general', title: '' }), { code: 'invalid_title' });
});

test('goals only on case threads; progress is 0–100', () => {
  const patch = validateThreadPatchInput({ goals: [{ id: 'g1', text: 'Maths C → B', progress: 62 }] }, 'case');
  assert.equal(patch.goals[0].progress, 62);
  assert.throws(() => validateThreadPatchInput({ goals: [{ id: 'g1', text: 'x', progress: 140 }] }, 'case'), { code: 'invalid_goals' });
  assert.throws(() => validateThreadPatchInput({ goals: [{ id: 'g1', text: 'x', progress: 10 }] }, 'general'), { code: 'goals_need_case' });
});

test('repository create / get / list / patch', async () => {
  const store = memoryStore();
  const repo = createThreadRepository({
    store,
    now: () => '2026-09-26T00:00:00.000Z',
    generateId: () => 'thread_00000000-0000-4000-8000-000000000001'
  });
  const thread = await repo.createThread({ kind: 'case', title: 'Fletcher W. · case management', purpose_tag: 'case management' });
  assert.equal(thread.status, 'open');
  assert.equal((await repo.getThread(thread.id)).title, 'Fletcher W. · case management');
  assert.equal((await repo.listThreads()).length, 1);
  const patched = await repo.patchThread(thread.id, { goals: [{ id: 'g1', text: 'Maths C → B', progress: 62 }] });
  assert.equal(patched.goals.length, 1);
  assert.ok(parseThreadRecord(store._map.get(`threads/records/${thread.id}`)));
  await assert.rejects(() => repo.getThread('thread_00000000-0000-4000-8000-000000000009'), { code: 'thread_not_found' });
});
