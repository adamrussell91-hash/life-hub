import { isIndexKey, listBlobKeys } from './blobs-list.mjs';
import {
  isValidCommunicationId,
  isValidCommunicationOperationId
} from './communication-schema.mjs';
import { isValidMeetingId, isValidMeetingOperationId } from './meeting-schema.mjs';
import { isValidEventId, isValidEventOperationId } from './event-schema.mjs';

// Storage adapter for Professional Hub content (`professional-hub-content`).
// Brand-new umbrella store — opens directly on the umbrella site, no
// cross-site token fallback (same rationale as universal-link-blobs.mjs).

export const PROFESSIONAL_CONTENT_STORE = 'professional-hub-content';

export const COMMUNICATION_PREFIX = 'communications/records/';
export const COMMUNICATION_INDEX_PREFIX = 'communications/index/';
export const COMMUNICATION_OPERATION_PREFIX = 'communications/operations/';

export const MEETING_PREFIX = 'meetings/records/';
export const MEETING_INDEX_PREFIX = 'meetings/index/';
export const MEETING_OPERATION_PREFIX = 'meetings/operations/';

export const EVENT_PREFIX = 'events/records/';
export const EVENT_INDEX_PREFIX = 'events/index/';
export const EVENT_OPERATION_PREFIX = 'events/operations/';

function assertValidCommunicationId(id) {
  if (!isValidCommunicationId(id)) {
    throw Object.assign(new Error(`Invalid Communication id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_communication_id'
    });
  }
  return id;
}

function assertValidCommunicationOperationId(id) {
  if (!isValidCommunicationOperationId(id)) {
    throw Object.assign(new Error(`Invalid Communication operation id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_communication_operation_id'
    });
  }
  return id;
}

function assertValidMeetingId(id) {
  if (!isValidMeetingId(id)) {
    throw Object.assign(new Error(`Invalid Meeting id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_meeting_id'
    });
  }
  return id;
}

function assertValidMeetingOperationId(id) {
  if (!isValidMeetingOperationId(id)) {
    throw Object.assign(new Error(`Invalid Meeting operation id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_meeting_operation_id'
    });
  }
  return id;
}

function assertValidEventId(id) {
  if (!isValidEventId(id)) {
    throw Object.assign(new Error(`Invalid Event id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_event_id'
    });
  }
  return id;
}

function assertValidEventOperationId(id) {
  if (!isValidEventOperationId(id)) {
    throw Object.assign(new Error(`Invalid Event operation id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_event_operation_id'
    });
  }
  return id;
}

export async function defaultGetProfessionalStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(PROFESSIONAL_CONTENT_STORE);
}

export async function getJSON(store, key, options = {}) {
  return store.get(key, { type: 'json', ...options });
}

export async function setJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  if (typeof store.set === 'function') return store.set(key, JSON.stringify(value));
  throw new Error('Professional content store cannot write.');
}

export function communicationKey(id) {
  return `${COMMUNICATION_PREFIX}${assertValidCommunicationId(id)}`;
}

export function communicationIndexKey(id) {
  return `${COMMUNICATION_INDEX_PREFIX}${assertValidCommunicationId(id)}`;
}

export function communicationOperationKey(id) {
  return `${COMMUNICATION_OPERATION_PREFIX}${assertValidCommunicationOperationId(id)}`;
}

export async function listCommunicationIndexKeys(store) {
  return (await listBlobKeys(store, COMMUNICATION_INDEX_PREFIX)).filter((key) => !isIndexKey(key));
}

export async function listAuthoritativeCommunicationKeys(store) {
  return (await listBlobKeys(store, COMMUNICATION_PREFIX)).filter((key) => !isIndexKey(key));
}

export function meetingKey(id) {
  return `${MEETING_PREFIX}${assertValidMeetingId(id)}`;
}

export function meetingIndexKey(id) {
  return `${MEETING_INDEX_PREFIX}${assertValidMeetingId(id)}`;
}

export function meetingOperationKey(id) {
  return `${MEETING_OPERATION_PREFIX}${assertValidMeetingOperationId(id)}`;
}

export async function listMeetingIndexKeys(store) {
  return (await listBlobKeys(store, MEETING_INDEX_PREFIX)).filter((key) => !isIndexKey(key));
}

export function eventKey(id) {
  return `${EVENT_PREFIX}${assertValidEventId(id)}`;
}

export function eventIndexKey(id) {
  return `${EVENT_INDEX_PREFIX}${assertValidEventId(id)}`;
}

export function eventOperationKey(id) {
  return `${EVENT_OPERATION_PREFIX}${assertValidEventOperationId(id)}`;
}

export async function listEventIndexKeys(store) {
  return (await listBlobKeys(store, EVENT_INDEX_PREFIX)).filter((key) => !isIndexKey(key));
}
