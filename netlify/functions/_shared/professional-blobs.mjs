import { isIndexKey, listBlobKeys } from './blobs-list.mjs';
import {
  isValidCommunicationId,
  isValidCommunicationOperationId
} from './communication-schema.mjs';
import { isValidMeetingId, isValidMeetingOperationId } from './meeting-schema.mjs';
import { isValidEventId, isValidEventOperationId } from './event-schema.mjs';
import {
  isValidApplicationId,
  isValidApplicationOperationId
} from './application-schema.mjs';
import { isValidObservationId } from './observation-schema.mjs';
import { isValidLinkProposalId } from './link-proposal-schema.mjs';
import { isValidLedgerItemId } from './ledger-schema.mjs';
import { isValidRememberFactId } from './remember-schema.mjs';
import { isValidThreadId } from './thread-schema.mjs';

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

export const APPLICATION_PREFIX = 'applications/records/';
export const APPLICATION_INDEX_PREFIX = 'applications/index/';
export const APPLICATION_OPERATION_PREFIX = 'applications/operations/';

export const OBSERVATION_PREFIX = 'observations/records/';
export const OBSERVATION_BY_ABOUT_REF_PREFIX = 'observations/by-about-ref/';

export const LINK_PROPOSAL_PREFIX = 'link-proposals/records/';
export const LINK_PROPOSAL_BY_PERSON_PREFIX = 'link-proposals/by-person/';
export const LINK_PROPOSAL_BY_HASH_PREFIX = 'link-proposals/by-hash/';

export const LEDGER_ITEM_PREFIX = 'ledger-items/records/';
export const LEDGER_ITEM_BY_PERSON_PREFIX = 'ledger-items/by-person/';
export const LEDGER_ITEM_BY_SOURCE_PREFIX = 'ledger-items/by-source/';

export const THREAD_PREFIX = 'threads/records/';

export const REMEMBER_FACT_PREFIX = 'remember-facts/records/';
export const REMEMBER_FACT_BY_PERSON_PREFIX = 'remember-facts/by-person/';
export const REMEMBER_RUN_STATE_KEY = 'remember-facts/_run_state';

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

function assertValidApplicationId(id) {
  if (!isValidApplicationId(id)) {
    throw Object.assign(new Error(`Invalid Application id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_application_id'
    });
  }
  return id;
}

function assertValidApplicationOperationId(id) {
  if (!isValidApplicationOperationId(id)) {
    throw Object.assign(new Error(`Invalid Application operation id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_application_operation_id'
    });
  }
  return id;
}

function assertValidObservationId(id) {
  if (!isValidObservationId(id)) {
    throw Object.assign(new Error(`Invalid Observation id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_observation_id'
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

export function applicationKey(id) {
  return `${APPLICATION_PREFIX}${assertValidApplicationId(id)}`;
}

export function applicationIndexKey(id) {
  return `${APPLICATION_INDEX_PREFIX}${assertValidApplicationId(id)}`;
}

export function applicationOperationKey(id) {
  return `${APPLICATION_OPERATION_PREFIX}${assertValidApplicationOperationId(id)}`;
}

export async function listApplicationIndexKeys(store) {
  return (await listBlobKeys(store, APPLICATION_INDEX_PREFIX)).filter((key) => !isIndexKey(key));
}

export function observationKey(id) {
  return `${OBSERVATION_PREFIX}${assertValidObservationId(id)}`;
}

// Secondary index: one key per (about_ref, observation) pair, so listing
// observations for one Person/Organisation doesn't require scanning every
// observation in the store. The about_ref segment is a canonical ref string
// (e.g. "shared:person:person_x"), used as-is — nothing else in this file
// base64/URL-encodes a ref used as a key segment, so a plain
// canonical-ref-as-path-segment stays consistent with the rest of this file
// rather than inventing a new encoding scheme.
export function observationByAboutRefKey(aboutRef, id) {
  return `${OBSERVATION_BY_ABOUT_REF_PREFIX}${aboutRef}/${assertValidObservationId(id)}`;
}

export async function listObservationIndexKeysForAboutRef(store, aboutRef) {
  return (await listBlobKeys(store, `${OBSERVATION_BY_ABOUT_REF_PREFIX}${aboutRef}/`)).filter(
    (key) => !isIndexKey(key)
  );
}

function assertValidLinkProposalId(id) {
  if (!isValidLinkProposalId(id)) {
    throw Object.assign(new Error(`Invalid Link Proposal id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_link_proposal_id'
    });
  }
  return id;
}

function assertValidLedgerItemId(id) {
  if (!isValidLedgerItemId(id)) {
    throw Object.assign(new Error(`Invalid Ledger Item id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_ledger_item_id'
    });
  }
  return id;
}

export function linkProposalKey(id) {
  return `${LINK_PROPOSAL_PREFIX}${assertValidLinkProposalId(id)}`;
}

export function linkProposalByPersonKey(personRef, id) {
  return `${LINK_PROPOSAL_BY_PERSON_PREFIX}${personRef}/${assertValidLinkProposalId(id)}`;
}

export function linkProposalByHashKey(hash) {
  if (typeof hash !== 'string' || !hash) {
    throw Object.assign(new Error('Invalid equivalence hash.'), {
      status: 400,
      code: 'invalid_equivalence_hash'
    });
  }
  return `${LINK_PROPOSAL_BY_HASH_PREFIX}${hash}`;
}

export async function listLinkProposalKeysForPerson(store, personRef) {
  return (await listBlobKeys(store, `${LINK_PROPOSAL_BY_PERSON_PREFIX}${personRef}/`)).filter(
    (key) => !isIndexKey(key)
  );
}

export function ledgerItemKey(id) {
  return `${LEDGER_ITEM_PREFIX}${assertValidLedgerItemId(id)}`;
}

export function ledgerItemByPersonKey(personRef, id) {
  return `${LEDGER_ITEM_BY_PERSON_PREFIX}${personRef}/${assertValidLedgerItemId(id)}`;
}

export function ledgerItemBySourceKey(sourceKey) {
  if (typeof sourceKey !== 'string' || !sourceKey) {
    throw Object.assign(new Error('Invalid ledger source key.'), {
      status: 400,
      code: 'invalid_ledger_source_key'
    });
  }
  return `${LEDGER_ITEM_BY_SOURCE_PREFIX}${sourceKey}`;
}

export async function listLedgerItemKeysForPerson(store, personRef) {
  return (await listBlobKeys(store, `${LEDGER_ITEM_BY_PERSON_PREFIX}${personRef}/`)).filter(
    (key) => !isIndexKey(key)
  );
}

export function threadKey(id) {
  if (!isValidThreadId(id)) {
    throw Object.assign(new Error(`Invalid thread id: ${JSON.stringify(id)}`), { status: 400, code: 'invalid_thread_id' });
  }
  return `${THREAD_PREFIX}${id}`;
}

export async function listThreadKeys(store) {
  return (await listBlobKeys(store, THREAD_PREFIX)).filter((key) => !isIndexKey(key));
}

function assertValidRememberFactId(id) {
  if (!isValidRememberFactId(id)) {
    throw Object.assign(new Error(`Invalid Remember Fact id: ${JSON.stringify(id)}`), {
      status: 400,
      code: 'invalid_remember_fact_id'
    });
  }
  return id;
}

export function rememberFactKey(id) {
  return `${REMEMBER_FACT_PREFIX}${assertValidRememberFactId(id)}`;
}

export function rememberFactByPersonKey(personRef, id) {
  return `${REMEMBER_FACT_BY_PERSON_PREFIX}${personRef}/${assertValidRememberFactId(id)}`;
}

export async function listRememberFactKeysForPerson(store, personRef) {
  return (await listBlobKeys(store, `${REMEMBER_FACT_BY_PERSON_PREFIX}${personRef}/`)).filter(
    (key) => !isIndexKey(key)
  );
}
