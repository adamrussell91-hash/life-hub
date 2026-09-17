import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleActivityHandler } from '../../netlify/functions/people-activity.mjs';
import { makeLink, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

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

function baseDeps(store, overrides = {}) {
  return {
    env,
    now: () => new Date('2026-09-17T00:00:00.000Z'),
    getContentStore: async () => store,
    resolveEntity: makeResolveEntity(store),
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/people/activity';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createPeopleActivityHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: URL_BASE }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const handler = createPeopleActivityHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createPeopleActivityHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'PUT' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createPeopleActivityHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('successful response shape: items array, newest first, deduped across both endpoints', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'Acme' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', validFrom: '2026-06-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2026-08-01T00:00:00.000Z' });

  const handler = createPeopleActivityHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.ok(Array.isArray(body.items));
  // Deduped: the professional_relationship link is discovered from both
  // Alice's and Bob's own relationships array, but must appear once.
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].date, '2026-08-01T00:00:00.000Z');
  assert.equal(body.items[1].date, '2026-06-01T00:00:00.000Z');
});

test('pagination cursor round-trip: since + limit page through the full timeline without gaps or repeats', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const dates = ['2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'];
  for (const validFrom of dates) {
    // eslint-disable-next-line no-await-in-loop
    const contact = await makePerson(store, { display_name: `Contact ${validFrom}` });
    // eslint-disable-next-line no-await-in-loop
    await makeLink(store, { sourceRef: alice.ref, targetRef: contact.ref, relationshipType: 'professional_relationship', validFrom });
  }

  const handler = createPeopleActivityHandler(baseDeps(store));

  const firstPageResponse = await handler(request({ url: `${URL_BASE}?limit=2` }));
  const firstPage = (await firstPageResponse.json()).data;
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.items[0].date, '2026-06-01T00:00:00.000Z');
  assert.equal(firstPage.items[1].date, '2026-03-01T00:00:00.000Z');
  assert.ok(firstPage.next_cursor);

  const secondPageResponse = await handler(request({ url: `${URL_BASE}?limit=2&since=${encodeURIComponent(firstPage.next_cursor)}` }));
  const secondPage = (await secondPageResponse.json()).data;
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0].date, '2026-01-01T00:00:00.000Z');
  assert.equal(secondPage.next_cursor, null, 'no further page remains');
});

test('an invalid cursor is rejected as a caller error, not silently ignored', async () => {
  const store = memoryStore();
  const handler = createPeopleActivityHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?since=not-a-real-cursor` }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_cursor');
});
