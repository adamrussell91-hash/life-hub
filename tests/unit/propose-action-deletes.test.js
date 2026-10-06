import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProposeActionInput,
  executeProposeActionWrites
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    map,
    async get(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, JSON.stringify(value)); },
    async delete(key) { map.delete(key); }
  };
}

test('Tasks delete is a valid proposal and removes the record and its index entry on Confirm', async () => {
  resetCapabilityCaches();
  const validated = validateProposeActionInput({
    intent: 'delete the stale task',
    writes: [{ path: 'tasks:task:task_old', mode: 'delete', content: '' }]
  }, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);
  assert.match(validated.proposal.writes[0].diff, /permanently delete/);

  const tasks = memoryStore({
    'tasks/task_old': { id: 'task_old', title: 'Old' },
    'tasks/task_keep': { id: 'task_keep', title: 'Keep' },
    'tasks/_index': ['task_old', 'task_keep']
  });
  const out = await executeProposeActionWrites(null, validated.proposal, { blobStores: { tasks } });
  assert.equal(out.ok, true, out.error);
  assert.equal(tasks.map.has('tasks/task_old'), false);
  assert.deepEqual(JSON.parse(tasks.map.get('tasks/_index')), ['task_keep']);
});

test('Goal and project deletes go through; a missing record is skipped, not an error', async () => {
  resetCapabilityCaches();
  const validated = validateProposeActionInput({
    intent: 'delete goal and project',
    writes: [
      { path: 'tasks:goal:goal_a', mode: 'delete', content: '' },
      { path: 'tasks:project:proj_gone', mode: 'delete', content: '' }
    ]
  }, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);
  const tasks = memoryStore({ 'goals/goal_a': { id: 'goal_a' }, 'goals/_index': ['goal_a'] });
  const out = await executeProposeActionWrites(null, validated.proposal, { blobStores: { tasks } });
  assert.equal(out.ok, true, out.error);
  assert.equal(tasks.map.has('goals/goal_a'), false);
  assert.deepEqual(JSON.parse(tasks.map.get('goals/_index')), []);
  assert.equal(out.results?.[1]?.skipped ?? true, true);
});

import { createProfessionalWriteExecutor } from '../../netlify/functions/_shared/professional-write-executor.mjs';
import { createTravelWriteExecutor } from '../../netlify/functions/_shared/travel-agent.mjs';
import { createKnowledgeWriteExecutor } from '../../netlify/functions/_shared/knowledge-page-agent.mjs';
import { meetingKey, meetingIndexKey } from '../../netlify/functions/_shared/professional-blobs.mjs';

test('People, Travel, Knowledge and Professional deletes validate (Confirm card is the approval)', () => {
  resetCapabilityCaches();
  for (const path of [
    'people:person:per_abc',
    'people:organisation:org_abc',
    'travel:trip:trip_bali',
    'knowledge:page:page_abc',
    'professional:meeting:mtg_abc',
    'professional:communication:com_abc'
  ]) {
    const v = validateProposeActionInput({
      intent: `delete ${path}`,
      writes: [{ path, mode: 'delete', content: '' }]
    }, { agentSlug: 'hammond' });
    assert.equal(v.ok, true, `${path}: ${v.error} ${v.detail ?? ''}`);
  }
});

test('Professional delete removes the record and its index row', async () => {
  const id = 'meeting_0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
  const rk = meetingKey(id);
  const ik = meetingIndexKey(id);
  const store = memoryStore({ [rk]: { id }, [ik]: { id } });
  const exec = createProfessionalWriteExecutor({ store, env: {} });
  const out = await exec.apply({ path: `professional:meeting:${id}`, mode: 'delete', content: '' }, { kind: 'meeting', id });
  assert.equal(out.ok, true, out.error);
  assert.equal(store.map.has(rk), false);
  assert.equal(store.map.has(ik), false);
});

test('Travel delete deletes the trip at its current version; missing trip is skipped', async () => {
  const calls = [];
  const repo = {
    async getTrip(id) {
      if (id === 'trip_gone') throw Object.assign(new Error('nf'), { code: 'not_found' });
      return { trip: { id }, version: 'sha1' };
    },
    async deleteTrip(id, version) { calls.push([id, version]); return { id, deleted: true }; }
  };
  const exec = createTravelWriteExecutor({ env: {}, createRepo: () => repo });
  const out = await exec.apply({ path: 'travel:trip:trip_bali', mode: 'delete', content: '' }, { id: 'trip_bali' });
  assert.equal(out.ok, true, out.error);
  assert.deepEqual(calls, [['trip_bali', 'sha1']]);
  const gone = await exec.apply({ path: 'travel:trip:trip_gone', mode: 'delete', content: '' }, { id: 'trip_gone' });
  assert.equal(gone.result.skipped, true);
});

test('Knowledge delete calls deletePage', async () => {
  const deleted = [];
  const exec = createKnowledgeWriteExecutor({ env: {}, deletePage: async (id) => { deleted.push(id); return { id, deleted: true }; } });
  const out = await exec.apply({ path: 'knowledge:page:page_abc', mode: 'delete', content: '' }, { id: 'page_abc' });
  assert.equal(out.ok, true, out.error);
  assert.deepEqual(deleted, ['page_abc']);
});
