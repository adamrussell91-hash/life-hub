// Dispatches professional:* Confirm writes to meeting/event/communication/career/tie executors.

import { createMeetingEventWriteExecutor } from './meeting-event-agent.mjs';
import { createProfessionalEditWriteExecutor } from './professional-edit-agent.mjs';
import { createCareerWriteExecutor } from './career-agent.mjs';
import { createTieDecisionWriteExecutor } from './tie-decision-agent.mjs';
import { writeError } from './agent-propose-helpers.mjs';

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

  async function apply(write, target, created = new Map()) {
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
