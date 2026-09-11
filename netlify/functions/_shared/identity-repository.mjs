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
import { mapBounded } from './blobs-list.mjs';
import {
  defaultGetUniversalLinkStore,
  entityEventKey,
  getJSON,
  listPersonIndexKeys,
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
//
// --- Self-identity invariant (correction B1, hardened) ---
//
// A prior version of this module gated the active-self invariant with a
// single check at the *start* of create/activate, then wrote the entity,
// the index, and finally the self-pointer, in that order, with no further
// check. That let a confirmed sequential defect through: if the pointer
// write was the step that failed (or any step after the entity write
// itself already landed), the entity was already durably `is_self: true,
// lifecycle_status: 'active'` on disk — externally observable via an
// ordinary GET — before the invariant was ever re-checked. A second,
// unrelated self creation/activation that completed fully in between could
// end up with its own equally-active entity, and a later blind repair of
// the first attempt could then clobber the pointer the second attempt
// legitimately holds.
//
// The fix is not merely reordering steps (Netlify Blobs has no
// compare-and-set, so no ordering alone is airtight against a *genuinely
// concurrent* pair of requests — see the PR body's concurrency boundary).
// Instead, every write that would make a Person newly `is_self &&
// lifecycle_status: 'active'` externally observable is gated by its own
// fresh, live ownership check, immediately before that exact write:
//
// - `claimSelfPointer` re-runs `assertSelfAvailable` immediately before
//   writing the pointer, and is the *first* step for any operation that
//   would activate a self Person — so the pointer is claimed (or the
//   operation stably rejected) before the entity write that would make it
//   observable ever runs.
// - The entity write for such an operation re-runs `assertSelfAvailable`
//   immediately before writing, so even if the pointer was claimed by this
//   operation but a later, fully-completed operation has since taken over
//   (the sequential case the confirmed defect exercised), this step
//   refuses rather than silently writing a second active self.
// - `releaseSelfPointerIfOwned` (used when a self Person deactivates)
//   clears the pointer only when it still names the Person being
//   deactivated — a stale deactivation repaired after a different Person
//   has since become self must never touch that later Person's claim.
// - `reconcileSelfIdentity` scans every Person the identity index knows
//   about and compares against the pointer: exactly one active self and a
//   matching pointer is left alone; zero active selfs clears the pointer;
// more than one active self (a state these fixes are designed to make
//   unreachable going forward, but which could already exist from
//   corrupted data) is reported as a stable conflict and never silently
//   resolved by picking one.
//
// Every one of these checks is re-run identically on repair — repair never
// blindly replays a stored pointer value, only ever the same live-checked
// claim/release primitives the original attempt used.
//
// Honest concurrency boundary: none of this is a database transaction.
// Two requests whose entire claim-check-then-write for the *same* step
// interleave inside that single check-then-act window could still both
// proceed — only Netlify Blobs gaining a compare-and-set primitive closes
// that gap completely. What this design guarantees is that any two
// attempts that are properly *sequenced* — one's operation (through
// whichever step it reaches, including a repair much later) finishes
// before the next's corresponding step runs — can never both end up
// active, because the step that would make the *second* one active always
// re-checks live state immediately before acting.

export const IDENTITY_OPERATION_SCHEMA_VERSION = 1;

const IDENTITY_OPERATION_TYPES = new Set(['create_identity', 'update_identity', 'lifecycle_identity']);
const IDENTITY_OPERATION_STATUSES = new Set(['prepared', 'repair_needed', 'committed']);

const STRONG = { consistency: 'strong' };
const RECONCILE_BATCH_SIZE = 10;

// One authoritative singleton pointer recording which Person currently
// holds `is_self: true` and `lifecycle_status: 'active'` (correction B1).
// Netlify Blobs offers no database transaction or compare-and-set
// primitive, so this alone cannot make the uniqueness check atomic — see
// `assertSelfAvailable`/`claimSelfPointer` below and the PR body's "active
// self invariant and concurrency boundary" section for the honest limits
// of what a strong read plus a single authoritative key can guarantee
// without one.
export const SELF_POINTER_KEY = 'entities/self-pointer';
export const SELF_POINTER_SCHEMA_VERSION = 2;

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

// Thrown by `assertSelfAvailable`/`claimSelfPointer` whenever an active
// self identity already exists elsewhere. Marked `stableConflict: true` so
// `runIdentitySteps` propagates it as-is (a stable 409) instead of masking
// it behind a retryable `503 identity_write_incomplete` — retrying this
// specific conflict can never succeed on its own; only an operator
// resolving which Person is actually self can.
function selfIdentityExistsError() {
  return Object.assign(new Error('An active self identity already exists.'), {
    status: 409,
    code: 'self_identity_exists',
    stableConflict: true
  });
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

function parseSelfPointer(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const personId = typeof raw.person_id === 'string' ? raw.person_id : null;
  const operationId = typeof raw.operation_id === 'string' ? raw.operation_id : null;
  return { person_id: personId, operation_id: operationId };
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
  // best-effort marks the journal `repair_needed`. A step whose failure is
  // a stable, non-retryable business conflict (marked `stableConflict` —
  // currently only the self-identity ownership checks) is rethrown as-is;
  // anything else (a genuine storage failure) is wrapped as a retryable
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
        if (cause?.stableConflict) throw cause;
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
  // (re)activation of itself as the current self not spuriously reject,
  // and lets a claim in progress for `excludingPersonId` itself pass.
  //
  // Honest concurrency boundary: this reads the singleton pointer with
  // strong consistency and then reads the pointed-to person with strong
  // consistency, but Netlify Blobs has no compare-and-set — two calls that
  // both pass this check before either writes could still both proceed.
  // This is the documented, accepted boundary for the current
  // single-operator system (see the PR body); it is not a claim of
  // transactional uniqueness. What closes the *sequential* version of this
  // gap is that every write this check gates (`claimSelfPointer`, and the
  // entity write itself) re-runs this exact check immediately beforehand,
  // rather than relying on a single check made earlier in the request.
  async function assertSelfAvailable({ excludingPersonId }) {
    const pointer = parseSelfPointer(await getJSON(store, SELF_POINTER_KEY, STRONG));
    const currentSelfId = pointer?.person_id ?? null;
    if (!currentSelfId || currentSelfId === excludingPersonId) return;
    const currentSelf = parsePersonRecord(await getJSON(store, personKey(currentSelfId), STRONG));
    if (currentSelf && currentSelf.is_self && currentSelf.lifecycle_status === 'active') {
      throw selfIdentityExistsError();
    }
  }

  // Claims the self pointer for `personId` — the first step of any
  // operation that would make a Person newly the active self. Re-checks
  // availability immediately before writing (not just once, earlier in the
  // request), so a claim can never land after a later, fully-completed
  // claim has already taken the slot.
  async function claimSelfPointer({ personId, operationId }) {
    await assertSelfAvailable({ excludingPersonId: personId });
    await setJSON(store, SELF_POINTER_KEY, {
      schema_version: SELF_POINTER_SCHEMA_VERSION,
      person_id: personId,
      operation_id: operationId,
      updated_at: now()
    });
  }

  // Clears the self pointer for a deactivating Person, but only when the
  // live pointer still names that exact Person — required behaviour 2/3: a
  // stale deactivation repaired after a later Person has already become
  // self must never clear (or otherwise disturb) that later Person's
  // claim. Never throws: this is always a safe no-op when the pointer has
  // moved on, not a conflict.
  async function releaseSelfPointerIfOwned({ personId }) {
    const pointer = parseSelfPointer(await getJSON(store, SELF_POINTER_KEY, STRONG));
    if (!pointer || pointer.person_id !== personId) return;
    await setJSON(store, SELF_POINTER_KEY, {
      schema_version: SELF_POINTER_SCHEMA_VERSION,
      person_id: null,
      operation_id: null,
      updated_at: now()
    });
  }

  // Builds the ordered step list shared by every create/update/lifecycle
  // operation and its repair. `selfPointerAction` is `'claim'` (pointer
  // claimed first, entity write re-checks live availability immediately
  // before writing), `'release'` (pointer cleared last, only if still
  // owned), or `null` (no self-pointer involvement at all — every
  // Organisation, and every non-self Person).
  function buildIdentitySteps({
    kind,
    entityId,
    operationId,
    entityRecord,
    indexRecord,
    event,
    selfPointerAction,
    entityAlreadyDone = false
  }) {
    const steps = [];
    if (selfPointerAction === 'claim') {
      steps.push({
        name: 'self_pointer',
        alreadyDone: false,
        write: () => claimSelfPointer({ personId: entityId, operationId })
      });
    }
    steps.push({
      name: 'entity',
      alreadyDone: entityAlreadyDone,
      write: () => (selfPointerAction === 'claim' ? assertSelfAvailable({ excludingPersonId: entityId }) : Promise.resolve())
        .then(() => setJSON(store, entityKeyFor(kind, entityId), entityRecord))
    });
    steps.push({ name: 'index', alreadyDone: false, write: () => setJSON(store, indexKeyFor(kind, entityId), indexRecord) });
    if (event) {
      steps.push({
        name: 'event',
        alreadyDone: false,
        write: () => setJSON(store, entityEventKey(event.entity_ref, event.event_id), event)
      });
    }
    if (selfPointerAction === 'release') {
      steps.push({
        name: 'self_pointer',
        alreadyDone: false,
        write: () => releaseSelfPointerIfOwned({ personId: entityId })
      });
    }
    return steps;
  }

  // Scans every Person the identity index knows about and compares the
  // live count of `is_self && lifecycle_status: 'active'` records against
  // the pointer (required behaviour 6). The authoritative Person records
  // are the ground truth here, not the pointer — the pointer is a cache of
  // "who currently holds the slot" that this reconciles *toward* the
  // records, never the other way around:
  //
  // - Exactly one active self: the pointer is corrected to name it if it
  //   doesn't already (`reconciled`), or left alone if it does
  //   (`consistent`).
  // - Zero active selfs: the pointer is cleared if it names anyone
  //   (`reconciled`), or left alone if already clear (`consistent`).
  // - More than one active self — a state the claim/release checks above
  //   are designed to make unreachable going forward, but which could
  //   already exist from data corrupted before this correction — is
  //   reported as a stable `conflict` and nothing is written. This never
  //   silently picks one; it is exactly the "stable conflict requiring
  //   operator action" required behaviour 6 asks for.
  async function reconcileSelfIdentity() {
    const pointer = parseSelfPointer(await getJSON(store, SELF_POINTER_KEY, STRONG));
    const pointerPersonId = pointer?.person_id ?? null;

    const indexKeys = await listPersonIndexKeys(store);
    const indexRecords = await mapBounded(indexKeys, RECONCILE_BATCH_SIZE, key => getJSON(store, key));
    const personIds = [...new Set(
      indexRecords
        .filter(record => record && typeof record === 'object' && typeof record.id === 'string')
        .map(record => record.id)
    )];

    const personRecords = await mapBounded(personIds, RECONCILE_BATCH_SIZE, id => getJSON(store, personKey(id), STRONG));
    const activeSelfIds = personIds
      .filter((_, index) => {
        const record = parsePersonRecord(personRecords[index]);
        return Boolean(record && record.is_self && record.lifecycle_status === 'active');
      })
      .sort();

    if (activeSelfIds.length > 1) {
      return { status: 'conflict', person_ids: activeSelfIds, pointer_person_id: pointerPersonId };
    }

    const truePersonId = activeSelfIds[0] ?? null;
    if (pointerPersonId === truePersonId) {
      return { status: 'consistent', person_id: truePersonId };
    }

    await setJSON(store, SELF_POINTER_KEY, {
      schema_version: SELF_POINTER_SCHEMA_VERSION,
      person_id: truePersonId,
      operation_id: null,
      updated_at: now()
    });
    return { status: 'reconciled', person_id: truePersonId, previous_pointer_person_id: pointerPersonId };
  }

  async function createIdentity({ kind, input }) {
    const validated = kind === 'person' ? validatePersonCreateInput(input) : validateOrganisationCreateInput(input);
    const claimsSelf = kind === 'person' && validated.is_self;

    // B1: fast-fail check before generating an id or journal at all. The
    // authoritative gate is `claimSelfPointer`'s own re-check immediately
    // before the pointer write below — this is purely an early rejection
    // for the ordinary case where availability hasn't changed since.
    if (claimsSelf) {
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
    const selfPointerAction = claimsSelf ? 'claim' : null;

    const operationId = deriveOperationId(['create_identity', kind, entityId]);
    const journal = {
      schema_version: IDENTITY_OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: 'create_identity',
      kind,
      entity_id: entityId,
      status: 'prepared',
      completed_steps: [],
      payload: { entity: record, index: indexRecord, self_pointer_action: selfPointerAction },
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    try {
      await setJSON(store, identityOperationKey(operationId), journal);
    } catch {
      throw identityWriteIncompleteError({ operationId, entityId });
    }

    const steps = buildIdentitySteps({
      kind,
      entityId,
      operationId,
      entityRecord: record,
      indexRecord,
      event: null,
      selfPointerAction
    });

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

    const steps = buildIdentitySteps({
      kind: ref.kind,
      entityId: ref.id,
      operationId,
      entityRecord: updatedRecord,
      indexRecord,
      event: null,
      selfPointerAction: null,
      entityAlreadyDone: entityAlreadyWritten
    });

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

    // A self identity's transition graph only ever permits active<->inactive
    // (every other target is rejected by `assertLifecycleTransitionAllowed`'s
    // self-protection below), so which direction this operation's pointer
    // involvement takes is fully determined by `toStatus` alone.
    const selfPointerAction = !isSelf ? null : (toStatus === 'active' ? 'claim' : 'release');

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
      // B1: fast-fail check before generating an event/journal, mirroring
      // createIdentity's early check — `claimSelfPointer`'s own re-check
      // immediately before the pointer write is still the authoritative
      // gate (also applied on a resumed retry via the step list below).
      if (selfPointerAction === 'claim') {
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
        self_pointer_action: selfPointerAction
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

    const steps = buildIdentitySteps({
      kind: ref.kind,
      entityId: ref.id,
      operationId,
      entityRecord: updatedRecord,
      indexRecord,
      event,
      selfPointerAction,
      entityAlreadyDone: entityAlreadyWritten
    });

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
      const selfPointerAction = journal.payload.self_pointer_action === 'claim' ? 'claim' : null;
      const steps = buildIdentitySteps({
        kind: journal.kind,
        entityId: journal.entity_id,
        operationId,
        entityRecord: journal.payload.entity,
        indexRecord: journal.payload.index,
        event: null,
        selfPointerAction
      });
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

    const selfPointerAction = journal.operation_type === 'lifecycle_identity'
      ? (journal.payload.self_pointer_action ?? null)
      : null;

    const steps = buildIdentitySteps({
      kind: journal.kind,
      entityId: journal.entity_id,
      operationId,
      entityRecord: journal.payload.entity,
      indexRecord: journal.payload.index,
      event: journal.operation_type === 'lifecycle_identity' ? journal.payload.event : null,
      selfPointerAction,
      entityAlreadyDone: entityAlreadyWritten
    });

    await runIdentitySteps({ journal, entityId: journal.entity_id, steps });
    return { operation_id: operationId, entity_id: journal.entity_id, status: 'committed', repaired: true };
  }

  return {
    createIdentity,
    loadEntity,
    updateFields,
    transitionLifecycle,
    repairIdentityOperation,
    reconcileSelfIdentity
  };
}

export async function defaultCreateIdentityRepository(deps = {}) {
  const store = deps.store ?? await defaultGetUniversalLinkStore();
  return createIdentityRepository({ ...deps, store });
}
