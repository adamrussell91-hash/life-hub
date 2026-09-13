import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext, endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { formatEntityRef, parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import {
  createStudentReferenceRepository,
  createTeachingScopedResolveEntity
} from '../../netlify/functions/_shared/student-reference-repository.mjs';

// Synthetic fixtures only (comms-hub-people-unification.md ยง6.3) — every
// initials/code value below is a made-up placeholder, never a real
// student's initials.

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, structuredClone(value));
      return { modified: true };
    },
    async set(key, value, options = {}) {
      if (options.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, value);
      return { modified: true };
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

function failingSetStore(inner, { failOn }) {
  let call = 0;
  return {
    ...inner,
    async setJSON(key, value, options = {}) {
      call += 1;
      if (failOn.includes(call)) throw Object.assign(new Error('simulated write failure'), { code: 'simulated_failure' });
      return inner.setJSON(key, value, options);
    }
  };
}

const teachingContext = createAccessContext({ workflow: 'teaching' });
const tasksContext = createAccessContext({ workflow: 'tasks' });

// A fake `baseResolveEntity` backed by in-memory fixture maps — avoids the
// real resolvers' dynamic `@netlify/blobs` store getters entirely, the
// same pattern tests/integration/universal-links.test.js uses. Every class/
// program value is a synthetic placeholder (comms-hub-people-unification.md
// ยง6.3), never a real class or activity name.
const classesById = new Map();
const programsById = new Map();

function seedClass(id, title = 'Synthetic Class 10E') {
  classesById.set(id, { title });
}

function seedProgram(id, name = 'Synthetic Coaching Group') {
  programsById.set(id, { name });
}

async function baseResolveEntity(refInput, accessContext) {
  const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
  if (!ref) throw endpointNotFoundError();
  const formatted = formatEntityRef(ref);
  if (ref.namespace === 'teaching' && ref.kind === 'class') {
    const record = classesById.get(ref.id);
    if (!record) throw endpointNotFoundError();
    return {
      ref: formatted,
      kind: 'class',
      display_label: record.title,
      supporting_label: null,
      href: `/teaching/classes/${ref.id}`,
      lifecycle_status: 'active',
      visibility: 'operator'
    };
  }
  if (ref.namespace === 'tasks' && (ref.kind === 'program' || ref.kind === 'project')) {
    const record = programsById.get(ref.id);
    if (!record) throw endpointNotFoundError();
    return {
      ref: formatted,
      kind: ref.kind,
      display_label: record.name,
      supporting_label: null,
      href: null,
      lifecycle_status: 'active',
      visibility: 'operator'
    };
  }
  throw endpointNotFoundError();
}

function makeRepo({ teachingStore, ulStore, now }) {
  return createStudentReferenceRepository({
    teachingStore,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: now ?? (() => new Date('2026-08-01T00:00:00.000Z').toISOString())
  });
}

// --- Protected access ---

test('createStudentReferenceRepository requires the teaching workflow and teaching_protected visibility', () => {
  const store = memoryStore();
  assert.throws(
    () => createStudentReferenceRepository({ teachingStore: store, accessContext: tasksContext }),
    (e) => e.status === 404 && e.code === 'endpoint_not_found'
  );
});

test('createStudentReferenceRepository requires a bound store', () => {
  assert.throws(
    () => createStudentReferenceRepository({ teachingStore: null, accessContext: teachingContext }),
    (e) => e.status === 503
  );
});

// --- Creation, deterministic duplicate suffix allocation ---

test('create allocates bare initials first, then neutral numeric suffixes for duplicates', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });

  const first = await repo.create('ar');
  const second = await repo.create('ar');
  const third = await repo.create('ar');

  assert.equal(first.student.display_code, 'AR');
  assert.equal(second.student.display_code, 'AR2');
  assert.equal(third.student.display_code, 'AR3');
  assert.notEqual(first.student.ref, second.student.ref);
});

test('create is concurrency safe: two concurrent creates for the same initials never collide on a code', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });

  const [a, b] = await Promise.all([repo.create('bc'), repo.create('bc')]);
  assert.notEqual(a.student.display_code, b.student.display_code);
  assert.deepEqual([a.student.display_code, b.student.display_code].sort(), ['BC', 'BC2']);
});

test('create never stores a bare "1" suffix', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  await repo.create('zz');
  const second = await repo.create('zz');
  assert.equal(second.student.display_code, 'ZZ2');
});

// --- Partial write recovery: create ---

test('create recovers when the code-claim write itself fails: the retry claims the same free code', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  // Fail exactly the 2nd setJSON call: 1) operation journal (prepared),
  // 2) the code-claim write itself (nothing durable results from this one).
  const flaky = failingSetStore(teachingStore, { failOn: [2] });
  const repo = createStudentReferenceRepository({
    teachingStore: flaky,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });

  await assert.rejects(
    repo.create('dd'),
    (e) => e.status === 503 && e.code === 'student_reference_write_incomplete' && typeof e.operation_id === 'string'
  );
  assert.equal(teachingStore._map.has('protected/student-reference-codes/DD'), false, 'the failed claim write must not be durable');

  const repo2 = makeRepo({ teachingStore, ulStore });
  const journalEntry = [...teachingStore._map.entries()].find(([key]) => key.startsWith('protected/student-reference-operations/'));
  const [, journal] = journalEntry;
  const repaired = await repo2.repairCreate(journal.operation_id);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.student.display_code, 'DD', 'the retry must claim the same free code, not skip to a suffix');
});

test('create recovers when the write fails after the code claim is journalled but before the record is written', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  // 1) operation journal (prepared), 2) code-claim write — fail the
  // authoritative record write (3rd). `claimDisplayCode` needs no journal
  // bookkeeping of its own: it is idempotent by re-deriving the same
  // already-claimed code on repair (see claimDisplayCode's own comment).
  const flaky = failingSetStore(teachingStore, { failOn: [3] });
  const repo = createStudentReferenceRepository({
    teachingStore: flaky,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });

  await assert.rejects(
    repo.create('dd'),
    (e) => e.status === 503 && e.code === 'student_reference_write_incomplete' && typeof e.operation_id === 'string'
  );

  // The code claim (and the journal recording it) are durable even though
  // the record write failed.
  assert.equal(teachingStore._map.has('protected/student-reference-codes/DD'), true);
  const recordKeysBeforeRepair = [...teachingStore._map.keys()].filter((k) => k.startsWith('protected/student-references/'));
  assert.equal(recordKeysBeforeRepair.length, 0, 'the authoritative record must not exist yet');

  // Recover the same operation via repairCreate and confirm it finishes
  // with the SAME code (no re-allocation, no duplicate record).
  const repo2 = makeRepo({ teachingStore, ulStore });
  const journalEntry = [...teachingStore._map.entries()].find(([key]) => key.startsWith('protected/student-reference-operations/'));
  assert.ok(journalEntry, 'expected a journal to have been written');
  const [, journal] = journalEntry;
  const repaired = await repo2.repairCreate(journal.operation_id);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.student.display_code, 'DD');

  const codeKeys = [...teachingStore._map.keys()].filter((k) => k.startsWith('protected/student-reference-codes/'));
  assert.equal(codeKeys.length, 1, 'must not have claimed a second code on repair');
});

test('create recovers when the write fails after the record is written but before the journal commits', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  // 1) journal prepared, 2) code claim, 3) record write, 4) journal commit
  // — fail the commit write.
  const flaky = failingSetStore(teachingStore, { failOn: [4] });
  const repo = createStudentReferenceRepository({
    teachingStore: flaky,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });

  await assert.rejects(repo.create('ee'), (e) => e.status === 503);

  const journalEntry = [...teachingStore._map.entries()].find(([key]) => key.startsWith('protected/student-reference-operations/'));
  const [, journal] = journalEntry;
  assert.equal(journal.status, 'repair_needed');

  const repo2 = makeRepo({ teachingStore, ulStore });
  const repaired = await repo2.repairCreate(journal.operation_id);
  assert.equal(repaired.student.display_code, 'EE');

  const recordKeys = [...teachingStore._map.keys()].filter((k) => k.startsWith('protected/student-references/'));
  assert.equal(recordKeys.length, 1, 'must not duplicate the authoritative record on repair');
});

test('a failed-then-repaired create never wastes a code or changes the suffix a later sibling would get', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  // Fail the commit write for the first "gg" create.
  const flaky = failingSetStore(teachingStore, { failOn: [4] });
  const flakyRepo = createStudentReferenceRepository({
    teachingStore: flaky,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });
  await assert.rejects(flakyRepo.create('gg'), (e) => e.status === 503);

  const repo = makeRepo({ teachingStore, ulStore });
  const journalEntry = [...teachingStore._map.entries()].find(([key]) => key.startsWith('protected/student-reference-operations/'));
  const [, journal] = journalEntry;
  const repaired = await repo.repairCreate(journal.operation_id);
  assert.equal(repaired.student.display_code, 'GG', 'repair must land the first student on the bare initials, not a suffix');

  // A second, entirely new "gg" student created afterward must get the
  // very next free suffix (GG2) — proving the earlier failure-then-repair
  // cycle did not waste GG2 or leave a gap.
  const second = await repo.create('gg');
  assert.equal(second.student.display_code, 'GG2');
});

test('repairCreate on an already-committed operation is a safe no-op', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { operation_id: operationId, student } = await repo.create('ff');
  const result = await repo.repairCreate(operationId);
  assert.equal(result.repaired, false);
  assert.equal(result.student.display_code, student.display_code);
});

test('repairCreate 404s an unknown or malformed operation id', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  await assert.rejects(repo.repairCreate('op_notreal'), (e) => e.status === 404);
  await assert.rejects(repo.repairCreate('../../etc/passwd'), (e) => e.status === 404);
});

// --- Archive / delete lifecycle, tombstones, recovery ---

test('archive then delete leaves a non-identifying tombstone and removes the authoritative record', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('gg');
  const id = student.ref.split(':').pop();

  await repo.archive(id);
  const result = await repo.delete(id, 'guardian_request');
  assert.equal(result.deleted, true);

  assert.equal(teachingStore._map.has(`protected/student-references/${id}`), false);
  const tombstone = teachingStore._map.get(`protected/student-reference-tombstones/${id}`);
  assert.ok(tombstone);
  assert.deepEqual(Object.keys(tombstone).sort(), ['deleted_at', 'id', 'kind', 'schema_version']);
  assert.equal(JSON.stringify(tombstone).includes('GG'), false, 'tombstone must not carry the former display_code');
});

test('delete requires the record to be archived first', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('hh');
  const id = student.ref.split(':').pop();
  await assert.rejects(repo.delete(id, 'test'), (e) => e.status === 409 && e.code === 'student_reference_must_be_archived');
});

test('delete recovers when the record delete fails after the tombstone is written', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('ii');
  const id = student.ref.split(':').pop();
  await repo.archive(id);

  let deleteCalls = 0;
  const flaky = {
    ...teachingStore,
    async delete(key) {
      deleteCalls += 1;
      if (deleteCalls === 1) throw Object.assign(new Error('simulated'), { code: 'simulated_delete_failure' });
      return teachingStore.delete(key);
    }
  };
  const flakyRepo = createStudentReferenceRepository({
    teachingStore: flaky,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });

  await assert.rejects(flakyRepo.delete(id, 'guardian_request'), (e) => e.status === 503);
  assert.ok(teachingStore._map.has(`protected/student-reference-tombstones/${id}`));
  assert.ok(teachingStore._map.has(`protected/student-references/${id}`), 'record must still exist after the failed delete');

  const result = await repo.delete(id, 'guardian_request');
  assert.equal(result.deleted, true);
  assert.equal(teachingStore._map.has(`protected/student-references/${id}`), false);
});

test('a repeated delete call after full completion is idempotent', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('jj');
  const id = student.ref.split(':').pop();
  await repo.archive(id);
  await repo.delete(id, 'guardian_request');
  const again = await repo.delete(id, 'guardian_request');
  assert.equal(again.deleted, true);
});

test('archive is retryable when the record write fails before the journal commits', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('kk');
  const id = student.ref.split(':').pop();

  // This fresh wrapper's own call count starts at 0 (create() already ran
  // against the un-wrapped store above): call 1 is archive's journal-prepare
  // write, call 2 is the record overwrite — fail that one.
  let call = 0;
  const flaky = {
    ...teachingStore,
    async setJSON(key, value, options = {}) {
      call += 1;
      if (call === 2) throw Object.assign(new Error('simulated'), { code: 'simulated_failure' });
      return teachingStore.setJSON(key, value, options);
    }
  };
  const flakyRepo = createStudentReferenceRepository({
    teachingStore: flaky,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => ulStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });

  await assert.rejects(flakyRepo.archive(id), (e) => e.status === 503);
  assert.equal((await teachingStore.get(`protected/student-references/${id}`, { type: 'json' })).lifecycle_status, 'active');

  const result = await repo.archive(id);
  assert.equal(result.lifecycle_status, 'archived');
});

test('archiving twice is a safe no-op; archiving a deleted record is rejected', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('ll');
  const id = student.ref.split(':').pop();
  await repo.archive(id);
  const again = await repo.archive(id);
  assert.equal(again.lifecycle_status, 'archived');

  await repo.delete(id, 'guardian_request');
  await assert.rejects(repo.archive(id), (e) => e.status === 404);
});

// --- participates_in via the canonical Universal Link repository ---

test('assign creates a participates_in Universal Link with teaching_protected visibility, not a second membership table', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const classId = 'class_synthetic_10e';
  seedClass(classId);
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('mm');
  const studentId = student.ref.split(':').pop();

  const { link, created } = await repo.assign({
    studentId,
    contextType: 'class',
    contextRef: formatEntityRef({ namespace: 'teaching', kind: 'class', id: classId })
  });
  assert.equal(created, true);
  assert.equal(link.relationship_type, 'participates_in');
  assert.equal(link.visibility, 'teaching_protected');
  assert.equal(link.context_key, 'class');
  assert.equal(link.metadata.permission_status, 'pending');

  // The link is stored under the canonical Universal Link prefixes, not any
  // Teaching-owned membership key.
  const ulKeys = [...ulStore._map.keys()];
  assert.ok(ulKeys.some((k) => k.startsWith('universal-links/links/')));
  assert.equal([...teachingStore._map.keys()].some((k) => k.includes('context')), false);
});

test('assign rejects a context_ref whose kind does not match the context_type', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const programId = 'prog_synthetic';
  seedProgram(programId);
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('nn');
  const studentId = student.ref.split(':').pop();

  await assert.rejects(
    repo.assign({
      studentId,
      contextType: 'class',
      contextRef: formatEntityRef({ namespace: 'tasks', kind: 'program', id: programId })
    }),
    (e) => e.code === 'context_kind_mismatch'
  );
});

test('setPermissionStatus closes the current link and opens a new one rather than mutating in place', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const programId = 'prog_coaching_synth';
  seedProgram(programId);
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('oo');
  const studentId = student.ref.split(':').pop();
  const contextRef = formatEntityRef({ namespace: 'tasks', kind: 'program', id: programId });

  // assign's own valid_from must differ from the fixed clock's `now()` (used
  // below by setPermissionStatus) so the closed and reopened periods get
  // distinct deterministic link ids.
  const { link: original } = await repo.assign({
    studentId,
    contextType: 'coaching',
    contextRef,
    validFrom: '2025-01-01T00:00:00.000Z'
  });
  const { ended, created } = await repo.setPermissionStatus({
    studentId,
    contextType: 'coaching',
    contextRef,
    status: 'approved'
  });

  assert.equal(ended.id, original.id);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.valid_to, '2026-08-01T00:00:00.000Z');
  assert.notEqual(created.id, original.id);
  assert.equal(created.valid_from, '2026-08-01T00:00:00.000Z');
  assert.equal(created.metadata.permission_status, 'approved');
  assert.equal(created.status, 'current');
});

test('setPermissionStatus is one journalled, retry-safe operation: the create half can be repaired without re-ending or losing the timestamp', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const programId = 'prog_coaching_retry';
  seedProgram(programId);
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('qr');
  const studentId = student.ref.split(':').pop();
  const contextRef = formatEntityRef({ namespace: 'tasks', kind: 'program', id: programId });
  const { link: original } = await repo.assign({
    studentId,
    contextType: 'coaching',
    contextRef,
    validFrom: '2025-01-01T00:00:00.000Z'
  });

  // Let the end half commit, then fail exactly the new link's own write so
  // the create half fails after the end half already landed.
  let failedOnce = false;
  const flakyUlStore = {
    ...ulStore,
    async setJSON(key, value) {
      if (!failedOnce && key.startsWith('universal-links/links/') && !key.includes(original.id)) {
        failedOnce = true;
        throw Object.assign(new Error('simulated'), { code: 'simulated_failure' });
      }
      return ulStore.setJSON(key, value);
    }
  };
  const flakyRepo = createStudentReferenceRepository({
    teachingStore,
    accessContext: teachingContext,
    getUniversalLinkStore: async () => flakyUlStore,
    baseResolveEntity,
    now: () => new Date('2026-08-01T00:00:00.000Z').toISOString()
  });

  await assert.rejects(
    flakyRepo.setPermissionStatus({ studentId, contextType: 'coaching', contextRef, status: 'approved' }),
    (e) => e.status === 503 && e.code === 'student_reference_write_incomplete' && typeof e.operation_id === 'string'
  );

  // The end half is durable: the original link is already ended at the
  // server-persisted timestamp, even though the operation as a whole
  // hasn't committed.
  const endedNow = await (await ulStore.get(`universal-links/links/${original.id}`, { type: 'json' }));
  assert.equal(endedNow.status, 'ended');
  assert.equal(endedNow.valid_to, '2026-08-01T00:00:00.000Z');

  const operationJournal = [...teachingStore._map.values()].find((v) => v?.operation_type === 'set_permission_status');
  assert.ok(operationJournal, 'expected a set_permission_status journal to exist');
  assert.equal(operationJournal.payload.at, '2026-08-01T00:00:00.000Z', 'the server timestamp must be persisted in the journal');

  // Repair must not attempt to re-end the already-ended link (which would
  // otherwise reject with invalid_lifecycle_transition) and must reuse the
  // exact same persisted timestamp for the create half.
  const repaired = await repo.repairSetPermissionStatus(operationJournal.operation_id);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.created.valid_from, '2026-08-01T00:00:00.000Z');
  assert.equal(repaired.created.metadata.permission_status, 'approved');
  assert.equal(repaired.created.status, 'current');
});

test('assign rejects an archived StudentReference', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const classId = 'class_archived_assign_synth';
  seedClass(classId);
  const repo = makeRepo({ teachingStore, ulStore });
  const { student } = await repo.create('st');
  const studentId = student.ref.split(':').pop();
  await repo.archive(studentId);

  await assert.rejects(
    repo.assign({
      studentId,
      contextType: 'class',
      contextRef: formatEntityRef({ namespace: 'teaching', kind: 'class', id: classId })
    }),
    (e) => e.status === 409 && e.code === 'student_reference_not_active'
  );
});

test('search finds current members of a context by code prefix and excludes ended/other-context memberships', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const classId = 'class_search_synth';
  seedClass(classId);
  const repo = makeRepo({ teachingStore, ulStore });
  const contextRef = formatEntityRef({ namespace: 'teaching', kind: 'class', id: classId });

  const { student: s1 } = await repo.create('pp');
  const { student: s2 } = await repo.create('pp');
  await repo.assign({ studentId: s1.ref.split(':').pop(), contextType: 'class', contextRef });
  await repo.assign({ studentId: s2.ref.split(':').pop(), contextType: 'class', contextRef });

  const results = await repo.search({ contextType: 'class', contextRef, query: 'pp' });
  assert.deepEqual(results.map((r) => r.display_code).sort(), ['PP', 'PP2']);
});

test('search excludes an archived StudentReference even while its membership link is still current', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const classId = 'class_search_archived_synth';
  seedClass(classId);
  const repo = makeRepo({ teachingStore, ulStore });
  const contextRef = formatEntityRef({ namespace: 'teaching', kind: 'class', id: classId });

  const { student } = await repo.create('tv');
  const studentId = student.ref.split(':').pop();
  await repo.assign({ studentId, contextType: 'class', contextRef });
  await repo.archive(studentId);

  const results = await repo.search({ contextType: 'class', contextRef, query: 'tv' });
  assert.deepEqual(results, []);
});

// --- Privacy non-disclosure ---

test('the Teaching-scoped resolver 404s a student ref under a non-teaching workflow', async () => {
  const teachingStore = memoryStore();
  const { student } = await makeRepo({ teachingStore, ulStore: memoryStore() }).create('qq');
  const resolveEntity = createTeachingScopedResolveEntity({ teachingStore, baseResolveEntity });
  await assert.rejects(
    resolveEntity(student.ref, tasksContext),
    (e) => e.status === 404 && e.code === 'endpoint_not_found'
  );
});

test('the Teaching-scoped resolver never returns a real name — only the neutral display_code — and no href', async () => {
  const teachingStore = memoryStore();
  const { student } = await makeRepo({ teachingStore, ulStore: memoryStore() }).create('rs');
  const resolveEntity = createTeachingScopedResolveEntity({ teachingStore, baseResolveEntity });
  const projection = await resolveEntity(student.ref, teachingContext);
  assert.equal(projection.display_label, 'RS');
  assert.equal(projection.href, null);
});

test('generic resolveEntity still 404s teaching:student_reference regardless of workflow', async () => {
  const { resolveEntity } = await import('../../netlify/functions/_shared/entity-resolvers.mjs');
  await assert.rejects(
    resolveEntity('teaching:student_reference:student_ref_00000000-0000-4000-8000-000000000001', teachingContext),
    (e) => e.status === 404 && e.code === 'endpoint_not_found'
  );
});
