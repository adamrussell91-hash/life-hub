import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitiesHandler } from '../../netlify/functions/entities.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';
import { createEntityOverviewHandler } from '../../netlify/functions/entity-overview.mjs';
import { createUniversalLinksHandler } from '../../netlify/functions/universal-links.mjs';
import { createCommunicationsHandler } from '../../netlify/functions/communications.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import { resolveCommunication, resolvePerson, resolveOrganisation, resolveTask } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { communicationKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function request(url, { method = 'GET', body, cookie = true } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      origin: 'https://life-hub.adam-russell.com',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

test('synthetic Seth vertical workflow: roles, task contact, communication, follow-up, archive', async () => {
  const ulStore = memoryStore();
  const professionalStore = memoryStore();
  const tasksStore = memoryStore();

  const resolveEntity = async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { ...options, getStore: async () => ulStore });
    }
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, { ...options, getStore: async () => ulStore });
    }
    if (ref.namespace === 'professional' && ref.kind === 'communication') {
      return resolveCommunication(ref.id, accessContext, { getStore: async () => professionalStore });
    }
    if (ref.namespace === 'tasks' && ref.kind === 'task') {
      return resolveTask(ref.id, accessContext, { getStore: async () => tasksStore });
    }
    throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
  };

  const entities = createEntitiesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    identityNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => ulStore
  });
  const links = createUniversalLinksHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => ulStore,
    resolveEntity
  });
  const search = createEntitySearchHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => ulStore
  });
  const overview = createEntityOverviewHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => ulStore,
    resolveEntity
  });
  const communications = createCommunicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    communicationNow: () => '2026-09-12T10:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => ulStore,
    resolveEntity
  });

  // 1. Create Seth Example
  const sethRes = await entities(request('https://api.adam-russell.com/api/entities', {
    method: 'POST',
    body: { kind: 'person', display_name: 'Seth Example', sort_name: 'Example, Seth' }
  }));
  assert.equal(sethRes.status, 201);
  const seth = (await sethRes.json()).data;
  const sethRef = seth.ref;

  // 2. Create Example University and link Seth
  const orgRes = await entities(request('https://api.adam-russell.com/api/entities', {
    method: 'POST',
    body: { kind: 'organisation', display_name: 'Example University' }
  }));
  const org = (await orgRes.json()).data;

  // 3. Two concurrent dated roles in separate contexts
  for (const role of [
    { role: 'Gifted Education Teacher', context_key: 'Teaching Faculty', valid_from: '2023-01-15' },
    { role: 'Research Associate', context_key: 'Research Lab', valid_from: '2023-06-01' }
  ]) {
    const linkRes = await links(request('https://api.adam-russell.com/api/universal-links', {
      method: 'POST',
      body: {
        source_ref: sethRef,
        target_ref: org.ref,
        relationship_type: 'employee_at',
        role: role.role,
        context_key: role.context_key,
        valid_from: role.valid_from
      }
    }));
    assert.ok(linkRes.status === 201 || linkRes.status === 200);
  }

  // 4. Roles on Seth timeline
  const overviewRes = await overview(request(`https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(sethRef)}`));
  const overviewBody = await overviewRes.json();
  assert.equal(overviewBody.data.current_relationships.length >= 2, true);
  assert.equal(overviewBody.data.timeline.length >= 2, true);

  // 5–6. Task "Email Seth about the proposal" + contact link (Task JSON has no person id)
  const taskId = 'task_email_seth_proposal';
  await tasksStore.setJSON(taskKey(taskId), {
    id: taskId,
    title: 'Email Seth about the proposal',
    status: 'open',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    contexts: [{ kind: 'person', value: 'free text remains' }]
  });
  const contactRes = await links(request('https://api.adam-russell.com/api/universal-links', {
    method: 'POST',
    body: {
      source_ref: `tasks:task:${taskId}`,
      target_ref: sethRef,
      relationship_type: 'contact'
    }
  }));
  assert.ok(contactRes.status === 201 || contactRes.status === 200);
  const storedTask = await tasksStore.get(taskKey(taskId), { type: 'json' });
  assert.equal(Object.prototype.hasOwnProperty.call(storedTask, 'person_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storedTask, 'universal_link_id'), false);
  assert.equal(storedTask.title, 'Email Seth about the proposal');

  // 7–8. Outbound Communication linked to Seth + Task
  const commRes = await communications(request('https://api.adam-russell.com/api/communications', {
    method: 'POST',
    body: {
      direction: 'outbound',
      channel: 'email',
      occurred_at: '2026-09-12T10:00:00.000Z',
      subject: 'Proposal',
      summary: 'Sent the proposal to Seth',
      links: [
        {
          target_ref: sethRef,
          relationship_type: 'recipient',
          occurred_at: '2026-09-12T10:00:00.000Z'
        },
        {
          target_ref: `tasks:task:${taskId}`,
          relationship_type: 'follows_from'
        }
      ]
    }
  }));
  assert.equal(commRes.status, 201);
  const communication = (await commRes.json()).data.communication;
  const storedComm = await professionalStore.get(communicationKey(communication.id), { type: 'json' });
  assert.equal(Object.prototype.hasOwnProperty.call(storedComm, 'recipient_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storedComm, 'task_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storedComm, 'links'), false);

  // 9. Follow-up Task linked to Seth + Communication
  const followUpId = 'task_follow_up_seth';
  await tasksStore.setJSON(taskKey(followUpId), {
    id: followUpId,
    title: 'Follow up: Proposal',
    status: 'open'
  });
  await links(request('https://api.adam-russell.com/api/universal-links', {
    method: 'POST',
    body: {
      source_ref: `tasks:task:${followUpId}`,
      target_ref: `professional:communication:${communication.id}`,
      relationship_type: 'follow_up'
    }
  }));
  await links(request('https://api.adam-russell.com/api/universal-links', {
    method: 'POST',
    body: {
      source_ref: `tasks:task:${followUpId}`,
      target_ref: sethRef,
      relationship_type: 'contact'
    }
  }));
  const followUpStored = await tasksStore.get(taskKey(followUpId), { type: 'json' });
  assert.equal(Object.prototype.hasOwnProperty.call(followUpStored, 'communication_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(followUpStored, 'person_id'), false);

  // 10. Seth overview shows org, roles, tasks, communication
  const finalOverview = await (
    await overview(request(`https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(sethRef)}`))
  ).json();
  assert.ok(finalOverview.data.linked_records.organisations.length >= 1);
  assert.ok(finalOverview.data.linked_records.tasks.length >= 1);
  assert.ok(finalOverview.data.linked_records.communications.length >= 1);

  // 11. End one relationship; history retained
  const current = finalOverview.data.current_relationships[0];
  const endRes = await links(request(
    `https://api.adam-russell.com/api/universal-links?id=${encodeURIComponent(current.link.id)}&action=end`,
    { method: 'PATCH', body: { valid_to: '2026-09-01' } }
  ));
  assert.equal(endRes.status, 200);
  const afterEnd = await (
    await overview(request(`https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(sethRef)}`))
  ).json();
  assert.ok(afterEnd.data.historical_relationships.length >= 1);

  // 12–13. Archive Seth; ordinary search hides; archive search finds
  await entities(request(`https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(sethRef)}&action=archive`, {
    method: 'PATCH',
    body: {}
  }));
  const ordinary = await (
    await search(request('https://api.adam-russell.com/api/entities/search?q=Seth&kinds=person'))
  ).json();
  assert.equal(ordinary.data.groups.person.some((item) => item.ref === sethRef), false);
  const archived = await (
    await search(request('https://api.adam-russell.com/api/entities/search?q=Seth&kinds=person&include_archived=true'))
  ).json();
  assert.equal(archived.data.groups.person.some((item) => item.ref === sethRef), true);
});

test('APIs reject unauthenticated requests and disallowed origins', async () => {
  const handler = createCommunicationsHandler({
    env,
    getContentStore: async () => memoryStore()
  });
  const unauth = await handler(request('https://api.adam-russell.com/api/communications', { cookie: false }));
  assert.equal(unauth.status, 401);
  const badOrigin = await handler(new Request('https://api.adam-russell.com/api/communications', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://evil.example.com' }
  }));
  assert.equal(badOrigin.status, 403);
});
