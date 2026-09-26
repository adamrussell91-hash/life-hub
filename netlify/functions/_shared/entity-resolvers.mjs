import { parseEntityRef, formatEntityRef } from './entity-ref.mjs';
import { assertEntityKindAllowed, endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import { communicationDisplayLabel, isValidCommunicationId, parseCommunicationRecord } from './communication-schema.mjs';
import { meetingDisplayLabel, isValidMeetingId, parseMeetingRecord } from './meeting-schema.mjs';
import { eventDisplayLabel, isValidEventId, parseEventRecord } from './event-schema.mjs';
import {
  applicationDisplayLabel,
  isValidApplicationId,
  parseApplicationRecord
} from './application-schema.mjs';
import {
  communicationKey,
  meetingKey,
  eventKey,
  applicationKey,
  defaultGetProfessionalStore,
  getJSON as getProfessionalJSON
} from './professional-blobs.mjs';
import { taskKey, getJSON as getTasksJSON, defaultGetTasksStore } from './tasks-blobs.mjs';
import { displayLabelFor, isValidOrganisationId, isValidPersonId, parseOrganisationRecord, parsePersonRecord } from './identity-schema.mjs';
import { defaultGetUniversalLinkStore, getJSON as getIdentityJSON, organisationKey, personKey } from './universal-link-blobs.mjs';
import { getGithubOrganisation, getGithubPerson } from './github-professional-data.mjs';
import { classKey, defaultGetContentStore as defaultGetTeachingStore, getJSON as getTeachingJSON } from './teaching-blobs.mjs';
import {
  resolveKnowledgePage,
  resolveTeachingUnit,
  resolveTasksProject,
  resolveTasksGoal,
  resolveTasksProgram,
  resolveTeachingLesson,
  resolveLifeDecision
} from './knowledge-universal-links.mjs';

export {
  resolveKnowledgePage,
  resolveTeachingUnit,
  resolveTasksProject,
  resolveTasksGoal,
  resolveTasksProgram,
  resolveTeachingLesson,
  resolveLifeDecision
};
// Entity resolvers verify a record exists and is accessible, then return a
// safe display projection: { ref, kind, display_label, supporting_label,
// href, lifecycle_status, visibility }. This is the only shape a resolver
// may return — never the raw stored record.
//
// Slice 5 supplies Communication resolution against `professional-hub-content`.
// Resolver output never exposes the Communication summary.

// Canonical browser hrefs for the umbrella-mounted apps (implementation
// programme, "Repository facts": Professional at `/professional/`, Tasks
// at `/tasks/`). Relative paths only — resolvers never invent an absolute
// hostname for a hub the umbrella already serves. Exported so
// entity-search.mjs's projections (a different codepath that hydrates the
// same authoritative records) can render the identical href rather than
// duplicating the URL shape.
export function personHref(id) {
  return `/professional/#/person/${encodeURIComponent(id)}`;
}

export function organisationHref(id) {
  return `/professional/#/organisation/${encodeURIComponent(id)}`;
}

export function taskHref(id) {
  return `/tasks/#/task/${encodeURIComponent(id)}`;
}

export function classHref(id) {
  return `/teaching/classes/${encodeURIComponent(id)}`;
}

export function resolverUnavailableError(kind) {
  return Object.assign(new Error(`Resolution for kind "${kind}" is not available until its owning slice.`), {
    status: 501,
    code: 'resolver_unavailable',
    kind
  });
}

export async function resolveTask(id, accessContext, { getStore = defaultGetTasksStore } = {}) {
  const ref = formatEntityRef({ namespace: 'tasks', kind: 'task', id });
  if (!ref) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTasksJSON(store, taskKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  return {
    ref,
    kind: 'task',
    display_label: typeof record.title === 'string' ? record.title : '',
    supporting_label: typeof record.status === 'string' ? record.status : null,
    href: taskHref(id),
    lifecycle_status: typeof record.status === 'string' ? record.status : null,
    visibility: 'operator'
  };
}

// Resolution rules (implementation programme, "Entity resolvers"):
// 1. A missing endpoint produces 404 endpoint_not_found.
// 2. An inaccessible endpoint behaves as absent and also 404s.
// 3. Deleted (and deidentified) endpoints never expose former labels —
//    `displayLabelFor` returns the fixed tombstone label instead.
// 4. Archived entities resolve only for deliberate overview and archive
//    workflows — ordinary resolution (Universal Link create/read) never
//    passes `includeArchived`, so an archived Person/Organisation is
//    absent everywhere except entity-overview.mjs and entity-search.mjs's
//    deliberate archive-search mode, which pass `includeArchived: true`
//    explicitly.
//
// An id that does not even match the expected `person_<uuid>` /
// `organisation_<uuid>` shape is treated as "missing," not as a 400 —
// resolution never discloses whether a malformed id would otherwise exist.
// A Person not found in `universal-link-content` Blobs falls back to the
// read-only, GitHub-canonical Professional import (github-professional-data.mjs)
// before giving up. That import's records are already normalized to this
// exact schema (identity-schema.mjs's `parsePersonRecord` shape) with
// permanent derived ids, so no further branching is needed once the
// fallback returns a record — the rest of this function treats it exactly
// like a native one. A misconfigured or unreachable GitHub data repo
// degrades to "not found" here, the same as any other absent record; it
// never turns into a distinct error, since this fallback is best-effort by
// design (see github-professional-data.mjs).
export async function resolvePerson(id, accessContext, { getStore = defaultGetUniversalLinkStore, includeArchived = false, env, fetchImpl } = {}) {
  if (!isValidPersonId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  let record = parsePersonRecord(await getIdentityJSON(store, personKey(id)));
  if (!record) record = await getGithubPerson(id, { env, fetchImpl });
  if (!record) throw endpointNotFoundError();
  if (record.lifecycle_status === 'archived' && !includeArchived) throw endpointNotFoundError();
  return {
    ref,
    kind: 'person',
    display_label: displayLabelFor(record),
    supporting_label: record.is_self ? 'self' : null,
    href: personHref(id),
    lifecycle_status: record.lifecycle_status,
    visibility: 'operator'
  };
}

export async function resolveOrganisation(id, accessContext, { getStore = defaultGetUniversalLinkStore, includeArchived = false, env, fetchImpl } = {}) {
  if (!isValidOrganisationId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'shared', kind: 'organisation', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  let record = parseOrganisationRecord(await getIdentityJSON(store, organisationKey(id)));
  if (!record) record = await getGithubOrganisation(id, { env, fetchImpl });
  if (!record) throw endpointNotFoundError();
  if (record.lifecycle_status === 'archived' && !includeArchived) throw endpointNotFoundError();
  return {
    ref,
    kind: 'organisation',
    display_label: displayLabelFor(record),
    supporting_label: null,
    href: organisationHref(id),
    lifecycle_status: record.lifecycle_status,
    visibility: 'operator'
  };
}

// Class metadata (title/code) is not itself sensitive — only membership is
// (docs/proposals/comms-hub-people-unification.md ยง6). This is an ordinary
// operator-visible resolver, deferred from Slice 11 only because nothing
// needed it yet; Slice 8's StudentReference `participates_in` relationship
// is the first real caller.
export async function resolveTeachingClass(
  id,
  accessContext,
  { getStore = defaultGetTeachingStore } = {}
) {
  const ref = formatEntityRef({ namespace: 'teaching', kind: 'class', id });
  if (!ref) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTeachingJSON(store, classKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const status = typeof record.status === 'string' ? record.status : 'active';
  if (status === 'trashed' || status === 'deleted') throw endpointNotFoundError();
  return {
    ref,
    kind: 'class',
    display_label: typeof record.title === 'string' && record.title ? record.title : id,
    supporting_label: typeof record.code === 'string' ? record.code : null,
    href: classHref(id),
    lifecycle_status: status,
    visibility: 'operator'
  };
}

export async function resolveCommunication(
  id,
  accessContext,
  { getStore = defaultGetProfessionalStore } = {}
) {
  if (!isValidCommunicationId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'professional', kind: 'communication', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parseCommunicationRecord(await getProfessionalJSON(store, communicationKey(id)));
  if (!record) throw endpointNotFoundError();
  return {
    ref,
    kind: 'communication',
    display_label: communicationDisplayLabel(record),
    supporting_label: `${record.direction} ${record.channel}`,
    href: `/professional/#/communication/${encodeURIComponent(id)}`,
    lifecycle_status: record.status,
    visibility: 'operator'
  };
}

export async function resolveMeeting(
  id,
  accessContext,
  { getStore = defaultGetProfessionalStore } = {}
) {
  if (!isValidMeetingId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'professional', kind: 'meeting', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parseMeetingRecord(await getProfessionalJSON(store, meetingKey(id)));
  if (!record) throw endpointNotFoundError();
  return {
    ref,
    kind: 'meeting',
    display_label: meetingDisplayLabel(record),
    supporting_label: record.state,
    href: `/professional/#/meeting/${encodeURIComponent(id)}`,
    lifecycle_status: record.state,
    visibility: 'operator'
  };
}

export async function resolveEvent(
  id,
  accessContext,
  { getStore = defaultGetProfessionalStore } = {}
) {
  if (!isValidEventId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'professional', kind: 'event', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parseEventRecord(await getProfessionalJSON(store, eventKey(id)));
  if (!record) throw endpointNotFoundError();
  return {
    ref,
    kind: 'event',
    display_label: eventDisplayLabel(record),
    supporting_label: record.event_type,
    href: `/professional/#/event/${encodeURIComponent(id)}`,
    lifecycle_status: record.occurrence_state,
    visibility: 'operator'
  };
}

export async function resolveApplication(
  id,
  accessContext,
  { getStore = defaultGetProfessionalStore } = {}
) {
  if (!isValidApplicationId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'professional', kind: 'application', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parseApplicationRecord(await getProfessionalJSON(store, applicationKey(id)));
  if (!record) throw endpointNotFoundError();
  return {
    ref,
    kind: 'application',
    display_label: applicationDisplayLabel(record),
    supporting_label: record.pipeline_status,
    href: `/professional/#/application/${encodeURIComponent(id)}`,
    lifecycle_status: record.pipeline_status,
    visibility: 'operator'
  };
}

// Exported so tests can assert each slot's kind without depending on
// dispatch internals.
export const RESOLVER_SLOTS = Object.freeze({
  'shared:person': resolvePerson,
  'shared:organisation': resolveOrganisation,
  'tasks:task': resolveTask,
  'tasks:project': resolveTasksProject,
  'tasks:goal': resolveTasksGoal,
  'tasks:program': resolveTasksProgram,
  'professional:communication': resolveCommunication,
  'professional:meeting': resolveMeeting,
  'professional:event': resolveEvent,
  'professional:application': resolveApplication,
  'knowledge:page': resolveKnowledgePage,
  'teaching:unit': resolveTeachingUnit,
  'teaching:lesson': resolveTeachingLesson,
  'teaching:class': resolveTeachingClass,
  'life:decision': resolveLifeDecision
  // 'teaching:student_reference' is deliberately absent — see entity-ref.mjs.
});

// Single entry point used by the read-only Universal Link repository.
// Enforces `allowed_entity_kinds` once, here, rather than duplicating the
// check in every resolver. Unknown or unregistered namespace:kind pairs —
// and kinds no resolver is registered for at all — behave exactly like a
// missing record, never a distinct error shape.
export async function resolveEntity(refInput, accessContext, options = {}) {
  const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
  if (!ref) throw endpointNotFoundError();
  assertEntityKindAllowed(accessContext, ref.kind);
  const resolver = RESOLVER_SLOTS[`${ref.namespace}:${ref.kind}`];
  if (!resolver) throw endpointNotFoundError();
  return resolver(ref.id, accessContext, options);
}
