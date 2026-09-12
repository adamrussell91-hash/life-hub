import { assertLifecycleTransitionAllowed, applyLifecycleTransition } from './entity-lifecycle.mjs';
import { assertAdministrationWorkflow } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import {
  IDENTITY_SCHEMA_VERSION,
  buildIdentityIndexRecord,
  displayLabelFor,
  generateEventId,
  generateOrganisationId,
  generatePersonId,
  isValidPersonId,
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
  listAuthoritativePersonKeys,
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
// - `reconcileSelfIdentity` scans every *authoritative* Person record
//   (never the derived search index — see `loadAuthoritativePersons`) and
//   compares against the pointer: exactly one active self and a matching
//   pointer is left alone; zero active selfs and no valid pending
//   reservation clears the pointer; more than one active self (a state
//   these fixes are designed to make unreachable going forward, but which
//   could already exist from corrupted data) is reported as a stable
//   conflict and never silently resolved by picking one.
//
// Every one of these checks is re-run identically on repair — repair never
// blindly replays a stored pointer value, only ever the same live-checked
// claim/release primitives the original attempt used.
//
// Hardened further after a second confirmed reproduction: a pointer
// written before its Person record exists did not actually reserve
// anything, because the original `assertSelfAvailable` treated "the
// pointed-to Person is absent or inactive" as proof the slot was free —
// so a second, unrelated operation could freely steal a genuinely
// in-flight claim, and each half of that race could go on to write its
// own active Person independently. `inspectSelfPointer` now classifies
// the pointer into `'empty'`, `'active_owner'`, `'pending'` (a claim
// that is provably still in flight — its journal exists, matches, and is
// not yet `committed`), or `'stale'` (anything else non-active — a
// missing, malformed, mismatched, or already-`committed`-without-
// becoming-active journal). `assertSelfAvailable` blocks a *different*
// operation on every non-empty state alike, including `'stale'`: an
// ordinary create or activation is never allowed to silently claim a
// reservation just because it looks abandoned — only
// `reconcileSelfIdentity`, an explicit administration action working
// from the authoritative Person records, may clear a genuinely stale one.
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

// The one internal pointer parser (correction Job 1, round 4): classifies
// the *raw* stored value into exactly one of three outcomes, and is the
// only place allowed to read `person_id`/`operation_id` off untrusted
// storage content. Every other function in this module that needs the
// pointer's identifiers goes through this classifier first — never through
// a looser, ad hoc read — so a malformed stored value can never reach
// `personKey`/`identityOperationKey` (both of which throw a validation
// error for an unsafe id, which is exactly the confirmed defect: a
// reconciliation call that cannot even inspect the pointer it exists to
// repair).
//
// - `'empty'`: no stored value at all, or the canonical empty pointer
//   (`person_id: null, operation_id: null` together). The slot is free.
// - `'candidate'`: a supported, well-shaped, nonempty pointer — a
//   path-safe, correctly formatted `person_id`, and an `operation_id` that
//   is either also valid or `null` (a legacy stale pointer predating the
//   operation id being recorded at all).
// - `'malformed'`: everything else — a non-object, an array, a primitive,
//   an unsupported schema version, a missing field, a partial-empty shape
//   (one identifier `null` while the other is not — the canonical empty
//   pointer always clears both together), or either identifier present but
//   unsafe/invalid. A malformed pointer is never proof the slot is free —
//   callers treat it as `'stale'`, exactly like a well-formed pointer whose
//   claim has been abandoned.
function classifyStoredSelfPointer(raw) {
  if (raw === null || raw === undefined) return { kind: 'empty' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed' };
  if (raw.schema_version !== SELF_POINTER_SCHEMA_VERSION) return { kind: 'malformed' };
  if (!Object.prototype.hasOwnProperty.call(raw, 'person_id') || !Object.prototype.hasOwnProperty.call(raw, 'operation_id')) {
    return { kind: 'malformed' };
  }

  const { person_id: personId, operation_id: operationId } = raw;
  if (personId === null && operationId === null) return { kind: 'empty' };

  // A pointer naming an operation but no Person (or any other partial
  // empty shape) is never a valid reservation.
  if (personId === null) return { kind: 'malformed' };
  if (typeof personId !== 'string' || !isValidPersonId(personId)) return { kind: 'malformed' };

  if (operationId === null) return { kind: 'candidate', person_id: personId, operation_id: null };
  if (typeof operationId !== 'string' || !isValidOperationId(operationId)) return { kind: 'malformed' };

  return { kind: 'candidate', person_id: personId, operation_id: operationId };
}

// A stored journal is a genuine pending self reservation only when every
// one of these holds (correction Job 1, round 4) — anything less is
// `'stale'`, including a journal for an entirely unrelated operation that
// merely happens to share the pointer's operation id after storage
// corruption. `pointer` here is always a `'candidate'` classification's
// `{ person_id, operation_id }`, never a raw stored shape.
function isGenuinePendingSelfReservation(journal, pointer) {
  if (!journal) return false;
  if (journal.operation_id !== pointer.operation_id) return false;
  if (journal.entity_id !== pointer.person_id) return false;
  if (journal.kind !== 'person') return false;
  if (journal.status !== 'prepared' && journal.status !== 'repair_needed') return false;
  if (journal.operation_type !== 'create_identity' && journal.operation_type !== 'lifecycle_identity') return false;
  if (journal.payload.self_pointer_action !== 'claim') return false;
  const entity = journal.payload.entity;
  if (!entity || typeof entity !== 'object') return false;
  if (entity.id !== pointer.person_id) return false;
  if (entity.kind !== 'person') return false;
  if (entity.is_self !== true) return false;
  if (entity.lifecycle_status !== 'active') return false;
  return true;
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

  // Classifies the live self pointer into exactly one of four states
  // (required behaviour 4 of the "pending reservation" correction):
  //
  // - `'empty'`: no pointer, or a pointer naming nobody. The slot is free.
  // - `'active_owner'`: the pointer names a Person whose *authoritative*
  //   record is currently `is_self && lifecycle_status: 'active'`. A
  //   fully committed, currently-active self.
  // - `'pending'`: the pointer names a Person who is not (yet) active,
  //   but the operation that claimed the pointer is still genuinely in
  //   flight — its journal exists, its `entity_id` and `operation_id`
  //   match the pointer exactly, and its status is `prepared` or
  //   `repair_needed` (never `committed`). This is a *valid* reservation:
  //   the claiming operation has not finished, but it also has not been
  //   abandoned or superseded.
  // - `'stale'`: the pointer names a Person who is not active, and the
  //   claim behind it cannot be trusted to still be in flight — its
  //   journal is missing, malformed, mismatched (a corrupted or
  //   overwritten record whose `entity_id`/`operation_id` don't match the
  //   pointer), or already `committed` (the claiming operation finished,
  //   yet the Person is still not the active self — e.g. it was
  //   independently deactivated or deleted afterward, or the pointer
  //   simply predates this correction and carries no operation id at
  //   all). A `'stale'` classification is never proof the slot is safe to
  //   reuse — see `assertSelfAvailable` below.
  //
  // Before writing anything, `assertSelfAvailable` treats `'pending'` and
  // `'stale'` identically to `'active_owner'`: all three block a
  // *different* operation (required behaviour 1, 2, 5, 7). The
  // distinction matters for repair and reconciliation, which — unlike an
  // ordinary create/activate — are explicitly allowed to resolve a
  // `'pending'` operation (by finishing it) or clear a `'stale'` one (by
  // reconciling toward the authoritative Person records), never by an
  // ordinary request silently overwriting either.
  async function inspectSelfPointer() {
    const classification = classifyStoredSelfPointer(await getJSON(store, SELF_POINTER_KEY, STRONG));
    if (classification.kind === 'empty') return { state: 'empty', pointer: null };
    // A malformed stored value is classified `'stale'` — the same
    // treatment as a well-formed pointer whose claim has been abandoned —
    // without ever passing its unsafe content to `personKey` or
    // `identityOperationKey` (the confirmed defect this correction fixes).
    if (classification.kind === 'malformed') return { state: 'stale', pointer: null };

    const pointer = { person_id: classification.person_id, operation_id: classification.operation_id };

    const personRecord = parsePersonRecord(await getJSON(store, personKey(pointer.person_id), STRONG));
    if (personRecord && personRecord.is_self && personRecord.lifecycle_status === 'active') {
      return { state: 'active_owner', pointer, personRecord };
    }

    if (!pointer.operation_id) {
      return { state: 'stale', pointer };
    }
    const journal = validateIdentityOperationRecord(await getJSON(store, identityOperationKey(pointer.operation_id), STRONG));
    if (!isGenuinePendingSelfReservation(journal, pointer)) {
      // Covers a missing journal, one that fails schema validation, one for
      // an unrelated entity/operation/kind, one already `committed` (the
      // claiming operation finished, but its Person is no longer the
      // active self), and one that never actually names a claim on this
      // exact Person becoming active self.
      return { state: 'stale', pointer };
    }
    return { state: 'pending', pointer, journal };
  }

  // The uniqueness check for the active self identity (correction B1),
  // shared by both creation and activation — the confirmed defect was
  // that only creation ran it. `excludingPersonId` lets a person's own
  // (re)activation of itself as the current self not spuriously reject,
  // and lets the same operation resuming its own claim (whatever state
  // that claim is currently in) pass — required behaviour 4d/6.
  //
  // A *different* operation is blocked by every non-empty state —
  // `'active_owner'`, `'pending'`, and `'stale'` alike (required
  // behaviour 1, 2, 5, 7). Treating `'stale'` as available here is
  // exactly the confirmed defect: a valid pending reservation (or even an
  // ambiguous one this check cannot prove is abandoned) must never be
  // silently claimed over by an ordinary create or activation. Clearing a
  // genuinely stale reservation is `reconcileSelfIdentity`'s job, an
  // explicit administration action — never a side effect of an unrelated
  // request.
  //
  // Honest concurrency boundary: this reads the singleton pointer with
  // strong consistency and then reads the pointed-to person (and, where
  // relevant, its claiming operation's journal) with strong consistency,
  // but Netlify Blobs has no compare-and-set — two calls whose read and
  // write for the *same* step genuinely overlap could still both proceed.
  // This is the documented, accepted boundary for the current
  // single-operator system (see the PR body); it is not a claim of
  // transactional uniqueness. What this check closes is the *sequential*
  // gap: every write it gates (`claimSelfPointer`, and the entity write
  // itself) re-runs this exact check immediately beforehand, rather than
  // relying on a single check made earlier in the request, so a
  // reservation can never be silently bypassed just because the Person it
  // names happens to not exist yet or not be active yet.
  async function assertSelfAvailable({ excludingPersonId }) {
    const { state, pointer } = await inspectSelfPointer();
    if (state === 'empty') return;
    // `pointer` is `null` for a malformed stored value (state `'stale'`
    // with nothing safe to compare) — it can never be "this operation's
    // own claim" in that case, so it always falls through to the conflict
    // below, exactly like any other non-empty state.
    if (pointer && pointer.person_id === excludingPersonId) return;
    throw selfIdentityExistsError();
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
    const classification = classifyStoredSelfPointer(await getJSON(store, SELF_POINTER_KEY, STRONG));
    if (classification.kind !== 'candidate' || classification.person_id !== personId) return;
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

  // Best-effort: rewrites a Person's identity index entry when it is
  // missing or stale (required behaviour 15 of the reconciliation
  // correction, Job 2). Never throws — index repair is a courtesy this
  // performs *in addition to* the pointer reconciliation below, and a
  // failure here must never mask reconciliation's own, more important
  // result. Returns whether a repair was written.
  async function repairPersonIndexIfNeeded(personRecord) {
    const expected = buildIndexFor(personRecord, 'person');
    try {
      const current = await getJSON(store, personIndexKey(personRecord.id));
      if (current && JSON.stringify(current) === JSON.stringify(expected)) return false;
      await setJSON(store, personIndexKey(personRecord.id), expected);
      return true;
    } catch {
      return false;
    }
  }

  // Enumerates *authoritative* Person records directly from
  // `entities/person/<id>` (correction Job 2) — never the derived search
  // index. The identity index is written as a separate step after the
  // authoritative record; a Person whose index write failed (or was never
  // repaired) is invisible to `listPersonIndexKeys`, but must never be
  // invisible to reconciliation, which exists precisely to catch this
  // class of drift (required behaviour 1-3, 14). The index stays eligible
  // only as *derived* data this function may repair (behaviour 9, 15),
  // never as the source of which Persons exist (behaviour 2, 8).
  async function loadAuthoritativePersons() {
    const personKeys = await listAuthoritativePersonKeys(store);
    const rawRecords = await mapBounded(personKeys, RECONCILE_BATCH_SIZE, key => getJSON(store, key, STRONG));
    return rawRecords.map(raw => parsePersonRecord(raw)).filter(Boolean);
  }

  // Scans every *authoritative* Person record (never the search index —
  // see `loadAuthoritativePersons`) and compares the live count of
  // `is_self && lifecycle_status: 'active'` records against the pointer
  // (required behaviour 10-14). The authoritative Person records are the
  // ground truth here, not the pointer — the pointer is a cache of "who
  // currently holds the slot" that this reconciles *toward* the records,
  // never the other way around:
  //
  // - Exactly one active self: the pointer is corrected to name it if it
  //   doesn't already (`reconciled`), or left alone if it does
  //   (`consistent`) — either way, its identity index is repaired if
  //   stale (behaviour 15).
  // - Zero active selfs: a genuinely `'stale'` or `'empty'` pointer state
  //   (per `inspectSelfPointer`) is cleared (`reconciled`) or left alone
  //   if already clear (`consistent`). A `'pending'` state is left
  //   strictly alone — its claiming operation may still legitimately
  //   finish; reconciliation must not cancel work that has not been
  //   proven abandoned (behaviour 13's principle, applied to the
  //   zero-active-self case).
  // - Exactly one active self, but the pointer currently names a
  //   *different*, still-`'pending'` reservation: reported as a stable
  //   `conflict` rather than silently cancelling that other operation's
  //   in-flight claim (required behaviour 13 — this correction's chosen
  //   rule is "report a conflict," documented here and in the PR body,
  //   never "safely cancel," since reconciliation cannot know whether the
  //   pending operation is about to legitimately finish).
  // - More than one active self — a state the claim/release checks above
  //   are designed to make unreachable going forward, but which could
  //   already exist from data corrupted before this correction — is
  //   reported as a stable `conflict` and nothing is written. This never
  //   silently picks one; it is exactly the "stable conflict requiring
  //   operator action" required behaviour 12 asks for.
  async function reconcileSelfIdentity(accessContext) {
    assertAdministrationWorkflow(accessContext);

    const classification = classifyStoredSelfPointer(await getJSON(store, SELF_POINTER_KEY, STRONG));
    // A malformed stored value never contributes a Person id to reconcile
    // against or to report — it is treated as `'stale'`, the same as any
    // other non-empty classification below, but nothing unsafe from it is
    // ever echoed back or used to build a Blob key.
    const pointerPersonId = classification.kind === 'candidate' ? classification.person_id : null;

    const persons = await loadAuthoritativePersons();
    const activeSelfPersons = persons.filter(record => record.is_self && record.lifecycle_status === 'active');
    const activeSelfIds = activeSelfPersons.map(record => record.id).sort();

    if (activeSelfIds.length > 1) {
      return { status: 'conflict', person_ids: activeSelfIds, pointer_person_id: pointerPersonId };
    }

    const truePersonId = activeSelfIds[0] ?? null;

    if (!truePersonId) {
      // No authoritative active self exists at all.
      const inspection = classification.kind === 'candidate' ? await inspectSelfPointer() : null;
      if (inspection && inspection.state === 'pending') {
        // A claim may still legitimately finish — never cancel it here.
        return { status: 'consistent', person_id: null, pending_reservation_person_id: pointerPersonId };
      }
      if (classification.kind === 'empty') {
        return { status: 'consistent', person_id: null };
      }
      // Non-empty (a stale candidate, or a malformed stored value) with no
      // authoritative active self anywhere: write the canonical empty
      // pointer.
      await setJSON(store, SELF_POINTER_KEY, {
        schema_version: SELF_POINTER_SCHEMA_VERSION,
        person_id: null,
        operation_id: null,
        updated_at: now()
      });
      return { status: 'reconciled', person_id: null, previous_pointer_person_id: pointerPersonId };
    }

    const truePerson = activeSelfPersons.find(record => record.id === truePersonId);

    if (pointerPersonId === truePersonId) {
      const indexRepaired = await repairPersonIndexIfNeeded(truePerson);
      return { status: 'consistent', person_id: truePersonId, index_repaired: indexRepaired };
    }

    // Exactly one true active self exists, but the pointer disagrees. If
    // the pointer's disagreement is itself a still-`'pending'` claim for a
    // *different* Person, this is a genuine conflict between an
    // in-progress reservation and an already-active self — report it
    // rather than silently cancelling the pending operation (behaviour 13).
    if (pointerPersonId) {
      const inspection = await inspectSelfPointer();
      if (inspection.state === 'pending') {
        return {
          status: 'conflict',
          person_ids: [truePersonId],
          pending_reservation_person_id: pointerPersonId
        };
      }
    }

    await setJSON(store, SELF_POINTER_KEY, {
      schema_version: SELF_POINTER_SCHEMA_VERSION,
      person_id: truePersonId,
      operation_id: null,
      updated_at: now()
    });
    const indexRepaired = await repairPersonIndexIfNeeded(truePerson);
    return { status: 'reconciled', person_id: truePersonId, previous_pointer_person_id: pointerPersonId, index_repaired: indexRepaired };
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

  async function repairIdentityOperation(operationId, accessContext) {
    // 1. Require an administration workflow context — before any
    // validation or storage access (correction Job 3).
    assertAdministrationWorkflow(accessContext);

    // 2. Return a non-disclosing not-found response for anything that
    // isn't a genuinely usable journal record: a malformed operation id
    // (checked before any Blob key is ever built), a well-formed but
    // unknown id, a malformed or unsupported-schema-version stored
    // journal, or a journal whose own stored `operation_id` doesn't match
    // the id it was looked up by (correction Job 4) — every case
    // collapses to the identical response, revealing nothing about which
    // check failed.
    if (!isValidOperationId(operationId)) throw identityOperationNotFoundError();
    const journal = validateIdentityOperationRecord(await getJSON(store, identityOperationKey(operationId), STRONG));
    if (!journal || journal.operation_id !== operationId) throw identityOperationNotFoundError();

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
