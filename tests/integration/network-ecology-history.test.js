import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createNetworkEcologyHistoryHandler } from '../../netlify/functions/network-ecology-history.mjs';
import { personKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
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

const URL_BASE = 'https://api.adam-russell.com/api/network-ecology/history';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: `${URL_BASE}?date=2025-01-01` }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?date=2025-01-01`, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?date=2025-01-01`, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('missing date returns a 400', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'missing_date');
});

test('malformed date returns a 400', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?date=not-a-real-date` }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'invalid_date');
});

test('successful response shape: nodes, edges, clusters, bridge_people, plus the echoed date', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });

  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?date=2025-06-01` }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.ok(Array.isArray(body.nodes));
  assert.ok(Array.isArray(body.edges));
  assert.ok(Array.isArray(body.clusters));
  assert.ok(Array.isArray(body.bridge_people));
  assert.equal(body.date, '2025-06-01T00:00:00.000Z');

  const nodeRefs = body.nodes.map((n) => n.ref);
  assert.ok(nodeRefs.includes(alice.ref));
  assert.ok(nodeRefs.includes(bob.ref));
  assert.ok(nodeRefs.includes(org.ref));
});

test('a link that ended AFTER the query date but started before it is correctly included in the historical result', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  // Bob's membership ran 2020-2022 and has since ENDED (status: 'ended'
  // today) — but as of the 2021 query date it WAS active.
  await makeLink(store, {
    sourceRef: bob.ref,
    targetRef: org.ref,
    relationshipType: 'employee_at',
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2022-01-01T00:00:00.000Z'
  });

  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?date=2021-06-01` }));
  const body = (await response.json()).data;

  const cluster = body.clusters.find((c) => c.id === org.ref);
  assert.ok(cluster, 'the 2-person cluster must exist as of the 2021 query date, even though Bob has since left');
  assert.deepEqual(cluster.member_refs.sort(), [alice.ref, bob.ref].sort());
  assert.ok(body.nodes.some((n) => n.ref === bob.ref));
});

// --- Privacy / visibility -----------------------------------------------

test('PRIVACY: an archived (hidden) person never leaks through node presence, edge presence, or cluster membership, evaluated by CURRENT lifecycle status', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const hiddenBob = await makePerson(store, { display_name: 'Hidden Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: hiddenBob.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: hiddenBob.ref, relationshipType: 'professional_relationship', role: 'mentor' });

  // Archived AFTER the historical query date — Hidden Bob was active,
  // visible, and NOT archived as of the queried date. He must still be
  // excluded, because visibility is evaluated by CURRENT status, not
  // historical status.
  const { ref: _hiddenBobRef, ...hiddenBobRecord } = hiddenBob;
  await store.setJSON(personKey(hiddenBob.id), { ...hiddenBobRecord, lifecycle_status: 'archived' });

  const handler = createNetworkEcologyHistoryHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?date=2021-01-01` }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  // Sanity: the fixture genuinely wrote an archived record.
  const rawRecord = await store.get(personKey(hiddenBob.id));
  assert.equal(rawRecord.lifecycle_status, 'archived');

  // 1. Node presence.
  assert.ok(!body.nodes.some((n) => n.ref === hiddenBob.ref), 'hidden person leaked as a node');
  // 2. Edge presence.
  assert.ok(
    !body.edges.some((e) => e.source_ref === hiddenBob.ref || e.target_ref === hiddenBob.ref),
    'hidden person leaked through an edge'
  );
  // 3. Cluster membership — with Hidden Bob gone, UNSW has only 1 visible
  // member (Alice), below the >= 2 candidate floor, so no cluster at all.
  const orgCluster = body.clusters.find((c) => c.id === org.ref);
  assert.equal(orgCluster, undefined, 'a hidden member must not keep an otherwise-too-small cluster alive');
  // 4. Alice's own node is unaffected.
  assert.ok(body.nodes.some((n) => n.ref === alice.ref));
});
