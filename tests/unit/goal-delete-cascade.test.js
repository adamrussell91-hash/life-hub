// tests/unit/goal-delete-cascade.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { cascadeGoalDelete } from '../../netlify/functions/_shared/goal-delete.mjs';

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    },
    _map: map
  };
}

test('cascadeGoalDelete unlinks projects/tasks, drops the read, and clears someday links', async () => {
  const store = memoryStore({
    'projects/p1': { id: 'p1', title: 'P', parent_goal_id: 'goal_x', updated_at: 'a' },
    'projects/p2': { id: 'p2', title: 'Other', parent_goal_id: 'goal_y', updated_at: 'a' },
    'tasks/t1': { id: 't1', title: 'T', parent_goal_id: 'goal_x', updated_at: 'a' },
    'tasks/t2': { id: 't2', title: 'Dream', bucket: 'someday', linked_goal_ids: ['goal_x', 'goal_y'], updated_at: 'a' },
    'goal_reads/goal_x': { read: { goal_id: 'goal_x' }, dismissed: [] }
  });

  await cascadeGoalDelete(store, 'goal_x');

  assert.equal((await store.get('projects/p1', { type: 'json' })).parent_goal_id, null);
  assert.equal((await store.get('projects/p2', { type: 'json' })).parent_goal_id, 'goal_y');
  assert.equal((await store.get('tasks/t1', { type: 'json' })).parent_goal_id, null);
  assert.deepEqual((await store.get('tasks/t2', { type: 'json' })).linked_goal_ids, ['goal_y']);
  assert.equal(await store.get('goal_reads/goal_x', { type: 'json' }), null);
});
