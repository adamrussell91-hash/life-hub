import {
  APPLICATION_SCHEMA_VERSION,
  PERMITTED_CREATE_LINK_TYPES,
  assertApplicationStateTransition,
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
  // Test-only write-boundary injection: fail once when the named step runs.
  let failAtStep = deps.failAtStep ?? null;
  function maybeFail(step) {
    if (failAtStep === step) {
      failAtStep = null;
      throw Object.assign(new Error(`Injected failure at ${step}`), {
        code: 'injected_write_failure',
        step
      });
    }
  }

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
    const journal = await loadOpenJournalForApplication(id);
    const record = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
    if (!record) {
      // Create journal may exist before the record write succeeds.
      if (
        journal &&
        journal.operation_type === 'create_application' &&
        journal.status !== 'committed' &&
        journal.payload?.record
      ) {
        return projectApplication(journal.payload.record, simplifyIncomplete(journal));
      }
      throw notFound();
    }
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
    let linkRepo = null;
    try {
      const ulStore = await getUniversalLinkStore();
      linkRepo = createUniversalLinkRepository({
        store: ulStore,
        resolveEntity,
        now
      });
    } catch {
      linkRepo = null;
    }
    const accessContext = createAccessContext({ workflow: 'life' });
    for (const record of records) {
      const journal = await loadOpenJournalForApplication(record.id);
      const projection = projectApplication(record, simplifyIncomplete(journal));
      if (linkRepo) {
        try {
          const applicationRef = formatEntityRef({
            namespace: 'professional',
            kind: 'application',
            id: record.id
          });
          const { outgoing } = await linkRepo.listForEntity(applicationRef, accessContext);
          const org = outgoing.find(
            (entry) =>
              entry.link.relationship_type === 'applies_to' &&
              entry.endpoint?.kind === 'organisation'
          );
          if (org) {
            projection.organisation = {
              ref: org.endpoint.ref,
              display_label: org.endpoint.display_label ?? org.endpoint.ref
            };
          }
        } catch {
          // List remains available even when relationship projection fails.
        }
      }
      projections.push(projection);
    }
    return projections;
  }


  async function persistJournal(journal) {
    await setJSON(professionalStore, applicationOperationKey(journal.operation_id), journal);
    return journal;
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
      pipeline_status: 'drafting',
      documents: validated.documents,
      selection_criteria: validated.selection_criteria,
      interview_rounds: validated.interview_rounds,
      outcome: { status: 'none', date: null, offer_details: null, reason: null },
      reflection: null,
      created_at: timestamp,
      updated_at: timestamp
    };

    // Deterministic operation identity before any externally observable write.
    const operationId = deriveApplicationOperationId([
      'create_application',
      id,
      draftIntents.map((intent) => intent.link_id)
    ]);
    let journal = {
      schema_version: 1,
      operation_id: operationId,
      operation_type: 'create_application',
      application_id: id,
      status: 'prepared',
      payload: { record },
      intents: draftIntents,
      completed_steps: [],
      completed_link_ids: [],
      failed_intent_ids: [],
      created_at: timestamp,
      updated_at: timestamp
    };
    try {
      maybeFail('journal');
      journal = await persistJournal(journal);
      maybeFail('pointer');
      await writeOperationPointer(id, operationId);
    } catch (error) {
      // Identity is known; expose a repairable incomplete contract even when
      // the journal or pointer write failed mid-create.
      try {
        journal = await persistJournal({
          ...journal,
          status: 'repair_needed',
          last_error_code: error?.code ?? 'application_write_failed',
          updated_at: now()
        });
        await writeOperationPointer(id, operationId);
      } catch {
        // Best-effort only: still return identifiers for a deterministic retry.
      }
      throw incompleteFromJournal(journal, draftIntents);
    }

    return resumeCreateApplication({
      journal,
      applicationRef,
      accessContext,
      draftIntents
    });
  }

  function incompleteFromJournal(journal, draftIntents) {
    return applicationIncomplete({
      applicationId: journal.application_id,
      operationId: journal.operation_id,
      completedLinkIds: journal.completed_link_ids ?? [],
      failedIntentIds: (draftIntents ?? journal.intents ?? [])
        .filter((intent) => !(journal.completed_link_ids ?? []).includes(intent.link_id))
        .map((intent) => intent.intent_id)
    });
  }

  async function markStep(journal, step) {
    const completed = new Set(journal.completed_steps ?? []);
    completed.add(step);
    return persistJournal({
      ...journal,
      completed_steps: [...completed],
      updated_at: now()
    });
  }

  async function resumeCreateApplication({ journal, applicationRef, accessContext, draftIntents }) {
    const id = journal.application_id;
    const record = journal.payload?.record;
    if (!record) {
      throw validationError('invalid_application_operation', 'Create journal is missing its Application payload.');
    }
    const intents = draftIntents ?? journal.intents ?? [];
    const done = new Set(journal.completed_steps ?? []);

    try {
      if (!done.has('record')) {
        maybeFail('record');
        await setJSON(professionalStore, applicationKey(id), record);
        journal = await markStep(journal, 'record');
      }
      if (!done.has('index')) {
        maybeFail('index');
        await setJSON(professionalStore, applicationIndexKey(id), applicationIndexRecord(record));
        journal = await markStep(journal, 'index');
      }
    } catch (error) {
      journal = await persistJournal({
        ...journal,
        status: 'repair_needed',
        last_error_code: error?.code ?? 'application_write_failed',
        updated_at: now()
      });
      throw incompleteFromJournal(journal, intents);
    }

    if (!intents.length) {
      journal = await persistJournal({
        ...journal,
        status: 'committed',
        failed_intent_ids: [],
        updated_at: now()
      });
      return { application: projectApplication(record), links: [], created: true };
    }

    await resolveEntity(applicationRef, accessContext);

    let linkRepo;
    try {
      maybeFail('store_bind');
      const ulStore = await getUniversalLinkStore();
      linkRepo = createUniversalLinkRepository({
        store: ulStore,
        resolveEntity,
        now
      });
      if (!done.has('store_bound')) {
        journal = await markStep(journal, 'store_bound');
      }
    } catch {
      journal = await persistJournal({
        ...journal,
        status: 'repair_needed',
        failed_intent_ids: intents.map((intent) => intent.intent_id),
        last_error_code: 'universal_link_store_unavailable',
        updated_at: now()
      });
      throw incompleteFromJournal(journal, intents);
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
      throw incompleteFromJournal(journal, intents);
    }

    try {
      maybeFail('commit');
      journal = await persistJournal({
        ...journal,
        status: 'committed',
        failed_intent_ids: [],
        updated_at: now()
      });
    } catch (error) {
      journal = await persistJournal({
        ...journal,
        status: 'repair_needed',
        last_error_code: error?.code ?? 'application_commit_failed',
        updated_at: now()
      });
      throw incompleteFromJournal(journal, intents);
    }

    const links = [];
    for (const intent of intents) {
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
    assertApplicationStateTransition(existing.pipeline_status, nextStatus);
    const updated = { ...existing, pipeline_status: nextStatus, updated_at: now() };
    await setJSON(professionalStore, applicationKey(id), updated);
    await setJSON(professionalStore, applicationIndexKey(id), applicationIndexRecord(updated));
    return projectApplication(updated);
  }

  async function retryLinks(id) {
    if (!isValidApplicationId(id)) throw notFound();
    const journal = await loadOpenJournalForApplication(id);
    if (!journal || journal.status === 'committed') {
      const record = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
      if (!record) throw notFound();
      return { application: projectApplication(record), links: [], retried: false };
    }

    const applicationRef = formatEntityRef({ namespace: 'professional', kind: 'application', id });
    const accessContext = createAccessContext({ workflow: 'life' });

    if (journal.operation_type === 'create_application') {
      const result = await resumeCreateApplication({
        journal,
        applicationRef,
        accessContext,
        draftIntents: journal.intents ?? []
      });
      return { application: result.application, links: result.links, retried: true };
    }

    const record = parseApplicationRecord(await getJSON(professionalStore, applicationKey(id)));
    if (!record) throw notFound();

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
