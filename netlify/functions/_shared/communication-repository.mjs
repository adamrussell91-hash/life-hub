import {
  COMMUNICATION_SCHEMA_VERSION,
  PERMITTED_CREATE_LINK_TYPES,
  communicationIndexRecord,
  compareCommunicationsNewestFirst,
  deriveCommunicationOperationId,
  generateCommunicationId,
  isValidCommunicationId,
  parseCommunicationRecord,
  projectCommunication,
  validateCommunicationCreateInput,
  validateCommunicationFieldUpdate
} from './communication-schema.mjs';
import { createAccessContext } from './entity-access.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  communicationIndexKey,
  communicationKey,
  communicationOperationKey,
  getJSON,
  listCommunicationIndexKeys,
  setJSON
} from './professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { equivalenceInput, generateLinkId } from './universal-link-schema.mjs';

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];
const FORBIDDEN_RECORD_FIELDS = [
  'links',
  'recipient_id',
  'person_id',
  'task_id',
  'link_id',
  'universal_link_id',
  'organisation_id'
];

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function assertNoAccessFields(value) {
  for (const key of FORBIDDEN_ACCESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw validationError('access_field_not_accepted', `Field "${key}" is not accepted in this request.`);
    }
  }
}

function linksIncompleteError({
  communicationId,
  operationId,
  completedLinkIds,
  failedIntentIds
}) {
  return Object.assign(new Error('One or more Communication links could not be completed.'), {
    status: 503,
    code: 'communication_links_incomplete',
    retryable: true,
    communication_id: communicationId,
    operation_id: operationId,
    completed_link_ids: completedLinkIds,
    failed_intent_ids: failedIntentIds
  });
}

function intentIdFor(intent) {
  return intent.intent_id;
}

function buildIntent({ communicationRef, communicationOccurredAt, rawLink, index }) {
  if (!rawLink || typeof rawLink !== 'object' || Array.isArray(rawLink)) {
    throw validationError('invalid_link', 'Each link must be an object.');
  }
  assertNoAccessFields(rawLink);
  for (const key of FORBIDDEN_RECORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawLink, key) && key !== 'links') {
      // links is orchestration-only at create root; nested link bodies use
      // the canonical Universal Link create fields only.
    }
  }

  const relationshipType = rawLink.relationship_type;
  if (!PERMITTED_CREATE_LINK_TYPES.has(relationshipType)) {
    throw validationError(
      'unsupported_relationship_type',
      `relationship_type "${relationshipType}" is not permitted on Communication create.`
    );
  }

  const sourceRef = assertRegisteredEntityRef(rawLink.source_ref ?? communicationRef);
  const sourceCanonical = formatEntityRef(sourceRef);
  if (sourceCanonical !== communicationRef) {
    throw validationError(
      'invalid_source_ref',
      'Each requested link must use the new Communication as its source_ref.'
    );
  }

  const targetRef = assertRegisteredEntityRef(rawLink.target_ref);
  const targetCanonical = formatEntityRef(targetRef);

  let occurredAt = rawLink.occurred_at === undefined ? null : rawLink.occurred_at;
  if (relationshipType === 'recipient' || relationshipType === 'about_person') {
    if (occurredAt == null) occurredAt = communicationOccurredAt;
    if (occurredAt !== communicationOccurredAt) {
      throw validationError(
        'occurred_at_mismatch',
        `${relationshipType} occurred_at must match the Communication occurred_at.`
      );
    }
  } else if (occurredAt != null) {
    throw validationError('unexpected_occurred_at', 'follows_from must not supply occurred_at.');
  }

  const role = rawLink.role === undefined ? null : rawLink.role;
  const contextKey = rawLink.context_key === undefined ? null : rawLink.context_key;
  const contextRef = rawLink.context_ref === undefined ? null : rawLink.context_ref;
  const metadata = rawLink.metadata === undefined ? {} : rawLink.metadata;

  const equivalence = equivalenceInput({
    sourceRef: sourceCanonical,
    targetRef: targetCanonical,
    relationshipType,
    contextKey,
    contextRef,
    role,
    validFrom: null,
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
      metadata
    }
  };
}

function incompleteProjection(journal) {
  if (!journal || journal.status === 'committed') return null;
  return {
    operation_id: journal.operation_id,
    status: journal.status,
    completed_link_ids: [...(journal.completed_link_ids ?? [])],
    failed_intent_ids: [...(journal.failed_intent_ids ?? [])],
    pending_intent_ids: (journal.intents ?? [])
      .map((intent) => intent.intent_id)
      .filter((id) => !(journal.completed_link_ids ?? []).some((linkId) => {
        const intent = journal.intents.find((item) => item.intent_id === id);
        return intent && intent.link_id === linkId;
      }))
      .filter((id) => {
        const intent = journal.intents.find((item) => item.intent_id === id);
        return intent && !(journal.completed_link_ids ?? []).includes(intent.link_id);
      })
  };
}

function simplifyIncomplete(journal) {
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

export function createCommunicationRepository(deps = {}) {
  const professionalStore = deps.store;
  if (!professionalStore) {
    throw new Error('createCommunicationRepository requires a professional store.');
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateCommunicationId;
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;
  const createLinkRepository = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;

  async function loadJournal(operationId) {
    return getJSON(professionalStore, communicationOperationKey(operationId));
  }

  async function loadOpenJournalForCommunication(communicationId) {
    // Deterministic operation id is derived from communication id + intents;
    // list is avoided: callers always know the operation id from create/retry.
    // For projection on get/list we look up by derived open journal key stored
    // beside the record as `communications/operations/by-communication/<id>`.
    const pointer = await getJSON(
      professionalStore,
      `communications/operations/by-communication/${communicationId}`
    );
    if (!pointer?.operation_id) return null;
    return loadJournal(pointer.operation_id);
  }

  async function writeOperationPointer(communicationId, operationId) {
    // Pointer key uses a validated communication id path segment only.
    if (!isValidCommunicationId(communicationId)) {
      throw validationError('invalid_communication_id', 'Invalid Communication id.');
    }
    await setJSON(professionalStore, `communications/operations/by-communication/${communicationId}`, {
      operation_id: operationId,
      communication_id: communicationId
    });
  }

  async function getCommunication(id) {
    if (!isValidCommunicationId(id)) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    const record = parseCommunicationRecord(
      await getJSON(professionalStore, communicationKey(id))
    );
    if (!record) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    const journal = await loadOpenJournalForCommunication(id);
    return projectCommunication(record, simplifyIncomplete(journal));
  }

  async function listCommunications() {
    const indexKeys = await listCommunicationIndexKeys(professionalStore);
    const ids = [
      ...new Set(
        indexKeys
          .map((key) => key.slice('communications/index/'.length))
          .filter((id) => isValidCommunicationId(id))
      )
    ];
    const records = [];
    for (const id of ids) {
      const record = parseCommunicationRecord(
        await getJSON(professionalStore, communicationKey(id))
      );
      if (record) records.push(record);
    }
    records.sort(compareCommunicationsNewestFirst);
    const projections = [];
    for (const record of records) {
      const journal = await loadOpenJournalForCommunication(record.id);
      projections.push(projectCommunication(record, simplifyIncomplete(journal)));
    }
    return projections;
  }

  async function prepareValidatedIntents({ communicationRef, occurredAt, links }) {
    const accessContext = createAccessContext({ workflow: 'life' });
    const intents = links.map((rawLink, index) =>
      buildIntent({
        communicationRef,
        communicationOccurredAt: occurredAt,
        rawLink,
        index
      })
    );

    // Preflight: resolve every target and validate relationship shape via a
    // dry createLink validation path — resolve endpoints now so an invalid
    // request writes nothing.
    for (const intent of intents) {
      await resolveEntity(intent.create_input.source_ref, accessContext);
      await resolveEntity(intent.create_input.target_ref, accessContext);
    }
    return intents;
  }

  async function runLinkIntents({ journal, linkRepo, accessContext }) {
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
        await setJSON(professionalStore, communicationOperationKey(journal.operation_id), journal);
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
        await setJSON(professionalStore, communicationOperationKey(journal.operation_id), journal);
        break;
      }
    }

    if (failed.length || completed.size < journal.intents.length) {
      const pendingFailed = failed.length
        ? failed
        : journal.intents
            .filter((intent) => !completed.has(intent.link_id))
            .map((intent) => intent.intent_id);
      throw linksIncompleteError({
        communicationId: journal.communication_id,
        operationId: journal.operation_id,
        completedLinkIds: [...completed],
        failedIntentIds: pendingFailed
      });
    }

    journal = {
      ...journal,
      status: 'committed',
      completed_link_ids: [...completed],
      failed_intent_ids: [],
      updated_at: now()
    };
    await setJSON(professionalStore, communicationOperationKey(journal.operation_id), journal);
    return journal;
  }

  async function createCommunication(input) {
    assertNoAccessFields(input);
    const validated = validateCommunicationCreateInput(input);
    const timestamp = now();
    const id = generateId();
    if (!isValidCommunicationId(id)) {
      throw validationError('invalid_communication_id', 'Generated Communication id is invalid.');
    }
    const communicationRef = formatEntityRef({
      namespace: 'professional',
      kind: 'communication',
      id
    });

    // Validate link intents before writing the Communication when possible.
    // Source resolution requires the Communication to exist, so target
    // preflight happens first; source is resolved after the record write.
    const accessContext = createAccessContext({ workflow: 'life' });
    const draftIntents = validated.links.map((rawLink, index) =>
      buildIntent({
        communicationRef,
        communicationOccurredAt: validated.occurred_at,
        rawLink: {
          ...rawLink,
          source_ref: communicationRef
        },
        index
      })
    );
    for (const intent of draftIntents) {
      await resolveEntity(intent.create_input.target_ref, accessContext);
    }

    const record = {
      schema_version: COMMUNICATION_SCHEMA_VERSION,
      id,
      direction: validated.direction,
      channel: validated.channel,
      occurred_at: validated.occurred_at,
      subject: validated.subject,
      summary: validated.summary,
      status: validated.status,
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(professionalStore, communicationKey(id), record);
    await setJSON(professionalStore, communicationIndexKey(id), communicationIndexRecord(record));

    if (!draftIntents.length) {
      return { communication: projectCommunication(record), links: [], created: true };
    }

    await resolveEntity(communicationRef, accessContext);

    const operationId = deriveCommunicationOperationId([
      'create_communication_links',
      id,
      draftIntents.map((intent) => intent.link_id)
    ]);
    let journal = {
      schema_version: 1,
      operation_id: operationId,
      operation_type: 'create_communication_links',
      communication_id: id,
      status: 'prepared',
      intents: draftIntents,
      completed_link_ids: [],
      failed_intent_ids: [],
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(professionalStore, communicationOperationKey(operationId), journal);
    await writeOperationPointer(id, operationId);

    // Once the Communication and recovery journal exist, every subsequent
    // failure — including Universal Link store binding — must surface as a
    // retryable communication_links_incomplete response, not a generic 500.
    const incompleteFromJournal = (currentJournal) =>
      linksIncompleteError({
        communicationId: id,
        operationId,
        completedLinkIds: currentJournal.completed_link_ids ?? [],
        failedIntentIds: draftIntents
          .filter((intent) => !(currentJournal.completed_link_ids ?? []).includes(intent.link_id))
          .map((intent) => intent.intent_id)
      });

    let linkRepo;
    try {
      const ulStore = await getUniversalLinkStore();
      linkRepo = createLinkRepository({
        store: ulStore,
        resolveEntity,
        now
      });
    } catch {
      journal = {
        ...journal,
        status: 'repair_needed',
        failed_intent_ids: draftIntents.map((intent) => intent.intent_id),
        last_error_code: 'universal_link_store_unavailable',
        updated_at: now()
      };
      await setJSON(professionalStore, communicationOperationKey(operationId), journal);
      throw incompleteFromJournal(journal);
    }

    try {
      journal = await runLinkIntents({ journal, linkRepo, accessContext });
    } catch (error) {
      if (error?.code === 'communication_links_incomplete') {
        throw error;
      }
      throw incompleteFromJournal(journal);
    }

    const links = [];
    for (const intent of draftIntents) {
      const listed = await linkRepo.getLink(intent.link_id, accessContext);
      links.push(listed.link);
    }
    return {
      communication: projectCommunication(record),
      links,
      created: true
    };
  }

  async function updateCommunication(id, patchInput) {
    assertNoAccessFields(patchInput);
    const patch = validateCommunicationFieldUpdate(patchInput);
    const existing = parseCommunicationRecord(
      await getJSON(professionalStore, communicationKey(id))
    );
    if (!existing) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    const updated = {
      ...existing,
      ...patch,
      updated_at: now()
    };
    await setJSON(professionalStore, communicationKey(id), updated);
    await setJSON(professionalStore, communicationIndexKey(id), communicationIndexRecord(updated));
    const journal = await loadOpenJournalForCommunication(id);
    return projectCommunication(updated, simplifyIncomplete(journal));
  }

  async function retryLinks(id) {
    if (!isValidCommunicationId(id)) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    const record = parseCommunicationRecord(
      await getJSON(professionalStore, communicationKey(id))
    );
    if (!record) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    const journal = await loadOpenJournalForCommunication(id);
    if (!journal) {
      return { communication: projectCommunication(record), links: [], retried: false };
    }
    if (journal.status === 'committed') {
      return { communication: projectCommunication(record), links: [], retried: false };
    }

    const accessContext = createAccessContext({ workflow: 'life' });
    const ulStore = await getUniversalLinkStore();
    const linkRepo = createLinkRepository({
      store: ulStore,
      resolveEntity,
      now
    });

    const next = await runLinkIntents({ journal, linkRepo, accessContext });
    const links = [];
    for (const intent of next.intents) {
      const listed = await linkRepo.getLink(intent.link_id, accessContext);
      links.push(listed.link);
    }
    return {
      communication: projectCommunication(record),
      links,
      retried: true
    };
  }

  return {
    getCommunication,
    listCommunications,
    createCommunication,
    updateCommunication,
    retryLinks
  };
}

export { intentIdFor, incompleteProjection, simplifyIncomplete };
