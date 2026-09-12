import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createCommunicationsHandler } from '../../netlify/functions/communications.mjs';
import { createIdentityRepository } from '../../netlify/functions/_shared/identity-repository.mjs';
import { personKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import {
  resolveCommunication,
  resolvePerson,
  resolveTask
} from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { communicationKey } from '../../netlify/functions/_shared/professional-blobs.mjs';

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
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, value);
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

function makeHandler({ professionalStore, universalStore, tasksStore, linkCreateImpl }) {
  const resolveEntity = async (refInput, accessContext, options = {}) => {
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
    resolveEntity,
    createUniversalLinkRepository: () => ({
      createLink: linkCreateImpl,
      getLink: async (id) => ({ link: { id } })
    })
  });
}

test('rejects an unauthenticated request with 401', async () => {
  const handler = makeHandler({
    professionalStore: memoryStore(),
    universalStore: memoryStore(),
    tasksStore: memoryStore(),
    linkCreateImpl: async () => ({ link: { id: 'ul_x' }, created: true })
  });
  const response = await handler(request({ cookie: false }));
  assert.equal(response.status, 401);
});

test('rejects a disallowed origin', async () => {
  const handler = makeHandler({
    professionalStore: memoryStore(),
    universalStore: memoryStore(),
    tasksStore: memoryStore(),
    linkCreateImpl: async () => ({ link: { id: 'ul_x' }, created: true })
  });
  const response = await handler(request({ origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('DELETE is not exposed', async () => {
  const handler = makeHandler({
    professionalStore: memoryStore(),
    universalStore: memoryStore(),
    tasksStore: memoryStore(),
    linkCreateImpl: async () => ({ link: { id: 'ul_x' }, created: true })
  });
  const response = await handler(request({ method: 'DELETE' }));
  assert.equal(response.status, 405);
});

test('POST creates a Communication without copying links or target ids into the stored record', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const { ref: personRef } = await seedPerson(universalStore);
  const createdLinks = [];
  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore: memoryStore(),
    linkCreateImpl: async (input) => {
      createdLinks.push(input);
      return { link: { id: `ul_${createdLinks.length}` }, created: true };
    }
  });

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
  assert.match(body.data.communication.id, /^communication_/);
  assert.equal(body.data.communication.subject, 'Proposal');
  assert.equal(Object.prototype.hasOwnProperty.call(body.data.communication, 'links'), false);
  assert.equal(createdLinks.length, 1);
  assert.equal(createdLinks[0].relationship_type, 'recipient');
  assert.equal(createdLinks[0].source_ref.startsWith('professional:communication:'), true);

  const stored = await professionalStore.get(communicationKey(body.data.communication.id), {
    type: 'json'
  });
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'links'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'recipient_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'person_id'), false);
});

test('POST rejects access fields and unknown metadata', async () => {
  const handler = makeHandler({
    professionalStore: memoryStore(),
    universalStore: memoryStore(),
    tasksStore: memoryStore(),
    linkCreateImpl: async () => ({ link: { id: 'ul_x' }, created: true })
  });
  const response = await handler(
    request({
      method: 'POST',
      body: {
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        workflow: 'administration'
      }
    })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'access_field_not_accepted');
});

test('POST with a failing link write returns communication_links_incomplete and keeps the Communication', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const { ref: personRef } = await seedPerson(universalStore);
  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore: memoryStore(),
    linkCreateImpl: async () => {
      throw Object.assign(new Error('boom'), {
        status: 503,
        code: 'link_write_incomplete',
        retryable: true,
        operation_id: 'op_deadbeefdeadbeefdeadbeefdeadbeef',
        link_id: 'ul_fail'
      });
    }
  });

  const response = await handler(
    request({
      method: 'POST',
      body: {
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        subject: 'Incomplete',
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
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'communication_links_incomplete');
  assert.equal(body.error.retryable, true);
  assert.ok(body.data.communication_id);
  assert.ok(body.data.operation_id);
  assert.ok(Array.isArray(body.data.failed_intent_ids));

  const getResponse = await handler(
    request({
      url: `https://api.adam-russell.com/api/communications?id=${body.data.communication_id}`
    })
  );
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.equal(getBody.data.communication.subject, 'Incomplete');
  assert.ok(getBody.data.communication.incomplete_links);
});

test('retry-links resumes missing work without duplicating completed links', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const { ref: personRef } = await seedPerson(universalStore);
  let attempts = 0;
  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore: memoryStore(),
    linkCreateImpl: async (input) => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('boom'), {
          status: 503,
          code: 'link_write_incomplete',
          retryable: true
        });
      }
      return { link: { id: 'ul_ok', ...input }, created: true };
    }
  });

  const createResponse = await handler(
    request({
      method: 'POST',
      body: {
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        subject: 'Retry me',
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
  const created = await createResponse.json();
  const id = created.data.communication_id;
  const retryResponse = await handler(
    request({
      method: 'POST',
      url: `https://api.adam-russell.com/api/communications?id=${id}&action=retry-links`,
      body: {}
    })
  );
  assert.equal(retryResponse.status, 200);
  const retryBody = await retryResponse.json();
  assert.equal(retryBody.data.communication.subject, 'Retry me');
  assert.equal(retryBody.data.communication.incomplete_links == null, true);
  assert.equal(attempts, 2);
});

test('PATCH updates only subject and summary', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore: memoryStore(),
    linkCreateImpl: async () => ({ link: { id: 'ul_x' }, created: true })
  });
  const createResponse = await handler(
    request({
      method: 'POST',
      body: {
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        subject: 'Old',
        summary: 'Old summary'
      }
    })
  );
  const created = await createResponse.json();
  const id = created.data.communication.id;
  const patchResponse = await handler(
    request({
      method: 'PATCH',
      url: `https://api.adam-russell.com/api/communications?id=${id}`,
      body: { subject: 'New', summary: 'New summary', direction: 'inbound' }
    })
  );
  assert.equal(patchResponse.status, 400);
  const okPatch = await handler(
    request({
      method: 'PATCH',
      url: `https://api.adam-russell.com/api/communications?id=${id}`,
      body: { subject: 'New', summary: 'New summary' }
    })
  );
  assert.equal(okPatch.status, 200);
  const body = await okPatch.json();
  assert.equal(body.data.communication.subject, 'New');
  assert.equal(body.data.communication.direction, 'outbound');
});

test('preflight invalid link target performs no Communication write', async () => {
  const professionalStore = memoryStore();
  const universalStore = memoryStore();
  const handler = makeHandler({
    professionalStore,
    universalStore,
    tasksStore: memoryStore(),
    linkCreateImpl: async () => ({ link: { id: 'ul_x' }, created: true })
  });
  const response = await handler(
    request({
      method: 'POST',
      body: {
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-09-01T10:00:00.000Z',
        links: [
          {
            target_ref: 'shared:person:person_00000000-0000-4000-8000-000000000099',
            relationship_type: 'recipient',
            occurred_at: '2026-09-01T10:00:00.000Z'
          }
        ]
      }
    })
  );
  assert.equal(response.status, 404);
  const listed = await professionalStore.list({ prefix: 'communications/records/' });
  assert.equal(listed.blobs.length, 0);
});
