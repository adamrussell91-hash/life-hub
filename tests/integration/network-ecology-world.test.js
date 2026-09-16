import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createNetworkEcologyWorldHandler } from '../../netlify/functions/network-ecology-world.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { personKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import {
  makeLink,
  makeMeeting,
  makeOrganisation,
  makePerson,
  makeResolveEntity,
  memoryStore
} from '../support/people-fixtures.mjs';

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
    getProfessionalStore: async () => professionalStore,
    resolveEntity: makeResolveEntity(store, null, professionalStore),
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/network-ecology/world';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ cookie: false, url: URL_BASE }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('successful response shape: nodes, edges, clusters, bridge_people', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.ok(Array.isArray(body.nodes));
  assert.ok(Array.isArray(body.edges));
  assert.ok(Array.isArray(body.clusters));
  assert.ok(Array.isArray(body.bridge_people));

  const nodeRefs = body.nodes.map((n) => n.ref);
  assert.ok(nodeRefs.includes(alice.ref));
  assert.ok(nodeRefs.includes(bob.ref));
  assert.ok(nodeRefs.includes(org.ref));

  const orgCluster = body.clusters.find((c) => c.id === org.ref);
  assert.ok(orgCluster, 'expected an organisation cluster for UNSW');
  assert.equal(orgCluster.kind, 'organisation');
  assert.deepEqual(orgCluster.member_refs.sort(), [alice.ref, bob.ref].sort());
  // Two people, no professional_relationship link between them, long
  // duration — density 0, so not forest/reef; size 2 with bridgeRatio 0
  // lands on Island.
  assert.equal(orgCluster.habitat, 'island');
});

test('an organisation cluster with >= 8 members and low density classifies as savannah, feeding a real habitat end to end', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const org = await makeOrganisation(store, { display_name: 'Big Org' });
  const people = [];
  for (let i = 0; i < 8; i += 1) {
    const person = await makePerson(store, { display_name: `Person ${i}` });
    people.push(person);
    await makeLink(store, { sourceRef: person.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  }

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  const body = (await response.json()).data;
  const orgCluster = body.clusters.find((c) => c.id === org.ref);
  assert.equal(orgCluster.habitat, 'savannah');
});

test('a meeting within the event window with >= 2 current attendees produces a wetland event cluster', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const meeting = await makeMeeting(professionalStore, { title: 'HALT Conference', scheduled_start: '2026-09-20T00:00:00.000Z' });
  const meetingRef = formatEntityRef({ namespace: 'professional', kind: 'meeting', id: meeting.id });

  await makeLink(store, {
    sourceRef: meetingRef,
    targetRef: alice.ref,
    relationshipType: 'attendee',
    resolveEntity: makeResolveEntity(store, null, professionalStore)
  });
  await makeLink(store, {
    sourceRef: meetingRef,
    targetRef: bob.ref,
    relationshipType: 'attendee',
    resolveEntity: makeResolveEntity(store, null, professionalStore)
  });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  const body = (await response.json()).data;

  const eventCluster = body.clusters.find((c) => c.id === meetingRef);
  assert.ok(eventCluster, 'expected an event cluster for the meeting');
  assert.equal(eventCluster.habitat, 'wetland');
  assert.deepEqual(eventCluster.member_refs.sort(), [alice.ref, bob.ref].sort());
});

test('a meeting far outside the event window never produces a cluster', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const meeting = await makeMeeting(professionalStore, { title: 'Old Meeting', scheduled_start: '2020-01-01T00:00:00.000Z' });
  const meetingRef = formatEntityRef({ namespace: 'professional', kind: 'meeting', id: meeting.id });
  const resolveEntity = makeResolveEntity(store, null, professionalStore);

  await makeLink(store, { sourceRef: meetingRef, targetRef: alice.ref, relationshipType: 'attendee', resolveEntity });
  await makeLink(store, { sourceRef: meetingRef, targetRef: bob.ref, relationshipType: 'attendee', resolveEntity });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  const body = (await response.json()).data;

  assert.equal(body.clusters.find((c) => c.id === meetingRef), undefined);
});

test('no meetings/events at all is handled gracefully (event clusters simply empty, no error)', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.deepEqual(body.clusters, []);
  assert.ok(body.nodes.some((n) => n.ref === alice.ref));
});

test('bridge_people surfaces a person spanning two organisation clusters, with a plain-language description', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });
  const unsw = await makeOrganisation(store, { display_name: 'UNSW' });
  const stAloysius = await makeOrganisation(store, { display_name: 'St Aloysius' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: unsw.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: unsw.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: stAloysius.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: carol.ref, targetRef: stAloysius.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  const body = (await response.json()).data;

  assert.equal(body.bridge_people.length, 1);
  assert.equal(body.bridge_people[0].ref, alice.ref);
  // Alphabetical by organisation label ("St Aloysius" < "UNSW").
  assert.equal(body.bridge_people[0].description, 'Connects St Aloysius and UNSW');
});

// --- Privacy / visibility -----------------------------------------------

test('PRIVACY: an archived (hidden) person never leaks through node presence, edge presence, or cluster membership', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  // Created ACTIVE first — an archived entity cannot be a link endpoint at
  // CREATE time (`resolvePerson` rejects an archived endpoint without
  // `includeArchived`, matching ordinary Universal Link create semantics).
  // Real usage is exactly this order too: relationships accumulate while a
  // person is active, and they are archived afterwards, keeping their
  // existing link records intact.
  const hiddenBob = await makePerson(store, { display_name: 'Hidden Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  // Hidden Bob has a full set of relationships that WOULD otherwise make
  // him a node, an edge endpoint, and a cluster member: a current
  // organisation link (shared with Alice, which would otherwise form a
  // 2-person Island cluster) and a current professional_relationship with
  // Alice.
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: hiddenBob.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: hiddenBob.ref, relationshipType: 'professional_relationship', role: 'mentor' });

  // Now archive Hidden Bob — a lifecycle transition, not a re-create.
  const { ref: _hiddenBobRef, ...hiddenBobRecord } = hiddenBob;
  await store.setJSON(personKey(hiddenBob.id), { ...hiddenBobRecord, lifecycle_status: 'archived' });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  // Confirm the hidden person really did exist in the underlying data
  // (this is not a false-negative from a broken fixture) by checking the
  // authoritative store directly held their record.
  const rawRecord = await store.get(personKey(hiddenBob.id));
  assert.ok(rawRecord, 'sanity: the fixture actually wrote an archived person record');
  assert.equal(rawRecord.lifecycle_status, 'archived');

  // 1. Node presence: Hidden Bob must not appear as a node.
  assert.ok(!body.nodes.some((n) => n.ref === hiddenBob.ref), 'hidden person leaked as a node');

  // 2. Edge presence: no edge may reference Hidden Bob on either side.
  assert.ok(
    !body.edges.some((e) => e.source_ref === hiddenBob.ref || e.target_ref === hiddenBob.ref),
    'hidden person leaked through an edge'
  );

  // 3. Cluster membership: the UNSW cluster must not count or list Hidden
  // Bob as a member — with him gone, UNSW only has 1 visible current
  // member (Alice), which is BELOW the >= 2 candidate floor, so the
  // cluster must not exist at all (never a degenerate 1-person "Island").
  const orgCluster = body.clusters.find((c) => c.id === org.ref);
  assert.equal(orgCluster, undefined, 'a hidden member must not keep an otherwise-too-small cluster alive');

  // 4. Alice's own visible node must be entirely unaffected — she still
  // appears, just without any trace of her link to Hidden Bob.
  assert.ok(body.nodes.some((n) => n.ref === alice.ref));
});

test('PRIVACY: an archived person is also excluded from bridge_people even if they would otherwise bridge two clusters', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const bob = await makePerson(store, { display_name: 'Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });
  const hiddenAlice = await makePerson(store, { display_name: 'Hidden Alice' });
  const unsw = await makeOrganisation(store, { display_name: 'UNSW' });
  const stAloysius = await makeOrganisation(store, { display_name: 'St Aloysius' });

  await makeLink(store, { sourceRef: bob.ref, targetRef: unsw.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: hiddenAlice.ref, targetRef: unsw.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: carol.ref, targetRef: stAloysius.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: hiddenAlice.ref, targetRef: stAloysius.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });

  // Archive Hidden Alice only after her links exist (see the previous
  // test's comment for why).
  const { ref: _hiddenAliceRef, ...hiddenAliceRecord } = hiddenAlice;
  await store.setJSON(personKey(hiddenAlice.id), { ...hiddenAliceRecord, lifecycle_status: 'archived' });

  const handler = createNetworkEcologyWorldHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  const body = (await response.json()).data;

  assert.ok(!body.bridge_people.some((p) => p.ref === hiddenAlice.ref));
  // Both organisations now have only 1 visible member each — below the
  // candidate floor — so neither cluster (nor any bridge) should exist.
  assert.equal(body.clusters.find((c) => c.id === unsw.ref), undefined);
  assert.equal(body.clusters.find((c) => c.id === stAloysius.ref), undefined);
});
