import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleHomeSignalsHandler } from '../../netlify/functions/people-home-signals.mjs';
import { makeLink, makeMeeting, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-09-17T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

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
    now: () => new Date('2026-09-17T00:00:00.000Z'),
    getContentStore: async () => store,
    resolveEntity: makeResolveEntity(store),
    getProfessionalStore: async () => professionalStore,
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/people/home-signals';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleHomeSignalsHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ cookie: false, url: URL_BASE }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleHomeSignalsHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleHomeSignalsHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleHomeSignalsHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('successful response has the full expected shape and folds in meetings/events for the upcoming signal', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice', created_at: '2026-09-10T00:00:00.000Z' });
  const bob = await makePerson(store, { display_name: 'Bob', created_at: '2026-01-01T00:00:00.000Z' });
  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: bob.ref,
    relationshipType: 'professional_relationship',
    validFrom: '2026-09-01T00:00:00.000Z'
  });
  await makeMeeting(professionalStore, { scheduled_start: '2026-09-20T00:00:00.000Z' });

  const handler = createPeopleHomeSignalsHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.equal(typeof body.signals.active_relationships, 'number');
  assert.equal(typeof body.signals.upcoming_interactions, 'number');
  assert.equal(typeof body.signals.recent_relationship_changes, 'number');
  assert.equal(typeof body.signals.current_opportunity_windows, 'number');
  assert.ok(Array.isArray(body.reconnect_suggestions));
  assert.ok(Array.isArray(body.recent_changes));
  assert.ok(Array.isArray(body.new_connections));
  assert.ok(Array.isArray(body.dormant_for_review));

  assert.equal(body.signals.active_relationships, 1);
  assert.equal(body.signals.upcoming_interactions, 1, 'the meeting scheduled for 2026-09-20 falls within the 14-day window of 2026-09-17');
  assert.equal(body.new_connections.length, 1);
  assert.equal(body.new_connections[0].display_name, 'Alice');
});
