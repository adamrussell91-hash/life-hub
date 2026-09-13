/**
 * Cross-store Task → Meeting/Event/Application Universal Link journal.
 * Covers preparation, follow_up, learning_for, and application_action.
 * Deterministic Task ids when creating; existing Task ids when selecting.
 * Retry never duplicates.
 */
import { createHash } from 'node:crypto';
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { getJSON, setJSON } from './professional-blobs.mjs';
import {
  defaultGetTasksStore,
  getJSON as getTasksJSON,
  readTaskIndex,
  setJSON as setTasksJSON,
  taskKey,
  writeTaskIndex
} from './tasks-blobs.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { equivalenceInput, generateLinkId } from './universal-link-schema.mjs';

const PREFIX = 'professional/task-link-operations/';

const ALLOWED = Object.freeze({
  preparation: { targetKind: 'meeting', sourceKinds: ['tasks:task'] },
  follow_up: { targetKind: 'meeting', sourceKinds: ['tasks:task'] },
  learning_for: { targetKind: 'event', sourceKinds: ['tasks:task'] },
  application_action: { targetKind: 'application', sourceKinds: ['tasks:task'] }
});

export function deriveProfessionalTaskLinkOperationId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  return `ptl_${digest}`;
}

export function deriveProfessionalTaskLinkTaskId(operationId) {
  const digest = createHash('sha256')
    .update(`professional_task_link_task_id:${operationId}`)
    .digest('hex')
    .slice(0, 32);
  return `task_ptl_${digest}`;
}

function operationKey(operationId) {
  return `${PREFIX}${operationId}`;
}

function pointerKey(targetRef, relationshipType) {
  return `${PREFIX}by-target/${encodeURIComponent(targetRef)}/${relationshipType}`;
}

function incompleteError(journal) {
  return Object.assign(new Error('Task relationship could not be completed.'), {
    status: 503,
    code: 'professional_task_link_incomplete',
    retryable: true,
    operation_id: journal.operation_id,
    task_id: journal.task_id,
    target_ref: journal.target_ref,
    relationship_type: journal.relationship_type,
    completed_link_ids: [...(journal.completed_link_ids ?? [])],
    failed_intent_ids: [...(journal.failed_intent_ids ?? [])]
  });
}

export function projectProfessionalTaskLinkOperation(journal) {
  if (!journal) return null;
  const completed = new Set(journal.completed_intent_ids ?? []);
  return {
    operation_id: journal.operation_id,
    status: journal.status,
    task_id: journal.task_id,
    title: journal.title,
    relationship_type: journal.relationship_type,
    target_ref: journal.target_ref,
    completed_intent_ids: [...(journal.completed_intent_ids ?? [])],
    completed_link_ids: [...(journal.completed_link_ids ?? [])],
    failed_intent_ids: [...(journal.failed_intent_ids ?? [])],
    pending_intent_ids: (journal.intents ?? [])
      .map((intent) => intent.intent_id)
      .filter((id) => !completed.has(id))
  };
}

function buildIntent({ sourceRef, targetRef, relationshipType }) {
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
  return {
    intent_id: `${relationshipType}:${sourceRef}:${targetRef}`,
    link_id: generateLinkId(equivalence),
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

export function createProfessionalTaskLinkOperationRepository(deps = {}) {
  const professionalStore = deps.store;
  if (!professionalStore) {
    throw new Error('createProfessionalTaskLinkOperationRepository requires a professional store.');
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const resolveEntity = deps.resolveEntity;
  if (typeof resolveEntity !== 'function') {
    throw new Error('createProfessionalTaskLinkOperationRepository requires resolveEntity.');
  }
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;
  const createLinkRepository = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;
  const getTasksStore = deps.getTasksStore ?? defaultGetTasksStore;

  async function loadJournal(operationId) {
    return getJSON(professionalStore, operationKey(operationId));
  }

  async function saveJournal(journal) {
    const existing = await loadJournal(journal.operation_id);
    let merged = journal;
    if (existing && existing.operation_id === journal.operation_id) {
      const completedIntentIds = [
        ...new Set([...(existing.completed_intent_ids ?? []), ...(journal.completed_intent_ids ?? [])])
      ];
      const completedLinkIds = [
        ...new Set([...(existing.completed_link_ids ?? []), ...(journal.completed_link_ids ?? [])])
      ];
      const completed = new Set(completedIntentIds);
      const status =
        existing.status === 'committed' || journal.status === 'committed'
          ? 'committed'
          : journal.status || existing.status;
      merged = {
        ...existing,
        ...journal,
        task_id: journal.task_id || existing.task_id,
        title: journal.title || existing.title,
        intents: journal.intents ?? existing.intents,
        completed_intent_ids: completedIntentIds,
        completed_link_ids: completedLinkIds,
        failed_intent_ids:
          status === 'committed'
            ? []
            : (journal.failed_intent_ids ?? []).filter((id) => !completed.has(id)),
        status,
        created_at: existing.created_at || journal.created_at,
        updated_at: journal.updated_at || existing.updated_at
      };
    }
    await setJSON(professionalStore, operationKey(merged.operation_id), merged);
    await setJSON(professionalStore, pointerKey(merged.target_ref, merged.relationship_type), {
      operation_id: merged.operation_id,
      target_ref: merged.target_ref,
      relationship_type: merged.relationship_type
    });
    return merged;
  }

  async function ensureTaskRecord(taskId, title) {
    const tasksStore = await getTasksStore(deps.env);
    const existing = await getTasksJSON(tasksStore, taskKey(taskId));
    if (existing?.id === taskId) return { task: existing, created: false };
    const timestamp = now();
    const task = {
      schema_version: 1,
      id: taskId,
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
    await setTasksJSON(tasksStore, taskKey(taskId), task);
    const ids = await readTaskIndex(tasksStore);
    if (!ids.includes(taskId)) await writeTaskIndex(tasksStore, [...ids, taskId]);
    const stored = await getTasksJSON(tasksStore, taskKey(taskId));
    if (!stored?.id) {
      throw Object.assign(new Error('Task could not be stored.'), {
        status: 503,
        code: 'professional_task_write_failed',
        retryable: true
      });
    }
    return { task: stored, created: true };
  }

  async function bindLinkRepo() {
    const store = await getUniversalLinkStore(deps.env);
    return createLinkRepository({
      store,
      now,
      resolveEntity
    });
  }

  /**
   * @param {{
   *   targetRef: string,
   *   relationshipType: 'preparation'|'follow_up'|'learning_for'|'application_action',
   *   title?: string,
   *   taskId?: string,
   *   operationSeed?: string
   * }} input
   */
  async function linkTask(input) {
    const relationshipType = input.relationshipType;
    const allowed = ALLOWED[relationshipType];
    if (!allowed) {
      throw Object.assign(new Error('Unsupported relationship type.'), {
        status: 400,
        code: 'invalid_relationship_type'
      });
    }
    const targetRef = typeof input.targetRef === 'string' ? input.targetRef : '';
    const parsedTarget = parseEntityRef(targetRef);
    if (!parsedTarget || parsedTarget.kind !== allowed.targetKind) {
      throw Object.assign(new Error('Target entity does not match relationship.'), {
        status: 400,
        code: 'invalid_target_ref'
      });
    }

    const accessContext = createAccessContext({ workflow: 'professional' });
    await resolveEntity(targetRef, accessContext);

    const existingTaskId =
      typeof input.taskId === 'string' && input.taskId.trim() ? input.taskId.trim() : null;
    const title =
      typeof input.title === 'string' && input.title.trim()
        ? input.title.trim().slice(0, 500)
        : null;
    if (!existingTaskId && !title) {
      throw Object.assign(new Error('Provide task_id or title.'), {
        status: 400,
        code: 'task_id_or_title_required'
      });
    }

    const operationId = deriveProfessionalTaskLinkOperationId([
      'task_link',
      relationshipType,
      targetRef,
      existingTaskId || input.operationSeed || title
    ]);

    let journal = await loadJournal(operationId);
    if (!journal) {
      const taskId = existingTaskId || deriveProfessionalTaskLinkTaskId(operationId);
      journal = {
        schema_version: 1,
        operation_id: operationId,
        kind: 'professional_task_link',
        relationship_type: relationshipType,
        target_ref: targetRef,
        task_id: taskId,
        title: title || existingTaskId,
        create_task: !existingTaskId,
        intents: [],
        completed_intent_ids: [],
        completed_link_ids: [],
        failed_intent_ids: [],
        status: 'incomplete',
        created_at: now(),
        updated_at: now()
      };
      journal = await saveJournal(journal);
    }

    if (journal.status === 'committed') {
      return {
        operation: projectProfessionalTaskLinkOperation(journal),
        created: false
      };
    }

    if (journal.create_task) {
      await ensureTaskRecord(journal.task_id, journal.title || 'Linked task');
    } else {
      const tasksStore = await getTasksStore(deps.env);
      const existing = await getTasksJSON(tasksStore, taskKey(journal.task_id));
      if (!existing?.id) {
        throw Object.assign(new Error('Selected Task was not found.'), {
          status: 404,
          code: 'task_not_found'
        });
      }
    }

    const sourceRef = formatEntityRef({
      namespace: 'tasks',
      kind: 'task',
      id: journal.task_id
    });
    if (!journal.intents?.length) {
      journal = await saveJournal({
        ...journal,
        intents: [
          buildIntent({
            sourceRef,
            targetRef,
            relationshipType
          })
        ],
        updated_at: now()
      });
    }

    const completedIntents = new Set(journal.completed_intent_ids ?? []);
    const completedLinks = new Set(journal.completed_link_ids ?? []);
    let linkRepo;
    try {
      linkRepo = await bindLinkRepo();
    } catch (error) {
      const pending = (journal.intents ?? [])
        .map((intent) => intent.intent_id)
        .filter((id) => !completedIntents.has(id));
      journal = await saveJournal({
        ...journal,
        status: 'incomplete',
        failed_intent_ids: pending,
        updated_at: now()
      });
      throw incompleteError(journal);
    }
    for (const intent of journal.intents) {
      if (completedIntents.has(intent.intent_id)) continue;
      try {
        await resolveEntity(intent.create_input.source_ref, accessContext);
        await resolveEntity(intent.create_input.target_ref, accessContext);
        const result = await linkRepo.createLink(intent.create_input, accessContext);
        completedIntents.add(intent.intent_id);
        completedLinks.add(result.link.id);
        journal = await saveJournal({
          ...journal,
          completed_intent_ids: [...completedIntents],
          completed_link_ids: [...completedLinks],
          updated_at: now()
        });
      } catch (error) {
        journal = await saveJournal({
          ...journal,
          status: 'incomplete',
          failed_intent_ids: [intent.intent_id],
          updated_at: now()
        });
        throw incompleteError(journal);
      }
    }

    journal = await saveJournal({
      ...journal,
      status: 'committed',
      failed_intent_ids: [],
      updated_at: now()
    });
    return {
      operation: projectProfessionalTaskLinkOperation(journal),
      created: true
    };
  }

  async function retry(operationId) {
    const journal = await loadJournal(operationId);
    if (!journal) {
      throw Object.assign(new Error('Task link operation not found.'), {
        status: 404,
        code: 'task_link_operation_not_found'
      });
    }
    if (journal.status === 'committed') {
      return { operation: projectProfessionalTaskLinkOperation(journal) };
    }
    return linkTask({
      targetRef: journal.target_ref,
      relationshipType: journal.relationship_type,
      taskId: journal.create_task ? undefined : journal.task_id,
      title: journal.create_task ? journal.title : undefined,
      operationSeed: journal.create_task ? journal.title : undefined
    });
  }

  async function loadForTarget(targetRef, relationshipType) {
    const pointer = await getJSON(professionalStore, pointerKey(targetRef, relationshipType));
    if (!pointer?.operation_id) return null;
    return projectProfessionalTaskLinkOperation(await loadJournal(pointer.operation_id));
  }

  return { linkTask, retry, loadForTarget, loadJournal };
}
