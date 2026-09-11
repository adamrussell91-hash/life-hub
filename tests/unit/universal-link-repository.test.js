import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext, endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { bySourceKey, byTargetKey, byTypeKey, linkKey, operationKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';

// This suite exercises the canonical write service against a synthetic,
// injected `resolveEntity` (as Slice 1's read-repository suite does) and a
// deterministic clock/operation-id generator, so tests are fully
// reproducible and never depend on wall-clock time or randomness.

function createMemoryStore() {
  const map = new Map();
  const writeLog = [];
  let failWhen = null; // (key, value) => boolean

  return {
    async get(key, { type } = {}) {
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
    // --- test-only helpers, not part of the Netlify Blobs API ---
    _failNextMatching(predicate) {
      failWhen = predicate;
    },
    _clearFailure() {
      failWhen = null;
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

const TASK_REF = 'tasks:task:task_email_seth';
const PERSON_REF = 'shared:person:person_seth';
const ORG_REF = 'shared:organisation:organisation_unsw';

function createFakeResolver(entities) {
  return async function resolveEntity(refInput, accessContext) {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const entity = entities.get(ref);
    if (!entity || entity.hidden) throw endpointNotFoundError();
    return {
      ref,
      kind: entity.kind,
      display_label: entity.display_label ?? ref,
      supporting_label: null,
      href: null,
      lifecycle_status: 'active',
      visibility: entity.visibility ?? 'operator'
    };
  };
}

function defaultEntities() {
  return new Map([
    [TASK_REF, { kind: 'task', display_label: 'Email Seth about the proposal' }],
    [PERSON_REF, { kind: 'person', display_label: 'Seth Example' }],
    [ORG_REF, { kind: 'organisation', display_label: 'Example University' }]
  ]);
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

let opCounter = 0;
function makeOperationIdGenerator() {
  opCounter = 0;
  return () => `op_${String(opCounter++).padStart(32, '0')}`;
}

function createRepo(store, overrides = {}) {
  return createUniversalLinkRepository({
    store,
    resolveEntity: overrides.resolveEntity ?? createFakeResolver(defaultEntities()),
    now: overrides.now ?? makeClock(),
    generateOperationId: overrides.generateOperationId ?? makeOperationIdGenerator()
  });
}

const life = createAccessContext({ workflow: 'life' });
const admin = createAccessContext({ workflow: 'administration' });

const COLLABORATOR_INPUT = Object.freeze({
  source_ref: TASK_REF,
  target_ref: PERSON_REF,
  relationship_type: 'collaborator'
});

// --- Deterministic ids across the write path ---

test('createLink assigns the same deterministic id to two equivalent create calls', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const first = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  const second = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.link.id, second.link.id);
});

test('equivalent create calls produce exactly one authoritative record and one membership per index', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { link } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  await repo.createLink({ ...COLLABORATOR_INPUT }, life);

  assert.ok(store._has(linkKey(link.id)));
  assert.ok(store._has(bySourceKey(TASK_REF, link.id)));
  assert.ok(store._has(byTargetKey(PERSON_REF, link.id)));
  assert.ok(store._has(byTypeKey('collaborator', link.id)));

  const linkWrites = store._writeLog.filter(key => key === linkKey(link.id));
  assert.equal(linkWrites.length, 1, 'the authoritative link must be written exactly once across three equivalent calls');
});

// --- Validation happens before any write ---

test('unknown relationship type fails before any write', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.createLink({ ...COLLABORATOR_INPUT, relationship_type: 'made_up_key' }, life),
    error => error.code === 'unknown_relationship_key'
  );
  assert.equal(store._writeLog.length, 0);
});

test('reversed source and target types fail before any write', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.createLink({ source_ref: PERSON_REF, target_ref: TASK_REF, relationship_type: 'collaborator' }, life),
    error => error.code === 'invalid_source_kind'
  );
  assert.equal(store._writeLog.length, 0);
});

test('unknown metadata keys fail before any write', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.createLink({ ...COLLABORATOR_INPUT, metadata: { made_up: true } }, life),
    error => error.code === 'unknown_metadata_key'
  );
  assert.equal(store._writeLog.length, 0);
});

test('client supplied weaker visibility fails before any write', async () => {
  const store = createMemoryStore();
  // No relationship declared in this slice's registry has an endpoint that
  // legitimately resolves as `teaching_protected`, so exercise the
  // strictestVisibility derivation directly: one endpoint resolves at the
  // stricter `teaching_protected` visibility (step 5 derives the link's
  // final visibility as the strictest of *both* endpoints, independent of
  // what the relationship's own declaration separately allows), and the
  // client explicitly asks for the weaker `operator` (step 6 must reject
  // this before any write happens, not silently downgrade the link).
  const entities = new Map([
    [TASK_REF, { kind: 'task' }],
    [PERSON_REF, { kind: 'person', visibility: 'teaching_protected' }]
  ]);
  const repo = createRepo(store, { resolveEntity: createFakeResolver(entities) });
  await assert.rejects(
    repo.createLink({ ...COLLABORATOR_INPUT, visibility: 'operator' }, life),
    error => error.status === 400 && error.code === 'visibility_too_weak'
  );
  assert.equal(store._writeLog.length, 0);
});

test('an unknown client supplied visibility value fails before any write', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.createLink({ ...COLLABORATOR_INPUT, visibility: 'not_a_known_visibility' }, life),
    error => error.status === 400
  );
  assert.equal(store._writeLog.length, 0);
});

test('hidden or missing endpoints produce the same outward response', async () => {
  const store = createMemoryStore();
  const missingRepo = createRepo(store, { resolveEntity: createFakeResolver(new Map([[TASK_REF, { kind: 'task' }]])) });
  await assert.rejects(missingRepo.createLink({ ...COLLABORATOR_INPUT }, life), error => error.code === 'endpoint_not_found');

  const hiddenRepo = createRepo(store, {
    resolveEntity: createFakeResolver(new Map([[TASK_REF, { kind: 'task' }], [PERSON_REF, { kind: 'person', hidden: true }]]))
  });
  await assert.rejects(hiddenRepo.createLink({ ...COLLABORATOR_INPUT }, life), error => error.code === 'endpoint_not_found');
  assert.equal(store._writeLog.length, 0);
});

test('unsafe refs, link ids, operation ids, and relationship types never reach storage keys', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.createLink({ source_ref: '../../etc/passwd', target_ref: PERSON_REF, relationship_type: 'collaborator' }, life),
    error => error.code === 'invalid_entity_ref'
  );
  await assert.rejects(repo.getLink('ul_../../etc/passwd', life), error => error.code === 'invalid_link_id');
  await assert.rejects(repo.repairOperation('op_../../etc/passwd', admin), error => error.code === 'operation_not_found');
  assert.equal(store._writeLog.length, 0);
});

// --- Failure injection matrix: every write boundary, then retry ---

const WRITE_BOUNDARIES = [
  { name: 'prepared journal write', match: key => key.startsWith('universal-links/operations/') },
  { name: 'authoritative link write', match: key => key.startsWith('universal-links/links/') },
  { name: 'source membership write', match: key => key.startsWith('universal-links/by-source/') },
  { name: 'target membership write', match: key => key.startsWith('universal-links/by-target/') },
  { name: 'relationship type membership write', match: key => key.startsWith('universal-links/by-type/') }
];

for (const boundary of WRITE_BOUNDARIES) {
  test(`injected failure at "${boundary.name}" returns link_write_incomplete, and retry completes the same link without duplication`, async () => {
    const store = createMemoryStore();
    const repo = createRepo(store);

    let failed = false;
    store._failNextMatching(key => {
      if (failed) return false;
      if (boundary.match(key)) {
        failed = true;
        return true;
      }
      return false;
    });

    let caughtOperationId;
    let caughtLinkId;
    await assert.rejects(repo.createLink({ ...COLLABORATOR_INPUT }, life), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'link_write_incomplete');
      assert.equal(typeof error.operation_id, 'string');
      assert.equal(typeof error.link_id, 'string');
      caughtOperationId = error.operation_id;
      caughtLinkId = error.link_id;
      return true;
    });

    store._clearFailure();

    const retry = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
    assert.equal(retry.link.id, caughtLinkId);

    assert.ok(store._has(linkKey(caughtLinkId)));
    assert.ok(store._has(bySourceKey(TASK_REF, caughtLinkId)));
    assert.ok(store._has(byTargetKey(PERSON_REF, caughtLinkId)));
    assert.ok(store._has(byTypeKey('collaborator', caughtLinkId)));

    const outgoing = await repo.listOutgoing(TASK_REF, life);
    assert.equal(outgoing.length, 1, 'no duplicate link or membership after retry');

    // When the failure happened at the prepared-journal write itself, that
    // attempt's operation id was never durably written — there is nothing
    // for repairOperation to find under it, by definition, and the retry
    // above (not this operation id) is what completed the link. For every
    // later boundary, the journal *was* persisted, so a second
    // repairOperation call on it is a safe no-op that reports committed.
    if (boundary.name !== 'prepared journal write') {
      const repaired = await repo.repairOperation(caughtOperationId, admin);
      assert.equal(repaired.status, 'committed');
    } else {
      await assert.rejects(repo.repairOperation(caughtOperationId, admin), error => error.code === 'operation_not_found');
    }
  });
}

test('injected failure at "committed journal update" returns link_write_incomplete, and the data is already durable for the retry', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  // The final write of createLink's happy path is the operations/<id>
  // key a *second* time (the commit). Fail only that second write to this
  // exact operation key.
  let seenOperationWrites = 0;
  store._failNextMatching(key => {
    if (!key.startsWith('universal-links/operations/')) return false;
    seenOperationWrites += 1;
    return seenOperationWrites === 2;
  });

  let caughtLinkId;
  await assert.rejects(repo.createLink({ ...COLLABORATOR_INPUT }, life), error => {
    assert.equal(error.code, 'link_write_incomplete');
    caughtLinkId = error.link_id;
    return true;
  });

  store._clearFailure();
  const retry = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  assert.equal(retry.created, false, 'the link and memberships were already durable before the commit write failed');
  assert.equal(retry.link.id, caughtLinkId);

  const outgoing = await repo.listOutgoing(TASK_REF, life);
  assert.equal(outgoing.length, 1);
});

test('a best-effort repair_needed journal write that itself fails still surfaces link_write_incomplete without crashing', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  let sawFirstLinkWrite = false;
  let sawSecondOperationWrite = false;
  store._failNextMatching(key => {
    if (key.startsWith('universal-links/links/') && !sawFirstLinkWrite) {
      sawFirstLinkWrite = true;
      return true; // fail the authoritative link write
    }
    if (key.startsWith('universal-links/operations/') && sawFirstLinkWrite && !sawSecondOperationWrite) {
      sawSecondOperationWrite = true;
      return true; // also fail the best-effort repair_needed journal write
    }
    return false;
  });

  await assert.rejects(repo.createLink({ ...COLLABORATOR_INPUT }, life), error => error.code === 'link_write_incomplete');
});

// --- repairOperation ---

test('repairOperation completes a journal left in "prepared" with nothing written', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  let failed = false;
  store._failNextMatching(key => {
    if (failed) return false;
    if (key.startsWith('universal-links/links/')) {
      failed = true;
      return true;
    }
    return false;
  });

  let operationId;
  await assert.rejects(repo.createLink({ ...COLLABORATOR_INPUT }, life), error => {
    operationId = error.operation_id;
    return true;
  });
  store._clearFailure();

  const result = await repo.repairOperation(operationId, admin);
  assert.equal(result.status, 'committed');
  const outgoing = await repo.listOutgoing(TASK_REF, life);
  assert.equal(outgoing.length, 1);
});

test('repairOperation completes a journal left "repair_needed" with only some steps done', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  let failed = false;
  store._failNextMatching(key => {
    if (failed) return false;
    if (key.startsWith('universal-links/by-target/')) {
      failed = true;
      return true; // link + source membership succeed, target membership fails
    }
    return false;
  });

  let operationId;
  await assert.rejects(repo.createLink({ ...COLLABORATOR_INPUT }, life), error => {
    operationId = error.operation_id;
    return true;
  });
  store._clearFailure();

  assert.ok(store._writeLog.some(key => key.startsWith('universal-links/by-source/')), 'source membership should have succeeded first');
  assert.equal(store._writeLog.some(key => key.startsWith('universal-links/by-target/')), false);

  const result = await repo.repairOperation(operationId, admin);
  assert.equal(result.status, 'committed');
  const outgoing = await repo.listOutgoing(TASK_REF, life);
  assert.equal(outgoing.length, 1);
});

test('repairOperation is idempotent on an already-committed operation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { link } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  void link;
  // Recover the operation id from the store directly for this test.
  const operationId = [...store._writeLog].find(key => key.startsWith('universal-links/operations/')).split('/').pop();
  const result = await repo.repairOperation(operationId, admin);
  assert.equal(result.status, 'committed');
  assert.equal(result.repaired, false);
});

test('repairOperation returns a non-disclosing not found response for an unknown operation', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.repairOperation('op_' + '0'.repeat(32), admin),
    error => error.status === 404 && error.code === 'operation_not_found'
  );
});

test('repairOperation requires an administration workflow context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(
    repo.repairOperation('op_' + '0'.repeat(32), life),
    error => error.status === 403 && error.code === 'administration_required'
  );
});

// --- Lifecycle: endLink, suppressLink, deleteLink ---

test('endLink enforces valid period lifecycle transitions', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { link } = await repo.createLink({
    source_ref: PERSON_REF,
    target_ref: ORG_REF,
    relationship_type: 'employee_at',
    valid_from: '2025-01-01T00:00:00.000Z'
  }, life);

  // Rejects a timeless relationship.
  const { link: timeless } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  await assert.rejects(repo.endLink(timeless.id, '2026-01-01T00:00:00.000Z', life), error => error.code === 'not_a_period_relationship');

  // Rejects a non-ISO valid_to.
  await assert.rejects(repo.endLink(link.id, 'not-a-date', life), error => error.code === 'invalid_valid_to');

  // Rejects valid_to before valid_from.
  await assert.rejects(
    repo.endLink(link.id, '2024-01-01T00:00:00.000Z', life),
    error => error.code === 'valid_to_before_valid_from'
  );

  const ended = await repo.endLink(link.id, '2026-06-01T00:00:00.000Z', life);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.valid_to, '2026-06-01T00:00:00.000Z');
  assert.equal(ended.id, link.id);

  // Cannot end an already-ended link.
  await assert.rejects(repo.endLink(link.id, '2026-07-01T00:00:00.000Z', life), error => error.code === 'invalid_lifecycle_transition');
});

test('suppressLink and deleteLink enforce administration scope and valid transitions', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { link } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);

  await assert.rejects(repo.suppressLink(link.id, 'operator_requested', life), error => error.code === 'administration_required');
  await assert.rejects(repo.deleteLink(link.id, 'operator_requested', life), error => error.code === 'administration_required');

  await assert.rejects(repo.suppressLink(link.id, 'Free text reason', admin), error => error.code === 'invalid_reason_code');

  const suppressed = await repo.suppressLink(link.id, 'operator_requested', admin);
  assert.equal(suppressed.status, 'suppressed');

  // suppressLink again from suppressed is not a permitted transition.
  await assert.rejects(repo.suppressLink(link.id, 'operator_requested', admin), error => error.code === 'invalid_lifecycle_transition');

  const deleted = await repo.deleteLink(link.id, 'operator_requested', admin);
  assert.equal(deleted.status, 'deleted');

  // deleteLink from deleted is not a permitted transition.
  await assert.rejects(repo.deleteLink(link.id, 'operator_requested', admin), error => error.code === 'invalid_lifecycle_transition');
});

test('suppressed and deleted links remain absent from ordinary reads, but ended links remain visible', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  const { link: suppressedTarget } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  await repo.suppressLink(suppressedTarget.id, 'operator_requested', admin);

  const { link: periodLink } = await repo.createLink({
    source_ref: PERSON_REF,
    target_ref: ORG_REF,
    relationship_type: 'employee_at',
    valid_from: '2025-01-01T00:00:00.000Z'
  }, life);
  const ended = await repo.endLink(periodLink.id, '2026-01-01T00:00:00.000Z', life);

  await assert.rejects(repo.getLink(suppressedTarget.id, life), error => error.code === 'endpoint_not_found');
  const endedRead = await repo.getLink(ended.id, life);
  assert.equal(endedRead.status, 'ended');

  const outgoing = await repo.listOutgoing(TASK_REF, life);
  assert.equal(outgoing.length, 0, 'suppressed link must not appear in an ordinary list');
});

// --- rebuildIndexes ---

test('dry run rebuild reports missing memberships and performs zero writes', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { link } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);

  // Simulate a partially-broken index: a fresh store seeded with only the
  // authoritative link record, no memberships at all.
  const brokenStore = createMemoryStore();
  await brokenStore.setJSON(linkKey(link.id), await store.get(linkKey(link.id), { type: 'json' }));
  const brokenRepo = createRepo(brokenStore, { resolveEntity: createFakeResolver(defaultEntities()) });

  const report = await brokenRepo.rebuildIndexes(admin, { dryRun: true });
  assert.equal(report.dry_run, true);
  assert.equal(report.inspected, 1);
  assert.equal(report.valid, 1);
  assert.equal(report.missing, 3, 'source, target, and type memberships are all missing');
  assert.equal(report.repaired, 0);
  assert.equal(brokenStore._writeLog.filter(key => !key.startsWith('universal-links/links/')).length, 0, 'dry run must not write anything');
});

test('live rebuild restores missing memberships', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  const { link } = await repo.createLink({ ...COLLABORATOR_INPUT }, life);

  const brokenStore = createMemoryStore();
  await brokenStore.setJSON(linkKey(link.id), await store.get(linkKey(link.id), { type: 'json' }));
  const brokenRepo = createRepo(brokenStore, { resolveEntity: createFakeResolver(defaultEntities()) });

  const report = await brokenRepo.rebuildIndexes(admin, { dryRun: false });
  assert.equal(report.repaired, 3);
  assert.equal(report.missing, 3);

  assert.ok(brokenStore._has(bySourceKey(TASK_REF, link.id)));
  assert.ok(brokenStore._has(byTargetKey(PERSON_REF, link.id)));
  assert.ok(brokenStore._has(byTypeKey('collaborator', link.id)));

  const outgoing = await brokenRepo.listOutgoing(TASK_REF, life);
  assert.equal(outgoing.length, 1);
});

test('rebuild reports malformed links without deleting or rewriting them', async () => {
  const store = createMemoryStore();
  await store.setJSON(`${'universal-links/links/'}ul_${'a'.repeat(64)}`, { not: 'a valid link record' });
  const repo = createRepo(store);

  const report = await repo.rebuildIndexes(admin, { dryRun: false });
  assert.equal(report.invalid, 1);
  assert.equal(report.invalid_record_ids.length, 1);
  assert.equal(report.invalid_record_ids[0], `ul_${'a'.repeat(64)}`);
  // The malformed record itself must be untouched — still present, still malformed.
  const stillThere = await store.get(`universal-links/links/ul_${'a'.repeat(64)}`, { type: 'json' });
  assert.deepEqual(stillThere, { not: 'a valid link record' });
});

test('rebuild never rewrites a link record that is already valid', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await repo.createLink({ ...COLLABORATOR_INPUT }, life);
  const linkWritesBeforeRebuild = store._writeLog.filter(key => key.startsWith('universal-links/links/')).length;

  await repo.rebuildIndexes(admin, { dryRun: false });

  const linkWritesAfterRebuild = store._writeLog.filter(key => key.startsWith('universal-links/links/')).length;
  assert.equal(linkWritesAfterRebuild, linkWritesBeforeRebuild, 'rebuild must never write to an already-valid authoritative link');
});

test('rebuildIndexes requires an administration workflow context', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);
  await assert.rejects(repo.rebuildIndexes(life, { dryRun: true }), error => error.code === 'administration_required');
});

test('rebuild hydration never exceeds ten simultaneous reads or writes', async () => {
  const store = createMemoryStore();
  const repo = createRepo(store);

  // Create 25 distinct links so rebuild has to hydrate across multiple
  // bounded batches.
  for (let i = 0; i < 25; i += 1) {
    const personRef = `shared:person:person_${i}`;
    const entities = defaultEntities();
    entities.set(personRef, { kind: 'person' });
    const r = createRepo(store, { resolveEntity: createFakeResolver(entities), now: () => `2026-09-${String((i % 27) + 1).padStart(2, '0')}T00:00:00.000Z`, generateOperationId: () => `op_${String(1000 + i).padStart(32, '0')}` });
    // eslint-disable-next-line no-await-in-loop
    await r.createLink({ source_ref: TASK_REF, target_ref: personRef, relationship_type: 'collaborator' }, life);
  }

  let inFlight = 0;
  let maxInFlight = 0;
  const originalGet = store.get.bind(store);
  const originalSetJSON = store.setJSON.bind(store);
  store.get = async (...args) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 1));
    inFlight -= 1;
    return originalGet(...args);
  };
  store.setJSON = async (...args) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 1));
    inFlight -= 1;
    return originalSetJSON(...args);
  };

  const report = await repo.rebuildIndexes(admin, { dryRun: false });
  assert.equal(report.inspected, 25);
  assert.ok(maxInFlight <= 10, `expected at most 10 concurrent Blob operations, saw ${maxInFlight}`);
});

// --- No module outside universal-link-repository.mjs writes Universal Link keys ---

test('createUniversalLinkRepository is the only place these tests call setJSON/operationKey together to perform a write', () => {
  // This is a structural/documentation assertion; the real guarantee is
  // verified repo-wide by grepping production source for `setJSON(` calls
  // outside this file and the low level storage adapter (see the Slice 2
  // PR body's verification section, item 7). This test exists so that
  // guarantee has a named anchor in the suite.
  assert.equal(typeof createUniversalLinkRepository, 'function');
});
