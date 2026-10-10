import { isDeletedRecord, withoutDeleted } from './record-liveness.mjs';
import { listGithubPdEvents } from './github-professional-data.mjs';
import { importedPdEventById, projectNotionPdEvent, pdPlacementKey } from './notion-pd-events.mjs';
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
import { mapBounded, listBlobKeys } from './blobs-list.mjs';
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

const LIST_BATCH_SIZE = 10;
const STRONG = { consistency: 'strong' };

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
  const loadImportedEvents = deps.listImportedEvents ?? (() => listGithubPdEvents({ env: deps.env ?? process.env }));
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
    const record = await loadEditableEvent(id);
    const journal = await loadOpenJournalForEvent(id);
    const migration = await getJSON(professionalStore, `events/imports/${id}`, STRONG);
    let notes = [];
    if (migration?.notes?.length) {
      const context = createAccessContext({ workflow: 'professional' });
      if (migration.complete) {
        const links = createUniversalLinkRepository({ store: await getUniversalLinkStore(), resolveEntity, now });
        const current = await links.listForEntity(`professional:event:${id}`, context);
        notes = current.outgoing.filter(entry => entry.link.relationship_type === 'talk_note' && entry.link.status === 'current')
          .map(entry => ({ talk_id: entry.link.metadata?.talk_id, page_id: entry.link.target_ref.split(':').pop(),
            title: entry.endpoint?.display_label ?? '', href: entry.endpoint?.href ?? '' }));
      } else {
        for (const note of migration.notes) {
          try {
            await resolveEntity(`knowledge:page:${note.page_id}`, context);
            notes.push(note);
          } catch { /* Deleted or unavailable notes never reach live views. */ }
        }
      }
    }
    return { ...projectEvent(record, simplifyIncomplete(journal)), ...(notes.length ? {knowledge_notes: notes} : {}) };
  }

  async function listEvents() {
    const [indexKeys, recordKeys] = await Promise.all([listEventIndexKeys(professionalStore), listBlobKeys(professionalStore, 'events/records/')]);
    const ids = [
      ...new Set(
        [...indexKeys.map(key => key.slice('events/index/'.length)), ...recordKeys.map(key => key.slice('events/records/'.length))]
          .filter((id) => isValidEventId(id))
      )
    ];
    const records = (
      await mapBounded(ids, LIST_BATCH_SIZE, async (id) => parseEventRecord(await getJSON(professionalStore, eventKey(id), STRONG)))
    ).filter(Boolean);
    const knownIds = new Set(records.map(record => record.id));
    const placements = new Set(records.map(record => pdPlacementKey(record.title, record.start)));
    for (const row of await loadImportedEvents().catch(() => [])) {
      const imported = projectNotionPdEvent(row);
      if (!imported || knownIds.has(imported.id) || placements.has(pdPlacementKey(imported.title, imported.start))) continue;
      let record;
      try {
        record = await loadEditableEvent(imported.id, imported);
      } catch (error) {
        // A tombstone can already exist even while the eventual index listing
        // still omits it. It must suppress this source row, not fail the list.
        if (error?.status === 404) continue;
        throw error;
      }
      records.push(record);
      knownIds.add(record.id);
      placements.add(pdPlacementKey(record.title, record.start));
    }
    const live = withoutDeleted(records);
    for (const record of live) {
      if (!indexKeys.includes(eventIndexKey(record.id))) await setJSON(professionalStore, eventIndexKey(record.id), eventIndexRecord(record));
    }
    live.sort(compareEventsSoonestFirst);
    return mapBounded(live, LIST_BATCH_SIZE, async (record) =>
      projectEvent(record, simplifyIncomplete(await loadOpenJournalForEvent(record.id)))
    );
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
        permittedTypes: PERMITTED_CREATE_LINK_TYPES,
        defaultOccurredAt: validated.start,
        pointTypesRequiringOccurredAt: new Set(['attendee'])
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
      priority_area: validated.priority_area,
      hours: validated.hours,
      attendance_state: validated.attendance_state,
      certificate: validated.certificate,
      created_at: timestamp,
      updated_at: timestamp,
      talks: [],
      blocks: []
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

  // Keep a durable import journal until existing Knowledge associations have
  // been registered as normal Universal Links. Retry without the source snapshot.
  async function migrateKnowledgeNotes(id) {
    const key = `events/imports/${id}`;
    const migration = await getJSON(professionalStore, key, STRONG);
    if (!migration?.notes?.length || migration.complete) return;
    try {
      const store = await getUniversalLinkStore();
      const links = createUniversalLinkRepository({ store, resolveEntity, now });
      const context = createAccessContext({ workflow: 'professional' });
      for (const note of migration.notes) {
        await links.createLink({
          source_ref: `professional:event:${id}`, target_ref: `knowledge:page:${note.page_id}`,
          relationship_type: 'talk_note', metadata: { talk_id: note.talk_id }
        }, context);
      }
      await setJSON(professionalStore, key, { ...migration, complete: true });
    } catch {
      // The native event stays usable; the journal preserves its notes while
      // an unavailable endpoint or relationship store is retried on the next read.
    }
  }

  async function loadEditableEvent(id, snapshot = null) {
    if (!isValidEventId(id)) throw notFound();
    const stored = parseEventRecord(await getJSON(professionalStore, eventKey(id), STRONG));
    if (isDeletedRecord(stored)) throw notFound();
    if (stored) {
      // Older saves kept the native event but its note relationships were
      // still hydrated from the snapshot. Preserve them before retiring it.
      if (stored.talks?.some(talk => talk.id.startsWith('t_')) &&
          !await getJSON(professionalStore, `events/imports/${id}`, STRONG)) {
        const previous = deps.loadImportedEvent
          ? await deps.loadImportedEvent(id).catch(() => null)
          : importedPdEventById(await loadImportedEvents().catch(() => []), id);
        if (previous?.knowledge_notes?.length) {
          await setJSON(professionalStore, `events/imports/${id}`,
            { notes: previous.knowledge_notes, complete: false }, { onlyIfNew: true });
        }
      }
      if (!await getJSON(professionalStore, eventIndexKey(id), STRONG)) await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(stored));
      await migrateKnowledgeNotes(id);
      return stored;
    }
    const imported = snapshot ?? (deps.loadImportedEvent
      ? await deps.loadImportedEvent(id)
      : importedPdEventById(await loadImportedEvents().catch(() => []), id));
    if (!imported) throw notFound();
    const { source, notion_id, knowledge_notes, ...record } = imported;
    const parsed = parseEventRecord(record);
    if (!parsed) throw notFound();
    if (knowledge_notes?.length) {
      await setJSON(professionalStore, `events/imports/${id}`, { notes: knowledge_notes, complete: false }, { onlyIfNew: true });
    }
    await setJSON(professionalStore, eventKey(id), parsed, { onlyIfNew: true });
    const authoritative = parseEventRecord(await getJSON(professionalStore, eventKey(id), STRONG)) ?? parsed;
    if (isDeletedRecord(authoritative)) throw notFound();
    await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(authoritative));
    await migrateKnowledgeNotes(id);
    return authoritative;
  }

  async function writeEventChange(id, change) {
    await loadEditableEvent(id);
    const entry = typeof professionalStore.getWithMetadata === 'function'
      ? await professionalStore.getWithMetadata(eventKey(id), { type: 'json', ...STRONG })
      : null;
    const existing = parseEventRecord(entry?.data ?? await getJSON(professionalStore, eventKey(id), STRONG));
    if (!existing || isDeletedRecord(existing)) throw notFound();
    const updated = change(existing);
    const result = await setJSON(professionalStore, eventKey(id), updated,
      entry?.etag ? { onlyIfMatch: entry.etag } : {});
    if (result?.modified === false) {
      throw Object.assign(new Error('This event changed. Reload it before saving again.'), { status: 409, code: 'event_changed' });
    }
    await setJSON(professionalStore, eventIndexKey(id), eventIndexRecord(updated));
    return updated;
  }

  async function updateEvent(id, patchInput) {
    assertNoAccessFields(patchInput);
    const patch = validateEventFieldUpdate(patchInput);
    const updated = await writeEventChange(id, (existing) => ({ ...existing, ...patch, updated_at: now() }));
    const journal = await loadOpenJournalForEvent(id);
    return projectEvent(updated, simplifyIncomplete(journal));
  }

  async function deleteEvent(id) {
    await writeEventChange(id, (existing) => ({ ...existing, deleted_at: now(), updated_at: now() }));
    return { deleted: true, id };
  }

  async function transitionState(id, nextState) {
    const updated = await writeEventChange(id, (existing) => {
      assertEventStateTransition(existing.occurrence_state, nextState);
      return { ...existing, occurrence_state: nextState, updated_at: now() };
    });
    return projectEvent(updated);
  }

  async function rescheduleEvent(id, input) {
    assertNoAccessFields(input);
    const validated = validateEventRescheduleInput(input);
    const updated = await writeEventChange(id, (existing) => {
      assertEventStateTransition(existing.occurrence_state, 'rescheduled');
      return { ...existing, ...validated, occurrence_state: 'rescheduled', updated_at: now() };
    });
    return projectEvent(updated);
  }

  async function retryLinks(id) {
    if (!isValidEventId(id)) throw notFound();
    const record = parseEventRecord(await getJSON(professionalStore, eventKey(id), STRONG));
    if (!record || isDeletedRecord(record)) throw notFound();
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
    deleteEvent,
    transitionState,
    rescheduleEvent,
    retryLinks,
    // Migration / listEvents: materialise an imported PD row into Blobs.
    loadEditableEvent
  };
}
