// tests/unit/goal-entity.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTITY_REF_KINDS, parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { hrefForHubRef, labelForHubRef } from '../../netlify/functions/_shared/hub-ref.mjs';
import { RESOLVER_SLOTS, resolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { validateRelationshipInput } from '../../netlify/functions/_shared/relationship-registry.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 7) }, SECRET).token;

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

test('@ search returns goals and projects from their indexes', async () => {
  const tasksStore = memoryStore({
    'goals/_index': ['goal_ha', 'goal_x'],
    'goals/goal_ha': { id: 'goal_ha', title: 'Highly Accomplished evidence', sphere: 'professional', status: 'active' },
    'goals/goal_x': { id: 'goal_x', title: 'Unrelated', sphere: 'life', status: 'active' },
    'projects/_index': ['proj_ha'],
    'projects/proj_ha': { id: 'proj_ha', title: 'HA evidence portfolio', status: 'active' }
  });
  const handler = createEntitySearchHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    getTasksStore: async () => tasksStore,
    getProfessionalStore: async () => memoryStore()
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/entities/search?q=Highly&kinds=goal,project', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  }));
  assert.equal(response.status, 200);
  const { groups } = (await response.json()).data;
  assert.deepEqual(groups.goal.map(item => item.ref), ['tasks:goal:goal_ha']);
  assert.equal(groups.goal[0].href, '/tasks/#/goal/goal_ha');

  const projects = await handler(new Request('https://api.adam-russell.com/api/entities/search?q=HA&kinds=project', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  }));
  const projectGroups = (await projects.json()).data.groups;
  assert.deepEqual(projectGroups.project.map(item => item.ref), ['tasks:project:proj_ha']);
  assert.equal(projectGroups.project[0].href, '/tasks/#/project/proj_ha');
});
