import {
  APPLICATION_SCHEMA_VERSION,
  PERMITTED_CREATE_LINK_TYPES,
  assertApplicationPipelineTransition,
  compareApplicationsNewestFirst,
  deriveApplicationOperationId,
  generateApplicationId,
  isValidApplicationId,
  applicationIndexRecord,
  parseApplicationRecord,
  projectApplication,
  validateApplicationCreateInput,
  validateApplicationFieldUpdate
} from './application-schema.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  getJSON,
  listApplicationIndexKeys,
  applicationIndexKey,
  applicationKey,
  applicationOperationKey,
  setJSON
} from './professional-blobs.mjs';
import {
  assertNoAccessFields,
  buildLinkIntent,
  createAccessContext,
  createLinkRepoDeps,
  linksIncompleteError,
  runLinkIntents,
  simplifyIncomplete
} from './professional-entity-links.mjs';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound() {
  return Object.assign(new Error('Application not found.'), {
    status: 404,
    code: 'application_not_found'
  });
}

function applicationIncomplete(args) {
  return linksIncompleteError({
    code: 'application_links_incomplete',
    entityIdField: 'application_id',
    entityId: args.applicationId,
    operationId: args.operationId,
    completedLinkIds: args.completedLinkIds,
    failedIntentIds: args.failedIntentIds
  });
}

export function createApplicationRepository(deps = {}) {
  const professionalStore = deps.store;
  if (!professionalStore) {
    throw new Error('createApplicationRepository requires a professional store.');
  }
  const { resolveEntity, getUniversalLinkStore, createUniversalLinkRepository, now } = createLinkRepoDeps({
    ...deps,
    resolveEntity: deps.resolveEntity ?? defaultResolveEntity
  });
  const generateId = deps.generateId ?? generateApplicationId;

  async function loadJournal(operationId) {
    return getJSON(professionalStore, applicationOperationKey(operationId));
  }

  async function loadOpenJournalForApplication(applicationId) {
    const pointer = await getJSON(
      professionalStore,
      `applications/operations/by-application/${applicationId}`
    );
    if (!pointer?.operation_id) return null;
    return loadJournal(pointer.operation_id);
  }

  async function writeOperationPointer(applicationId, operationId) {
    if (!isValidApplicationId(applicationId)) {
      throw validationError('invalid_application_id', 'Invalid Application id.');
    }
    await setJSON(professionalStore, `applications/operations/by-application/${applicationId}`, {
      operation_id: operationId,
      application_id: applicationId
    });
  }

  async function getApplication(id) {
    if (!isValidApplicationId(id)) throw notFound();
    const record = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
    if (!record) throw notFound();
    const journal = await loadOpenJournalForApplication(id);
    return projectApplication(record, simplifyIncomplete(journal));
  }

  async function listApplications() {
    const indexKeys = await listApplicationIndexKeys(professionalStore);
    const ids = [
      ...new Set(
        indexKeys
          .map((key) => key.slice('applications/index/'.length))
          .filter((id) => isValidApplicationId(id))
      )
    ];
    const records = [];
    for (const id of ids) {
      const record = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
      if (record) records.push(record);
    }
    records.sort(compareApplicationsNewestFirst);
    const projections = [];
    for (const record of records) {
      const journal = await loadOpenJournalForApplication(record.id);
      projections.push(projectApplication(record, simplifyIncomplete(journal)));
    }
    return projections;
  }

  async function createApplication(input) {
    assertNoAccessFields(input);
    const validated = validateApplicationCreateInput(input);
    const timestamp = now();
    const id = generateId();
    if (!isValidApplicationId(id)) {
      throw validationError('invalid_application_id', 'Generated Application id is invalid.');
    }
    const applicationRef = formatEntityRef({ namespace: 'professional', kind: 'application', id });
    const accessContext = createAccessContext({ workflow: 'life' });
    const draftIntents = validated.links.map((rawLink, index) =>
      buildLinkIntent({
        entityRef: applicationRef,
        rawLink: { ...rawLink, source_ref: applicationRef },
        index,
        permittedTypes: PERMITTED_CREATE_LINK_TYPES
      })
    );
    for (const intent of draftIntents) {
      await resolveEntity(intent.create_input.target_ref, accessContext);
    }

    const record = {
      schema_version: APPLICATION_SCHEMA_VERSION,
      id,
      position_title: validated.position_title,
      advertisement: validated.advertisement,
      closing_date: validated.closing_date,
      pipeline_status: 'researching',
      documents: validated.documents,
      selection_criteria: validated.selection_criteria,
      interview_rounds: validated.interview_rounds,
      outcome: null,
      reflection: null,
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(professionalStore, applicationKey(id), record);
    await setJSON(professionalStore, applicationIndexKey(id), applicationIndexRecord(record));

    if (!draftIntents.length) {
      return { application: projectApplication(record), links: [], created: true };
    }

    await resolveEntity(applicationRef, accessContext);

    const operationId = deriveApplicationOperationId([
      'create_application_links',
      id,
      draftIntents.map((intent) => intent.link_id)
    ]);
    let journal = {
      schema_version: 1,
      operation_id: operationId,
      operation_type: 'create_application_links',
      application_id: id,
      status: 'prepared',
      intents: draftIntents,
      completed_link_ids: [],
      failed_intent_ids: [],
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(professionalStore, applicationOperationKey(operationId), journal);
    await writeOperationPointer(id, operationId);

    const incompleteFromJournal = (currentJournal) =>
      applicationIncomplete({
        applicationId: id,
        operationId,
        completedLinkIds: currentJournal.completed_link_ids ?? [],
        failedIntentIds: draftIntents
          .filter((intent) => !(currentJournal.completed_link_ids ?? []).includes(intent.link_id))
          .map((intent) => intent.intent_id)
      });

    let linkRepo;
    try {
      const ulStore = await getUniversalLinkStore();
      linkRepo = createUniversalLinkRepository({
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
      await setJSON(professionalStore, applicationOperationKey(operationId), journal);
      throw incompleteFromJournal(journal);
    }

    try {
      journal = await runLinkIntents({
        journal,
        linkRepo,
        accessContext,
        professionalStore,
        operationKey: applicationOperationKey,
        now,
        incompleteError: ({ completedLinkIds, failedIntentIds, operationId: opId }) =>
          applicationIncomplete({
            applicationId: id,
            operationId: opId,
            completedLinkIds,
            failedIntentIds
          })
      });
    } catch (error) {
      if (error?.code === 'application_links_incomplete') throw error;
      throw incompleteFromJournal(journal);
    }

    const links = [];
    for (const intent of draftIntents) {
      const listed = await linkRepo.getLink(intent.link_id, accessContext);
      links.push(listed.link);
    }
    return { application: projectApplication(record), links, created: true };
  }

  async function updateApplication(id, patchInput) {
    assertNoAccessFields(patchInput);
    const existing = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
    if (!existing) throw notFound();
    const patch = validateApplicationFieldUpdate(patchInput, existing);
    const updated = { ...existing, ...patch, updated_at: now() };
    await setJSON(professionalStore, applicationKey(id), updated);
    await setJSON(professionalStore, applicationIndexKey(id), applicationIndexRecord(updated));
    const journal = await loadOpenJournalForApplication(id);
    return projectApplication(updated, simplifyIncomplete(journal));
  }

  async function transitionPipeline(id, nextStatus) {
    const existing = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
    if (!existing) throw notFound();
    assertApplicationPipelineTransition(existing.pipeline_status, nextStatus);
    const updated = { ...existing, pipeline_status: nextStatus, updated_at: now() };
    await setJSON(professionalStore, applicationKey(id), updated);
    await setJSON(professionalStore, applicationIndexKey(id), applicationIndexRecord(updated));
    return projectApplication(updated);
  }

  async function retryLinks(id) {
    if (!isValidApplicationId(id)) throw notFound();
    const record = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
    if (!record) throw notFound();
    const journal = await loadOpenJournalForApplication(id);
    if (!journal || journal.status === 'committed') {
      return { application: projectApplication(record), links: [], retried: false };
    }

    const accessContext = createAccessContext({ workflow: 'life' });
    const ulStore = await getUniversalLinkStore();
    const linkRepo = createUniversalLinkRepository({
      store: ulStore,
      resolveEntity,
      now
    });

    const next = await runLinkIntents({
      journal,
      linkRepo,
      accessContext,
      professionalStore,
      operationKey: applicationOperationKey,
      now,
      incompleteError: ({ completedLinkIds, failedIntentIds, operationId }) =>
        applicationIncomplete({
          applicationId: id,
          operationId,
          completedLinkIds,
          failedIntentIds
        })
    });
    const links = [];
    for (const intent of next.intents) {
      const listed = await linkRepo.getLink(intent.link_id, accessContext);
      links.push(listed.link);
    }
    return { application: projectApplication(record), links, retried: true };
  }

  return {
    getApplication,
    listApplications,
    createApplication,
    updateApplication,
    transitionPipeline,
    retryLinks
  };
}
