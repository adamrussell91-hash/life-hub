import {
  MEETING_SCHEMA_VERSION,
  PERMITTED_CREATE_LINK_TYPES,
  assertMeetingStateTransition,
  compareMeetingsSoonestFirst,
  deriveMeetingOperationId,
  generateMeetingId,
  isValidMeetingId,
  meetingIndexRecord,
  parseMeetingRecord,
  projectMeeting,
  validateMeetingCreateInput,
  validateMeetingFieldUpdate,
  validateMeetingRescheduleInput
} from './meeting-schema.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  getJSON,
  listMeetingIndexKeys,
  meetingIndexKey,
  meetingKey,
  meetingOperationKey,
  setJSON
} from './professional-blobs.mjs';
import { projectMeetingSchedule } from './schedule-projection.mjs';
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
  return Object.assign(new Error('Meeting not found.'), {
    status: 404,
    code: 'meeting_not_found'
  });
}

function meetingIncomplete(args) {
  return linksIncompleteError({
    code: 'meeting_links_incomplete',
    entityIdField: 'meeting_id',
    entityId: args.meetingId,
    operationId: args.operationId,
    completedLinkIds: args.completedLinkIds,
    failedIntentIds: args.failedIntentIds
  });
}

export function createMeetingRepository(deps = {}) {
  const professionalStore = deps.store;
  if (!professionalStore) {
    throw new Error('createMeetingRepository requires a professional store.');
  }
  const { resolveEntity, getUniversalLinkStore, createUniversalLinkRepository, now } = createLinkRepoDeps({
    ...deps,
    resolveEntity: deps.resolveEntity ?? defaultResolveEntity
  });
  const generateId = deps.generateId ?? generateMeetingId;

  async function loadJournal(operationId) {
    return getJSON(professionalStore, meetingOperationKey(operationId));
  }

  async function loadOpenJournalForMeeting(meetingId) {
    const pointer = await getJSON(
      professionalStore,
      `meetings/operations/by-meeting/${meetingId}`
    );
    if (!pointer?.operation_id) return null;
    return loadJournal(pointer.operation_id);
  }

  async function writeOperationPointer(meetingId, operationId) {
    if (!isValidMeetingId(meetingId)) {
      throw validationError('invalid_meeting_id', 'Invalid Meeting id.');
    }
    await setJSON(professionalStore, `meetings/operations/by-meeting/${meetingId}`, {
      operation_id: operationId,
      meeting_id: meetingId
    });
  }

  async function getMeeting(id) {
    if (!isValidMeetingId(id)) throw notFound();
    const record = parseMeetingRecord(await getJSON(professionalStore, meetingKey(id)));
    if (!record) throw notFound();
    const journal = await loadOpenJournalForMeeting(id);
    return projectMeeting(record, simplifyIncomplete(journal));
  }

  async function listMeetings() {
    const indexKeys = await listMeetingIndexKeys(professionalStore);
    const ids = [
      ...new Set(
        indexKeys
          .map((key) => key.slice('meetings/index/'.length))
          .filter((id) => isValidMeetingId(id))
      )
    ];
    const records = [];
    for (const id of ids) {
      const record = parseMeetingRecord(await getJSON(professionalStore, meetingKey(id)));
      if (record) records.push(record);
    }
    records.sort(compareMeetingsSoonestFirst);
    const projections = [];
    for (const record of records) {
      const journal = await loadOpenJournalForMeeting(record.id);
      projections.push(projectMeeting(record, simplifyIncomplete(journal)));
    }
    return projections;
  }

  async function listScheduleProjections() {
    const meetings = await listMeetings();
    return meetings.map((m) => projectMeetingSchedule(m));
  }

  async function createMeeting(input) {
    assertNoAccessFields(input);
    const validated = validateMeetingCreateInput(input);
    const timestamp = now();
    const id = generateId();
    if (!isValidMeetingId(id)) {
      throw validationError('invalid_meeting_id', 'Generated Meeting id is invalid.');
    }
    const meetingRef = formatEntityRef({ namespace: 'professional', kind: 'meeting', id });
    const accessContext = createAccessContext({ workflow: 'life' });
    const draftIntents = validated.links.map((rawLink, index) =>
      buildLinkIntent({
        entityRef: meetingRef,
        rawLink: { ...rawLink, source_ref: meetingRef },
        index,
        permittedTypes: PERMITTED_CREATE_LINK_TYPES,
        defaultOccurredAt: validated.scheduled_start,
        pointTypesRequiringOccurredAt: new Set(['attendee'])
      })
    );
    for (const intent of draftIntents) {
      await resolveEntity(intent.create_input.target_ref, accessContext);
    }

    const record = {
      schema_version: MEETING_SCHEMA_VERSION,
      id,
      title: validated.title,
      scheduled_start: validated.scheduled_start,
      scheduled_end: validated.scheduled_end,
      time_zone: validated.time_zone,
      location_text: validated.location_text,
      agenda: validated.agenda,
      notes: validated.notes,
      state: 'scheduled',
      occurrence_history: [],
      created_at: timestamp,
      updated_at: timestamp
    };

    await setJSON(professionalStore, meetingKey(id), record);
    await setJSON(professionalStore, meetingIndexKey(id), meetingIndexRecord(record));

    if (!draftIntents.length) {
      return { meeting: projectMeeting(record), links: [], created: true };
    }

    await resolveEntity(meetingRef, accessContext);

    const operationId = deriveMeetingOperationId([
      'create_meeting_links',
      id,
      draftIntents.map((intent) => intent.link_id)
    ]);
    let journal = {
      schema_version: 1,
      operation_id: operationId,
      operation_type: 'create_meeting_links',
      meeting_id: id,
      status: 'prepared',
      intents: draftIntents,
      completed_link_ids: [],
      failed_intent_ids: [],
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(professionalStore, meetingOperationKey(operationId), journal);
    await writeOperationPointer(id, operationId);

    const incompleteFromJournal = (currentJournal) =>
      meetingIncomplete({
        meetingId: id,
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
      await setJSON(professionalStore, meetingOperationKey(operationId), journal);
      throw incompleteFromJournal(journal);
    }

    try {
      journal = await runLinkIntents({
        journal,
        linkRepo,
        accessContext,
        professionalStore,
        operationKey: meetingOperationKey,
        now,
        incompleteError: ({ completedLinkIds, failedIntentIds, operationId: opId }) =>
          meetingIncomplete({
            meetingId: id,
            operationId: opId,
            completedLinkIds,
            failedIntentIds
          })
      });
    } catch (error) {
      if (error?.code === 'meeting_links_incomplete') throw error;
      throw incompleteFromJournal(journal);
    }

    const links = [];
    for (const intent of draftIntents) {
      const listed = await linkRepo.getLink(intent.link_id, accessContext);
      links.push(listed.link);
    }
    return { meeting: projectMeeting(record), links, created: true };
  }

  async function updateMeeting(id, patchInput) {
    assertNoAccessFields(patchInput);
    const patch = validateMeetingFieldUpdate(patchInput);
    const existing = parseMeetingRecord(await getJSON(professionalStore, meetingKey(id)));
    if (!existing) throw notFound();
    const updated = { ...existing, ...patch, updated_at: now() };
    await setJSON(professionalStore, meetingKey(id), updated);
    await setJSON(professionalStore, meetingIndexKey(id), meetingIndexRecord(updated));
    const journal = await loadOpenJournalForMeeting(id);
    return projectMeeting(updated, simplifyIncomplete(journal));
  }

  async function transitionState(id, nextState) {
    const existing = parseMeetingRecord(await getJSON(professionalStore, meetingKey(id)));
    if (!existing) throw notFound();
    assertMeetingStateTransition(existing.state, nextState);
    const updated = { ...existing, state: nextState, updated_at: now() };
    await setJSON(professionalStore, meetingKey(id), updated);
    await setJSON(professionalStore, meetingIndexKey(id), meetingIndexRecord(updated));
    return projectMeeting(updated);
  }

  async function rescheduleMeeting(id, input) {
    assertNoAccessFields(input);
    const validated = validateMeetingRescheduleInput(input);
    const existing = parseMeetingRecord(await getJSON(professionalStore, meetingKey(id)));
    if (!existing) throw notFound();
    assertMeetingStateTransition(existing.state, 'rescheduled');
    const changedAt = now();
    const historyEntry = {
      scheduled_start: existing.scheduled_start,
      scheduled_end: existing.scheduled_end,
      time_zone: existing.time_zone,
      changed_at: changedAt,
      ...(validated.reason ? { reason: validated.reason } : {})
    };
    const updated = {
      ...existing,
      scheduled_start: validated.scheduled_start,
      scheduled_end: validated.scheduled_end,
      time_zone: validated.time_zone,
      state: 'rescheduled',
      occurrence_history: [...(existing.occurrence_history ?? []), historyEntry],
      updated_at: changedAt
    };
    await setJSON(professionalStore, meetingKey(id), updated);
    await setJSON(professionalStore, meetingIndexKey(id), meetingIndexRecord(updated));
    return projectMeeting(updated);
  }

  async function retryLinks(id) {
    if (!isValidMeetingId(id)) throw notFound();
    const record = parseMeetingRecord(await getJSON(professionalStore, meetingKey(id)));
    if (!record) throw notFound();
    const journal = await loadOpenJournalForMeeting(id);
    if (!journal || journal.status === 'committed') {
      return { meeting: projectMeeting(record), links: [], retried: false };
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
      operationKey: meetingOperationKey,
      now,
      incompleteError: ({ completedLinkIds, failedIntentIds, operationId }) =>
        meetingIncomplete({
          meetingId: id,
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
    return { meeting: projectMeeting(record), links, retried: true };
  }

  return {
    getMeeting,
    listMeetings,
    listScheduleProjections,
    createMeeting,
    updateMeeting,
    transitionState,
    rescheduleMeeting,
    retryLinks
  };
}
