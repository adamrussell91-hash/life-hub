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
  equivalenceInput,
  generateLinkId,
  generateOperationId as defaultGenerateOperationId,
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
  now = () => new Date().toISOString(),
  generateOperationId = defaultGenerateOperationId
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
    return {
      linkRaw,
      validLink,
      hasSource: Boolean(sourceMembership),
      hasTarget: Boolean(targetMembership),
      hasType: Boolean(typeMembership)
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
        updated_at: now()
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

    // 9. If a valid equivalent record already exists and all memberships
    // exist, return the record with created false.
    if (existingValidLink && state.hasSource && state.hasTarget && state.hasType) {
      return { link: existingValidLink, created: false };
    }

    // 10. Otherwise repair the same deterministic link (or create it for
    // the first time) rather than creating a second link — steps 11-16.
    const timestamp = now();
    const linkPayload = Object.freeze({
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

    const operationId = generateOperationId();
    const journal = {
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

    // 11. Write an operation journal record with status prepared before
    // writing the link or memberships.
    try {
      await setJSON(store, operationKey(operationId), journal);
    } catch {
      throw linkWriteIncompleteError({ operationId, linkId });
    }

    // 12-16. Write the link and any missing memberships; mark committed.
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

  async function endLink(id, validTo, accessContext) {
    // 1. Load the visible authoritative link.
    const record = await readRepository.getLink(id, accessContext);

    // 2. Permit only valid lifecycle transitions.
    if (record.status !== 'current') {
      throw invalidTransitionError('endLink requires a link with status current.');
    }

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

    // 6. Set valid_to, status ended, and updated_at. 7. Preserve the link
    // id and memberships (untouched).
    const updated = {
      ...record,
      valid_to: validTo,
      status: 'ended',
      updated_at: now()
    };
    await setJSON(store, linkKey(id), updated);

    // 8. Journal the mutation.
    await journalMutation({ operationType: 'end_link', linkId: id });

    return updated;
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

  async function journalMutation({ operationType, linkId, reasonCode = null }) {
    const operationId = generateOperationId();
    const timestamp = now();
    try {
      await setJSON(store, operationKey(operationId), {
        schema_version: OPERATION_SCHEMA_VERSION,
        operation_id: operationId,
        operation_type: operationType,
        link_id: linkId,
        status: 'committed',
        completed_steps: [],
        link_payload: { link_id: linkId, reason_code: reasonCode },
        created_at: timestamp,
        updated_at: timestamp,
        last_error_code: null
      });
    } catch {
      // The mutation itself already succeeded; the journal entry for a
      // single-write lifecycle mutation is a best-effort audit record, not
      // a recovery mechanism (unlike create's multi-step journal).
    }
  }

  async function suppressLink(id, reason, accessContext) {
    // 1. Require an administration workflow context.
    assertAdministrationWorkflow(accessContext);
    assertReasonCode(reason);

    const record = await loadAuthoritativeLinkForAdministration(id);

    // 2. Permit transitions from current or ended.
    if (record.status !== 'current' && record.status !== 'ended') {
      throw invalidTransitionError('suppressLink requires a link with status current or ended.');
    }

    // 3. Set status suppressed and updated_at. 4. Preserve the prior
    // temporal fields.
    const updated = { ...record, status: 'suppressed', updated_at: now() };
    await setJSON(store, linkKey(id), updated);

    // 5. Journal the mutation. 6. Store a bounded machine safe reason code.
    await journalMutation({ operationType: 'suppress_link', linkId: id, reasonCode: reason });

    return updated;
  }

  async function deleteLink(id, reason, accessContext) {
    // 1. Require an administration workflow context.
    assertAdministrationWorkflow(accessContext);
    assertReasonCode(reason);

    const record = await loadAuthoritativeLinkForAdministration(id);

    // 2. Permit transitions from current, ended, or suppressed.
    if (!['current', 'ended', 'suppressed'].includes(record.status)) {
      throw invalidTransitionError('deleteLink requires a link with status current, ended, or suppressed.');
    }

    // 3. Set status deleted and updated_at. 4. Soft deletion only. 5.
    // Preserve the authoritative record and memberships.
    const updated = { ...record, status: 'deleted', updated_at: now() };
    await setJSON(store, linkKey(id), updated);

    // 6. Journal the mutation. 7. Store a bounded machine safe reason code.
    await journalMutation({ operationType: 'delete_link', linkId: id, reasonCode: reason });

    return updated;
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
      // memberships. 5. Check whether each membership exists.
      const sourceKey = bySourceKey(record.source_ref, record.id);
      const targetKey = byTargetKey(record.target_ref, record.id);
      const typeKey = byTypeKey(record.relationship_type, record.id);

      const hasSource = Boolean(await getJSON(store, sourceKey, STRONG));
      const hasTarget = Boolean(await getJSON(store, targetKey, STRONG));
      const hasType = Boolean(await getJSON(store, typeKey, STRONG));

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
    listOutgoing: (sourceRef, accessContext) => readRepository.listOutgoing(sourceRef, accessContext),
    listIncoming: (targetRef, accessContext) => readRepository.listIncoming(targetRef, accessContext),
    listForEntity: (ref, accessContext) => readRepository.listForEntity(ref, accessContext),
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
