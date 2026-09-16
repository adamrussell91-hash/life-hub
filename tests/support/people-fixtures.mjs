// Shared fixture helpers for the Phase 2 People Home test suites
// (people-collection, people-home-signals, people-cohorts, and their
// integration test counterparts). Not itself a `*.test.js` file, so
// `npm test`'s `tests/unit/*.test.js tests/integration/*.test.js` glob
// never picks it up directly — it is imported by those files instead.
//
// Mirrors the in-memory store + synthetic resolver pattern
// `tests/integration/entity-overview.test.js` already established, factored
// out here because six new test files in this phase all need the identical
// setup (rather than each re-deriving its own slightly-different copy).

import { buildIdentityIndexRecord, generatePersonId, generateOrganisationId, IDENTITY_SCHEMA_VERSION } from '../../netlify/functions/_shared/identity-schema.mjs';
import { resolveOrganisation, resolvePerson, resolveTask } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef, formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { personIndexKey, personKey, organisationKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import {
  eventIndexKey,
  eventKey,
  meetingIndexKey,
  meetingKey
} from '../../netlify/functions/_shared/professional-blobs.mjs';
import { MEETING_SCHEMA_VERSION, meetingIndexRecord } from '../../netlify/functions/_shared/meeting-schema.mjs';
import { EVENT_SCHEMA_VERSION, eventIndexRecord } from '../../netlify/functions/_shared/event-schema.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { createObservationRepository } from '../../netlify/functions/_shared/observation-repository.mjs';

export function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

/**
 * `tasksStore`, when supplied, is optional — most existing callers never
 * link a Task and don't need it. Mirrors the local `makeResolveEntity`
 * `tests/integration/entity-overview.test.js` already established for Task
 * resolution, factored out here so other suites needing a Task-aware
 * resolver (e.g. `person-brief` — Open Loops / Current Shared Work) reuse
 * the identical pattern instead of re-deriving their own.
 */
export function makeResolveEntity(store, tasksStore = null) {
  return async function resolveEntity(refInput, accessContext, options = {}) {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    if (ref.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { ...options, getStore: async () => store });
    }
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, { ...options, getStore: async () => store });
    }
    if (ref.namespace === 'tasks' && ref.kind === 'task' && tasksStore) {
      return resolveTask(ref.id, accessContext, { ...options, getStore: async () => tasksStore });
    }
    throw endpointNotFoundError();
  };
}

export async function makePerson(store, overrides = {}) {
  const id = overrides.id ?? generatePersonId();
  const timestamp = overrides.created_at ?? '2026-01-01T00:00:00.000Z';
  const record = {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'person',
    display_name: overrides.display_name ?? 'Test Person',
    sort_name: overrides.sort_name ?? null,
    aliases: overrides.aliases ?? [],
    lifecycle_status: overrides.lifecycle_status ?? 'active',
    is_self: overrides.is_self ?? false,
    retention_reason: null,
    retention_review_at: null,
    created_at: timestamp,
    updated_at: overrides.updated_at ?? timestamp
  };
  await store.setJSON(personKey(id), record);
  // Also write the lightweight index projection a real create-person flow
  // always writes alongside the authoritative record (identity-repository.mjs)
  // — `career-overview.mjs`'s `findActiveSelfPerson` (reused by
  // `person-brief.mjs`'s Mutual Connections) discovers candidate ids via
  // this index, not the authoritative-record prefix, so a fixture person
  // without it is invisible to that lookup.
  await store.setJSON(
    personIndexKey(id),
    buildIdentityIndexRecord({
      id,
      kind: 'person',
      displayLabel: record.display_name,
      sortName: record.sort_name,
      lifecycleStatus: record.lifecycle_status,
      isSelf: record.is_self,
      updatedAt: record.updated_at
    })
  );
  return { ...record, ref: formatEntityRef({ namespace: 'shared', kind: 'person', id }) };
}

export async function makeOrganisation(store, overrides = {}) {
  const id = overrides.id ?? generateOrganisationId();
  const timestamp = overrides.created_at ?? '2026-01-01T00:00:00.000Z';
  const record = {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id,
    kind: 'organisation',
    display_name: overrides.display_name ?? 'Test Org',
    legal_name: overrides.legal_name ?? null,
    aliases: overrides.aliases ?? [],
    lifecycle_status: overrides.lifecycle_status ?? 'active',
    retention_reason: null,
    retention_review_at: null,
    created_at: timestamp,
    updated_at: overrides.updated_at ?? timestamp
  };
  await store.setJSON(organisationKey(id), record);
  return { ...record, ref: formatEntityRef({ namespace: 'shared', kind: 'organisation', id }) };
}

/**
 * Creates a link via the real write repository (never hand-crafted JSON —
 * that would need to independently reimplement `validateUniversalLinkRecord`
 * to pass `listForEntity`'s own validation). Returns the committed link.
 */
export async function makeLink(store, { sourceRef, targetRef, relationshipType, role = null, validFrom = null, validTo = null, occurredAt = null, metadata = {}, now, resolveEntity }) {
  const resolve = resolveEntity ?? makeResolveEntity(store);
  const repo = createUniversalLinkRepository({ store, resolveEntity: resolve, ...(now ? { now } : {}) });
  const accessContext = createAccessContext({ workflow: 'life' });
  const { link } = await repo.createLink(
    { source_ref: sourceRef, target_ref: targetRef, relationship_type: relationshipType, role, valid_from: validFrom, occurred_at: occurredAt, metadata },
    accessContext
  );
  if (validTo) {
    return repo.endLink(link.id, validTo, accessContext);
  }
  return link;
}

let meetingCounter = 0;
let eventCounter = 0;

/**
 * Writes a Meeting record directly (record + index) rather than going
 * through `createMeetingRepository().createMeeting()` — that path also
 * runs the attendee-link operation journal, which this fixture has no need
 * to exercise for `people-activity`/`people-home-signals` tests that only
 * read `listMeetings()`.
 */
export async function makeMeeting(store, overrides = {}) {
  meetingCounter += 1;
  const id = overrides.id ?? `meeting_${String(meetingCounter).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const timestamp = overrides.created_at ?? '2026-01-01T00:00:00.000Z';
  const record = {
    schema_version: MEETING_SCHEMA_VERSION,
    id,
    title: overrides.title ?? 'Test Meeting',
    scheduled_start: overrides.scheduled_start,
    scheduled_end: overrides.scheduled_end ?? overrides.scheduled_start,
    time_zone: overrides.time_zone ?? 'Australia/Sydney',
    location_text: null,
    agenda: null,
    notes: null,
    state: overrides.state ?? 'scheduled',
    occurrence_history: [],
    created_at: timestamp,
    updated_at: timestamp
  };
  await store.setJSON(meetingKey(id), record);
  await store.setJSON(meetingIndexKey(id), meetingIndexRecord(record));
  return record;
}

export async function makeEvent(store, overrides = {}) {
  eventCounter += 1;
  const id = overrides.id ?? `event_${String(eventCounter).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const timestamp = overrides.created_at ?? '2026-01-01T00:00:00.000Z';
  const record = {
    schema_version: EVENT_SCHEMA_VERSION,
    id,
    title: overrides.title ?? 'Test Event',
    event_type: 'professional_development',
    start: overrides.start,
    end: overrides.end ?? overrides.start,
    time_zone: overrides.time_zone ?? 'Australia/Sydney',
    all_day: false,
    occurrence_state: overrides.occurrence_state ?? 'scheduled',
    location_text: null,
    accreditation_category: null,
    hours: null,
    attendance_state: null,
    certificate: null,
    created_at: timestamp,
    updated_at: timestamp
  };
  await store.setJSON(eventKey(id), record);
  await store.setJSON(eventIndexKey(id), eventIndexRecord(record));
  return record;
}

let taskCounter = 0;

/**
 * Writes a minimal Task record directly to a Tasks-content memory store —
 * `resolveTask` (entity-resolvers.mjs) only reads `title`/`status` off it,
 * so this deliberately does not model the full Tasks schema (mirrors
 * `tests/integration/entity-overview.test.js`'s own inline Task fixtures).
 */
/**
 * Writes an Observation via the real repository (never hand-crafted JSON,
 * same reasoning as `makeLink`) — used by Relational Search (Feature 3.3)
 * fixtures needing a person's Observations text as a match target.
 */
export async function makeObservation(professionalStore, { aboutRef, text, occurredAt = '2026-01-01T00:00:00.000Z', source = 'manual' }) {
  const repo = createObservationRepository({ store: professionalStore });
  return repo.createObservation({ about_ref: aboutRef, text, occurred_at: occurredAt, source, linked_ref: null });
}

export async function makeTask(tasksStore, overrides = {}) {
  taskCounter += 1;
  const id = overrides.id ?? `task_${String(taskCounter).padStart(8, '0')}`;
  const record = {
    id,
    title: overrides.title ?? 'Test Task',
    status: overrides.status ?? 'open'
  };
  await tasksStore.setJSON(taskKey(id), record);
  return { ...record, ref: formatEntityRef({ namespace: 'tasks', kind: 'task', id }) };
}
