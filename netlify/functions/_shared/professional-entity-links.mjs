import { assertRegisteredEntityRef, formatEntityRef } from './entity-ref.mjs';
import { equivalenceInput, generateLinkId } from './universal-link-schema.mjs';
import { createAccessContext } from './entity-access.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { setJSON } from './professional-blobs.mjs';

// Shared Universal Link create/retry journaling for Professional entities
// (Meeting, Event) — mirrors Communication link operations without copying
// relationship IDs onto domain records.

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];

export function assertNoAccessFields(value) {
  for (const key of FORBIDDEN_ACCESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw Object.assign(new Error(`Field "${key}" is not accepted in this request.`), {
        status: 400,
        code: 'access_field_not_accepted'
      });
    }
  }
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

export function simplifyIncomplete(journal) {
  if (!journal || journal.status === 'committed') return null;
  const completed = new Set(journal.completed_link_ids ?? []);
  const pending = (journal.intents ?? [])
    .filter((intent) => !completed.has(intent.link_id))
    .map((intent) => intent.intent_id);
  return {
    operation_id: journal.operation_id,
    status: journal.status,
    completed_link_ids: [...completed],
    failed_intent_ids: [...(journal.failed_intent_ids ?? [])],
    pending_intent_ids: pending
  };
}

export function buildLinkIntent({
  entityRef,
  rawLink,
  index,
  permittedTypes,
  defaultOccurredAt = null,
  pointTypesRequiringOccurredAt = new Set()
}) {
  if (!rawLink || typeof rawLink !== 'object' || Array.isArray(rawLink)) {
    throw validationError('invalid_link', 'Each link must be an object.');
  }
  assertNoAccessFields(rawLink);

  const relationshipType = rawLink.relationship_type;
  if (!permittedTypes.has(relationshipType)) {
    throw validationError(
      'unsupported_relationship_type',
      `relationship_type "${relationshipType}" is not permitted.`
    );
  }

  const sourceRef = assertRegisteredEntityRef(rawLink.source_ref ?? entityRef);
  const sourceCanonical = formatEntityRef(sourceRef);
  if (sourceCanonical !== entityRef) {
    throw validationError(
      'invalid_source_ref',
      'Each requested link must use the new entity as its source_ref.'
    );
  }

  const targetRef = assertRegisteredEntityRef(rawLink.target_ref);
  const targetCanonical = formatEntityRef(targetRef);

  let occurredAt = rawLink.occurred_at === undefined ? null : rawLink.occurred_at;
  if (pointTypesRequiringOccurredAt.has(relationshipType)) {
    if (occurredAt == null) occurredAt = defaultOccurredAt;
  }

  const role = rawLink.role === undefined ? null : rawLink.role;
  const contextKey = rawLink.context_key === undefined ? null : rawLink.context_key;
  const contextRef = rawLink.context_ref === undefined ? null : rawLink.context_ref;
  const metadata = rawLink.metadata === undefined ? {} : rawLink.metadata;
  const validFrom = rawLink.valid_from === undefined ? null : rawLink.valid_from;
  const validTo = rawLink.valid_to === undefined ? null : rawLink.valid_to;

  const equivalence = equivalenceInput({
    sourceRef: sourceCanonical,
    targetRef: targetCanonical,
    relationshipType,
    contextKey,
    contextRef,
    role,
    validFrom,
    occurredAt
  });
  const linkId = generateLinkId(equivalence);
  const intentId = `intent_${String(index).padStart(3, '0')}_${linkId.slice(3, 19)}`;

  return {
    intent_id: intentId,
    link_id: linkId,
    create_input: {
      source_ref: sourceCanonical,
      target_ref: targetCanonical,
      relationship_type: relationshipType,
      role,
      context_key: contextKey,
      context_ref: contextRef,
      occurred_at: occurredAt,
      valid_from: validFrom,
      valid_to: validTo,
      metadata
    }
  };
}

export function linksIncompleteError({
  code,
  entityIdField,
  entityId,
  operationId,
  completedLinkIds,
  failedIntentIds
}) {
  return Object.assign(new Error('One or more links could not be completed.'), {
    status: 503,
    code,
    retryable: true,
    [entityIdField]: entityId,
    operation_id: operationId,
    completed_link_ids: completedLinkIds,
    failed_intent_ids: failedIntentIds
  });
}

export async function runLinkIntents({
  journal,
  linkRepo,
  accessContext,
  professionalStore,
  operationKey,
  now,
  incompleteError
}) {
  const completed = new Set(journal.completed_link_ids ?? []);
  const failed = [];
  for (const intent of journal.intents) {
    if (completed.has(intent.link_id)) continue;
    try {
      const result = await linkRepo.createLink(intent.create_input, accessContext);
      completed.add(result.link.id);
      journal = {
        ...journal,
        completed_link_ids: [...completed],
        updated_at: now()
      };
      await setJSON(professionalStore, operationKey(journal.operation_id), journal);
    } catch (error) {
      failed.push(intent.intent_id);
      journal = {
        ...journal,
        status: 'repair_needed',
        completed_link_ids: [...completed],
        failed_intent_ids: [...new Set([...(journal.failed_intent_ids ?? []), intent.intent_id])],
        last_error_code: typeof error?.code === 'string' ? error.code : 'link_write_failed',
        updated_at: now()
      };
      await setJSON(professionalStore, operationKey(journal.operation_id), journal);
      break;
    }
  }

  if (failed.length || completed.size < journal.intents.length) {
    const pendingFailed = failed.length
      ? failed
      : journal.intents
          .filter((intent) => !completed.has(intent.link_id))
          .map((intent) => intent.intent_id);
    throw incompleteError({
      completedLinkIds: [...completed],
      failedIntentIds: pendingFailed,
      operationId: journal.operation_id,
      journal
    });
  }

  journal = {
    ...journal,
    status: 'committed',
    completed_link_ids: [...completed],
    failed_intent_ids: [],
    updated_at: now()
  };
  await setJSON(professionalStore, operationKey(journal.operation_id), journal);
  return journal;
}

export function createLinkRepoDeps(deps = {}) {
  return {
    resolveEntity: deps.resolveEntity,
    getUniversalLinkStore: deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore,
    createUniversalLinkRepository: deps.createUniversalLinkRepository ?? createUniversalLinkRepository,
    now: deps.now ?? (() => new Date().toISOString())
  };
}

export { createAccessContext };
