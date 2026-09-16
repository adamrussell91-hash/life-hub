import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleBriefHandler } from '../../netlify/functions/people-brief.mjs';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';
import {
  resolveMeeting,
  resolveOrganisation,
  resolvePerson,
  resolveTask
} from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  { now: Date.parse('2026-09-17T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) },
  SECRET
).token;

function request({ cookie = true, origin = 'https://life-hub.adam-russell.com', url, method = 'GET' } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {})
    }
  });
}

function baseDeps(store, professionalStore, overrides = {}) {
  return {
    env,
    now: () => '2026-09-17T00:00:00.000Z',
    getContentStore: async () => store,
    resolveEntity: makeResolveEntity(store),
    getProfessionalStore: async () => professionalStore,
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/people/brief';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ cookie: false, url: `${URL_BASE}?id=person_x` }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?id=person_x`, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?id=person_x`, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?id=person_x`, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('rejects a missing id', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'missing_id');
});

test('404s an unknown person id', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore));
  const response = await handler(
    request({ url: `${URL_BASE}?id=person_11111111-1111-1111-1111-111111111111` })
  );
  assert.equal(response.status, 404);
});

test('successful response has the full expected shape for a known person', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const person = await makePerson(store, { display_name: 'Vicky Leighton' });

  // Full resolver (person/organisation/task/meeting) so the meeting create
  // flow below can resolve both its own endpoint and the attendee's.
  function fullResolveEntity() {
    return async (refInput, accessContext, options = {}) => {
      const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
      if (!ref) throw endpointNotFoundError();
      if (ref.namespace === 'shared' && ref.kind === 'person') {
        return resolvePerson(ref.id, accessContext, { ...options, getStore: async () => store });
      }
      if (ref.namespace === 'shared' && ref.kind === 'organisation') {
        return resolveOrganisation(ref.id, accessContext, { ...options, getStore: async () => store });
      }
      if (ref.namespace === 'tasks' && ref.kind === 'task') {
        return resolveTask(ref.id, accessContext, options);
      }
      if (ref.namespace === 'professional' && ref.kind === 'meeting') {
        return resolveMeeting(ref.id, accessContext, { getStore: async () => professionalStore });
      }
      throw endpointNotFoundError();
    };
  }
  const resolveEntity = fullResolveEntity();

  const meetingRepo = createMeetingRepository({
    store: professionalStore,
    resolveEntity,
    getUniversalLinkStore: async () => store
  });
  await meetingRepo.createMeeting({
    title: 'Coffee meeting',
    scheduled_start: '2026-09-20T00:00:00.000Z',
    scheduled_end: '2026-09-20T01:00:00.000Z',
    time_zone: 'Australia/Sydney',
    location_text: 'Uni Cafe',
    links: [{ target_ref: person.ref, relationship_type: 'attendee', occurred_at: '2026-09-20T00:00:00.000Z' }]
  });

  const handler = createPeopleBriefHandler(baseDeps(store, professionalStore, { resolveEntity }));
  const response = await handler(request({ url: `${URL_BASE}?id=${person.id}` }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.equal(body.header.person.display_name, 'Vicky Leighton');
  assert.equal(body.header.next_interaction.title, 'Coffee meeting');
  assert.equal(body.header.next_interaction.location, 'Uni Cafe');
  assert.equal(typeof body.who_they_are, 'string');
  assert.ok(Array.isArray(body.open_loops));
  assert.ok(Array.isArray(body.current_shared_work));
  assert.ok(Array.isArray(body.mutual_connections));
});
