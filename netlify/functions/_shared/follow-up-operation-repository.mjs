import {
  deriveCommunicationOperationId,
  isValidCommunicationId,
  parseCommunicationRecord,
  projectCommunication
} from './communication-schema.mjs';
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import {
  buildFollowUpIntents,
  recipientPersonRefsFromLinks
} from './follow-up-intents.mjs';
import {
  communicationKey,
  getJSON,
  setJSON
} from './professional-blobs.mjs';
import {
  defaultGetTasksStore,
  getJSON as getTasksJSON,
  newTaskId,
  readTaskIndex,
  setJSON as setTasksJSON,
  taskKey,
  writeTaskIndex
} from './tasks-blobs.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { equivalenceInput, generateLinkId } from './universal-link-schema.mjs';

const FOLLOW_UP_OPERATION_PREFIX = 'communications/follow-up-operations/';

function followUpOperationKey(operationId) {
  return `${FOLLOW_UP_OPERATION_PREFIX}${operationId}`;
}

function followUpPointerKey(communicationId) {
  if (!isValidCommunicationId(communicationId)) {
    throw Object.assign(new Error('Invalid Communication id.'), {
      status: 400,
      code: 'invalid_communication_id'
    });
  }
  return `${FOLLOW_UP_OPERATION_PREFIX}by-communication/${communicationId}`;
}

function followUpIncompleteError(journal) {
  return Object.assign(new Error('Follow-up Task relationships could not be completed.'), {
    status: 503,
    code: 'follow_up_operation_incomplete',
    retryable: true,
    communication_id: journal.communication_id,
    operation_id: journal.operation_id,
    task_id: journal.task_id,
    completed_link_ids: [...(journal.completed_link_ids ?? [])],
    failed_intent_ids: [...(journal.failed_intent_ids ?? [])]
  });
}

function projectFollowUpOperation(journal) {
  if (!journal) return null;
  const completed = new Set(journal.completed_intent_ids ?? []);
  const pending = (journal.intents ?? [])
    .map((intent) => intent.intent_id)
    .filter((id) => !completed.has(id));
  return {
    operation_id: journal.operation_id,
    status: journal.status,
    task_id: journal.task_id,
    title: journal.title,
    completed_intent_ids: [...(journal.completed_intent_ids ?? [])],
    completed_link_ids: [...(journal.completed_link_ids ?? [])],
    failed_intent_ids: [...(journal.failed_intent_ids ?? [])],
    failed_relationships: [...(journal.failed_relationships ?? [])],
    pending_intent_ids: pending
  };
}

function enrichCommunication(record, incompleteLinks, followUpJournal) {
  const projection = projectCommunication(record, incompleteLinks);
  const followUp = projectFollowUpOperation(followUpJournal);
  if (followUp) projection.follow_up_operation = followUp;
  return projection;
}

function buildLinkIntent({ sourceRef, targetRef, relationshipType }) {
  const equivalence = equivalenceInput({
    sourceRef,
    targetRef,
    relationshipType,
    contextKey: null,
    contextRef: null,
    role: null,
    validFrom: null,
    occurredAt: null
  });
  const linkId = generateLinkId(equivalence);
  return {
    intent_id:
      relationshipType === 'follow_up'
        ? `follow_up:${targetRef}`
        : `contact:${targetRef}`,
    link_id: linkId,
    relationship_type: relationshipType,
    target_ref: targetRef,
    create_input: {
      source_ref: sourceRef,
      target_ref: targetRef,
      relationship_type: relationshipType,
      role: null,
      context_key: null,
      context_ref: null,
      occurred_at: null,
      metadata: {}
    }
  };
}

export function createFollowUpOperationRepository(deps = {}) {
  const professionalStore = deps.store;
  if (!professionalStore) {
    throw new Error('createFollowUpOperationRepository requires a professional store.');
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const resolveEntity = deps.resolveEntity;
  if (typeof resolveEntity !== 'function') {
    throw new Error('createFollowUpOperationRepository requires resolveEntity.');
  }
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;
  const createLinkRepository = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;
  const getTasksStore = deps.getTasksStore ?? defaultGetTasksStore;
  const createTaskId = deps.createTaskId ?? newTaskId;

  async function loadJournal(operationId) {
    return getJSON(professionalStore, followUpOperationKey(operationId));
  }

  async function loadJournalForCommunication(communicationId) {
    const pointer = await getJSON(professionalStore, followUpPointerKey(communicationId));
    if (!pointer?.operation_id) {
      // Deterministic id — also try direct load when pointer was never written.
      const operationId = deriveCommunicationOperationId(['follow_up_task', communicationId]);
      return loadJournal(operationId);
    }
    return loadJournal(pointer.operation_id);
  }

  async function saveJournal(journal) {
    await setJSON(professionalStore, followUpOperationKey(journal.operation_id), journal);
    await setJSON(professionalStore, followUpPointerKey(journal.communication_id), {
      operation_id: journal.operation_id,
      communication_id: journal.communication_id
    });
    return journal;
  }

  async function loadCommunicationRecord(communicationId) {
    if (!isValidCommunicationId(communicationId)) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    const record = parseCommunicationRecord(
      await getJSON(professionalStore, communicationKey(communicationId))
    );
    if (!record) {
      throw Object.assign(new Error('Communication not found.'), {
        status: 404,
        code: 'communication_not_found'
      });
    }
    return record;
  }

  async function createTaskRecord(title) {
    const tasksStore = await getTasksStore(deps.env);
    const timestamp = now();
    const id = createTaskId();
    const task = {
      schema_version: 1,
      id,
      title,
      description: '',
      kind: 'task',
      bucket: 'active',
      domain: 'other',
      status: 'open',
      priority: 'medium',
      parent_project_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: null,
      depends_on: [],
      tags: [],
      attachments: [],
      source: 'manual'
    };
    // Never store Communication, Person, or Universal Link ids on Task JSON.
    await setTasksJSON(tasksStore, taskKey(id), task);
    const ids = await readTaskIndex(tasksStore);
    await writeTaskIndex(tasksStore, [...ids, id]);
    // Confirm the write landed before returning the id to the journal.
    const stored = await getTasksJSON(tasksStore, taskKey(id));
    if (!stored?.id) {
      throw Object.assign(new Error('Follow-up Task could not be stored.'), {
        status: 503,
        code: 'follow_up_task_write_failed',
        retryable: true
      });
    }
    return stored;
  }

  async function ensureIntents(journal, linkRepo, accessContext) {
    if (Array.isArray(journal.intents) && journal.intents.length > 0) {
      return journal;
    }
    const communicationRef = `professional:communication:${journal.communication_id}`;
    const sourceRef = `tasks:task:${journal.task_id}`;
    let outgoing;
    try {
      const listed = await linkRepo.listForEntity(communicationRef, accessContext);
      outgoing = listed?.outgoing ?? [];
    } catch (error) {
      journal = {
        ...journal,
        status: 'incomplete',
        failed_intent_ids: ['recipient_lookup'],
        failed_relationships: [
          {
            intent_id: 'recipient_lookup',
            relationship_type: 'contact',
            target_ref: communicationRef,
            error_code: typeof error?.code === 'string' ? error.code : 'recipient_lookup_failed'
          }
        ],
        updated_at: now()
      };
      await saveJournal(journal);
      throw followUpIncompleteError(journal);
    }

    const recipients = recipientPersonRefsFromLinks(outgoing);
    const sketched = buildFollowUpIntents({
      communicationRef,
      recipientPersonRefs: recipients
    });
    const intents = sketched.map((item) =>
      buildLinkIntent({
        sourceRef,
        targetRef: item.target_ref,
        relationshipType: item.relationship_type
      })
    );
    journal = {
      ...journal,
      intents,
      failed_intent_ids: [],
      failed_relationships: [],
      updated_at: now()
    };
    return saveJournal(journal);
  }

  async function runLinkIntents(journal, linkRepo, accessContext) {
    const completedIntents = new Set(journal.completed_intent_ids ?? []);
    const completedLinks = new Set(journal.completed_link_ids ?? []);
    const failed = [];

    for (const intent of journal.intents ?? []) {
      if (completedIntents.has(intent.intent_id)) continue;
      try {
        await resolveEntity(intent.create_input.source_ref, accessContext);
        await resolveEntity(intent.create_input.target_ref, accessContext);
        const result = await linkRepo.createLink(intent.create_input, accessContext);
        completedIntents.add(intent.intent_id);
        completedLinks.add(result.link.id);
        journal = {
          ...journal,
          completed_intent_ids: [...completedIntents],
          completed_link_ids: [...completedLinks],
          updated_at: now()
        };
        await saveJournal(journal);
      } catch (error) {
        failed.push({
          intent_id: intent.intent_id,
          relationship_type: intent.relationship_type,
          target_ref: intent.target_ref,
          error_code: typeof error?.code === 'string' ? error.code : 'link_write_failed'
        });
        journal = {
          ...journal,
          status: 'incomplete',
          completed_intent_ids: [...completedIntents],
          completed_link_ids: [...completedLinks],
          failed_intent_ids: failed.map((item) => item.intent_id),
          failed_relationships: failed,
          updated_at: now()
        };
        await saveJournal(journal);
        break;
      }
    }

    if (failed.length || completedIntents.size < (journal.intents?.length ?? 0)) {
      const pendingFailed =
        failed.length > 0
          ? failed
          : (journal.intents ?? [])
              .filter((intent) => !completedIntents.has(intent.intent_id))
              .map((intent) => ({
                intent_id: intent.intent_id,
                relationship_type: intent.relationship_type,
                target_ref: intent.target_ref,
                error_code: 'link_pending'
              }));
      journal = {
        ...journal,
        status: 'incomplete',
        failed_intent_ids: pendingFailed.map((item) => item.intent_id),
        failed_relationships: pendingFailed,
        updated_at: now()
      };
      await saveJournal(journal);
      throw followUpIncompleteError(journal);
    }

    journal = {
      ...journal,
      status: 'committed',
      failed_intent_ids: [],
      failed_relationships: [],
      completed_intent_ids: [...completedIntents],
      completed_link_ids: [...completedLinks],
      updated_at: now()
    };
    return saveJournal(journal);
  }

  async function getProjection(communicationId) {
    const journal = await loadJournalForCommunication(communicationId);
    return projectFollowUpOperation(journal);
  }

  async function createOrRetry({ communicationId, title }) {
    const record = await loadCommunicationRecord(communicationId);
    const operationId = deriveCommunicationOperationId(['follow_up_task', communicationId]);
    let journal = await loadJournal(operationId);
    const timestamp = now();
    const resolvedTitle =
      typeof title === 'string' && title.trim()
        ? title.trim()
        : `Follow up: ${record.subject || record.channel}`;

    if (!journal) {
      journal = {
        schema_version: 1,
        kind: 'follow_up_task',
        operation_id: operationId,
        communication_id: communicationId,
        status: 'in_progress',
        title: resolvedTitle,
        task_id: null,
        intents: null,
        completed_intent_ids: [],
        completed_link_ids: [],
        failed_intent_ids: [],
        failed_relationships: [],
        created_at: timestamp,
        updated_at: timestamp
      };
      await saveJournal(journal);
    }

    if (journal.status === 'committed' && journal.task_id) {
      return {
        communication: enrichCommunication(record, null, journal),
        follow_up_operation: projectFollowUpOperation(journal),
        task_id: journal.task_id,
        created_task: false,
        incomplete: false
      };
    }

    let createdTask = false;
    if (!journal.task_id) {
      // Persist the Task id in the journal before recipient lookup or link writes
      // so every retry resumes the same Task.
      const task = await createTaskRecord(journal.title || resolvedTitle);
      journal = {
        ...journal,
        task_id: task.id,
        title: journal.title || resolvedTitle,
        status: 'in_progress',
        updated_at: now()
      };
      await saveJournal(journal);
      createdTask = true;
    }

    const accessContext = createAccessContext({ workflow: 'life' });
    const ulStore = await getUniversalLinkStore(deps.env);
    const linkRepo = createLinkRepository({
      store: ulStore,
      resolveEntity,
      now
    });

    journal = await ensureIntents(journal, linkRepo, accessContext);
    journal = await runLinkIntents(journal, linkRepo, accessContext);

    return {
      communication: enrichCommunication(record, null, journal),
      follow_up_operation: projectFollowUpOperation(journal),
      task_id: journal.task_id,
      created_task: createdTask,
      incomplete: false
    };
  }

  return {
    loadJournalForCommunication,
    getProjection,
    createOrRetry,
    projectFollowUpOperation,
    enrichCommunication
  };
}

export {
  buildFollowUpIntents,
  recipientPersonRefsFromLinks,
  projectFollowUpOperation,
  followUpOperationKey,
  followUpPointerKey
};
