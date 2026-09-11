import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import {
  UNIVERSAL_LINK_CONTENT_STORE,
  bySourceKey,
  bySourcePrefix,
  byTargetKey,
  byTargetPrefix,
  byTypeKey,
  byTypePrefix,
  getJSON,
  linkKey,
  listMembership,
  organisationKey,
  personKey
} from '../../netlify/functions/_shared/universal-link-blobs.mjs';

// The canonical deterministic id form is `ul_` + 64 lowercase hex chars.
function ulId(label) {
  return `ul_${createHash('sha256').update(label).digest('hex')}`;
}

// The module under test exports no write capability in this slice (see
// entity-resolvers/universal-link-read-repository). Seeding fixtures here
// uses the fake store's OWN `setJSON`, not anything imported from
// universal-link-blobs.mjs.
function createMemoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      const blobs = [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }));
      return { blobs };
    }
  };
}

function membershipRecord(linkId, canonicalRef) {
  return { schema_version: 1, link_id: linkId, canonical_ref: canonicalRef, created_at: '2026-09-11T00:00:00.000Z' };
}

test('store name is the shared universal-link-content store', () => {
  assert.equal(UNIVERSAL_LINK_CONTENT_STORE, 'universal-link-content');
});

test('key builders use entity-ref.mjs hashEntityRef and produce the layout named in the implementation programme', () => {
  const linkId = ulId('abc');
  assert.equal(personKey('person_seth'), 'entities/person/person_seth');
  assert.equal(organisationKey('organisation_unsw'), 'entities/organisation/organisation_unsw');
  assert.equal(linkKey(linkId), `universal-links/links/${linkId}`);

  const sourceRef = 'tasks:task:task_email_seth';
  const targetRef = 'shared:person:person_seth';
  assert.equal(bySourcePrefix(sourceRef), `universal-links/by-source/${hashEntityRef(sourceRef)}/`);
  assert.equal(byTargetPrefix(targetRef), `universal-links/by-target/${hashEntityRef(targetRef)}/`);
  assert.equal(byTypePrefix('collaborator'), 'universal-links/by-type/collaborator/');
  assert.equal(bySourceKey(sourceRef, linkId), `${bySourcePrefix(sourceRef)}${linkId}`);
  assert.equal(byTargetKey(targetRef, linkId), `${byTargetPrefix(targetRef)}${linkId}`);
  assert.equal(byTypeKey('collaborator', linkId), `universal-links/by-type/collaborator/${linkId}`);
});

test('every key builder that concatenates a link id validates it first, rejecting malformed and path-like ids', () => {
  const sourceRef = 'tasks:task:task_email_seth';
  const targetRef = 'shared:person:person_seth';
  for (const bad of ['ul_deadbeef', 'ul_../../etc/passwd', '../../etc/passwd', '', 'not_a_link_id']) {
    assert.throws(() => linkKey(bad), error => error.status === 400 && error.code === 'invalid_link_id', `linkKey(${JSON.stringify(bad)})`);
    assert.throws(() => bySourceKey(sourceRef, bad), error => error.code === 'invalid_link_id', `bySourceKey(${JSON.stringify(bad)})`);
    assert.throws(() => byTargetKey(targetRef, bad), error => error.code === 'invalid_link_id', `byTargetKey(${JSON.stringify(bad)})`);
    assert.throws(() => byTypeKey('collaborator', bad), error => error.code === 'invalid_link_id', `byTypeKey(${JSON.stringify(bad)})`);
  }
});

test('this module exports no write capability', () => {
  const exported = { bySourceKey, bySourcePrefix, byTargetKey, byTargetPrefix, byTypeKey, byTypePrefix, getJSON, linkKey, listMembership, organisationKey, personKey };
  assert.equal('setJSON' in exported, false);
  assert.equal('deleteKey' in exported, false);
  assert.equal('operationKey' in exported, false);
  assert.equal('buildMembershipRecord' in exported, false);
});

test('getJSON reads through the store adapter', async () => {
  const store = createMemoryStore();
  await store.setJSON(personKey('person_seth'), { id: 'person_seth', display_name: 'Seth' });
  assert.deepEqual(await getJSON(store, personKey('person_seth')), { id: 'person_seth', display_name: 'Seth' });
  assert.equal(await getJSON(store, personKey('person_missing')), null);
});

test('listMembership reads every membership blob under a prefix and dedupes by link_id', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  const idOne = ulId('one');
  const idTwo = ulId('two');
  await store.setJSON(`${prefix}${idOne}`, membershipRecord(idOne, sourceRef));
  await store.setJSON(`${prefix}${idTwo}`, membershipRecord(idTwo, sourceRef));
  // A duplicate write under a different key for the same link_id must not
  // produce two results.
  await store.setJSON(`${prefix}${idOne}_dup`, membershipRecord(idOne, sourceRef));

  const results = await listMembership(store, prefix, sourceRef);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(r => r.link_id).sort(), [idOne, idTwo].sort());
});

test('listMembership drops a record whose retained canonical_ref does not match (hash-collision protection)', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  const idReal = ulId('real');
  const idCollision = ulId('collision');
  await store.setJSON(`${prefix}${idReal}`, membershipRecord(idReal, sourceRef));
  await store.setJSON(`${prefix}${idCollision}`, membershipRecord(idCollision, 'tasks:task:task_unrelated'));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), [idReal]);
});

test('listMembership drops a record whose link_id is malformed or path-like', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  const idReal = ulId('real');
  await store.setJSON(`${prefix}${idReal}`, membershipRecord(idReal, sourceRef));
  await store.setJSON(`${prefix}bad-key`, membershipRecord('ul_deadbeef', sourceRef));
  await store.setJSON(`${prefix}path-key`, membershipRecord('ul_../../etc/passwd', sourceRef));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), [idReal]);
});

test('listMembership ignores an _index key under the prefix', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  const idReal = ulId('real');
  await store.setJSON(`${prefix}_index`, ['not-a-membership-record']);
  await store.setJSON(`${prefix}${idReal}`, membershipRecord(idReal, sourceRef));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), [idReal]);
});

test('listMembership bounds concurrent Blob GETs to 10 even with many membership keys', async () => {
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  const ids = Array.from({ length: 25 }, (_, i) => ulId(`batch-${i}`));

  const map = new Map();
  for (const id of ids) map.set(`${prefix}${id}`, JSON.stringify(membershipRecord(id, sourceRef)));

  let inFlight = 0;
  let maxInFlight = 0;
  const store = {
    async get(key, { type } = {}) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 4));
      inFlight -= 1;
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async list({ prefix: p = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(p)).map(key => ({ key })) };
    }
  };

  const results = await listMembership(store, prefix, sourceRef);
  assert.equal(results.length, 25);
  assert.ok(maxInFlight <= 10, `expected at most 10 concurrent GETs, saw ${maxInFlight}`);
  assert.ok(maxInFlight > 1, 'sanity check: batching still runs concurrently within a batch');
});
