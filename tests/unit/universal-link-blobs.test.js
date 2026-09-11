import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(personKey('person_seth'), 'entities/person/person_seth');
  assert.equal(organisationKey('organisation_unsw'), 'entities/organisation/organisation_unsw');
  assert.equal(linkKey('ul_abc'), 'universal-links/links/ul_abc');

  const sourceRef = 'tasks:task:task_email_seth';
  const targetRef = 'shared:person:person_seth';
  assert.equal(bySourcePrefix(sourceRef), `universal-links/by-source/${hashEntityRef(sourceRef)}/`);
  assert.equal(byTargetPrefix(targetRef), `universal-links/by-target/${hashEntityRef(targetRef)}/`);
  assert.equal(byTypePrefix('collaborator'), 'universal-links/by-type/collaborator/');
  assert.equal(bySourceKey(sourceRef, 'ul_abc'), `${bySourcePrefix(sourceRef)}ul_abc`);
  assert.equal(byTargetKey(targetRef, 'ul_abc'), `${byTargetPrefix(targetRef)}ul_abc`);
  assert.equal(byTypeKey('collaborator', 'ul_abc'), 'universal-links/by-type/collaborator/ul_abc');
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
  await store.setJSON(`${prefix}ul_one`, membershipRecord('ul_one', sourceRef));
  await store.setJSON(`${prefix}ul_two`, membershipRecord('ul_two', sourceRef));
  // A duplicate write under a different key for the same link_id must not
  // produce two results.
  await store.setJSON(`${prefix}ul_one_dup`, membershipRecord('ul_one', sourceRef));

  const results = await listMembership(store, prefix, sourceRef);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(r => r.link_id).sort(), ['ul_one', 'ul_two']);
});

test('listMembership drops a record whose retained canonical_ref does not match (hash-collision protection)', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  await store.setJSON(`${prefix}ul_real`, membershipRecord('ul_real', sourceRef));
  await store.setJSON(`${prefix}ul_collision`, membershipRecord('ul_collision', 'tasks:task:task_unrelated'));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), ['ul_real']);
});

test('listMembership ignores an _index key under the prefix', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  await store.setJSON(`${prefix}_index`, ['not-a-membership-record']);
  await store.setJSON(`${prefix}ul_real`, membershipRecord('ul_real', sourceRef));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), ['ul_real']);
});
