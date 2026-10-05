// Dispatches professional:* Confirm writes to meeting/event/communication/career/tie executors.

import { createMeetingEventWriteExecutor } from './meeting-event-agent.mjs';
import { createProfessionalEditWriteExecutor } from './professional-edit-agent.mjs';
import { createCareerWriteExecutor } from './career-agent.mjs';
import { createTieDecisionWriteExecutor } from './tie-decision-agent.mjs';
import { writeError } from './agent-propose-helpers.mjs';
import {
  getJSON,
  meetingKey,
  meetingIndexKey,
  eventKey,
  eventIndexKey,
  communicationKey,
  communicationIndexKey,
  applicationKey,
  applicationIndexKey,
  careerFutureKey,
  careerFutureIndexKey
} from './professional-blobs.mjs';

const DELETE_KEYS = {
  meeting: [meetingKey, meetingIndexKey],
  event: [eventKey, eventIndexKey],
  communication: [communicationKey, communicationIndexKey],
  application: [applicationKey, applicationIndexKey],
  future: [careerFutureKey, careerFutureIndexKey]
};

/**
 * Combined executor handed to executeProposeActionWrites as blobStores.professional.
 */
export function createProfessionalWriteExecutor({
  store,
  env,
  fetchImpl,
  now,
  resolveEntity
} = {}) {
  if (!store) throw new Error('createProfessionalWriteExecutor requires a professional store.');
  const meetingEvent = createMeetingEventWriteExecutor({ store, env, now });
  const edits = createProfessionalEditWriteExecutor({ store, env, now, resolveEntity });
  const career = createCareerWriteExecutor({ store, env, now });
  const ties = createTieDecisionWriteExecutor({
    professionalStore: store,
    env,
    fetchImpl,
    now,
    resolveEntity
  });

  // Permanent delete of one record + its index row. Adam approved it on the Confirm card.
  async function deleteRecord(write, target) {
    const keys = DELETE_KEYS[target.kind];
    if (!keys) return writeError('invalid_professional_write', write.path);
    if (typeof store.delete !== 'function') return writeError('professional_store_unbound', write.path);
    let recordKey;
    let indexKey;
    try {
      [recordKey, indexKey] = keys.map(fn => fn(target.id));
    } catch {
      return writeError('invalid_professional_write', write.path);
    }
    const existing = await getJSON(store, recordKey).catch(() => null);
    await store.delete(recordKey);
    await store.delete(indexKey);
    return {
      ok: true,
      result: { path: write.path, mode: 'delete', id: target.id, ...(existing ? { deleted: true } : { skipped: true }) }
    };
  }

  async function apply(write, target, created = new Map()) {
    if (write.mode === 'delete') return deleteRecord(write, target);
    // Existing Meeting/Event edits and every Communication write.
    if (target.kind === 'communication' || ((target.kind === 'meeting' || target.kind === 'event') && write.mode === 'overwrite')) {
      return edits.apply(write, target, created);
    }
    if (target.kind === 'meeting' || target.kind === 'event') {
      return meetingEvent.apply(write, target, created);
    }
    if (target.kind === 'application' || target.kind === 'future') {
      return career.apply(write, target, created);
    }
    if (target.kind === 'tie') {
      return ties.apply(write, target, created);
    }
    return writeError('unknown_write_target', write.path);
  }

  return { apply };
}
