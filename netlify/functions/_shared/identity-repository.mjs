import { assertLifecycleTransitionAllowed, applyLifecycleTransition } from './entity-lifecycle.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import {
  IDENTITY_SCHEMA_VERSION,
  buildIdentityIndexRecord,
  displayLabelFor,
  generateEventId,
  generateOrganisationId,
  generatePersonId,
  parseOrganisationRecord,
  parsePersonRecord,
  validateOrganisationCreateInput,
  validateOrganisationFieldUpdate,
  validatePersonCreateInput,
  validatePersonFieldUpdate
} from './identity-schema.mjs';
import { deriveOperationId, isValidOperationId } from './universal-link-schema.mjs';
import {
  defaultGetUniversalLinkStore,
  entityEventKey,
  getJSON,
  organisationIndexKey,
  organisationKey,
  personIndexKey,
  personKey,
  setJSON
} from './universal-link-blobs.mjs';

// The canonical identity write service (correction B4). Person and
// Organisation writes used to be coordinated ad hoc by `entities.mjs`
// itself — a plain `writeEntity` helper wrote the authoritative record and
// its index as two independent `setJSON` calls with no recovery protocol,
// and lifecycle transitions additionally wrote a lifecycle event as a
// third independent call. This produced confirmed unsafe states: a create
// that wrote the entity but failed the index, then generated a *second*
// identity on plain retry (identity ids are random by design — unlike
// Universal Links, there is no deterministic content hash to dedupe a
// person or organisation on); a delete/deidentify that redacted the
// entity but failed the index, leaving the former active name searchable
// through a stale index entry; and a lifecycle transition that updated the
// entity and index but failed the event write, then rejected a retry
// because the status had already changed.
//
// This module is the only place that writes a Person, Organisation,
// identity index, lifecycle event, or the self-identity pointer. Handlers
// (`entities.mjs`) call it rather than coordinating these writes
// themselves.
//
// Every write here follows the same prepare-before-mutate, mutate, commit
// protocol `universal-link-repository.mjs` uses for Universal Links: a
// versioned operation journal is written first under
// `identities/operations/<operation_id>`, recording exactly what this
// attempt intends to write; a failure after that point returns a named
// retryable `503 identity_write_incomplete` carrying the operation and
// entity ids; and `repairIdentityOperation` (or, for `update_identity`/
// `lifecycle_identity`, a later call with the *same* inputs) can finish
// whatever is missing.
//
// `create_identity` cannot be resumed by an ordinary retry with the same
// request body, because entity ids are randomly generated and there is no
// content-based equivalence to key a retry off — a second ordinary POST
// is, by design, a second identity. Recovery for a specific failed create
// goes through `repairIdentityOperation` with the `operation_id` the 503
// response carried, which replays the *original* attempt's exact payload
// under its own entity id rather than generating a new one.
//
// `update_identity` and `lifecycle_identity` operations derive a
// deterministic operation id from (operation type, kind, entity id, and
// — for lifecycle — the target status; for update, the exact patch being
// applied). A repeat call with the same inputs is distinguished from an
// unrelated later call at the same target by comparing the entity's own
// `updated_at` at call time against the operation's recorded
// pre-mutation/post-mutation values: a match means "this is the same
// attempt, resume it" (bypassing the fromStatus transition-graph check —
// the original attempt already validated it, so a retry landing after the
// mutation itself succeeded must not re-reject just because the status
// already changed); no match means an unrelated, independent request,
// which goes through ordinary validation from the live state.

export const IDENTITY_OPERATION_SCHEMA_VERSION = 1;

const IDENTITY_OPERATION_TYPES = new Set(['create_identity', 'update_identity', 'lifecycle_identity']);
const IDENTITY_OPERATION_STATUSES = new Set(['prepared', 'repair_needed', 'committed']);

const STRONG = { consistency: 'strong' };

// One authoritative singleton pointer recording which Person currently
// holds `is_self: true` and `lifecycle_status: 'active'` (correction B1).
// Netlify Blobs offers no database transaction or compare-and-set
// primitive, so this alone cannot make the uniqueness check atomic — see
// `assertSelfAvailable` below and the PR body's "active self invariant and
// concurrency boundary" section for the honest limits of what a strong
// read plus a single authoritative key can guarantee without one.
export const SELF_POINTER_KEY = 'entities/self-pointer';

export function identityOperationKey(operationId) {
  if (!isValidOperationId(operationId)) {
    throw Object.assign(new Error(`Invalid identity operation id: ${JSON.stringify(operationId)}`), {
      status: 400,
      code: 'invalid_operation_id'
    });
  }
  return `identities/operations/${operationId}`;
}

function validateIdentityOperationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== IDENTITY_OPERATION_SCHEMA_VERSION) return null;
  if (!isValidOperationId(raw.operation_id)) return null;
  if (!IDENTITY_OPERATION_TYPES.has(raw.operation_type)) return null;
  if (raw.kind !== 'person' && raw.kind !== 'organisation') return null;
  if (!IDENTITY_OPERATION_STATUSES.has(raw.status)) return null;
  if (!raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)) return null;
  return { ...raw, payload: { ...raw.payload } };
}

function identityWriteIncompleteError({ operationId, entityId }) {
  return Object.assign(new Error('The identity write did not complete.'), {
    status: 503,
    code: 'identity_write_incomplete',
    retryable: true,
    operation_id: operationId,
    entity_id: entityId
  });
}

function identityOperationNotFoundError() {
  return Object.assign(new Error('Identity operation not found.'), { status: 404, code: 'operation_not_found' });
}

function identityOperationSupersededError({ operationId, entityId }) {
  return Object.assign(
    new Error('This identity operation has been superseded by a later change and cannot be safely replayed.'),
    { status: 409, code: 'identity_operation_superseded', operation_id: operationId, entity_id: entityId }
  );
}

function identityNotFoundError() {
  return Object.assign(new Error('Entity not found.'), { status: 404, code: 'entity_not_found' });
}

function invalidLifecycleTransitionError(message) {
  return Object.assign(new Error(message), { status: 409, code: 'invalid_lifecycle_transition' });
}

function entityKeyFor(kind, id) {
  return kind === 'person' ? personKey(id) : organisationKey(id);
}

function indexKeyFor(kind, id) {
  return kind === 'person' ? personIndexKey(id) : organisationIndexKey(id);
}

function buildIndexFor(record, kind) {
  return buildIdentityIndexRecord({
    id: record.id,
    kind,
    displayLabel: displayLabelFor(record),
    sortName: kind === 'person' ? record.sort_name : null,
    lifecycleStatus: record.lifecycle_status,
    isSelf: kind === 'person' ? record.is_self : false,
    updatedAt: record.updated_at
  });
}

// Distinguishes "this call is the same attempt as the journal already on
// file" from "this journal is for an unrelated request that happens to
// share the same deterministic operation id" (e.g. two independent
// archive-then-reactivate-then-archive-again transitions collide on the
// same (kind, id, toStatus) id). `pre_updated_at` matches when the retry
// lands before the entity mutation succeeded; `post_updated_at` matches
// when it lands after — either way, the *same* stored payload is safe to
// resume. Neither matching means the entity has moved on since this
// journal was written; it is stale and must not be blindly replayed.
function computeResumeState({ journal, preUpdatedAt }) {
  if (!journal) return { resuming: false, entityAlreadyWritten: false };
  const matchesPre = journal.payload.pre_updated_at === preUpdatedAt;
  const matchesPost = journal.payload.post_updated_at === preUpdatedAt;
  if (!matchesPre && !matchesPost) return { resuming: false, entityAlreadyWritten: false };
  return { resuming: true, entityAlreadyWritten: matchesPost };
}

export function createIdentityRepository({ store, now = () => new Date().toISOString() } = {}) {
  if (!store) {
    throw new Error('createIdentityRepository requires a store.');
  }

  async function bestEffortMarkRepairNeeded(journal, completedSteps, errorCode) {
    try {
      await setJSON(store, identityOperationKey(journal.operation_id), {
        ...journal,
        status: 'repair_needed',
        completed_steps: [...completedSteps],
        updated_at: now(),
        last_error_code: typeof errorCode === 'string' ? errorCode : 'write_failed'
      });
    } catch {
      // Best effort only — the caller already has the primary
      // identity_write_incomplete error to surface.
    }
  }

  // Runs an ordered list of `{ name, alreadyDone, write }` steps, skipping
  // any already satisfied, then commits the journal. On any failure,
  // best-effort marks the journal `repair_needed` and throws
  // `identity_write_incomplete`.
  async function runIdentitySteps({ journal, entityId, steps }) {
    const completedSteps = [];
    for (const step of steps) {
      try {
        // eslint-disable-next-line no-await-in-loop
        if (!step.alreadyDone) await step.write();
        completedSteps.push(step.name);
      } catch (cause) {
        // eslint-disable-next-line no-await-in-loop
        await bestEffortMarkRepairNeeded(journal, completedSteps, cause?.code ?? 'write_failed');
        throw identityWriteIncompleteError({ operationId: journal.operation_id, entityId });
      }
    }
    try {
      await setJSON(store, identityOperationKey(journal.operation_id), {
        ...journal,
        status: 'committed',
        completed_steps: steps.map(step => step.name),
        updated_at: now(),
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, completedSteps, cause?.code ?? 'commit_write_failed');
      throw identityWriteIncompleteError({ operationId: journal.operation_id, entityId });
    }
  }

  async function loadEntity({ kind, id }) {
    const raw = await getJSON(store, entityKeyFor(kind, id));
    const record = kind === 'person' ? parsePersonRecord(raw) : parseOrganisationRecord(raw);
    if (!record) throw identityNotFoundError();
    return record;
  }

  // The uniqueness check for the active self identity (correction B1),
  // shared by both creation and activation — the confirmed defect was
  // that only creation ran it. `excludingPersonId` lets a person's own
  // (re)activation of itself as the current self not spuriously reject.
  //
  // Honest concurrency boundary: this reads the singleton pointer with
  // strong consistency and then reads the pointed-to person with strong
  // consistency, but Netlify Blobs has no compare-and-set — two calls that
  // both pass this check before either writes could still both proceed.
  // This is the documented, accepted boundary for the current
  // single-operator system (see the PR body); it is not a claim of
  // transactional uniqueness.
  async function assertSelfAvailable({ excludingPersonId }) {
    const pointer = await getJSON(store, SELF_POINTER_KEY, STRONG);
    const currentSelfId = pointer && typeof pointer === 'object' && typeof pointer.person_id === 'string'
      ? pointer.person_id
      : null;
    if (!currentSelfId || currentSelfId === excludingPersonId) return;
    const currentSelf = parsePersonRecord(await getJSON(store, personKey(currentSelfId), STRONG));
    if (currentSelf && currentSelf.is_self && currentSelf.lifecycle_status === 'active') {
      throw Object.assign(new Error('An active self identity already exists.'), {
        status: 409,
        code: 'self_identity_exists'
      });
    }
  }

  async function createIdentity({ kind, input }) {
    const validated = kind === 'person' ? validatePersonCreateInput(input) : validateOrganisationCreateInput(input);

    // B1: the same uniqueness check creation always ran, now shared with
    // activation via `assertSelfAvailable`.
    if (kind === 'person' && validated.is_self) {
      await assertSelfAvailable({ excludingPersonId: null });
    }

    const timestamp = now();
    const entityId = kind === 'person' ? generatePersonId() : generateOrganisationId();
    const record = Object.freeze(kind === 'person'
      ? {
        schema_version: IDENTITY_SCHEMA_VERSION,
        id: entityId,
        kind: 'person',
        display_name: validated.display_name,
        sort_name: validated.sort_name,
        aliases: validated.aliases,
        lifecycle_status: 'active',
        is_self: validated.is_self,
        retention_reason: null,
        retention_review_at: null,
        created_at: timestamp,
        updated_at: timestamp
      }
      : {
        schema_version: IDENTITY_SCHEMA_VERSION,
        id: entityId,
        kind: 'organisation',
        display_name: validated.display_name,
        legal_name: validated.legal_name,
        aliases: validated.aliases,
        lifecycle_status: 'active',
        retention_reason: null,
        retention_review_at: null,
        created_at: timestamp,
        updated_at: timestamp
      });

    const indexRecord = buildIndexFor(record, kind);
    const selfPointerPayload = kind === 'person' && validated.is_self
      ? { schema_version: 1, person_id: entityId, updated_at: timestamp }
      : null;

    const operationId = deriveOperationId(['create_identity', kind, entityId]);
    const journal = {
      schema_version: IDENTITY_OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: 'create_identity',
      kind,
      entity_id: entityId,
      status: 'prepared',
      completed_steps: [],
      payload: { entity: record, index: indexRecord, self_pointer: selfPointerPayload },
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    try {
      await setJSON(store, identityOperationKey(operationId), journal);
    } catch {
      throw identityWriteIncompleteError({ operationId, entityId });
    }

    const steps = [
      { name: 'entity', alreadyDone: false, write: () => setJSON(store, entityKeyFor(kind, entityId), record) },
      { name: 'index', alreadyDone: false, write: () => setJSON(store, indexKeyFor(kind, entityId), indexRecord) }
    ];
    if (selfPointerPayload) {
      steps.push({ name: 'self_pointer', alreadyDone: false, write: () => setJSON(store, SELF_POINTER_KEY, selfPointerPayload) });
    }

    await runIdentitySteps({ journal, entityId, steps });
    return { record, ref: formatEntityRef({ namespace: 'shared', kind, id: entityId }) };
  }

  async function updateFields({ ref, patch }) {
    const record = await loadEntity(ref);

    // B3: identifying field updates are rejected once a record has
    // reached a terminal, redacted lifecycle state. The previous code
    // applied an ordinary field patch unconditionally, so a PATCH sent
    // after deidentify/delete could write new identifying values straight
    // into the authoritative record and return 200.
    if (record.lifecycle_status === 'deidentified' || record.lifecycle_status === 'deleted') {
      throw invalidLifecycleTransitionError(
        `Cannot update identifying fields on a ${record.lifecycle_status} identity.`
      );
    }

    const validatedPatch = ref.kind === 'person'
      ? validatePersonFieldUpdate(patch)
      : validateOrganisationFieldUpdate(patch);

    const preUpdatedAt = record.updated_at;
    const patchFingerprint = JSON.stringify(Object.keys(validatedPatch).sort().map(key => [key, validatedPatch[key]]));
    const operationId = deriveOperationId(['update_identity', ref.kind, ref.id, patchFingerprint]);

    const existingJournal = validateIdentityOperationRecord(await getJSON(store, identityOperationKey(operationId), STRONG));
    const { resuming, entityAlreadyWritten } = computeResumeState({ journal: existingJournal, preUpdatedAt });

    const timestamp = now();
    const updatedRecord = resuming
      ? existingJournal.payload.entity
      : Object.freeze({ ...record, ...validatedPatch, updated_at: timestamp });
    const indexRecord = resuming ? existingJournal.payload.index : buildIndexFor(updatedRecord, ref.kind);

    const steps = [
      { name: 'entity', alreadyDone: entityAlreadyWritten, write: () => setJSON(store, entityKeyFor(ref.kind, ref.id), updatedRecord) },
      { name: 'index', alreadyDone: false, write: () => setJSON(store, indexKeyFor(ref.kind, ref.id), indexRecord) }
    ];

    const journal = resuming ? existingJournal : {
      schema_version: IDENTITY_OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: 'update_identity',
      kind: ref.kind,
      entity_id: ref.id,
      status: 'prepared',
      completed_steps: [],
      payload: { pre_updated_at: preUpdatedAt, post_updated_at: updatedRecord.updated_at, entity: updatedRecord, index: indexRecord },
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    if (!resuming) {
      try {
        await setJSON(store, identityOperationKey(operationId), journal);
      } catch {
        throw identityWriteIncompleteError({ operationId, entityId: ref.id });
      }
    }

    await runIdentitySteps({ journal, entityId: ref.id, steps });
    return updatedRecord;
  }

  async function transitionLifecycle({ ref, toStatus, retentionReason = null, retentionReviewAt = null }) {
    const record = await loadEntity(ref);
    const isSelf = ref.kind === 'person' ? record.is_self : false;
    const preUpdatedAt = record.updated_at;

    const operationId = deriveOperationId(['lifecycle_identity', ref.kind, ref.id, toStatus]);
    const existingJournal = validateIdentityOperationRecord(await getJSON(store, identityOperationKey(operationId), STRONG));
    const { resuming, entityAlreadyWritten } = computeResumeState({ journal: existingJournal, preUpdatedAt });

    if (!resuming) {
      // The transition-graph check only runs for a fresh (or stale/
      // superseded-id-reused) attempt — a resumed *incomplete* attempt
      // already passed it the first time, and must not reject merely
      // because the status already changed underneath it (correction B4,
      // confirmed repro 3).
      assertLifecycleTransitionAllowed({
        kind: ref.kind,
        fromStatus: record.lifecycle_status,
        toStatus,
        isSelf,
        retentionReason,
        retentionReviewAt
      });
      // B1: the same self-uniqueness check activation now runs, matching
      // creation.
      if (isSelf && toStatus === 'active') {
        await assertSelfAvailable({ excludingPersonId: ref.id });
      }
    }

    const timestamp = now();
    const updatedRecord = resuming
      ? existingJournal.payload.entity
      : Object.freeze(applyLifecycleTransition({ record, toStatus, retentionReason, retentionReviewAt, now: timestamp }));
    const indexRecord = resuming ? existingJournal.payload.index : buildIndexFor(updatedRecord, ref.kind);
    const entityRef = formatEntityRef({ namespace: 'shared', kind: ref.kind, id: ref.id });
    const event = resuming ? existingJournal.payload.event : Object.freeze({
      schema_version: 1,
      event_id: generateEventId(),
      entity_ref: entityRef,
      event_type: 'lifecycle_transition',
      from_status: record.lifecycle_status,
      to_status: toStatus,
      created_at: timestamp
    });
    const needsSelfPointer = isSelf && (toStatus === 'active' || record.lifecycle_status === 'active');
    const selfPointerPayload = resuming
      ? existingJournal.payload.self_pointer ?? null
      : (needsSelfPointer ? { schema_version: 1, person_id: toStatus === 'active' ? ref.id : null, updated_at: timestamp } : null);

    const steps = [
      { name: 'entity', alreadyDone: entityAlreadyWritten, write: () => setJSON(store, entityKeyFor(ref.kind, ref.id), updatedRecord) },
      { name: 'index', alreadyDone: false, write: () => setJSON(store, indexKeyFor(ref.kind, ref.id), indexRecord) },
      { name: 'event', alreadyDone: false, write: () => setJSON(store, entityEventKey(entityRef, event.event_id), event) }
    ];
    if (selfPointerPayload) {
      steps.push({ name: 'self_pointer', alreadyDone: false, write: () => setJSON(store, SELF_POINTER_KEY, selfPointerPayload) });
    }

    const journal = resuming ? existingJournal : {
      schema_version: IDENTITY_OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: 'lifecycle_identity',
      kind: ref.kind,
      entity_id: ref.id,
      status: 'prepared',
      completed_steps: [],
      payload: {
        pre_updated_at: preUpdatedAt,
        post_updated_at: updatedRecord.updated_at,
        entity: updatedRecord,
        index: indexRecord,
        event,
        self_pointer: selfPointerPayload
      },
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    if (!resuming) {
      try {
        await setJSON(store, identityOperationKey(operationId), journal);
      } catch {
        throw identityWriteIncompleteError({ operationId, entityId: ref.id });
      }
    }

    await runIdentitySteps({ journal, entityId: ref.id, steps });
    return updatedRecord;
  }

  async function repairIdentityOperation(operationId) {
    if (!isValidOperationId(operationId)) throw identityOperationNotFoundError();
    const journal = validateIdentityOperationRecord(await getJSON(store, identityOperationKey(operationId), STRONG));
    if (!journal) throw identityOperationNotFoundError();

    if (journal.status === 'committed') {
      return { operation_id: operationId, entity_id: journal.entity_id, status: 'committed', repaired: false };
    }

    if (journal.operation_type === 'create_identity') {
      const steps = [
        { name: 'entity', alreadyDone: false, write: () => setJSON(store, entityKeyFor(journal.kind, journal.entity_id), journal.payload.entity) },
        { name: 'index', alreadyDone: false, write: () => setJSON(store, indexKeyFor(journal.kind, journal.entity_id), journal.payload.index) }
      ];
      if (journal.payload.self_pointer) {
        steps.push({ name: 'self_pointer', alreadyDone: false, write: () => setJSON(store, SELF_POINTER_KEY, journal.payload.self_pointer) });
      }
      await runIdentitySteps({ journal, entityId: journal.entity_id, steps });
      return {
        operation_id: operationId,
        entity_id: journal.entity_id,
        status: 'committed',
        repaired: true,
        ref: formatEntityRef({ namespace: 'shared', kind: journal.kind, id: journal.entity_id })
      };
    }

    // update_identity / lifecycle_identity: only safe to replay when the
    // live entity is still exactly where this operation left it (or
    // hasn't moved since it was prepared) — otherwise a later, unrelated
    // change has superseded it and blindly replaying a stale payload
    // would revert that change.
    const record = await loadEntity({ kind: journal.kind, id: journal.entity_id });
    const { resuming, entityAlreadyWritten } = computeResumeState({ journal, preUpdatedAt: record.updated_at });
    if (!resuming) {
      throw identityOperationSupersededError({ operationId, entityId: journal.entity_id });
    }

    const steps = [
      { name: 'entity', alreadyDone: entityAlreadyWritten, write: () => setJSON(store, entityKeyFor(journal.kind, journal.entity_id), journal.payload.entity) },
      { name: 'index', alreadyDone: false, write: () => setJSON(store, indexKeyFor(journal.kind, journal.entity_id), journal.payload.index) }
    ];
    if (journal.operation_type === 'lifecycle_identity') {
      steps.push({
        name: 'event',
        alreadyDone: false,
        write: () => setJSON(store, entityEventKey(journal.payload.event.entity_ref, journal.payload.event.event_id), journal.payload.event)
      });
      if (journal.payload.self_pointer) {
        steps.push({ name: 'self_pointer', alreadyDone: false, write: () => setJSON(store, SELF_POINTER_KEY, journal.payload.self_pointer) });
      }
    }

    await runIdentitySteps({ journal, entityId: journal.entity_id, steps });
    return { operation_id: operationId, entity_id: journal.entity_id, status: 'committed', repaired: true };
  }

  return {
    createIdentity,
    loadEntity,
    updateFields,
    transitionLifecycle,
    repairIdentityOperation
  };
}

export async function defaultCreateIdentityRepository(deps = {}) {
  const store = deps.store ?? await defaultGetUniversalLinkStore();
  return createIdentityRepository({ ...deps, store });
}
