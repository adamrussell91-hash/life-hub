import {
  EVENT_SCHEMA_VERSION,
  PERMITTED_CREATE_LINK_TYPES,
  assertEventStateTransition,
  compareEventsSoonestFirst,
  deriveEventOperationId,
  generateEventId,
  isValidEventId,
  eventIndexRecord,
  parseEventRecord,
  projectEvent,
  validateEventCreateInput,
  validateEventFieldUpdate,
  validateEventRescheduleInput
} from './event-schema.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  eventIndexKey,
  eventKey,
  eventOperationKey,
  getJSON,
  listEventIndexKeys,
  setJSON
} from './professional-blobs.mjs';
import { projectEventSchedule } from './schedule-projection.mjs';
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
  return Object.assign(new Error('Event not found.'), {
    status: 404,
    code: 'event_not_found'
  });
}

function eventIncomplete(args) {
  return linksIncompleteError({
    code: 'event_links_incomplete',
    entityIdField: 'event_id',
    entityId: args.eventId,
    operationId: args.operationId,
    completedLinkIds: args.completedLinkIds,
    failedIntentIds: args.failedIntentIds
  });
}

export function createEventRepository(deps = {}) {
  const professionalStore = deps.store;
  if (!professionalStore) {
    throw new Error('createEventRepository requires a professional store.');
  }
  const { resolveEntity, getUniversalLinkStore, createUniversalLinkRepository, now } = createLinkRepoDeps({
    ...deps,
    resolveEntity: deps.resolveEntity ?? defaultResolveEntity
  });
  const generateId = deps.generateId ?? generateEventId;

  async function loadJournal(operationId) {
    return getJSON(professionalStore, eventOperationKey(operationId));
  }

  async function loadOpenJournalForEvent(eventId) {
    const pointer = await getJSON(professionalStore, `events/operations/by-event/${eventId}`);
    if (!pointer?.operation_id) return null;
    return loadJournal(pointer.operation_id);
  }

  async function writeOperationPointer(eventId, operationId) {
    if (!isValidEventId(eventId)) {
      throw validationError('invalid_event_id', 'Invalid Event id.');
    }
    await setJSON(professionalStore, `events/operations/by-event/${eventId}`, {
      operation_id: operationId,
      event_id: eventId
    });
  }

  async function getEvent(id) {
    if (!isValidEventId(id)) throw notFound();
    const record = parseEventRecord(await getJSON(professionalStore, eventKey(id)));
    if (!record) throw notFound();
    const journal = await loadOpenJournalForEvent(id);
    return projectEvent(record, simplifyIncomplete(journal));
  }

  async function listEvents() {
    const indexKeys = await listEventIndexKeys(professionalStore);
    const ids = [
      ...new Set(
        indexKeys
          .map((key) => key.slice('events/index/'.length))
          .filter((id) => isValidEventId(id))
      )
    ];
    const records = [];
    for (const id of ids) {
      const record = parseEventRecord(await getJSON(professionalStore, eventKey(id)));
      if (record) records.push(record);
    }
    records.sort(compareEventsSoonestFirst);
    const projections = [];
    for (const record of records) {
      const journal = await loadOpenJournalForEvent(record.id);
      projections.push(projectEvent(record, simplifyIncomplete(journal)));
    }
    return projections;
  }

  async function listScheduleProjections() {
    const events = await listEvents();
    return events.map((e) => projectEventSchedule(e));
  }

  async function createEvent(input) {
    assertNoAccessFields(input);
    const validated = validateEventCreateInput(input);
    const timestamp = now();
    const id = generateId();
    if (!isValidEventId(id)) {
      throw validationError('invalid_event_id', 'Generated Event id is invalid.');
    }
    const eventRef = formatEntityRef({ namespace: 'professional', kind: 'event', id });
    const accessContext = createAccessContext({ workflow: 'life' });
    const draftIntents = validated.links.map((rawLink, index) =>
      buildLinkIntent({
        entityRef: eventRef,
        rawLink: { ...rawLink, source_ref: eventRef },
        index,
        permittedTypes: PERMITTED_CREATE_LINK_TYPES
      })
    );
    for (const intent of draftIntents) {
      await resolveEntity(intent.create_input.target_ref, accessContext);
    }

    const record = {
      schema_version: EVENT_SCHEMA_VERSION,
      id,
      title: validated.title,
      event_type: validated.event_type,
      start: validated.start,
      end: validated.end,
      time_zone: validated.time_zone,
      all_day: validated.all_day,
      occurrence_state: 'scheduled',
      location_text: validated.location_text,
      accreditation_category: validated.accreditation_category,
      hours: validated.hours,
      attendance_state: validated.attendance_state,
      certificate: validated.certificate,
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(professionalStore, eventKey(id), record);
    await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(record));

    if (!draftIntents.length) {
      return { event: projectEvent(record), links: [], created: true };
    }

    await resolveEntity(eventRef, accessContext);

    const operationId = deriveEventOperationId([
      'create_event_links',
      id,
      draftIntents.map((intent) => intent.link_id)
    ]);
    let journal = {
      schema_version: 1,
      operation_id: operationId,
      operation_type: 'create_event_links',
      event_id: id,
      status: 'prepared',
      intents: draftIntents,
      completed_link_ids: [],
      failed_intent_ids: [],
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(professionalStore, eventOperationKey(operationId), journal);
    await writeOperationPointer(id, operationId);

    const incompleteFromJournal = (currentJournal) =>
      eventIncomplete({
        eventId: id,
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
      await setJSON(professionalStore, eventOperationKey(operationId), journal);
      throw incompleteFromJournal(journal);
    }

    try {
      journal = await runLinkIntents({
        journal,
        linkRepo,
        accessContext,
        professionalStore,
        operationKey: eventOperationKey,
        now,
        incompleteError: ({ completedLinkIds, failedIntentIds, operationId: opId }) =>
          eventIncomplete({
            eventId: id,
            operationId: opId,
            completedLinkIds,
            failedIntentIds
          })
      });
    } catch (error) {
      if (error?.code === 'event_links_incomplete') throw error;
      throw incompleteFromJournal(journal);
    }

    const links = [];
    for (const intent of draftIntents) {
      const listed = await linkRepo.getLink(intent.link_id, accessContext);
      links.push(listed.link);
    }
    return { event: projectEvent(record), links, created: true };
  }

  async function updateEvent(id, patchInput) {
    assertNoAccessFields(patchInput);
    const patch = validateEventFieldUpdate(patchInput);
    const existing = parseEventRecord(await getJSON(professionalStore, eventKey(id)));
    if (!existing) throw notFound();
    const updated = { ...existing, ...patch, updated_at: now() };
    await setJSON(professionalStore, eventKey(id), updated);
    await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(updated));
    const journal = await loadOpenJournalForEvent(id);
    return projectEvent(updated, simplifyIncomplete(journal));
  }

  async function transitionState(id, nextState) {
    const existing = parseEventRecord(await getJSON(professionalStore, eventKey(id)));
    if (!existing) throw notFound();
    assertEventStateTransition(existing.occurrence_state, nextState);
    const updated = { ...existing, occurrence_state: nextState, updated_at: now() };
    await setJSON(professionalStore, eventKey(id), updated);
    await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(updated));
    return projectEvent(updated);
  }

  async function rescheduleEvent(id, input) {
    assertNoAccessFields(input);
    const validated = validateEventRescheduleInput(input);
    const existing = parseEventRecord(await getJSON(professionalStore, eventKey(id)));
    if (!existing) throw notFound();
    assertEventStateTransition(existing.occurrence_state, 'rescheduled');
    const updated = {
      ...existing,
      start: validated.start,
      end: validated.end,
      time_zone: validated.time_zone,
      all_day: validated.all_day,
      occurrence_state: 'rescheduled',
      updated_at: now()
    };
    await setJSON(professionalStore, eventKey(id), updated);
    await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(updated));
    return projectEvent(updated);
  }

  async function retryLinks(id) {
    if (!isValidEventId(id)) throw notFound();
    const record = parseEventRecord(await getJSON(professionalStore, eventKey(id)));
    if (!record) throw notFound();
    const journal = await loadOpenJournalForEvent(id);
    if (!journal || journal.status === 'committed') {
      return { event: projectEvent(record), links: [], retried: false };
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
      operationKey: eventOperationKey,
      now,
      incompleteError: ({ completedLinkIds, failedIntentIds, operationId }) =>
        eventIncomplete({
          eventId: id,
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
    return { event: projectEvent(record), links, retried: true };
  }

  return {
    getEvent,
    listEvents,
    listScheduleProjections,
    createEvent,
    updateEvent,
    transitionState,
    rescheduleEvent,
    retryLinks
  };
}
