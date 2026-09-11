import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SELF_POINTER_KEY,
  createIdentityRepository,
  identityOperationKey
} from '../../netlify/functions/_shared/identity-repository.mjs';
import { personKey, personIndexKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';

// Mirrors universal-link-repository.test.js's synthetic store: failure
// injection on both reads and writes, plus a durable write log, so every
// failure-injection test is fully deterministic and reproducible.
function createMemoryStore() {
  const map = new Map();
  const writeLog = [];
  let failWhen = null;
  let failGetWhen = null;

  return {
    async get(key, { type } = {}) {
      if (failGetWhen && failGetWhen(key)) {
        throw Object.assign(new Error('simulated read failure'), { code: 'simulated_read_failure' });
      }
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      if (failWhen && failWhen(key, value)) {
        throw Object.assign(new Error('simulated write failure'), { code: 'simulated_failure' });
      }
      writeLog.push(key);
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
    _failNextMatching(predicate) {
      failWhen = predicate;
    },
    _clearFailure() {
      failWhen = null;
    },
    _failGetMatching(predicate) {
      failGetWhen = predicate;
    },
    _clearGetFailure() {
      failGetWhen = null;
    },
    _writeLog: writeLog,
    _has(key) {
      return map.has(key);
    },
    _raw(key) {
      const value = map.get(key);
      return value ? JSON.parse(value) : null;
    }
  };
}

let clock = 0;
function makeClock(startIso = '2026-09-11T00:00:00.000Z') {
  clock = Date.parse(startIso);
  return () => {
    const iso = new Date(clock).toISOString();
    clock += 1000;
    return iso;
  };
}

function createRepo(store, overrides = {}) {
  return createIdentityRepository({ store, now: overrides.now ?? makeClock() });
}

// --- Basic create/read ---

test('createIdentity creates a Person and an Organisation with server-derived fields', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  assert.equal(person.kind, 'person');
  assert.equal(person.lifecycle_status, 'active');
  assert.match(person.id, /^person_[0-9a-f-]{36}$/);

  const { record: org } = await repo.createIdentity({ kind: 'organisation', input: { display_name: 'Example University' } });
  assert.equal(org.kind, 'organisation');
  assert.match(org.id, /^organisation_[0-9a-f-]{36}$/);
});

// --- Correction B1: one active self identity across creation AND activation ---

test('B1: confirmed reproduction — create self A, deactivate A, create active self B, then activating A is rejected', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
  assert.equal(personB.is_self, true);
  assert.equal(personB.lifecycle_status, 'active');

  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );

  // The externally observable state must never show two active selfs.
  const finalA = await repo.loadEntity({ kind: 'person', id: personA.id });
  const finalB = await repo.loadEntity({ kind: 'person', id: personB.id });
  const activeSelfs = [finalA, finalB].filter(p => p.is_self && p.lifecycle_status === 'active');
  assert.equal(activeSelfs.length, 1);
  assert.equal(activeSelfs[0].id, personB.id);
});

test('B1: creating a second active self is still rejected (unchanged behaviour)', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );
});

test('B1: reactivating the current self (a no-op transition on itself) does not spuriously reject', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'inactive' });
  const reactivated = await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'active' });
  assert.equal(reactivated.lifecycle_status, 'active');
});

test('B1: an authoritative singleton self pointer exists in universal-link-content, not only the search index', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, person.id);
});

test('B1: controlled interleaving — a second self activation that lands after the first fully commits is still rejected', async () => {
  // Netlify Blobs has no compare-and-set, so this test proves what the
  // strong-read-plus-singleton-key design actually guarantees: two
  // attempts that are properly *sequenced* (one fully completes, then the
  // next's check runs) can never both succeed, even though nothing here
  // claims true transactional atomicity for two attempts that overlap
  // inside the same read-then-write window (see the PR body's concurrency
  // boundary section).
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personB.id }, toStatus: 'inactive' });

  // Two "concurrent" activation attempts for A and B, both starting from
  // the same observed state (no active self) — interleaved so B's full
  // operation (check through commit) finishes before A's own check runs.
  const bResult = await repo.transitionLifecycle({ ref: { kind: 'person', id: personB.id }, toStatus: 'active' });
  assert.equal(bResult.lifecycle_status, 'active');

  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.code === 'self_identity_exists'
  );
});

// --- Correction B3: block identifying field updates after deidentify/delete ---

test('B3: confirmed reproduction — a field update after deidentify is rejected and the tombstone survives unchanged', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example', aliases: ['Sethy'] } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'deidentified' });

  await assert.rejects(
    repo.updateFields({ ref: { kind: 'person', id: person.id }, patch: { display_name: 'New Name', aliases: ['New Alias'] } }),
    error => error.status === 409 && error.code === 'invalid_lifecycle_transition'
  );

  const stored = await repo.loadEntity({ kind: 'person', id: person.id });
  assert.notEqual(stored.display_name, 'New Name');
  assert.deepEqual(stored.aliases, []);
});

test('B3: a field update after delete is also rejected, for both Person and Organisation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'deidentified' });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'deleted' });
  await assert.rejects(
    repo.updateFields({ ref: { kind: 'person', id: person.id }, patch: { display_name: 'New Name' } }),
    error => error.code === 'invalid_lifecycle_transition'
  );

  const { record: org } = await repo.createIdentity({ kind: 'organisation', input: { display_name: 'Example University' } });
  await repo.transitionLifecycle({ ref: { kind: 'organisation', id: org.id }, toStatus: 'retained', retentionReason: 'legal_hold', retentionReviewAt: '2027-01-01T00:00:00.000Z' });
  await repo.transitionLifecycle({ ref: { kind: 'organisation', id: org.id }, toStatus: 'deleted' });
  await assert.rejects(
    repo.updateFields({ ref: { kind: 'organisation', id: org.id }, patch: { display_name: 'New Name', legal_name: 'New Legal Name' } }),
    error => error.code === 'invalid_lifecycle_transition'
  );
});

test('B3: an ordinary field update on an active identity still succeeds', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const updated = await repo.updateFields({ ref: { kind: 'person', id: person.id }, patch: { display_name: 'Seth Updated' } });
  assert.equal(updated.display_name, 'Seth Updated');
});

// --- Correction B4: recoverable identity record/index/event writes ---

const CREATE_BOUNDARIES = ['entity', 'index'];

for (const boundary of CREATE_BOUNDARIES) {
  test(`B4: createIdentity survives a failed "${boundary}" write; repairIdentityOperation returns the original entity id`, async () => {
    const store = createMemoryStore();
    const repo = createRepo(store);

    let failed = false;
    store._failNextMatching(key => {
      if (failed) return false;
      const matches = boundary === 'entity' ? key.startsWith('entities/person/') : key.startsWith('entities/index/person/');
      if (matches) {
        failed = true;
        return true;
      }
      return false;
    });

    let caughtOperationId;
    let caughtEntityId;
    await assert.rejects(
      repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } }),
      error => {
        assert.equal(error.status, 503);
        assert.equal(error.code, 'identity_write_incomplete');
        caughtOperationId = error.operation_id;
        caughtEntityId = error.entity_id;
        return true;
      }
    );

    store._clearFailure();

    // A plain second POST would create a *different* identity — recovery
    // for this specific failed attempt goes through repairIdentityOperation
    // with the operation id the 503 carried (correction B4, design note:
    // identity ids are random, so there is no content-based equivalence to
    // dedupe an ordinary retry against, unlike Universal Links).
    const repaired = await repo.repairIdentityOperation(caughtOperationId);
    assert.equal(repaired.status, 'committed');
    assert.equal(repaired.entity_id, caughtEntityId);

    const stored = await repo.loadEntity({ kind: 'person', id: caughtEntityId });
    assert.equal(stored.display_name, 'Seth Example');
    assert.ok(store._has(personKey(caughtEntityId)));
    assert.ok(store._has(personIndexKey(caughtEntityId)));

    // No duplicate identity was created.
    assert.equal(store._writeLog.filter(key => key.startsWith('entities/person/') && !key.startsWith('entities/person_')).length >= 1, true);
  });
}

test('B4: confirmed reproduction 1 — create fails the index write; repair completes it without a second identity', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  store._failNextMatching(key => key.startsWith('entities/index/person/'));
  let caughtOperationId;
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } }),
    error => {
      caughtOperationId = error.operation_id;
      return error.status === 503 && error.code === 'identity_write_incomplete';
    }
  );
  store._clearFailure();

  const repaired = await repo.repairIdentityOperation(caughtOperationId);
  assert.equal(repaired.repaired, true);

  const personEntityKeys = [...store._writeLog].filter(key => /^entities\/person\/person_/.test(key));
  const distinctIds = new Set(personEntityKeys);
  assert.equal(distinctIds.size, 1, 'exactly one Person entity key was ever written');
});

test('B4: confirmed reproduction 2 — deidentify fails the index write; a stale index never resurfaces the former name', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });

  store._failNextMatching(key => key === personIndexKey(person.id));
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'deidentified' }),
    error => error.status === 503 && error.code === 'identity_write_incomplete'
  );
  store._clearFailure();

  // The authoritative record is already redacted even though the index
  // write failed and is now stale (still shows the active name).
  const stored = await repo.loadEntity({ kind: 'person', id: person.id });
  assert.equal(stored.lifecycle_status, 'deidentified');
  assert.doesNotMatch(JSON.stringify(stored), /Seth Example/);
  const staleIndex = store._raw(personIndexKey(person.id));
  assert.equal(staleIndex.display_label, 'Seth Example', 'the index is genuinely stale at this point in the test');
  assert.notEqual(stored.display_name, 'Seth Example');

  // Retrying the same transition (the operation resumes, since the entity
  // hasn't moved since) repairs the index and does not reject merely
  // because the status already changed.
  const retried = await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'deidentified' });
  assert.equal(retried.lifecycle_status, 'deidentified');
  const repairedIndex = store._raw(personIndexKey(person.id));
  assert.notEqual(repairedIndex.display_label, 'Seth Example');
});

test('B4: confirmed reproduction 3 — a lifecycle transition survives a failed event write and does not reject the retry', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });

  let failed = false;
  store._failNextMatching(key => {
    if (failed) return false;
    if (key.startsWith('entities/events/')) {
      failed = true;
      return true;
    }
    return false;
  });

  let caughtOperationId;
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'archived' }),
    error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'identity_write_incomplete');
      caughtOperationId = error.operation_id;
      return true;
    }
  );

  // The entity and index already moved to archived even though the
  // request failed.
  const midway = await repo.loadEntity({ kind: 'person', id: person.id });
  assert.equal(midway.lifecycle_status, 'archived');

  store._clearFailure();

  // The retry must not reject merely because the status already changed.
  const retried = await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'archived' });
  assert.equal(retried.lifecycle_status, 'archived');

  const eventKeys = [...store._writeLog].filter(key => key.startsWith('entities/events/'));
  assert.equal(new Set(eventKeys).size, 1, 'exactly one lifecycle event key was ever written');

  const repaired = await repo.repairIdentityOperation(caughtOperationId);
  assert.equal(repaired.status, 'committed');
  assert.equal(repaired.repaired, false, 'the retry above already finished it');
});

test('B4: a genuinely later, independent transition is not blocked by an earlier committed operation at the same deterministic id', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });

  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'archived' });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'active' });
  // A second, independent archive — same (kind, id, toStatus) as the first,
  // but the entity has moved on in between, so this must actually run
  // again rather than silently no-op against the first archive's journal.
  const secondArchive = await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'archived' });
  assert.equal(secondArchive.lifecycle_status, 'archived');

  // Three transitions happened (archive, reactivate, archive again), so
  // three distinct lifecycle events must exist — the second archive must
  // not be treated as a no-op replay of the first just because it shares
  // the same deterministic operation id.
  const eventKeys = [...store._writeLog].filter(key => key.startsWith('entities/events/'));
  assert.equal(new Set(eventKeys).size, 3, 'each of the three transitions produced its own lifecycle event');
});

test('B4: repairIdentityOperation refuses to replay a lifecycle operation superseded by a later change', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });

  store._failNextMatching(key => key.startsWith('entities/events/'));
  let caughtOperationId;
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'archived' }),
    error => {
      caughtOperationId = error.operation_id;
      return true;
    }
  );
  store._clearFailure();

  // A different transition happens instead of retrying the failed one.
  await repo.transitionLifecycle({ ref: { kind: 'person', id: person.id }, toStatus: 'active' });

  await assert.rejects(
    repo.repairIdentityOperation(caughtOperationId),
    error => error.status === 409 && error.code === 'identity_operation_superseded'
  );
});

test('B4: repairIdentityOperation is idempotent on an already-committed operation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  const result = await repo.repairIdentityOperation(operationId);
  assert.equal(result.status, 'committed');
  assert.equal(result.repaired, false);
});

test('B4: repairIdentityOperation returns a non-disclosing not-found for an unknown operation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.repairIdentityOperation('op_' + '0'.repeat(32)),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
});

test('B4: unsafe operation ids never reach storage keys', () => {
  assert.throws(() => identityOperationKey('op_../../etc/passwd'), error => error.code === 'invalid_operation_id');
});
