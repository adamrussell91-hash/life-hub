import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createCommunicationsHandler } from '../../netlify/functions/communications.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import {
  resolveCommunication,
  resolvePerson,
  resolveTask
} from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  {
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  },
  SECRET
).token;

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/communications',
  method = 'GET',
  body
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

async function seedPerson(store, displayName = 'Seth Example') {
  const identity = createIdentityRepository({
    store,
    now: () => '2026-08-01T01:00:00.000Z'
  });
  const { record, ref } = await identity.createIdentity({
    kind: 'person',
    input: { display_name: displayName }
  });
  return { record, ref };
}

function makeHandler({
  professionalStore,
  universalStore,
  tasksStore,
  linkCreateImpl,
  listForEntityImpl,
  createTaskId
}) {
  const resolveEntity = async (refInput, accessContext) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref.namespace === 'professional' && ref.kind === 'communication') {
      return resolveCommunication(ref.id, accessContext, {
        getStore: async () => professionalStore
      });
    }
    if (ref.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { getStore: async () => universalStore });
    }
    if (ref.namespace === 'tasks' && ref.kind === 'task') {
      return resolveTask(ref.id, accessContext, { getStore: async () => tasksStore });
    }
    throw Object.assign(new Error('not found'), { status: 404, code: 'endpoint_not_found' });
  };

  return createCommunicationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    communicationNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => professionalStore,
    getUniversalLinkStore: async () => universalStore,
    getTasksStore: async () => tasksStore,
    createTaskId,
    resolveEntity,
    createUniversalLinkRepository: () => ({
      createLink: linkCreateImpl,
      listForEntity: listForEntityImpl,
      getLink: async (id) => ({ link: { id } })
    })
  });
}

async function createCommunicationWithRecipient(handler, personRef) {
  const response = await handler(
    request({
      method: 'POST',
      body: {
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        subject: 'Proposal',
        summary: 'Spoke with Seth',
        links: [
          {
            target_ref: personRef,
            relationship_type: 'recipient',
            occurred_at: '2026-09-01T10:00:00.000Z'
          }
        ]
      }
    })
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  return body.data.communication;
}

test('follow-up: recipient lookup failure after Task create survives reload and retries the same Task', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const tasksStore = memoryStore();
  const { ref: personRef } = await seedPerson(universalStore);
  let listCalls = 0;
  let taskIdCounter = 0;
  const createdLinks = [];

  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore,
    createTaskId: () => {
      taskIdCounter += 1;
      return `task_follow_${taskIdCounter}`;
    },
    listForEntityImpl: async () => {
      listCalls += 1;
      if (listCalls === 1) {
        throw Object.assign(new Error('recipient lookup failed'), {
          status: 503,
          code: 'recipient_lookup_failed'
        });
      }
      return {
        outgoing: [
          {
            link: {
              id: 'ul_recipient',
              status: 'current',
              relationship_type: 'recipient',
              target_ref: personRef
            }
          }
        ],
        incoming: []
      };
    },
    linkCreateImpl: async (input) => {
      createdLinks.push(input);
      return {
        link: { id: `ul_${createdLinks.length}`, ...input, status: 'current' },
        created: true
      };
    }
  });

  const communication = await createCommunicationWithRecipient(handler, personRef);

  const first = await handler(
    request({
      method: 'POST',
      url: `https://api.adam-russell.com/api/communications?id=${communication.id}&action=create-follow-up`,
      body: { title: 'Follow up: Proposal' }
    })
  );
  assert.equal(first.status, 503);
  const firstBody = await first.json();
  assert.equal(firstBody.error.code, 'follow_up_operation_incomplete');
  assert.equal(firstBody.error.retryable, true);
  assert.equal(firstBody.data.task_id, 'task_follow_1');
  assert.equal(taskIdCounter, 1);

  const reload = await handler(
    request({ url: `https://api.adam-russell.com/api/communications?id=${communication.id}` })
  );
  assert.equal(reload.status, 200);
  const reloadBody = await reload.json();
  assert.equal(reloadBody.data.communication.follow_up_operation.status, 'incomplete');
  assert.equal(reloadBody.data.communication.follow_up_operation.task_id, 'task_follow_1');

  const retry = await handler(
    request({
      method: 'POST',
      url: `https://api.adam-russell.com/api/communications?id=${communication.id}&action=retry-follow-up`,
      body: {}
    })
  );
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.equal(retryBody.data.task_id, 'task_follow_1');
  assert.equal(retryBody.data.created_task, false);
  assert.equal(retryBody.data.follow_up_operation.status, 'committed');
  assert.equal(taskIdCounter, 1);

  const storedTask = await tasksStore.get(taskKey('task_follow_1'), { type: 'json' });
  assert.equal(storedTask.title, 'Follow up: Proposal');
  assert.equal(Object.prototype.hasOwnProperty.call(storedTask, 'communication_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storedTask, 'person_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storedTask, 'universal_link_id'), false);
});

test('follow-up: partial link failure, repeated retry, completed reload, concurrent clicks', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const tasksStore = memoryStore();
  const { ref: personRef } = await seedPerson(universalStore);
  let taskIdCounter = 0;
  let failContactOnce = true;
  const createdLinks = [];

  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore,
    createTaskId: () => {
      taskIdCounter += 1;
      return `task_follow_${taskIdCounter}`;
    },
    listForEntityImpl: async (ref) => {
      if (String(ref).startsWith('professional:communication:')) {
        return {
          outgoing: [
            {
              link: {
                id: 'ul_recipient',
                status: 'current',
                relationship_type: 'recipient',
                source_ref: String(ref),
                target_ref: personRef
              }
            }
          ],
          incoming: []
        };
      }
      return { outgoing: [], incoming: [] };
    },
    linkCreateImpl: async (input) => {
      if (input.relationship_type === 'contact' && failContactOnce) {
        failContactOnce = false;
        throw Object.assign(new Error('contact write failed'), {
          status: 503,
          code: 'link_write_failed'
        });
      }
      const existing = createdLinks.find(
        (item) =>
          item.source_ref === input.source_ref &&
          item.target_ref === input.target_ref &&
          item.relationship_type === input.relationship_type
      );
      if (existing) {
        return { link: { id: existing.id, ...existing }, created: false };
      }
      const link = { id: `ul_${createdLinks.length + 1}`, ...input, status: 'current' };
      createdLinks.push(link);
      return { link, created: true };
    }
  });

  const communication = await createCommunicationWithRecipient(handler, personRef);

  const first = await handler(
    request({
      method: 'POST',
      url: `https://api.adam-russell.com/api/communications?id=${communication.id}&action=create-follow-up`,
      body: { title: 'Follow up: Proposal' }
    })
  );
  assert.equal(first.status, 503);
  const firstBody = await first.json();
  assert.equal(firstBody.data.task_id, 'task_follow_1');
  assert.ok(firstBody.data.completed_link_ids.length >= 1);
  assert.ok(firstBody.data.failed_intent_ids.some((id) => String(id).startsWith('contact:')));

  const second = await handler(
    request({
      method: 'POST',
      url: `https://api.adam-russell.com/api/communications?id=${communication.id}&action=retry-follow-up`,
      body: {}
    })
  );
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.data.task_id, 'task_follow_1');
  assert.equal(secondBody.data.follow_up_operation.status, 'committed');

  const completedReload = await handler(
    request({ url: `https://api.adam-russell.com/api/communications?id=${communication.id}` })
  );
  const completedBody = await completedReload.json();
  assert.equal(completedBody.data.communication.follow_up_operation.status, 'committed');
  assert.equal(completedBody.data.communication.follow_up_operation.task_id, 'task_follow_1');

  const [clickA, clickB] = await Promise.all([
    handler(
      request({
        method: 'POST',
        url: `https://api.adam-russell.com/api/communications?id=${communication.id}&action=create-follow-up`,
        body: { title: 'Follow up: Proposal' }
      })
    ),
    handler(
      request({
        method: 'POST',
        url: `https://api.adam-russell.com/api/communications?id=${communication.id}&action=create-follow-up`,
        body: { title: 'Follow up: Proposal' }
      })
    )
  ]);
  assert.equal(clickA.status, 201);
  assert.equal(clickB.status, 201);
  const bodyA = await clickA.json();
  const bodyB = await clickB.json();
  assert.equal(bodyA.data.task_id, 'task_follow_1');
  assert.equal(bodyB.data.task_id, 'task_follow_1');
  assert.equal(taskIdCounter, 1);

  assert.equal(createdLinks.filter((link) => link.relationship_type === 'follow_up').length, 1);
  assert.equal(createdLinks.filter((link) => link.relationship_type === 'contact').length, 1);
  assert.ok(
    [...professionalStore.map.keys()].some((key) =>
      key.startsWith('communications/follow-up-operations/')
    )
  );
});
