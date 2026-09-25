// tests/unit/goal-entity.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTITY_REF_KINDS, parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { hrefForHubRef, labelForHubRef } from '../../netlify/functions/_shared/hub-ref.mjs';
import { RESOLVER_SLOTS, resolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { validateRelationshipInput } from '../../netlify/functions/_shared/relationship-registry.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      return type === 'json' ? structuredClone(map.get(key)) : map.get(key);
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

test('goal is a registered tasks kind with an href', () => {
  assert.equal(ENTITY_REF_KINDS.tasks.has('goal'), true);
  assert.deepEqual(parseEntityRef('tasks:goal:goal_ha'), { namespace: 'tasks', kind: 'goal', id: 'goal_ha' });
  assert.equal(hrefForHubRef({ hub: 'tasks', kind: 'goal', id: 'goal_ha' }), '/tasks/#/goal/goal_ha');
  assert.equal(labelForHubRef({ hub: 'tasks', kind: 'goal', id: 'goal_ha' }), 'Tasks goal goal_ha');
});

test('resolveEntity returns the goal projection and 404s a missing one', async () => {
  assert.ok(RESOLVER_SLOTS['tasks:goal']);
  const store = memoryStore({ 'goals/goal_ha': { id: 'goal_ha', title: 'HA evidence', sphere: 'professional', status: 'active' } });
  const context = createAccessContext({ workflow: 'tasks' });
  const resolved = await resolveEntity('tasks:goal:goal_ha', context, { getStore: async () => store });
  assert.deepEqual(resolved, {
    ref: 'tasks:goal:goal_ha',
    kind: 'goal',
    display_label: 'HA evidence',
    supporting_label: 'professional',
    href: '/tasks/#/goal/goal_ha',
    lifecycle_status: 'active',
    visibility: 'operator'
  });
  await assert.rejects(
    () => resolveEntity('tasks:goal:goal_missing', context, { getStore: async () => store }),
    error => error.status === 404
  );
});

test('anything can be tagged_with a goal, both ways', () => {
  // Deviation: validateRelationshipInput expects parsed EntityRef objects, not strings.
  const goal = parseEntityRef('tasks:goal:goal_ha');
  const page = parseEntityRef('knowledge:page:page_1');
  const task = parseEntityRef('tasks:task:t1');
  assert.equal(validateRelationshipInput({ sourceRef: page, targetRef: goal, relationshipType: 'tagged_with' }).key, 'tagged_with');
  assert.equal(validateRelationshipInput({ sourceRef: goal, targetRef: task, relationshipType: 'tagged_with' }).key, 'tagged_with');
});
