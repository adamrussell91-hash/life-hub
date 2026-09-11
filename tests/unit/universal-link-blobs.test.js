import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIVERSAL_LINK_CONTENT_STORE,
  buildMembershipRecord,
  bySourceKey,
  bySourcePrefix,
  byTargetKey,
  byTargetPrefix,
  byTypeKey,
  byTypePrefix,
  deleteKey,
  getJSON,
  hashRef,
  linkKey,
  listMembership,
  operationKey,
  organisationKey,
  personKey,
  setJSON
} from '../../netlify/functions/_shared/universal-link-blobs.mjs';

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
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      const blobs = [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }));
      return { blobs };
    }
  };
}

test('store name is the shared universal-link-content store', () => {
  assert.equal(UNIVERSAL_LINK_CONTENT_STORE, 'universal-link-content');
});

test('hashRef is deterministic and different refs hash differently', () => {
  assert.equal(hashRef('shared:person:person_seth'), hashRef('shared:person:person_seth'));
  assert.notEqual(hashRef('shared:person:person_seth'), hashRef('shared:person:person_other'));
  assert.match(hashRef('shared:person:person_seth'), /^[0-9a-f]{64}$/);
});

test('key builders produce the layout named in the implementation programme', () => {
  assert.equal(personKey('person_seth'), 'entities/person/person_seth');
  assert.equal(organisationKey('organisation_unsw'), 'entities/organisation/organisation_unsw');
  assert.equal(linkKey('ul_abc'), 'universal-links/links/ul_abc');
  assert.equal(operationKey('op_abc'), 'universal-links/operations/op_abc');

  const sourceRef = 'tasks:task:task_email_seth';
  const targetRef = 'shared:person:person_seth';
  assert.equal(bySourcePrefix(sourceRef), `universal-links/by-source/${hashRef(sourceRef)}/`);
  assert.equal(byTargetPrefix(targetRef), `universal-links/by-target/${hashRef(targetRef)}/`);
  assert.equal(byTypePrefix('collaborator'), 'universal-links/by-type/collaborator/');
  assert.equal(bySourceKey(sourceRef, 'ul_abc'), `${bySourcePrefix(sourceRef)}ul_abc`);
  assert.equal(byTargetKey(targetRef, 'ul_abc'), `${byTargetPrefix(targetRef)}ul_abc`);
  assert.equal(byTypeKey('collaborator', 'ul_abc'), 'universal-links/by-type/collaborator/ul_abc');
});

test('get/set/delete round trip through the store adapter', async () => {
  const store = createMemoryStore();
  await setJSON(store, personKey('person_seth'), { id: 'person_seth', display_name: 'Seth' });
  assert.deepEqual(await getJSON(store, personKey('person_seth')), { id: 'person_seth', display_name: 'Seth' });
  await deleteKey(store, personKey('person_seth'));
  assert.equal(await getJSON(store, personKey('person_seth')), null);
});

test('buildMembershipRecord contains only link_id, canonical_ref, created_at, and schema_version', () => {
  const record = buildMembershipRecord({ linkId: 'ul_abc', canonicalRef: 'shared:person:person_seth', now: () => '2026-09-11T00:00:00.000Z' });
  assert.deepEqual(Object.keys(record).sort(), ['canonical_ref', 'created_at', 'link_id', 'schema_version']);
  assert.equal(record.link_id, 'ul_abc');
  assert.equal(record.canonical_ref, 'shared:person:person_seth');
});

test('listMembership reads every membership blob under a prefix and dedupes by link_id', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  await setJSON(store, `${prefix}ul_one`, buildMembershipRecord({ linkId: 'ul_one', canonicalRef: sourceRef }));
  await setJSON(store, `${prefix}ul_two`, buildMembershipRecord({ linkId: 'ul_two', canonicalRef: sourceRef }));
  // A duplicate write under a different key for the same link_id must not
  // produce two results.
  await setJSON(store, `${prefix}ul_one_dup`, buildMembershipRecord({ linkId: 'ul_one', canonicalRef: sourceRef }));

  const results = await listMembership(store, prefix, sourceRef);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(r => r.link_id).sort(), ['ul_one', 'ul_two']);
});

test('listMembership drops a record whose retained canonical_ref does not match (hash-collision protection)', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  await setJSON(store, `${prefix}ul_real`, buildMembershipRecord({ linkId: 'ul_real', canonicalRef: sourceRef }));
  // Simulates a hash collision: same prefix, but the retained canonical ref
  // is for a different source entirely.
  await setJSON(store, `${prefix}ul_collision`, buildMembershipRecord({ linkId: 'ul_collision', canonicalRef: 'tasks:task:task_unrelated' }));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), ['ul_real']);
});

test('listMembership ignores an _index key under the prefix', async () => {
  const store = createMemoryStore();
  const sourceRef = 'tasks:task:task_email_seth';
  const prefix = bySourcePrefix(sourceRef);
  await setJSON(store, `${prefix}_index`, ['not-a-membership-record']);
  await setJSON(store, `${prefix}ul_real`, buildMembershipRecord({ linkId: 'ul_real', canonicalRef: sourceRef }));

  const results = await listMembership(store, prefix, sourceRef);
  assert.deepEqual(results.map(r => r.link_id), ['ul_real']);
});
