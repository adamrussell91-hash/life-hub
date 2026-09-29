import { runPromiseNudges } from './_shared/promise-nudges.mjs';
import { okResponse } from './_shared/http.mjs';
import { getSydneyMinutesOfDay } from '../../apps/life/js/core/time.js';

/**
 * Daily late-promise drafts. Fire both AEST/AEDT UTC hours; Sydney gate keeps ~07:00.
 * Window 06:50–07:20 Sydney (same dual-slot pattern as calendar ghosts).
 */
export const config = {
  schedule: '0 20,21 * * *'
};

const WINDOW_START = 6 * 60 + 50;
const WINDOW_END = 7 * 60 + 20;

export function inSydneyPromiseNudgeWindow(instant = new Date()) {
  const mins = getSydneyMinutesOfDay(instant instanceof Date ? instant : new Date(instant));
  return mins >= WINDOW_START && mins <= WINDOW_END;
}

export function createPromiseNudgesScheduledHandler(deps = {}) {
  return async function promiseNudgesScheduledHandler() {
    const now = deps.now ? deps.now() : new Date();
    if (!inSydneyPromiseNudgeWindow(now)) {
      return okResponse(202, { queued: 0, skipped: 'outside_window' });
    }
    const env = deps.env ?? process.env;
    const result = await runPromiseNudges({ env, now, deps });
    return okResponse(202, result);
  };
}

export default createPromiseNudgesScheduledHandler();
