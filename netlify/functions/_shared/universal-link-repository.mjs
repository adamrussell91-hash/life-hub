import { mapBounded } from './blobs-list.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './entity-ref.mjs';
import {
  assertAdministrationWorkflow,
  deriveWorkflowVisibility,
  endpointNotFoundError,
  strictestVisibility
} from './entity-access.mjs';
import { validateRelationshipInput } from './relationship-registry.mjs';
import {
  OPERATION_SCHEMA_VERSION,
  UNIVERSAL_LINK_SCHEMA_VERSION,
  deriveOperationId,
  equivalenceInput,
  generateLinkId,
  isValidLinkId,
  isValidOperationId,
  isValidReasonCode,
  validateOperationRecord,
  validateUniversalLinkRecord
} from './universal-link-schema.mjs';
import {
  buildEndpointMembershipRecord,
  buildTypeMembershipRecord,
  byTargetKey,
  bySourceKey,
  byTypeKey,
  defaultGetUniversalLinkStore,
  getJSON,
  isValidEndpointMembershipRecord,
  isValidTypeMembershipRecord,
  linkKey,
  listAuthoritativeLinkKeys,
  operationKey,
  setJSON
} from './universal-link-blobs.mjs';
import { createUniversalLinkReadRepository } from './universal-link-read-repository.mjs';

// The canonical Universal Link write service (Slice 2). Delegates
// `getLink`/`listOutgoing`/`listIncoming`/`listForEntity` to Slice 1's
// `universal-link-read-repository.mjs` rather than re-implementing the
// read algorithm — that module owns membership-prefix reads, bounded
// hydration, sorting, and endpoint non-disclosure; nothing here duplicates
// it. This module adds `createLink`, `endLink`, `suppressLink`,
// `deleteLink`, `repairOperation`, and `rebuildIndexes` on top.
//
// No handler, service, test helper, or domain module may write a Universal
// Link storage key directly — every production write goes through the
// repository this factory returns.

const REBUILD_BATCH_SIZE = 10;
const STRONG = { consistency: 'strong' };

function linkWriteIncompleteError({ operationId, linkId }) {
  return Object.assign(new Error('The Universal Link write did not complete.'), {
    status: 503,
    code: 'link_write_incomplete',
    retryable: true,
    operation_id: operationId,
    link_id: linkId
  });
}

function operationNotFoundError() {
  return Object.assign(new Error('Operation not found.'), { status: 404, code: 'operation_not_found' });
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function invalidTransitionError(message) {
  return Object.assign(new Error(message), { status: 409, code: 'invalid_lifecycle_transition' });
}

function isNullableString(value) {
  return value === null || value === undefined || typeof value === 'string';
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function assertReasonCode(reason) {
  if (!isValidReasonCode(reason)) {
    throw validationError('invalid_reason_code', 'reason must be a bounded, machine-safe lower_snake_case code.');
  }
  return reason;
}

export function createUniversalLinkRepository({
  store,
  resolveEntity,
  now = () => new Date().toISOString()
} = {}) {
  if (!store) {
    throw new Error('createUniversalLinkRepository requires a store.');
  }
  if (typeof resolveEntity !== 'function') {
    throw new Error('createUniversalLinkRepository requires a resolveEntity function.');
  }

  const readRepository = createUniversalLinkReadRepository({ store, resolveEntity });

  // Best-effort: writes the journal as `repair_needed` with whatever steps
  // are already known-complete, so a later `repairOperation` call can
  // replay only what's left. Never throws — the caller already has the
  // primary `link_write_incomplete` error to surface, and a failure here
  // must not mask it.
  async function bestEffortMarkRepairNeeded(journal, completedSteps, errorCode) {
    try {
      await setJSON(store, operationKey(journal.operation_id), {
        ...journal,
        status: 'repair_needed',
        completed_steps: [...completedSteps],
        updated_at: now(),
        last_error_code: typeof errorCode === 'string' ? errorCode : 'write_failed'
      });
    } catch {
      // Best effort only.
    }
  }

  // Strong-consistency snapshot of what already exists for a prospective
  // (or previously attempted) link — the ground truth used to decide which
  // of the four idempotent steps still need to run. Always re-read live
  // rather than trusting a journal's `completed_steps`, since storage state
  // is authoritative and a journal can lag or be stale.
  async function readAuthoritativeState({ linkId, sourceCanonical, targetCanonical, relationshipType }) {
    const [linkRaw, sourceMembership, targetMembership, typeMembership] = await Promise.all([
      getJSON(store, linkKey(linkId), STRONG),
      getJSON(store, bySourceKey(sourceCanonical, linkId), STRONG),
      getJSON(store, byTargetKey(targetCanonical, linkId), STRONG),
      getJSON(store, byTypeKey(relationshipType, linkId), STRONG)
    ]);
    let validLink = null;
    if (linkRaw) {
      try {
        validLink = validateUniversalLinkRecord(linkRaw);
      } catch {
        validLink = null;
      }
    }
    // A membership key holding *some* value is not enough to call it
    // present — its content must actually be the expected membership for
    // *this* link at *this* key (matching schema version, link id, and
    // canonical ref/relationship type). A record that merely exists but
    // doesn't match counts as missing, the same way the read path already
    // treats it (universal-link-blobs.mjs's `isPlausibleMembershipRecord`),
    // so create/retry/repair replace it instead of leaving a permanently
    // unreachable link behind it.
    return {
      linkRaw,
      validLink,
      hasSource: isValidEndpointMembershipRecord(sourceMembership, { linkId, canonicalRef: sourceCanonical }),
      hasTarget: isValidEndpointMembershipRecord(targetMembership, { linkId, canonicalRef: targetCanonical }),
      hasType: isValidTypeMembershipRecord(typeMembership, { linkId, relationshipType })
    };
  }

  // Runs the four idempotent create/repair steps in the documented order —
  // link, source membership, target membership, type membership — skipping
  // any step whose target key already exists. On any write failure, makes
  // a best-effort repair_needed journal update and throws
  // `link_write_incomplete`. Returns the ordered list of steps this call
  // actually completed (for the final committed-journal write).
  async function runSteps({ journal, linkId, linkPayloadToWrite, sourceCanonical, targetCanonical, relationshipType, state, timestamp }) {
    const completedSteps = [];

    async function step(name, missing, writeFn) {
      try {
        if (missing) await writeFn();
        completedSteps.push(name);
      } catch (cause) {
        await bestEffortMarkRepairNeeded(journal, completedSteps, cause?.code ?? 'write_failed');
        throw linkWriteIncompleteError({ operationId: journal.operation_id, linkId });
      }
    }

    await step('link', !state.validLink, () => setJSON(store, linkKey(linkId), linkPayloadToWrite));
    await step(
      'source_membership',
      !state.hasSource,
      () => setJSON(
        store,
        bySourceKey(sourceCanonical, linkId),
        buildEndpointMembershipRecord({ linkId, canonicalRef: sourceCanonical, createdAt: timestamp })
      )
    );
    await step(
      'target_membership',
      !state.hasTarget,
      () => setJSON(
        store,
        byTargetKey(targetCanonical, linkId),
        buildEndpointMembershipRecord({ linkId, canonicalRef: targetCanonical, createdAt: timestamp })
      )
    );
    await step(
      'type_membership',
      !state.hasType,
      () => setJSON(
        store,
        byTypeKey(relationshipType, linkId),
        buildTypeMembershipRecord({ linkId, relationshipType, createdAt: timestamp })
      )
    );

    try {
      await setJSON(store, operationKey(journal.operation_id), {
        ...journal,
        status: 'committed',
        completed_steps: ['link', 'source_membership', 'target_membership', 'type_membership'],
        updated_at: now(),
        // Reset explicitly — a resumed operation's loaded `journal` object
        // can carry `last_error_code` from an earlier failed attempt (set
        // by `bestEffortMarkRepairNeeded` below), and spreading `...journal`
        // would otherwise leave that stale code on an operation that just
        // reached `committed`.
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, completedSteps, cause?.code ?? 'commit_write_failed');
      throw linkWriteIncompleteError({ operationId: journal.operation_id, linkId });
    }

    return completedSteps;
  }

  async function createLink(input, accessContext) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw validationError('invalid_input', 'createLink requires a request body object.');
    }

    // 1. Parse and validate both EntityRefs.
    const sourceRefParsed = assertRegisteredEntityRef(input.source_ref);
    const targetRefParsed = assertRegisteredEntityRef(input.target_ref);
    const sourceCanonical = formatEntityRef(sourceRefParsed);
    const targetCanonical = formatEntityRef(targetRefParsed);

    // 2. Resolve both endpoint records.
    const sourceEndpoint = await resolveEntity(sourceCanonical, accessContext);
    const targetEndpoint = await resolveEntity(targetCanonical, accessContext);

    // 3. Derive endpoint visibility from the safe resolver projections.
    const sourceVisibility = sourceEndpoint.visibility;
    const targetVisibility = targetEndpoint.visibility;

    const role = input.role === undefined ? null : input.role;
    const contextKey = isNullableString(input.context_key) ? (input.context_key ?? null) : null;
    if (input.context_key !== undefined && input.context_key !== null && typeof input.context_key !== 'string') {
      throw validationError('invalid_context_key', 'context_key must be a string or null.');
    }
    if (input.context_ref !== undefined && input.context_ref !== null && typeof input.context_ref !== 'string') {
      throw validationError('invalid_context_ref', 'context_ref must be a string or null.');
    }
    const contextRef = input.context_ref === undefined ? null : input.context_ref;
    const validFrom = input.valid_from === undefined ? null : input.valid_from;
    const occurredAt = input.occurred_at === undefined ? null : input.occurred_at;
    const metadata = input.metadata === undefined ? {} : input.metadata;
    const requestedVisibility = input.visibility === undefined || input.visibility === null ? null : input.visibility;

    // 4. Validate source kind, target kind, relationship type, role,
    // temporal fields, metadata, and visibility against the registry.
    const declaration = validateRelationshipInput({
      sourceRef: sourceRefParsed,
      targetRef: targetRefParsed,
      relationshipType: input.relationship_type,
      role,
      validFrom,
      validTo: null,
      occurredAt,
      metadata,
      visibility: requestedVisibility ?? 'operator'
    });

    // 5. Derive final link visibility using strictestVisibility across both
    // endpoints and the server derived workflow access.
    const derivedVisibility = strictestVisibility(sourceVisibility, targetVisibility, deriveWorkflowVisibility(accessContext));

    // 6. Reject any client supplied visibility which is weaker than the
    // derived visibility.
    if (requestedVisibility !== null && strictestVisibility(requestedVisibility, derivedVisibility) !== requestedVisibility) {
      throw validationError('visibility_too_weak', 'Requested visibility is weaker than the derived visibility.');
    }

    // 7. Compute the deterministic link ID.
    const equivalence = equivalenceInput({
      sourceRef: sourceCanonical,
      targetRef: targetCanonical,
      relationshipType: declaration.key,
      contextKey,
      contextRef,
      role,
      validFrom,
      occurredAt
    });
    const linkId = generateLinkId(equivalence);

    // 8. Check for an existing authoritative record (and its memberships).
    const state = await readAuthoritativeState({
      linkId,
      sourceCanonical,
      targetCanonical,
      relationshipType: declaration.key
    });

    const existingValidLink = state.validLink;
    const created = !existingValidLink;

    // The operation id is derived from the deterministic link id itself,
    // not generated randomly per call — every create/retry attempt for
    // this exact equivalent link resolves to the same operation record.
    // This is what lets step 9's early return below still guarantee the
    // *original* operation reaches `committed`: previously, a repeat call
    // that found the link and every membership already durable returned
    // immediately without ever touching the operation journal, so an
    // original attempt whose *only* failure was the final commit-journal
    // write stayed stuck in `repair_needed` forever — a later "successful"
    // retry never even looked at it (implementation-programme correction
    // A3). Loading any existing journal for this id lets that be detected.
    const operationId = deriveOperationId(['create_link', linkId]);
    let journal = validateOperationRecord(await getJSON(store, operationKey(operationId), STRONG));

    // 9. If a valid equivalent record already exists, all memberships
    // exist, and the deterministic operation for this link is already
    // committed, there is nothing left to do.
    if (existingValidLink && state.hasSource && state.hasTarget && state.hasType && journal?.status === 'committed') {
      return { link: existingValidLink, created: false };
    }

    // 10. Otherwise repair the same deterministic link (or create it for
    // the first time), and ensure the deterministic operation reaches
    // `committed` — steps 11-16.
    const timestamp = now();
    const linkPayload = existingValidLink ?? Object.freeze({
      schema_version: UNIVERSAL_LINK_SCHEMA_VERSION,
      id: linkId,
      source_ref: sourceCanonical,
      target_ref: targetCanonical,
      relationship_type: declaration.key,
      role,
      context_key: contextKey,
      context_ref: contextRef,
      temporal_mode: declaration.temporal_mode,
      valid_from: validFrom,
      valid_to: null,
      occurred_at: occurredAt,
      status: 'current',
      visibility: derivedVisibility,
      metadata,
      created_at: timestamp,
      updated_at: timestamp
    });

    // 11. Write an operation journal record with status prepared before
    // writing the link or memberships — unless a journal for this
    // deterministic id already exists from a previous attempt, in which
    // case reuse it rather than starting a second one.
    if (!journal) {
      journal = {
        schema_version: OPERATION_SCHEMA_VERSION,
        operation_id: operationId,
        operation_type: 'create_link',
        link_id: linkId,
        status: 'prepared',
        completed_steps: [],
        link_payload: linkPayload,
        created_at: timestamp,
        updated_at: timestamp,
        last_error_code: null
      };
      try {
        await setJSON(store, operationKey(operationId), journal);
      } catch {
        throw linkWriteIncompleteError({ operationId, linkId });
      }
    }

    // 12-16. Write the link and any missing memberships; mark committed.
    // Every step is skipped when its target key already validly exists
    // (see `readAuthoritativeState`/`runSteps`), so replaying this for an
    // already-complete link performs no redundant writes beyond the final
    // idempotent commit of the journal itself.
    await runSteps({
      journal,
      linkId,
      linkPayloadToWrite: linkPayload,
      sourceCanonical,
      targetCanonical,
      relationshipType: declaration.key,
      state,
      timestamp
    });

    // 17. Return the committed link.
    return { link: existingValidLink ?? linkPayload, created };
  }

  async function repairOperation(operationId, accessContext) {
    // 1. Require an administration workflow context.
    assertAdministrationWorkflow(accessContext);

    // 3. Return a non disclosing not found response for an unknown
    // operation — including a malformed id, which is unknown by
    // definition.
    if (!isValidOperationId(operationId)) throw operationNotFoundError();

    // 2. Load and validate the journal record.
    const raw = await getJSON(store, operationKey(operationId), STRONG);
    const journal = validateOperationRecord(raw);
    if (!journal) throw operationNotFoundError();

    if (journal.status === 'committed') {
      return { operation_id: operationId, link_id: journal.link_id, status: 'committed', repaired: false };
    }

    if (journal.operation_type !== 'create_link') {
      return repairLifecycleJournal(journal);
    }

    // 5. Validate the link against the current schema and registry before
    // replay.
    let validatedPayload;
    try {
      validatedPayload = validateUniversalLinkRecord(journal.link_payload);
    } catch {
      throw linkWriteIncompleteError({ operationId, linkId: journal.link_id });
    }

    const linkId = journal.link_id;
    const sourceCanonical = validatedPayload.source_ref;
    const targetCanonical = validatedPayload.target_ref;
    const relationshipType = validatedPayload.relationship_type;

    const state = await readAuthoritativeState({ linkId, sourceCanonical, targetCanonical, relationshipType });
    const timestamp = now();

    // 4. Replay only missing idempotent steps. 6. Mark the operation
    // committed when complete.
    await runSteps({
      journal,
      linkId,
      linkPayloadToWrite: validatedPayload,
      sourceCanonical,
      targetCanonical,
      relationshipType,
      state,
      timestamp
    });

    // 7. Return safe operation and repair status data.
    return { operation_id: operationId, link_id: linkId, status: 'committed', repaired: true };
  }

  // --- Lifecycle methods ---
  //
  // `endLink`/`suppressLink`/`deleteLink` used to mutate the authoritative
  // link and then write a single best-effort "audit" journal entry that
  // was explicitly documented as *not* a recovery mechanism — a failed
  // journal write after a successful mutation was silently swallowed, and
  // there was no way to tell a caller their request had actually completed
  // when the response looked like a hard failure (implementation-programme
  // correction A4). These three methods now follow the same
  // prepare-before-mutate, mutate, commit protocol `createLink` uses:
  //
  // 1. Derive a deterministic operation id from the mutation's own inputs
  //    (link id + the intended target state) — not from wall-clock time —
  //    so a genuine retry of the *same* request (before or after the
  //    mutation itself lands) resolves to the *same* journal record
  //    instead of a fresh one, while a *different* later request (e.g. a
  //    link ended, reopened by a repair, then ended again with a different
  //    date) still gets its own.
  // 2. Write (or reuse) that operation's `prepared` journal, recording the
  //    validated intended transition — never endpoint display data.
  // 3. Write the authoritative link idempotently — skipped when the link
  //    already reflects the intended target state (so a retry that lands
  //    after the mutation already succeeded does not re-reject the
  //    transition just because the link's status already changed).
  // 4. Mark the operation committed.
  // 5. On any post-preparation failure, best-effort mark the operation
  //    `repair_needed` and return `503 link_write_incomplete` with the
  //    safe `operation_id`/`link_id`.
  // 6. `repairOperation` (above) replays any of these three operation
  //    types the same way, via `repairLifecycleJournal`.

  function deriveLifecycleOperationId(operationType, linkId, detail) {
    return deriveOperationId(['lifecycle_link', operationType, linkId, detail ?? null]);
  }

  // Reads (without creating) any existing journal for this deterministic
  // lifecycle operation. A caller uses this to distinguish two different
  // situations that both present as "the link is already at the target
  // status":
  //
  // - An *incomplete* prior attempt at this exact mutation (journal exists,
  //   not yet `committed`) — the link write may have already landed while
  //   the commit write failed. A retry here must resume and finish, not
  //   re-reject the transition just because the status already changed
  //   (implementation-programme correction A4).
  // - A *fully completed* prior attempt at this exact mutation (journal
  //   exists and is `committed`), or no attempt at all — an ordinary
  //   repeat of an already-finished request. The link's own transition
  //   graph decides whether repeating it is valid (e.g. suppressing an
  //   already-suppressed link has no `suppressed -> suppressed` edge and
  //   stays a normal rejection); this case must not silently succeed just
  //   because the *last* attempt happened to reach the same status.
  async function peekLifecycleJournal(operationType, linkId, detail) {
    const operationId = deriveLifecycleOperationId(operationType, linkId, detail);
    const journal = validateOperationRecord(await getJSON(store, operationKey(operationId), STRONG));
    return { operationId, journal, resumable: Boolean(journal) && journal.status !== 'committed' };
  }

  async function loadAuthoritativeLinkForAdministration(id) {
    if (!isValidLinkId(id)) throw endpointNotFoundError();
    const raw = await getJSON(store, linkKey(id), STRONG);
    let record;
    try {
      record = validateUniversalLinkRecord(raw);
    } catch {
      throw endpointNotFoundError();
    }
    if (!record) throw endpointNotFoundError();
    return record;
  }

  // Loads (or starts) the deterministic operation journal for one
  // lifecycle mutation attempt. `intendedPayload` never carries endpoint
  // display data — only the link id and the target status/fields being
  // written.
  async function ensureLifecycleJournal({ operationType, linkId, detail, intendedPayload }) {
    const operationId = deriveLifecycleOperationId(operationType, linkId, detail);
    const existing = validateOperationRecord(await getJSON(store, operationKey(operationId), STRONG));
    if (existing) return { operationId, journal: existing };

    const timestamp = now();
    const journal = {
      schema_version: OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation_type: operationType,
      link_id: linkId,
      status: 'prepared',
      completed_steps: [],
      link_payload: intendedPayload,
      created_at: timestamp,
      updated_at: timestamp,
      last_error_code: null
    };
    try {
      await setJSON(store, operationKey(operationId), journal);
    } catch {
      throw linkWriteIncompleteError({ operationId, linkId });
    }
    return { operationId, journal };
  }

  async function commitLifecycleJournal(journal) {
    try {
      await setJSON(store, operationKey(journal.operation_id), {
        ...journal,
        status: 'committed',
        completed_steps: ['link'],
        updated_at: now(),
        last_error_code: null
      });
    } catch (cause) {
      await bestEffortMarkRepairNeeded(journal, journal.completed_steps ?? [], cause?.code ?? 'commit_write_failed');
      throw linkWriteIncompleteError({ operationId: journal.operation_id, linkId: journal.link_id });
    }
  }

  // Shared core for endLink/suppressLink/deleteLink: writes the mutated
  // link only when it doesn't already reflect the intended state, then
  // commits the journal. `alreadyDone` is computed by the caller from the
  // authoritative record it already validated is allowed to transition (or
  // has already transitioned).
  async function applyLifecycleMutation({ journal, operationId, linkId, alreadyDone, buildUpdatedRecord }) {
    let result;
    if (alreadyDone) {
      result = alreadyDone;
    } else {
      result = buildUpdatedRecord();
      try {
        await setJSON(store, linkKey(linkId), result);
      } catch (cause) {
        await bestEffortMarkRepairNeeded(journal, [], cause?.code ?? 'write_failed');
        throw linkWriteIncompleteError({ operationId, linkId });
      }
    }
    await commitLifecycleJournal(journal);
    return result;
  }

  async function repairLifecycleJournal(journal) {
    const linkId = journal.link_id;
    const payload = journal.link_payload && typeof journal.link_payload === 'object' ? journal.link_payload : {};
    const toStatus = payload.to_status;

    let raw;
    let record;
    try {
      raw = await getJSON(store, linkKey(linkId), STRONG);
      record = validateUniversalLinkRecord(raw);
    } catch {
      record = null;
    }
    if (!record) throw linkWriteIncompleteError({ operationId: journal.operation_id, linkId });

    const alreadyDone = journal.operation_type === 'end_link'
      ? (record.status === 'ended' && record.valid_to === payload.valid_to ? record : null)
      : (record.status === toStatus ? record : null);

    return applyLifecycleMutation({
      journal,
      operationId: journal.operation_id,
      linkId,
      alreadyDone,
      buildUpdatedRecord: () => ({
        ...record,
        status: toStatus,
        updated_at: now(),
        ...(journal.operation_type === 'end_link' ? { valid_to: payload.valid_to } : {})
      })
    }).then(link => ({ operation_id: journal.operation_id, link_id: linkId, status: 'committed', repaired: true, link }));
  }

  async function endLink(id, validTo, accessContext) {
    // 1. Load the visible authoritative link. `ended` stays visible
    // through the ordinary read, so a retry that lands after the mutation
    // already succeeded (but before the commit journal write did) can
    // still see it here rather than 404ing.
    const record = await readRepository.getLink(id, accessContext);

    // 3. Apply only to period relationships.
    if (record.temporal_mode !== 'period') {
      throw validationError('not_a_period_relationship', 'endLink only applies to period relationships.');
    }

    // 4. Validate validTo as an ISO timestamp.
    if (!isIsoTimestamp(validTo)) {
      throw validationError('invalid_valid_to', 'valid_to must be an ISO timestamp.');
    }

    // 5. Reject validTo before valid_from.
    if (record.valid_from && new Date(validTo).getTime() < new Date(record.valid_from).getTime()) {
      throw validationError('valid_to_before_valid_from', 'valid_to cannot precede valid_from.');
    }

    // Only a resumed *incomplete* attempt at this exact mutation may bypass
    // the transition-graph check below — an ordinary repeat of an
    // already-fully-committed end (or a fresh call with no prior attempt)
    // still goes through it normally (see `peekLifecycleJournal`).
    const { resumable } = await peekLifecycleJournal('end_link', id, validTo);
    const alreadyDone = resumable && record.status === 'ended' && record.valid_to === validTo ? record : null;

    // 2. Permit only valid lifecycle transitions (unless resuming an
    // already-applied incomplete attempt).
    if (!alreadyDone && record.status !== 'current') {
      throw invalidTransitionError('endLink requires a link with status current.');
    }

    const { operationId, journal } = await ensureLifecycleJournal({
      operationType: 'end_link',
      linkId: id,
      detail: validTo,
      intendedPayload: { link_id: id, to_status: 'ended', valid_to: validTo }
    });

    // 6-7. Set valid_to, status ended, and updated_at, preserving the link
    // id and memberships (untouched). 8. Journal the mutation.
    return applyLifecycleMutation({
      journal,
      operationId,
      linkId: id,
      alreadyDone,
      buildUpdatedRecord: () => ({ ...record, valid_to: validTo, status: 'ended', updated_at: now() })
    });
  }

  async function suppressLink(id, reason, accessContext) {
    // 1. Require an administration workflow context.
    assertAdministrationWorkflow(accessContext);
    assertReasonCode(reason);

    const record = await loadAuthoritativeLinkForAdministration(id);
    const { resumable } = await peekLifecycleJournal('suppress_link', id, reason);
    const alreadyDone = resumable && record.status === 'suppressed' ? record : null;

    // 2. Permit transitions from current or ended (unless resuming an
    // already-applied incomplete attempt).
    if (!alreadyDone && record.status !== 'current' && record.status !== 'ended') {
      throw invalidTransitionError('suppressLink requires a link with status current or ended.');
    }

    const { operationId, journal } = await ensureLifecycleJournal({
      operationType: 'suppress_link',
      linkId: id,
      detail: reason,
      intendedPayload: { link_id: id, to_status: 'suppressed', reason_code: reason }
    });

    // 3-4. Set status suppressed, preserving the prior temporal fields. 5-6.
    // Journal the mutation with a bounded machine safe reason code.
    return applyLifecycleMutation({
      journal,
      operationId,
      linkId: id,
      alreadyDone,
      buildUpdatedRecord: () => ({ ...record, status: 'suppressed', updated_at: now() })
    });
  }

  async function deleteLink(id, reason, accessContext) {
    // 1. Require an administration workflow context.
    assertAdministrationWorkflow(accessContext);
    assertReasonCode(reason);

    const record = await loadAuthoritativeLinkForAdministration(id);
    const { resumable } = await peekLifecycleJournal('delete_link', id, reason);
    const alreadyDone = resumable && record.status === 'deleted' ? record : null;

    // 2. Permit transitions from current, ended, or suppressed (unless
    // resuming an already-applied incomplete attempt).
    if (!alreadyDone && !['current', 'ended', 'suppressed'].includes(record.status)) {
      throw invalidTransitionError('deleteLink requires a link with status current, ended, or suppressed.');
    }

    const { operationId, journal } = await ensureLifecycleJournal({
      operationType: 'delete_link',
      linkId: id,
      detail: reason,
      intendedPayload: { link_id: id, to_status: 'deleted', reason_code: reason }
    });

    // 3-5. Set status deleted (soft deletion only), preserving the
    // authoritative record and memberships. 6-7. Journal the mutation with
    // a bounded machine safe reason code.
    return applyLifecycleMutation({
      journal,
      operationId,
      linkId: id,
      alreadyDone,
      buildUpdatedRecord: () => ({ ...record, status: 'deleted', updated_at: now() })
    });
  }

  // --- Index rebuild ---

  async function rebuildIndexes(accessContext, options = {}) {
    // rebuildIndexes must require an administration workflow context.
    assertAdministrationWorkflow(accessContext);
    const dryRun = Boolean(options?.dryRun);

    // 1. List only the authoritative universal-links/links/ prefix.
    const keys = await listAuthoritativeLinkKeys(store);

    const counts = { inspected: 0, valid: 0, repaired: 0, missing: 0, invalid: 0, failed: 0 };
    const invalidRecordIds = [];

    // 2. Use bounded batches. Do not create an unbounded Promise.all.
    // Each item in a batch performs its reads/writes sequentially (not via
    // an inner Promise.all), so total concurrent Blob operations across a
    // batch never exceeds REBUILD_BATCH_SIZE.
    await mapBounded(keys, REBUILD_BATCH_SIZE, async key => {
      counts.inspected += 1;

      let raw;
      try {
        raw = await getJSON(store, key);
      } catch {
        counts.failed += 1;
        return;
      }

      // 3. Validate every loaded link against the current schema and
      // relationship registry.
      let record;
      try {
        record = validateUniversalLinkRecord(raw);
      } catch {
        // 9. Never delete unknown or invalid records.
        counts.invalid += 1;
        // 11. Return generic invalid record identifiers only — the key
        // suffix under the authoritative prefix, never record content.
        invalidRecordIds.push(key.startsWith('universal-links/links/') ? key.slice('universal-links/links/'.length) : key);
        return;
      }
      counts.valid += 1;

      // 4. Derive the expected source, target, and relationship type
      // memberships. 5. Check whether each membership exists — and is
      // actually valid for *this* link, not merely present (the same
      // strict check `readAuthoritativeState` uses; see correction A1).
      const sourceKey = bySourceKey(record.source_ref, record.id);
      const targetKey = byTargetKey(record.target_ref, record.id);
      const typeKey = byTypeKey(record.relationship_type, record.id);

      // Each membership read is wrapped separately so one failed read
      // never aborts the whole rebuild (correction A2): before this, an
      // unhandled rejection from any of these three reads propagated
      // through `mapBounded`'s `Promise.all`, which killed the entire
      // batch — including every other link already in flight alongside
      // it — and the rebuild never inspected any link queued after it.
      // A failed read here instead counts this one link as failed and
      // moves on; nothing is written for a link whose membership state
      // could not be fully established.
      let hasSource;
      let hasTarget;
      let hasType;
      try {
        hasSource = isValidEndpointMembershipRecord(await getJSON(store, sourceKey, STRONG), {
          linkId: record.id,
          canonicalRef: record.source_ref
        });
      } catch {
        counts.failed += 1;
        return;
      }
      try {
        hasTarget = isValidEndpointMembershipRecord(await getJSON(store, targetKey, STRONG), {
          linkId: record.id,
          canonicalRef: record.target_ref
        });
      } catch {
        counts.failed += 1;
        return;
      }
      try {
        hasType = isValidTypeMembershipRecord(await getJSON(store, typeKey, STRONG), {
          linkId: record.id,
          relationshipType: record.relationship_type
        });
      } catch {
        counts.failed += 1;
        return;
      }

      const missingWrites = [];
      if (!hasSource) {
        missingWrites.push(() => setJSON(
          store,
          sourceKey,
          buildEndpointMembershipRecord({ linkId: record.id, canonicalRef: record.source_ref, createdAt: record.created_at })
        ));
      }
      if (!hasTarget) {
        missingWrites.push(() => setJSON(
          store,
          targetKey,
          buildEndpointMembershipRecord({ linkId: record.id, canonicalRef: record.target_ref, createdAt: record.created_at })
        ));
      }
      if (!hasType) {
        missingWrites.push(() => setJSON(
          store,
          typeKey,
          buildTypeMembershipRecord({ linkId: record.id, relationshipType: record.relationship_type, createdAt: record.created_at })
        ));
      }

      counts.missing += missingWrites.length;

      // 6. In dry run mode, report missing memberships without writing.
      // 9. Never rewrite a valid authoritative link — only memberships are
      // ever written here.
      if (dryRun || !missingWrites.length) return;

      // 7. In live mode, write only missing memberships.
      for (const write of missingWrites) {
        try {
          await write();
          counts.repaired += 1;
        } catch {
          counts.failed += 1;
        }
      }
    });

    // 10. Report deterministic counts for inspected, valid, repaired,
    // missing, invalid, and failed records.
    return { dry_run: dryRun, ...counts, invalid_record_ids: invalidRecordIds };
  }

  return {
    createLink,
    getLink: (id, accessContext) => readRepository.getLink(id, accessContext),
    listOutgoing: (sourceRef, accessContext, resolveOptions) => readRepository.listOutgoing(sourceRef, accessContext, resolveOptions),
    listIncoming: (targetRef, accessContext, resolveOptions) => readRepository.listIncoming(targetRef, accessContext, resolveOptions),
    listForEntity: (ref, accessContext, resolveOptions) => readRepository.listForEntity(ref, accessContext, resolveOptions),
    endLink,
    suppressLink,
    deleteLink,
    repairOperation,
    rebuildIndexes
  };
}

export async function defaultCreateUniversalLinkRepository(deps = {}) {
  const store = deps.store ?? await defaultGetUniversalLinkStore();
  return createUniversalLinkRepository({ ...deps, store });
}
