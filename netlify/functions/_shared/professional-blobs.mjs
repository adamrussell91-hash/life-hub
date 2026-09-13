import { isIndexKey, listBlobKeys } from './blobs-list.mjs';
import {
  isValidCommunicationId,
  isValidCommunicationOperationId
} from './communication-schema.mjs';

// Storage adapter for Professional Hub content (`professional-hub-content`).
// Brand-new umbrella store — opens directly on the umbrella site, no
// cross-site token fallback (same rationale as universal-link-blobs.mjs).

export const PROFESSIONAL_CONTENT_STORE = 'professional-hub-content';

export const COMMUNICATION_PREFIX = 'communications/records/';
export const COMMUNICATION_INDEX_PREFIX = 'communications/index/';
export const COMMUNICATION_OPERATION_PREFIX = 'communications/operations/';

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
