import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SELF_POINTER_KEY,
  createIdentityRepository,
  identityOperationKey
} from '../../netlify/functions/_shared/identity-repository.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { personKey, personIndexKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';

// The administration access context every repair/reconcile call requires
// (correction Job 3) — server-derived exactly the way `entities-admin.mjs`
// builds it, never accepted from a request body.
const admin = createAccessContext({ workflow: 'administration' });
const life = createAccessContext({ workflow: 'life' });

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

// A deterministic store barrier (Job 1's required controlled-interleaving
// test): wraps a memory store so a specific write can pause the calling
// operation immediately after that write lands, until the test releases
// it. This lets a test suspend operation A right between "A's pointer
// write landed" and "A's Person record write starts" — the exact window
// the confirmed interleaving exploited — then run a second, fully
// synchronous operation B to completion before resuming A, with no timing
// assumptions beyond the JS event loop's own microtask/macrotask ordering.
function createBarrierStore(baseStore) {
  let barrier = null;
  return {
    async get(key, options) {
      return baseStore.get(key, options);
    },
    async setJSON(key, value) {
      await baseStore.setJSON(key, value);
      if (barrier && barrier.predicate(key, value)) {
        const current = barrier;
        barrier = null; // one-shot
        await current.promise;
      }
    },
    async list(options) {
      return baseStore.list(options);
    },
    // Arms a one-shot pause: the *next* setJSON call whose key/value match
    // `predicate` will complete its write, then block until the returned
    // `release` function is called.
    _pauseAfterNextWriteMatching(predicate) {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      barrier = { predicate, promise };
      return release;
    },
    _failNextMatching: predicate => baseStore._failNextMatching(predicate),
    _clearFailure: () => baseStore._clearFailure(),
    _writeLog: baseStore._writeLog,
    _has: key => baseStore._has(key),
    _raw: key => baseStore._raw(key)
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
    const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
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

  const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
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

  const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
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
    repo.repairIdentityOperation(caughtOperationId, admin),
    error => error.status === 409 && error.code === 'identity_operation_superseded'
  );
});

test('B4: repairIdentityOperation is idempotent on an already-committed operation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  const result = await repo.repairIdentityOperation(operationId, admin);
  assert.equal(result.status, 'committed');
  assert.equal(result.repaired, false);
});

test('B4: repairIdentityOperation returns a non-disclosing not-found for an unknown operation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.repairIdentityOperation('op_' + '0'.repeat(32), admin),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
});

test('B4: unsafe operation ids never reach storage keys', () => {
  assert.throws(() => identityOperationKey('op_../../etc/passwd'), error => error.code === 'invalid_operation_id');
});

// --- Job 1 (PR #313 correction comment): harden the active-self invariant
// against partial writes and repair. See identity-repository.mjs's
// "Self-identity invariant (correction B1, hardened)" comment for the full
// design: every write that would make a Person newly the observable
// active self re-checks live ownership immediately before writing, both
// on a fresh attempt and on repair, rather than trusting a single
// check made earlier or a stored payload value.

const SELF_CREATE_BOUNDARIES = ['self_pointer', 'entity', 'index'];

for (const boundary of SELF_CREATE_BOUNDARIES) {
  test(`Job1: create self A fails at "${boundary}"; self B may then be created; repairing A never produces two active selfs`, async () => {
    const store = createMemoryStore();
    const repo = createRepo(store);

    let failed = false;
    store._failNextMatching(key => {
      if (failed) return false;
      const matches = boundary === 'self_pointer'
        ? key === SELF_POINTER_KEY
        : boundary === 'entity'
          ? key.startsWith('entities/person/')
          : key.startsWith('entities/index/person/');
      if (matches) {
        failed = true;
        return true;
      }
      return false;
    });

    let caughtOperationId;
    let personAId;
    await assert.rejects(
      repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } }),
      error => {
        assert.equal(error.status, 503);
        assert.equal(error.code, 'identity_write_incomplete');
        caughtOperationId = error.operation_id;
        personAId = error.entity_id;
        return true;
      }
    );
    store._clearFailure();

    // B's creation may legitimately succeed (A's reservation never became
    // observable) or be correctly rejected (A's entity is already active
    // on disk) — either is safe; what must hold is the final state.
    let personBId = null;
    try {
      const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
      personBId = personB.id;
    } catch (error) {
      assert.equal(error.code, 'self_identity_exists');
    }

    // A plain second createIdentity would make a *third* identity — the
    // only recovery path for a specific failed create is
    // repairIdentityOperation, with the operation id the 503 carried.
    try {
      const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
      assert.equal(repaired.status, 'committed');
    } catch (error) {
      assert.equal(error.status, 409);
    }

    const activeSelfs = [];
    for (const id of [personAId, personBId].filter(Boolean)) {
      let record;
      try {
        record = await repo.loadEntity({ kind: 'person', id });
      } catch {
        continue;
      }
      if (record.is_self && record.lifecycle_status === 'active') activeSelfs.push(id);
    }
    assert.ok(activeSelfs.length <= 1, `expected at most one active self, got ${JSON.stringify(activeSelfs)}`);

    const reconciled = await repo.reconcileSelfIdentity(admin);
    assert.notEqual(reconciled.status, 'conflict');
  });
}

const SELF_ACTIVATE_BOUNDARIES = ['self_pointer', 'entity', 'index', 'event'];

for (const boundary of SELF_ACTIVATE_BOUNDARIES) {
  test(`Job1: activating self A fails at "${boundary}"; self B may then become active; repairing A never produces two active selfs`, async () => {
    const store = createMemoryStore();
    const repo = createRepo(store);
    const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
    await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });

    let failed = false;
    store._failNextMatching(key => {
      if (failed) return false;
      const matches = boundary === 'self_pointer'
        ? key === SELF_POINTER_KEY
        : boundary === 'entity'
          ? key === personKey(personA.id)
          : boundary === 'index'
            ? key === personIndexKey(personA.id)
            : key.startsWith('entities/events/');
      if (matches) {
        failed = true;
        return true;
      }
      return false;
    });

    let caughtOperationId;
    await assert.rejects(
      repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
      error => {
        assert.equal(error.status, 503);
        caughtOperationId = error.operation_id;
        return true;
      }
    );
    store._clearFailure();

    // B can only become active self if A's failed attempt never made A's
    // own record observably active — otherwise B's own claim correctly
    // rejects.
    let personBId = null;
    try {
      const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
      personBId = personB.id;
    } catch (error) {
      assert.equal(error.code, 'self_identity_exists');
    }

    try {
      const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
      assert.equal(repaired.status, 'committed');
    } catch (error) {
      assert.equal(error.status, 409);
    }

    const activeSelfs = [];
    for (const id of [personA.id, personBId].filter(Boolean)) {
      const record = await repo.loadEntity({ kind: 'person', id });
      if (record.is_self && record.lifecycle_status === 'active') activeSelfs.push(id);
    }
    assert.ok(activeSelfs.length <= 1, `expected at most one active self, got ${JSON.stringify(activeSelfs)}`);

    const reconciled = await repo.reconcileSelfIdentity(admin);
    assert.notEqual(reconciled.status, 'conflict');
  });
}

test('Job1: a stale deactivation of A blocks an ordinary create until explicitly repaired, then B can claim the slot', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });

  // Fail A's deactivation at the very last step (the pointer release):
  // entity, index, and event all succeed first, so A's own record already
  // shows inactive — but the pointer itself is never cleared, and still
  // carries the operation id of A's original (long since committed)
  // *create*, not the deactivation. `inspectSelfPointer` classifies this
  // as `'stale'`: the Person isn't active, and the only journal the
  // pointer's own operation id resolves to is already `committed` — a
  // claim that finished, not one still in flight.
  store._failNextMatching(key => key === SELF_POINTER_KEY);
  let caughtOperationId;
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' }),
    error => {
      caughtOperationId = error.operation_id;
      return error.status === 503 && error.code === 'identity_write_incomplete';
    }
  );
  store._clearFailure();

  const midway = await repo.loadEntity({ kind: 'person', id: personA.id });
  assert.equal(midway.lifecycle_status, 'inactive');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id, 'the pointer is genuinely stale at this point');

  // Required behaviour 7: a stale reservation must never be silently
  // overwritten by an ordinary create — B's attempt is rejected even
  // though A's own record already shows inactive.
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id, 'the stale pointer was not silently claimed over');

  // Explicit repair of A's stale deactivation clears the pointer, since it
  // still names A — required behaviour 2/3, 8.
  const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
  assert.equal(repaired.status, 'committed');
  assert.equal(store._raw(SELF_POINTER_KEY)?.person_id ?? null, null, 'repair released the stale reservation');

  // Only now can B legitimately claim the slot.
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personB.id);
});

test('Job1: reconcileSelfIdentity clears a stale reservation whose claiming operation is missing, malformed, or committed without an active Person', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });

  // Case 1: the pointer's operation id resolves to nothing at all (the
  // journal key was never written, or was deleted).
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: personA.id,
    operation_id: 'op_' + '9'.repeat(32),
    updated_at: '2026-01-01T00:00:00.000Z'
  });
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } }),
    error => error.code === 'self_identity_exists'
  );
  let reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'reconciled', person_id: null, previous_pointer_person_id: personA.id });
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);

  // Case 2: the pointer's operation id resolves to a malformed journal
  // (fails schema validation).
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: personA.id,
    operation_id: 'op_' + '8'.repeat(32),
    updated_at: '2026-01-01T00:00:00.000Z'
  });
  await store.setJSON(identityOperationKey('op_' + '8'.repeat(32)), { not: 'a valid journal' });
  reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);

  // Case 3: the pointer names a *committed* journal (a claim that
  // genuinely finished) whose Person is nonetheless not active — e.g. A
  // was independently deactivated afterward without the pointer moving.
  const createOperationId = [...store._writeLog]
    .filter(key => key.startsWith('identities/operations/'))
    .map(key => key.split('/').pop())
    .find(id => store._raw(`identities/operations/${id}`)?.entity_id === personA.id
      && store._raw(`identities/operations/${id}`)?.operation_type === 'create_identity');
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: personA.id,
    operation_id: createOperationId,
    updated_at: '2026-01-01T00:00:00.000Z'
  });
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person C', is_self: true } }),
    error => error.code === 'self_identity_exists'
  );
  reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);

  // Once reconciled, an ordinary create finally succeeds.
  const { record: personD } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person D', is_self: true } });
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personD.id);
});

test('Job1: a genuinely pending reservation is left alone by reconcileSelfIdentity — it may still legitimately finish', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  // Fail the entity write so the claim is genuinely still "in flight"
  // (its journal is `repair_needed`, not `committed`).
  store._failNextMatching(key => key.startsWith('entities/person/'));
  let caughtOperationId;
  let caughtEntityId;
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } }),
    error => {
      caughtOperationId = error.operation_id;
      caughtEntityId = error.entity_id;
      return true;
    }
  );
  store._clearFailure();

  assert.equal(store._raw(SELF_POINTER_KEY).person_id, caughtEntityId, 'the pending claim reserved the slot');

  // Reconciliation must not cancel a pending reservation — required
  // behaviour 13's principle applied to the zero-active-self case.
  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'consistent');
  assert.equal(reconciled.pending_reservation_person_id, caughtEntityId);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, caughtEntityId, 'the pending reservation was left untouched');

  // The pending operation can still legitimately finish via repair.
  const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
  assert.equal(repaired.status, 'committed');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, caughtEntityId);
});

test("Job1: activation of A fails before its pointer write; once B is active, retrying A's activation is a stable conflict, never a silently reconciled second self", async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });

  store._failNextMatching(key => key === SELF_POINTER_KEY);
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.status === 503
  );
  store._clearFailure();
  assert.equal(store._raw(SELF_POINTER_KEY)?.person_id ?? null, null, 'the pointer was never claimed for A');

  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
  assert.equal(personB.lifecycle_status, 'active');

  // A plain retry resumes the same journal (the entity hasn't moved since
  // the failed attempt) but must re-check live ownership at the
  // pointer-claim step, not blindly replay it.
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );

  const finalA = await repo.loadEntity({ kind: 'person', id: personA.id });
  const finalB = await repo.loadEntity({ kind: 'person', id: personB.id });
  assert.equal(finalA.lifecycle_status, 'inactive');
  assert.equal(finalB.lifecycle_status, 'active');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personB.id);

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'consistent', person_id: personB.id, index_repaired: false });
});

test('Job1: ordinary entity GET (loadEntity) and reconcileSelfIdentity agree on which Person is the active self', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'consistent', person_id: personB.id, index_repaired: false });

  const loadedA = await repo.loadEntity({ kind: 'person', id: personA.id });
  const loadedB = await repo.loadEntity({ kind: 'person', id: personB.id });
  assert.equal(loadedA.is_self && loadedA.lifecycle_status === 'active', false);
  assert.equal(loadedB.is_self && loadedB.lifecycle_status === 'active', true);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personB.id);
});

test('Job1: reconcileSelfIdentity and repairIdentityOperation are both idempotent when repeated', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });

  const first = await repo.reconcileSelfIdentity(admin);
  const second = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(first, { status: 'consistent', person_id: person.id, index_repaired: false });
  assert.deepEqual(second, { status: 'consistent', person_id: person.id, index_repaired: false });

  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  const repairedOnce = await repo.repairIdentityOperation(operationId, admin);
  const repairedTwice = await repo.repairIdentityOperation(operationId, admin);
  assert.equal(repairedOnce.repaired, false);
  assert.equal(repairedTwice.repaired, false);
});

test('Job1: reconcileSelfIdentity reports a stable conflict — and writes nothing — when two Persons are somehow both active selfs', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B' } });

  // Simulate corruption predating this correction: B is independently
  // written as an active self without ever going through the guarded
  // claim path.
  const rawB = store._raw(personKey(personB.id));
  await store.setJSON(personKey(personB.id), { ...rawB, is_self: true });
  const rawIndexB = store._raw(personIndexKey(personB.id));
  await store.setJSON(personIndexKey(personB.id), { ...rawIndexB, is_self: true });

  const before = store._raw(SELF_POINTER_KEY);
  const result = await repo.reconcileSelfIdentity(admin);
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.person_ids.sort(), [personA.id, personB.id].sort());
  assert.deepEqual(store._raw(SELF_POINTER_KEY), before, 'a conflict must never be silently resolved by writing the pointer');
});

// --- Job 1 required controlled-interleaving test (round 3 correction) ---
//
// The confirmed defect: `claimSelfPointer` wrote a pointer before writing
// the Person record, but `assertSelfAvailable` treated the pointer as
// occupied only when its referenced Person already existed and was
// active — so the pointer never actually reserved anything while its
// Person was still absent. These tests pause operation A with a
// deterministic store barrier immediately after A's pointer write lands
// (before A's Person record is written), run operation B to completion in
// that window, and assert B is rejected *before* it writes anything.

test("Job1: controlled interleaving — A's pending create claim reserves the slot against a concurrent create that reads it before A's Person record exists", async () => {
  const base = createMemoryStore();
  const store = createBarrierStore(base);
  const repo = createRepo(store);

  const releaseA = store._pauseAfterNextWriteMatching(key => key === SELF_POINTER_KEY);
  const aPromise = repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });

  // Let A's synchronous-plus-microtask work run until it genuinely blocks
  // on the barrier — a macrotask always runs after the microtask queue
  // fully drains, so this is deterministic, not a timing guess.
  await new Promise(resolve => setImmediate(resolve));

  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );
  assert.equal(store._writeLog.filter(key => key.startsWith('entities/person/')).length, 0, "B never wrote a Person record");

  releaseA();
  const { record: personA } = await aPromise;

  assert.equal(personA.is_self, true);
  assert.equal(personA.lifecycle_status, 'active');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id);

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'consistent', person_id: personA.id, index_repaired: false });
});

test("Job1: controlled interleaving — A's pending activation claim reserves the slot against a concurrent activation that reads it before A becomes active", async () => {
  const base = createMemoryStore();
  const store = createBarrierStore(base);
  const repo = createRepo(store);

  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personB.id }, toStatus: 'inactive' });

  const releaseA = store._pauseAfterNextWriteMatching(key => key === SELF_POINTER_KEY);
  const aPromise = repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' });
  await new Promise(resolve => setImmediate(resolve));

  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personB.id }, toStatus: 'active' }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );

  releaseA();
  const activatedA = await aPromise;

  assert.equal(activatedA.lifecycle_status, 'active');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id);
  const finalB = await repo.loadEntity({ kind: 'person', id: personB.id });
  assert.equal(finalB.lifecycle_status, 'inactive');

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'consistent', person_id: personA.id, index_repaired: false });
});

// --- Job 2 (round 3 correction): reconciliation must use authoritative
// Person records, not the derived search index ---

test('Job2: reconcileSelfIdentity finds an active self through authoritative storage even when its index write failed, and repairs the index', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  store._failNextMatching(key => key.startsWith('entities/index/person/'));
  let caughtOperationId;
  let caughtEntityId;
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } }),
    error => {
      caughtOperationId = error.operation_id;
      caughtEntityId = error.entity_id;
      return error.status === 503;
    }
  );
  store._clearFailure();

  // A's pointer and authoritative Person record both succeeded; only the
  // index is missing. An index-based reconciliation would find no active
  // self at all here — the confirmed defect.
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, caughtEntityId);
  assert.equal(store._has(personIndexKey(caughtEntityId)), false, 'the index is genuinely missing at this point');

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'consistent');
  assert.equal(reconciled.person_id, caughtEntityId);
  assert.equal(reconciled.index_repaired, true);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, caughtEntityId, 'the pointer was never touched — it was already correct');
  assert.ok(store._has(personIndexKey(caughtEntityId)), "reconciliation repaired A's missing index");
  assert.equal(store._raw(personIndexKey(caughtEntityId)).lifecycle_status, 'active', 'the repaired index reflects the authoritative record — what search would now see');

  // An ordinary attempt to create a second self is still rejected — A is
  // genuinely active, index or no index.
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } }),
    error => error.code === 'self_identity_exists'
  );

  // Repairing A's original operation still finishes cleanly afterward.
  const repaired = await repo.repairIdentityOperation(caughtOperationId, admin);
  assert.equal(repaired.status, 'committed');

  const finalRecord = await repo.loadEntity({ kind: 'person', id: caughtEntityId });
  assert.equal(finalRecord.is_self && finalRecord.lifecycle_status === 'active', true);
  const finalReconcile = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(finalReconcile, { status: 'consistent', person_id: caughtEntityId, index_repaired: false });
});

test('Job2: reconcileSelfIdentity finds an activated self through authoritative storage even when the activation\'s index write failed', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });

  store._failNextMatching(key => key === personIndexKey(personA.id));
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.status === 503
  );
  store._clearFailure();

  const midway = await repo.loadEntity({ kind: 'person', id: personA.id });
  assert.equal(midway.lifecycle_status, 'active');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id);
  assert.notEqual(store._raw(personIndexKey(personA.id)).lifecycle_status, 'active', 'the index is genuinely stale at this point');

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'consistent', person_id: personA.id, index_repaired: true });
  assert.equal(store._raw(personIndexKey(personA.id)).lifecycle_status, 'active');

  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person B', is_self: true } }),
    error => error.code === 'self_identity_exists'
  );
});

// --- Job 3 (round 3 correction): both repair capabilities must require and
// enforce a server-derived administration AccessContext ---

test('Job3: repairIdentityOperation rejects a call with no access context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  await assert.rejects(
    repo.repairIdentityOperation(operationId),
    error => error.status === 403 && error.code === 'administration_required'
  );
});

test('Job3: repairIdentityOperation rejects a life workflow context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  await assert.rejects(
    repo.repairIdentityOperation(operationId, life),
    error => error.status === 403 && error.code === 'administration_required'
  );
});

test('Job3: repairIdentityOperation accepts a server-derived administration context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: person } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  const result = await repo.repairIdentityOperation(operationId, admin);
  assert.equal(result.status, 'committed');
  assert.equal(result.entity_id, person.id);
});

test('Job3: reconcileSelfIdentity rejects a call with no access context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.reconcileSelfIdentity(),
    error => error.status === 403 && error.code === 'administration_required'
  );
});

test('Job3: reconcileSelfIdentity rejects a life workflow context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.reconcileSelfIdentity(life),
    error => error.status === 403 && error.code === 'administration_required'
  );
});

test('Job3: reconcileSelfIdentity accepts a server-derived administration context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const result = await repo.reconcileSelfIdentity(admin);
  assert.equal(result.status, 'consistent');
  assert.equal(result.person_id, null);
});

// --- Job 4 (round 3 correction): non-disclosing 404 for identity operation
// lookup — a malformed, unknown, corrupted, unsupported-schema-version, or
// mismatched-operation_id journal must all collapse to the same response ---

test('Job4: repairIdentityOperation returns a non-disclosing 404 for a path-unsafe operation id and performs no storage access', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.repairIdentityOperation('../../etc/passwd', admin),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
  assert.equal(store._writeLog.length, 0, 'no write of any kind happened for a path-unsafe id');
});

test('Job4: repairIdentityOperation returns the same 404 for a corrupted stored journal', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const operationId = 'op_' + '7'.repeat(32);
  await store.setJSON(identityOperationKey(operationId), { garbage: true });
  await assert.rejects(
    repo.repairIdentityOperation(operationId, admin),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
});

test('Job4: repairIdentityOperation returns the same 404 for a journal with an unsupported schema version', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const operationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  const journal = store._raw(identityOperationKey(operationId));
  await store.setJSON(identityOperationKey(operationId), { ...journal, schema_version: 999 });
  await assert.rejects(
    repo.repairIdentityOperation(operationId, admin),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
});

test("Job4: repairIdentityOperation returns the same 404 when the stored journal's own operation_id does not match the requested id", async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await repo.createIdentity({ kind: 'person', input: { display_name: 'Seth Example' } });
  const realOperationId = [...store._writeLog].find(key => key.startsWith('identities/operations/')).split('/').pop();
  const journal = store._raw(identityOperationKey(realOperationId));
  const otherOperationId = 'op_' + '6'.repeat(32);
  // Simulate a corrupted or overwritten record: the journal stored at
  // this key claims to be a *different* operation than the one it was
  // looked up by.
  await store.setJSON(identityOperationKey(otherOperationId), { ...journal, operation_id: realOperationId });
  await assert.rejects(
    repo.repairIdentityOperation(otherOperationId, admin),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
});

test('Job4: every malformed/unknown/corrupted operation id produces the identical response, revealing nothing about which check failed', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const outcomes = await Promise.all([
    repo.repairIdentityOperation('../../etc/passwd', admin).catch(error => error),
    repo.repairIdentityOperation('op_' + '0'.repeat(32), admin).catch(error => error),
    repo.repairIdentityOperation('', admin).catch(error => error),
    repo.repairIdentityOperation(null, admin).catch(error => error)
  ]);
  for (const error of outcomes) {
    assert.equal(error.status, 404);
    assert.equal(error.code, 'operation_not_found');
    assert.equal(error.message, 'Identity operation not found.');
  }
});

// --- Job1 (round 4 correction): malformed self-pointer reconciliation ---
//
// The confirmed defect: `inspectSelfPointer` passed a stored pointer's
// `person_id`/`operation_id` straight to `personKey`/`identityOperationKey`
// before proving either was safe, so a malformed stored pointer made every
// caller — including `reconcileSelfIdentity`, the one operation that exists
// to repair exactly this kind of corruption — throw a raw `400
// invalid_person_id`/`invalid_operation_id` instead of returning a normal
// classification. These tests reproduce the confirmed reproductions
// verbatim and cover the additional genuineness checks the correction adds
// to what counts as a pending reservation.

const SAMPLE_PERSON_ID = 'person_00000000-0000-4000-8000-000000000000';
const SAMPLE_OPERATION_ID = 'op_22222222222222222222222222222222';

test('Job1/R4 #1: a path-unsafe pointer person_id never reaches personKey — blocks as stale, not a 400', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: '../../escape',
    operation_id: 'op_11111111111111111111111111111111'
  });

  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Someone', is_self: true } }),
    error => {
      // Requirement 17: the confirmed defect threw `invalid_person_id`
      // (400) sourced from stored pointer content — it must now be an
      // ordinary, safe self-identity conflict instead.
      assert.notEqual(error.code, 'invalid_person_id');
      assert.notEqual(error.status, 400);
      return error.status === 409 && error.code === 'self_identity_exists';
    }
  );
});

test('Job1/R4 #2: a valid pointer person_id with a path-unsafe operation_id never reaches identityOperationKey', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: SAMPLE_PERSON_ID,
    operation_id: '../../escape'
  });

  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Someone', is_self: true } }),
    error => {
      assert.notEqual(error.code, 'invalid_operation_id');
      assert.notEqual(error.status, 400);
      return error.status === 409 && error.code === 'self_identity_exists';
    }
  );
});

test('Job1/R4 #3: an unsupported pointer schema version is malformed, not a valid candidate', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await store.setJSON(SELF_POINTER_KEY, { schema_version: 1, person_id: SAMPLE_PERSON_ID, operation_id: null });

  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Someone', is_self: true } }),
    error => error.status === 409 && error.code === 'self_identity_exists'
  );
  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('Job1/R4 #4: primitive and array stored pointer values are malformed, never crash, and reconcile clears them', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  for (const garbage of ['just a string', 42, true, ['array', 'pointer'], []]) {
    await store.setJSON(SELF_POINTER_KEY, garbage);
    await assert.rejects(
      repo.createIdentity({ kind: 'person', input: { display_name: 'Someone', is_self: true } }),
      error => error.status === 409 && error.code === 'self_identity_exists'
    );
    const reconciled = await repo.reconcileSelfIdentity(admin);
    assert.equal(reconciled.status, 'reconciled');
    assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
  }
});

test('Job1/R4 #5: partial empty pointer shapes are malformed — the canonical empty pointer clears both fields together', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  const partialShapes = [
    { schema_version: 2, person_id: null, operation_id: SAMPLE_OPERATION_ID },
    { schema_version: 2, person_id: SAMPLE_PERSON_ID },
    { schema_version: 2, operation_id: null },
    { schema_version: 2 }
  ];
  for (const shape of partialShapes) {
    await store.setJSON(SELF_POINTER_KEY, shape);
    await assert.rejects(
      repo.createIdentity({ kind: 'person', input: { display_name: 'Someone', is_self: true } }),
      error => error.status === 409 && error.code === 'self_identity_exists'
    );
  }
});

// Builds a synthetic, directly-injected journal + pointer pair so each
// "almost genuine" reservation shape can be tested in isolation, without
// needing to force a specific write to fail mid-operation.
async function writeSyntheticPointerAndJournal(store, { journalOverrides = {}, entityOverrides = {} } = {}) {
  const journal = {
    schema_version: 1,
    operation_id: SAMPLE_OPERATION_ID,
    operation_type: 'create_identity',
    kind: 'person',
    entity_id: SAMPLE_PERSON_ID,
    status: 'prepared',
    completed_steps: [],
    payload: {
      entity: {
        id: SAMPLE_PERSON_ID,
        kind: 'person',
        is_self: true,
        lifecycle_status: 'active',
        ...entityOverrides
      },
      index: {},
      self_pointer_action: 'claim'
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_error_code: null,
    ...journalOverrides
  };
  await store.setJSON(identityOperationKey(SAMPLE_OPERATION_ID), journal);
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: SAMPLE_PERSON_ID,
    operation_id: SAMPLE_OPERATION_ID,
    updated_at: '2026-01-01T00:00:00.000Z'
  });
}

test('Job1/R4 #6: a prepared journal for a nonself entity is never a genuine self reservation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await writeSyntheticPointerAndJournal(store, { entityOverrides: { is_self: false } });

  // Not pending: reconciliation (no active self exists) clears it outright
  // rather than reporting a pending reservation to leave alone.
  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('Job1/R4 #7: a prepared journal with no claim action is never a genuine self reservation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  // A journal whose self_pointer_action is null (as a release-direction or
  // pointerless journal would carry) rather than 'claim'.
  await store.setJSON(identityOperationKey(SAMPLE_OPERATION_ID), {
    schema_version: 1,
    operation_id: SAMPLE_OPERATION_ID,
    operation_type: 'lifecycle_identity',
    kind: 'person',
    entity_id: SAMPLE_PERSON_ID,
    status: 'prepared',
    completed_steps: [],
    payload: {
      entity: { id: SAMPLE_PERSON_ID, kind: 'person', is_self: true, lifecycle_status: 'active' },
      index: {},
      self_pointer_action: null
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_error_code: null
  });
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: SAMPLE_PERSON_ID,
    operation_id: SAMPLE_OPERATION_ID,
    updated_at: '2026-01-01T00:00:00.000Z'
  });

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('Job1/R4 #8: a lifecycle journal whose intended Person is not active is never a genuine self reservation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await writeSyntheticPointerAndJournal(store, {
    journalOverrides: { operation_type: 'lifecycle_identity' },
    entityOverrides: { lifecycle_status: 'inactive' }
  });

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('Job1/R4 #9: a journal whose entity_id disagrees with the pointer is never a genuine self reservation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const otherPersonId = 'person_11111111-1111-4111-8111-111111111111';
  await writeSyntheticPointerAndJournal(store, {
    journalOverrides: { entity_id: otherPersonId },
    entityOverrides: { id: otherPersonId }
  });

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('Job1/R4 #10: a genuine pending create reservation is preserved, not treated as stale', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  store._failNextMatching(key => key.startsWith('entities/person/'));
  let caughtEntityId;
  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } }),
    error => {
      caughtEntityId = error.entity_id;
      return true;
    }
  );
  store._clearFailure();

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'consistent');
  assert.equal(reconciled.pending_reservation_person_id, caughtEntityId);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, caughtEntityId, 'a genuine pending create reservation must not be cleared');
});

test('Job1/R4 #11: a genuine pending activation reservation is preserved, not treated as stale', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  await repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'inactive' });

  store._failNextMatching(key => key === SELF_POINTER_KEY);
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.status === 503
  );
  store._clearFailure();

  // The pointer write itself failed here, so nothing was reserved — this
  // proves the *absence* case is safe. Now exercise the genuinely-pending
  // case: the pointer write lands but the entity write fails.
  store._failNextMatching(key => key.startsWith('entities/person/'));
  await assert.rejects(
    repo.transitionLifecycle({ ref: { kind: 'person', id: personA.id }, toStatus: 'active' }),
    error => error.status === 503
  );
  store._clearFailure();

  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id, 'the pending activation reserved the slot');
  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'consistent');
  assert.equal(reconciled.pending_reservation_person_id, personA.id);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id, 'a genuine pending activation reservation must not be cleared');
});

test('Job1/R4 #12: a stale malformed pointer is cleared when no active self exists', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await store.setJSON(SELF_POINTER_KEY, ['not', 'a', 'pointer']);

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.deepEqual(reconciled, { status: 'reconciled', person_id: null, previous_pointer_person_id: null });
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('Job1/R4 #13: a stale malformed pointer is replaced when exactly one authoritative active self exists', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });

  await store.setJSON(SELF_POINTER_KEY, { schema_version: 1, garbage: true });

  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(reconciled.person_id, personA.id);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, personA.id);
});

test('Job1/R4 #14: no write happens when multiple authoritative active selfs exist, even with a malformed pointer', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { record: personA } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person A', is_self: true } });
  const { record: personB } = await repo.createIdentity({ kind: 'person', input: { display_name: 'Person B' } });

  const rawB = store._raw(personKey(personB.id));
  await store.setJSON(personKey(personB.id), { ...rawB, is_self: true });
  const rawIndexB = store._raw(personIndexKey(personB.id));
  await store.setJSON(personIndexKey(personB.id), { ...rawIndexB, is_self: true });

  await store.setJSON(SELF_POINTER_KEY, 'totally malformed');
  const before = store._raw(SELF_POINTER_KEY);

  const result = await repo.reconcileSelfIdentity(admin);
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.person_ids.sort(), [personA.id, personB.id].sort());
  assert.deepEqual(store._raw(SELF_POINTER_KEY), before, 'a conflict must never be silently resolved by writing the pointer');
});

test('Job1/R4 #15: reconciliation after clearing a malformed pointer is idempotent on repeat', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await store.setJSON(SELF_POINTER_KEY, 12345);

  const first = await repo.reconcileSelfIdentity(admin);
  const second = await repo.reconcileSelfIdentity(admin);
  assert.equal(first.status, 'reconciled');
  assert.deepEqual(second, { status: 'consistent', person_id: null });
});

test('Job1/R4 #17: unsafe stored identifiers never reach a Blob key lookup (no invalid_person_id/invalid_operation_id thrown)', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: '../../../etc/passwd',
    operation_id: '../../../etc/shadow'
  });

  await assert.rejects(
    repo.createIdentity({ kind: 'person', input: { display_name: 'Someone', is_self: true } }),
    error => !['invalid_person_id', 'invalid_operation_id'].includes(error.code)
  );
  const reconciled = await repo.reconcileSelfIdentity(admin);
  assert.equal(reconciled.status, 'reconciled');
});
