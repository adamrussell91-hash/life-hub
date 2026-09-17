import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createNetworkEcologyEgoHandler } from '../../netlify/functions/network-ecology-ego.mjs';
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

const URL_BASE = 'https://api.adam-russell.com/api/network-ecology/ego';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: `${URL_BASE}?ref=shared:person:x` }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?ref=shared:person:x`, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?ref=shared:person:x`, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('missing ref returns a 400', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'missing_ref');
});

test('hop-traversal correctness: hop 1 includes only direct neighbours, hop 2 extends further, and nodes beyond the cutoff are excluded', async () => {
  const store = memoryStore();
  const a = await makePerson(store, { display_name: 'A' });
  const b = await makePerson(store, { display_name: 'B' });
  const c = await makePerson(store, { display_name: 'C' });
  const d = await makePerson(store, { display_name: 'D' });

  // Chain: A -- B -- C -- D
  await makeLink(store, { sourceRef: a.ref, targetRef: b.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(store, { sourceRef: b.ref, targetRef: c.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(store, { sourceRef: c.ref, targetRef: d.ref, relationshipType: 'professional_relationship', role: 'colleague' });

  const handler = createNetworkEcologyEgoHandler(baseDeps(store));

  const hop1 = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent(a.ref)}&hops=1` }));
  const hop1Body = (await hop1.json()).data;
  const hop1Refs = hop1Body.nodes.map((n) => n.ref).sort();
  assert.deepEqual(hop1Refs, [a.ref, b.ref].sort());

  const hop2 = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent(a.ref)}&hops=2` }));
  const hop2Body = (await hop2.json()).data;
  const hop2Refs = hop2Body.nodes.map((n) => n.ref).sort();
  assert.deepEqual(hop2Refs, [a.ref, b.ref, c.ref].sort());
  // D is beyond the 2-hop cutoff from A.
  assert.ok(!hop2Refs.includes(d.ref));

  const hop3 = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent(a.ref)}&hops=3` }));
  const hop3Body = (await hop3.json()).data;
  assert.deepEqual(hop3Body.nodes.map((n) => n.ref).sort(), [a.ref, b.ref, c.ref, d.ref].sort());
});

test('default hops is 2 when omitted', async () => {
  const store = memoryStore();
  const a = await makePerson(store, { display_name: 'A' });
  const b = await makePerson(store, { display_name: 'B' });
  const c = await makePerson(store, { display_name: 'C' });
  const d = await makePerson(store, { display_name: 'D' });
  await makeLink(store, { sourceRef: a.ref, targetRef: b.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(store, { sourceRef: b.ref, targetRef: c.ref, relationshipType: 'professional_relationship', role: 'colleague' });
  await makeLink(store, { sourceRef: c.ref, targetRef: d.ref, relationshipType: 'professional_relationship', role: 'colleague' });

  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent(a.ref)}` }));
  const body = (await response.json()).data;
  assert.deepEqual(body.nodes.map((n) => n.ref).sort(), [a.ref, b.ref, c.ref].sort());
});

test('an unknown/hidden ref returns an empty subgraph, not an error', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent('shared:person:does-not-exist')}` }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.deepEqual(body.nodes, []);
  assert.deepEqual(body.edges, []);
});

test('PRIVACY: an archived neighbour never appears in the ego subgraph', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const hiddenBob = await makePerson(store, { display_name: 'Hidden Bob' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: hiddenBob.ref, relationshipType: 'professional_relationship', role: 'mentor' });

  const { ref: _hiddenBobRef, ...hiddenBobRecord } = hiddenBob;
  await store.setJSON(personKey(hiddenBob.id), { ...hiddenBobRecord, lifecycle_status: 'archived' });

  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent(alice.ref)}&hops=2` }));
  const body = (await response.json()).data;

  assert.deepEqual(body.nodes.map((n) => n.ref), [alice.ref]);
  assert.deepEqual(body.edges, []);
});

test('organisation nodes appear as legitimate hops via employee_at/member_of', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });

  const handler = createNetworkEcologyEgoHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?ref=${encodeURIComponent(alice.ref)}&hops=1` }));
  const body = (await response.json()).data;

  const orgNode = body.nodes.find((n) => n.ref === org.ref);
  assert.ok(orgNode);
  assert.equal(orgNode.kind, 'organisation');
  assert.equal(body.edges.length, 1);
  assert.equal(body.edges[0].relationship_type, 'employee_at');
});
