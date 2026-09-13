import { randomUUID } from 'node:crypto';
import { formatEntityRef, parseEntityRef, assertRegisteredEntityRef } from './entity-ref.mjs';
import { assertEntityKindAllowed, endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import {
  deriveOperationId,
  generateOperationId as defaultGenerateOperationId,
  isValidOperationId,
  isValidReasonCode
} from './universal-link-schema.mjs';
import { getJSON, setJSON, deleteKey } from './teaching-blobs.mjs';
import {
  STUDENT_CONTEXT_TARGET_KIND,
  assertLifecycleTransitionAllowed,
  isStudentReferenceId,
  normalizeInitials,
  parseStudentReference,
  studentReferenceError,
  validateContextType,
  validatePermissionStatus
} from './student-reference-schema.mjs';

// Teaching-owned, protected StudentReference implementation (implementation
// programme "Slice 8"; comms-hub-people-unification.md ยง6).
//
// StudentReference *identity* records (id, display_code, lifecycle_status)
// are Teaching's own concern and live in the existing `teaching-hub-content`
// store under a `protected/` prefix. But class/program/excursion/coaching
// *relationships* are not a second relationship system: every one of them
// is a `participates_in` Universal Link, written exclusively through the
// canonical `universal-link-repository.mjs` (relationship-registry.mjs's
// `participates_in` declaration). This module never writes a Universal
// Link key directly — it only calls the canonical repository, with a
// Teaching-scoped `resolveEntity` injected so the StudentReference endpoint
// itself can resolve (see `createTeachingScopedResolveEntity` below), and
// an accessContext whose workflow is always the server-derived `teaching`
// value — never client-supplied.

export const STUDENT_REFERENCE_PREFIX = 'protected/student-references/';
export const STUDENT_CODE_PREFIX = 'protected/student-reference-codes/';
export const STUDENT_TOMBSTONE_PREFIX = 'protected/student-reference-tombstones/';
export const STUDENT_OPERATION_PREFIX = 'protected/student-reference-operations/';

const OPERATION_SCHEMA_VERSION = 1;
const MAX_SUFFIX_ATTEMPTS = 500;

export function studentReferenceKey(id) {
  if (!isStudentReferenceId(id)) throw studentReferenceError();
  return `${STUDENT_REFERENCE_PREFIX}${id}`;
}

export function studentCodeKey(code) {
  return `${STUDENT_CODE_PREFIX}${code}`;
}

export function studentTombstoneKey(id) {
  if (!isStudentReferenceId(id)) throw studentReferenceError();
  return `${STUDENT_TOMBSTONE_PREFIX}${id}`;
}

export function studentOperationKey(operationId) {
  if (!isValidOperationId(operationId)) throw studentReferenceError('invalid_operation_id');
  return `${STUDENT_OPERATION_PREFIX}${operationId}`;
}

function studentWriteIncompleteError({ operationId, studentId }) {
  return Object.assign(new Error('The student reference write did not complete.'), {
    status: 503,
    code: 'student_reference_write_incomplete',
    retryable: true,
    operation_id: operationId,
    student_id: studentId ?? null
  });
}

function studentOperationNotFoundError() {
  return Object.assign(new Error('Operation not found.'), { status: 404, code: 'operation_not_found' });
}

function studentReferenceNotFoundError() {
  return Object.assign(new Error('Student reference not found.'), { status: 404, code: 'student_reference_not_found' });
}

// Structural guard for a stored operation journal — mirrors
// universal-link-schema.mjs's validateOperationRecord shape checks, scoped
// to this module's own operation types. Returns null (never throws) so a
// corrupted journal cannot crash a repair attempt.
const OPERATION_TYPES = new Set([
  'create_student_reference',
  'lifecycle_student_reference',
  'delete_student_reference',
  'set_permission_status'
]);
const OPERATION_STATUSES = new Set(['prepared', 'repair_needed', 'committed']);

function validateOperationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== OPERATION_SCHEMA_VERSION) return null;
  if (!isValidOperationId(raw.operation_id)) return null;
  if (!OPERATION_TYPES.has(raw.operation_type)) return null;
  if (!isStudentReferenceId(raw.student_id)) return null;
  if (!OPERATION_STATUSES.has(raw.status)) return null;
  if (!Array.isArray(raw.completed_steps)) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  if (!raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)) return null;
  return { ...raw, completed_steps: [...raw.completed_steps], payload: { ...raw.payload } };
}

function publicProjection(record) {
  return {
    ref: formatEntityRef({ namespace: 'teaching', kind: 'student_reference', id: record.id }),
    display_code: record.display_code,
    lifecycle_status: record.lifecycle_status
  };
}

// The Teaching-scoped resolver StudentReference needs but never gets a
// slot in entity-resolvers.mjs's generic RESOLVER_SLOTS (see entity-ref.mjs
// and entity-resolvers.mjs's comments). It resolves `teaching:student_reference`
// refs directly against the Teaching store, gated on the caller's
// accessContext genuinely carrying the `teaching` workflow and
// `teaching_protected` visibility; every other ref falls through to the
// ordinary shared resolver. `href: null` always — "no canonical
// StudentReference routes" (implementation priority 2).
export function createTeachingScopedResolveEntity({ teachingStore, baseResolveEntity = defaultResolveEntity }) {
  return async function resolveEntity(refInput, accessContext, options) {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref && ref.namespace === 'teaching' && ref.kind === 'student_reference') {
      if (accessContext?.workflow !== 'teaching' || !isVisibilityAllowed(accessContext, 'teaching_protected')) {
        throw endpointNotFoundError();
      }
      assertEntityKindAllowed(accessContext, 'student_reference');
      const record = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(ref.id)));
      if (!record || record.lifecycle_status === 'deleted') throw endpointNotFoundError();
      return {
        ref: formatEntityRef(ref),
        kind: 'student_reference',
        display_label: record.display_code,
        supporting_label: record.lifecycle_status === 'archived' ? 'archived' : null,
        href: null,
        lifecycle_status: record.lifecycle_status,
        visibility: 'teaching_protected'
      };
    }
    return baseResolveEntity(refInput, accessContext, options);
  };
}

async function trySetIfNew(store, key, value) {
  if (typeof store.setJSON === 'function') {
    const result = await store.setJSON(key, value, { onlyIfNew: true });
    return result?.modified !== false;
  }
  if (typeof store.set === 'function') {
    const result = await store.set(key, JSON.stringify(value), { onlyIfNew: true });
    return result?.modified !== false;
  }
  throw studentReferenceError('student_reference_store_unbound', 503);
}

export function createStudentReferenceRepository({
  teachingStore,
  accessContext,
  getUniversalLinkStore = defaultGetUniversalLinkStore,
  baseResolveEntity = defaultResolveEntity,
  now = () => new Date().toISOString(),
  generateId = () => `student_ref_${randomUUID()}`,
  generateOperationId = defaultGenerateOperationId
}) {
  if (!teachingStore) throw studentReferenceError('student_reference_store_unbound', 503);
  if (accessContext?.workflow !== 'teaching' || !isVisibilityAllowed(accessContext, 'teaching_protected')) {
    throw endpointNotFoundError();
  }
  assertEntityKindAllowed(accessContext, 'student_reference');

  const resolveEntity = createTeachingScopedResolveEntity({ teachingStore, baseResolveEntity });

  async function bestEffortMarkRepairNeeded(journal, completedSteps, errorCode) {
    try {
      await setJSON(teachingStore, studentOperationKey(journal.operation_id), {
        ...journal,
        status: 'repair_needed',
        completed_steps: [...completedSteps],
        updated_at: now(),
        last_error_code: typeof errorCode === 'string' ? errorCode : 'write_failed'
      });
    } catch {
      // Best effort only — caller already has the primary retryable error.
    }
  }

  async function getLinkRepo() {
    const store = await getUniversalLinkStore();
    return createUniversalLinkRepository({ store, resolveEntity, now });
  }

  async function getAuthoritative(id) {
    if (!isStudentReferenceId(id)) throw studentReferenceNotFoundError();
    const record = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(id)));
    if (!record) throw studentReferenceNotFoundError();
    return record;
  }

  // Allocates a unique display code for `initials`, concurrency-safe and
  // idempotent under retry: two callers racing for the same initials can
  // never both claim the same code, because `trySetIfNew` writes the claim
  // key only if it does not already exist. Critically, this function is
  // ALSO safe to call again for the SAME `studentId` after a prior partial
  // failure — before attempting a fresh claim at each candidate, it first
  // checks whether that candidate is already claimed BY THIS student
  // (a prior attempt's claim that succeeded but whose caller never learned
  // the outcome). When it is, that candidate is returned directly: no new
  // claim is attempted, no code is wasted, and the suffix never changes
  // between attempts. The first allocation for a given initials keeps the
  // bare initials; the second and later ones append a neutral numeric
  // suffix (AR, AR2, AR3, ...) — never a student number, DOB, year group,
  // or class (ยง6.1).
  async function claimDisplayCode(initials, studentId) {
    for (let n = 0; n < MAX_SUFFIX_ATTEMPTS; n += 1) {
      const candidate = n === 0 ? initials : `${initials}${n + 1}`;
      const key = studentCodeKey(candidate);
      // eslint-disable-next-line no-await-in-loop
      const existing = await getJSON(teachingStore, key);
      if (existing?.student_ref_id === studentId) return candidate;
      if (existing) continue; // claimed by a different student; try the next candidate
      // eslint-disable-next-line no-await-in-loop
      const claimed = await trySetIfNew(teachingStore, key, {
        schema_version: 1,
        student_ref_id: studentId,
        created_at: now()
      });
      if (claimed) return candidate;
      // Lost a race for this exact candidate between the check above and
      // this claim attempt — move on to the next one rather than retrying
      // the same candidate forever.
    }
    throw studentReferenceError('display_code_exhausted', 409);
  }

  // Runs (or resumes) the two idempotent create steps — claim a code, then
  // write the authoritative record. `claimDisplayCode` is itself safe to
  // call again after a prior partial failure (see above), so no
  // claimed-code bookkeeping needs to live in the journal at all: every
  // repair simply re-derives the same code and continues.
  async function runCreateSteps(journal) {
    const id = journal.student_id;
    let claimedCode;
    try {
      claimedCode = await claimDisplayCode(journal.payload.initials, id);
    } catch (cause) {
      if (cause?.code === 'display_code_exhausted') throw cause;
      await bestEffortMarkRepairNeeded(journal, [], cause?.code ?? 'claim_failed');
      throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId: id });
    }

    const existing = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(id)));
    if (!existing) {
      const record = {
        schema_version: 1,
        id,
        kind: 'student_reference',
        display_code: claimedCode,
        lifecycle_status: 'active',
        created_at: journal.created_at,
        updated_at: journal.created_at
      };
      try {
        await setJSON(teachingStore, studentReferenceKey(id), record);
      } catch (cause) {
        await bestEffortMarkRepairNeeded(journal, ['claim_code'], cause?.code ?? 'write_failed');
        throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId: id });
      }
    }

    try {
      await setJSON(teachingStore, studentOperationKey(journal.operation_id), {
        ...journal,
        status: 'committed',
        completed_steps: ['claim_code', 'write_record'],
        updated_at: now(),
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, ['claim_code', 'write_record'], cause?.code ?? 'commit_write_failed');
      throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId: id });
    }

    const finalRecord = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(id))) ?? {
      id,
      display_code: claimedCode,
      lifecycle_status: 'active'
    };
    return { student: publicProjection(finalRecord), operation_id: journal.operation_id };
  }

  async function create(initialsInput) {
    const initials = normalizeInitials(initialsInput);
    const id = generateId();
    const operationId = deriveOperationId(['create_student_reference', id]);
    const timestamp = now();
    const journal = {
      schema_version: OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: 'create_student_reference',
      student_id: id,
      status: 'prepared',
      completed_steps: [],
      payload: { initials },
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    try {
      await setJSON(teachingStore, studentOperationKey(operationId), journal);
    } catch {
      throw studentWriteIncompleteError({ operationId, studentId: id });
    }
    return runCreateSteps(journal);
  }

  // Repairs an incomplete `create` operation by its operation_id — `create`
  // itself cannot be safely retried with the original arguments alone,
  // since it generates a fresh random id every call; only the returned
  // operation_id lets a caller resume the exact same in-flight attempt.
  async function repairCreate(operationId) {
    if (!isValidOperationId(operationId)) throw studentOperationNotFoundError();
    const journal = validateOperationRecord(await getJSON(teachingStore, studentOperationKey(operationId)));
    if (!journal || journal.operation_type !== 'create_student_reference') throw studentOperationNotFoundError();
    if (journal.status === 'committed') {
      const record = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(journal.student_id)));
      return { student: record ? publicProjection(record) : null, operation_id: operationId, repaired: false };
    }
    const result = await runCreateSteps(journal);
    return { ...result, repaired: true };
  }

  // Single-record lifecycle transition (active<->archived, archived->deleted
  // handled separately by `deleteStudent`), journalled the same
  // prepare-then-mutate-then-commit way as every other write in this
  // programme, so a failure between the record write and the commit write
  // is recoverable by simply calling this again with the same arguments —
  // deriving the same deterministic operation id resumes it.
  async function transitionLifecycle(id, toStatus) {
    const record = await getAuthoritative(id);
    if (record.lifecycle_status === toStatus) return publicProjection(record);
    assertLifecycleTransitionAllowed(record.lifecycle_status, toStatus);

    const operationId = deriveOperationId(['lifecycle_student_reference', id, toStatus]);
    const timestamp = now();
    const updatedRecord = { ...record, lifecycle_status: toStatus, updated_at: timestamp };

    let journal = validateOperationRecord(await getJSON(teachingStore, studentOperationKey(operationId)));
    if (!journal) {
      journal = {
        schema_version: OPERATION_SCHEMA_VERSION,
        operation_id: operationId,
        operation_type: 'lifecycle_student_reference',
        student_id: id,
        status: 'prepared',
        completed_steps: [],
        payload: { to_status: toStatus, record: updatedRecord },
        created_at: timestamp,
        updated_at: timestamp,
        last_error_code: null
      };
      try {
        await setJSON(teachingStore, studentOperationKey(operationId), journal);
      } catch {
        throw studentWriteIncompleteError({ operationId, studentId: id });
      }
    }

    const liveRecord = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(id)));
    if (liveRecord?.lifecycle_status !== toStatus) {
      try {
        await setJSON(teachingStore, studentReferenceKey(id), journal.payload.record);
      } catch (cause) {
        await bestEffortMarkRepairNeeded(journal, [], cause?.code ?? 'write_failed');
        throw studentWriteIncompleteError({ operationId, studentId: id });
      }
    }

    try {
      await setJSON(teachingStore, studentOperationKey(operationId), {
        ...journal,
        status: 'committed',
        completed_steps: ['record'],
        updated_at: now(),
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, ['record'], cause?.code ?? 'commit_write_failed');
      throw studentWriteIncompleteError({ operationId, studentId: id });
    }

    return publicProjection(journal.payload.record);
  }

  function archive(id) {
    return transitionLifecycle(id, 'archived');
  }

  function unarchive(id) {
    return transitionLifecycle(id, 'active');
  }

  // Deletion requires archiving first (ยง7.1's archived -> deleted
  // transition) and leaves a non-identifying tombstone for link integrity
  // (ยง6.1, ยง7.1: "only a non identifying tombstone remains where needed for
  // link integrity"). The tombstone stores nothing but the id and a
  // deletion timestamp — never the former display_code. Two idempotent
  // steps (write tombstone, delete the authoritative record) recover after
  // failure at either one: a retry that lands after the tombstone already
  // exists skips re-writing it; a retry that lands after the record is
  // already gone (delete is itself idempotent) simply re-commits.
  async function deleteStudent(id, reason) {
    if (!isValidReasonCode(reason)) throw studentReferenceError('invalid_reason_code');
    if (!isStudentReferenceId(id)) throw studentReferenceNotFoundError();

    const existingTombstone = await getJSON(teachingStore, studentTombstoneKey(id));
    const record = parseStudentReference(await getJSON(teachingStore, studentReferenceKey(id)));

    if (!record) {
      if (existingTombstone) return { deleted: true };
      throw studentReferenceNotFoundError();
    }
    if (record.lifecycle_status !== 'archived') {
      throw studentReferenceError('student_reference_must_be_archived', 409);
    }

    const operationId = deriveOperationId(['delete_student_reference', id, reason]);
    const timestamp = now();
    let journal = validateOperationRecord(await getJSON(teachingStore, studentOperationKey(operationId)));
    if (!journal) {
      journal = {
        schema_version: OPERATION_SCHEMA_VERSION,
        operation_id: operationId,
        operation_type: 'delete_student_reference',
        student_id: id,
        status: 'prepared',
        completed_steps: [],
        payload: { reason_code: reason },
        created_at: timestamp,
        updated_at: timestamp,
        last_error_code: null
      };
      try {
        await setJSON(teachingStore, studentOperationKey(operationId), journal);
      } catch {
        throw studentWriteIncompleteError({ operationId, studentId: id });
      }
    }

    if (!existingTombstone) {
      try {
        await setJSON(teachingStore, studentTombstoneKey(id), {
          schema_version: 1,
          id,
          kind: 'student_reference_tombstone',
          deleted_at: timestamp
        });
      } catch (cause) {
        await bestEffortMarkRepairNeeded(journal, [], cause?.code ?? 'write_failed');
        throw studentWriteIncompleteError({ operationId, studentId: id });
      }
    }

    try {
      await deleteKey(teachingStore, studentReferenceKey(id));
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, ['tombstone'], cause?.code ?? 'delete_failed');
      throw studentWriteIncompleteError({ operationId, studentId: id });
    }

    try {
      await setJSON(teachingStore, studentOperationKey(operationId), {
        ...journal,
        status: 'committed',
        completed_steps: ['tombstone', 'delete_record'],
        updated_at: now(),
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, ['tombstone', 'delete_record'], cause?.code ?? 'commit_write_failed');
      throw studentWriteIncompleteError({ operationId, studentId: id });
    }

    return { deleted: true, operation_id: operationId };
  }

  function studentSourceRef(id) {
    return formatEntityRef({ namespace: 'teaching', kind: 'student_reference', id });
  }

  function assertContextTarget(contextType, contextRef) {
    validateContextType(contextType);
    const parsed = assertRegisteredEntityRef(contextRef);
    const kind = `${parsed.namespace}:${parsed.kind}`;
    if (kind !== STUDENT_CONTEXT_TARGET_KIND[contextType]) {
      throw studentReferenceError('context_kind_mismatch');
    }
    return formatEntityRef(parsed);
  }

  // Creates (or repairs, via the canonical repository's own create
  // protocol) the `participates_in` Universal Link for one membership.
  // Every step this touches — journal, link, membership writes — is the
  // canonical repository's own, so this needs no write-path of its own.
  async function assign({ studentId, contextType, contextRef, validFrom, permissionStatus }) {
    const student = await getAuthoritative(studentId);
    if (student.lifecycle_status !== 'active') {
      throw studentReferenceError('student_reference_not_active', 409);
    }
    const targetCanonical = assertContextTarget(contextType, contextRef);
    const linkRepo = await getLinkRepo();
    return linkRepo.createLink({
      source_ref: studentSourceRef(studentId),
      target_ref: targetCanonical,
      relationship_type: 'participates_in',
      context_key: contextType,
      valid_from: validFrom ?? now(),
      metadata: { permission_status: validatePermissionStatus(permissionStatus) ?? 'pending' },
      visibility: 'teaching_protected'
    }, accessContext);
  }

  async function findMembership({ linkRepo, studentId, contextType, contextRef }) {
    const targetCanonical = assertContextTarget(contextType, contextRef);
    const { outgoing } = await linkRepo.listForEntity(studentSourceRef(studentId), accessContext);
    return {
      targetCanonical,
      candidates: outgoing.filter(
        (entry) =>
          entry.link.relationship_type === 'participates_in' &&
          entry.link.context_key === contextType &&
          entry.link.target_ref === targetCanonical
      )
    };
  }

  // Ends a membership outright (no replacement) — e.g. a class ends, an
  // excursion concludes.
  async function endMembership({ studentId, contextType, contextRef, validTo }) {
    const linkRepo = await getLinkRepo();
    const { candidates } = await findMembership({ linkRepo, studentId, contextType, contextRef });
    const current = candidates.find((entry) => entry.link.status === 'current');
    if (!current) throw studentReferenceError('participation_not_found', 404);
    return linkRepo.endLink(current.link.id, validTo ?? now(), accessContext);
  }

  // Changes permission status by closing the current dated membership and
  // opening the next one with the updated metadata (comms-hub-people-
  // unification.md ยง3.3: "closes the previous dated relationship and
  // creates the next one" — never an in-place metadata mutation, so the
  // prior status stays queryable history). This is one journalled,
  // retryable operation: the server timestamp (`at`) is generated and
  // persisted to the journal BEFORE either the end or the create half
  // runs, so a retry (via `repairSetPermissionStatus`) always resumes with
  // the exact same `at` — never a freshly generated one, which would
  // otherwise make the retry unable to find the link it already ended.
  async function runSetPermissionStatusSteps(journal) {
    const { student_id: studentId } = journal;
    const { context_type: contextType, context_ref: contextRef, new_status: status, at } = journal.payload;
    const linkRepo = await getLinkRepo();

    let candidates;
    try {
      ({ candidates } = await findMembership({ linkRepo, studentId, contextType, contextRef }));
    } catch (cause) {
      if (Number.isInteger(cause?.status) && cause.status < 500) throw cause;
      await bestEffortMarkRepairNeeded(journal, [], cause?.code ?? 'read_failed');
      throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId });
    }
    const currentLink = candidates.find((entry) => entry.link.status === 'current');

    let ended;
    if (currentLink) {
      try {
        ended = await linkRepo.endLink(currentLink.link.id, at, accessContext);
      } catch (cause) {
        await bestEffortMarkRepairNeeded(journal, [], cause?.code ?? 'end_link_failed');
        throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId });
      }
    } else {
      // No current link: either a prior attempt already ended it at this
      // exact `at` (safe to resume the create half), or there was never a
      // matching membership at all.
      const recentlyEnded = candidates.find((entry) => entry.link.status === 'ended' && entry.link.valid_to === at);
      if (!recentlyEnded) throw studentReferenceError('participation_not_found', 404);
      ended = recentlyEnded.link;
    }

    let created;
    try {
      const result = await linkRepo.createLink({
        source_ref: studentSourceRef(studentId),
        target_ref: contextRef,
        relationship_type: 'participates_in',
        context_key: contextType,
        valid_from: at,
        metadata: { permission_status: status },
        visibility: 'teaching_protected'
      }, accessContext);
      created = result.link;
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, ['end'], cause?.code ?? 'create_link_failed');
      throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId });
    }

    try {
      await setJSON(teachingStore, studentOperationKey(journal.operation_id), {
        ...journal,
        status: 'committed',
        completed_steps: ['end', 'create'],
        updated_at: now(),
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, ['end', 'create'], cause?.code ?? 'commit_write_failed');
      throw studentWriteIncompleteError({ operationId: journal.operation_id, studentId });
    }

    return { ended, created, operation_id: journal.operation_id };
  }

  async function setPermissionStatus({ studentId, contextType, contextRef, status }) {
    validatePermissionStatus(status);
    await getAuthoritative(studentId);
    const targetCanonical = assertContextTarget(contextType, contextRef);

    const operationId = generateOperationId();
    const timestamp = now();
    const journal = {
      schema_version: OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: 'set_permission_status',
      student_id: studentId,
      status: 'prepared',
      completed_steps: [],
      // The server timestamp is captured and persisted here — before either
      // the end or the create half has run — so a repair reuses it exactly
      // rather than computing a new one.
      payload: { context_type: contextType, context_ref: targetCanonical, new_status: status, at: timestamp },
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    try {
      await setJSON(teachingStore, studentOperationKey(operationId), journal);
    } catch {
      throw studentWriteIncompleteError({ operationId, studentId });
    }
    return runSetPermissionStatusSteps(journal);
  }

  // Repairs an incomplete `setPermissionStatus` operation by its
  // operation_id — mirrors `repairCreate`: the persisted `at` in the
  // journal is what makes this resumable, since `setPermissionStatus`
  // itself has no stable natural key to retry against (the same student/
  // context pair may have its permission changed more than once).
  async function repairSetPermissionStatus(operationId) {
    if (!isValidOperationId(operationId)) throw studentOperationNotFoundError();
    const journal = validateOperationRecord(await getJSON(teachingStore, studentOperationKey(operationId)));
    if (!journal || journal.operation_type !== 'set_permission_status') throw studentOperationNotFoundError();
    if (journal.status === 'committed') {
      return { operation_id: operationId, repaired: false };
    }
    const result = await runSetPermissionStatusSteps(journal);
    return { ...result, repaired: true };
  }

  // Teaching-scoped search: "who is in this class/program/excursion/
  // coaching group" — indexed via the canonical repository's listIncoming
  // (bounded membership-prefix reads), never a scan of every
  // StudentReference. Never reachable from the generic `/api/entities/search`
  // (entity-search.mjs never adds `student_reference` to SUPPORTED_KINDS).
  async function search({ contextType, contextRef, query }) {
    validateContextType(contextType);
    const targetCanonical = formatEntityRef(assertRegisteredEntityRef(contextRef));
    const q = typeof query === 'string' ? query.trim().toUpperCase() : '';
    if (q.length > 20) throw studentReferenceError('invalid_query');

    const linkRepo = await getLinkRepo();
    const incoming = await linkRepo.listIncoming(targetCanonical, accessContext);
    const seen = new Set();
    const results = [];
    for (const entry of incoming) {
      if (entry.link.relationship_type !== 'participates_in') continue;
      if (entry.link.context_key !== contextType) continue;
      if (entry.link.status !== 'current') continue;
      if (entry.endpoint.kind !== 'student_reference') continue;
      // Ordinary search excludes archived StudentReferences — matches the
      // same "archived hides from ordinary suggestions" rule Person/
      // Organisation search already follows.
      if (entry.endpoint.lifecycle_status !== 'active') continue;
      if (seen.has(entry.endpoint.ref)) continue;
      seen.add(entry.endpoint.ref);
      const code = entry.endpoint.display_label;
      if (q && !code.startsWith(q)) continue;
      results.push({ ref: entry.endpoint.ref, display_code: code, lifecycle_status: entry.endpoint.lifecycle_status });
    }
    results.sort((a, b) => a.display_code.localeCompare(b.display_code));
    return results.slice(0, 20);
  }

  return {
    create,
    repairCreate,
    get: (id) => getAuthoritative(id).then(publicProjection),
    archive,
    unarchive,
    delete: deleteStudent,
    assign,
    endMembership,
    setPermissionStatus,
    repairSetPermissionStatus,
    search
  };
}
