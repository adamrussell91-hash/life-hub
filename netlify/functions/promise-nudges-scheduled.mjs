import { runPromiseNudges } from './_shared/promise-nudges.mjs';
import { okResponse } from './_shared/http.mjs';

/**
 * Daily late-promise drafts, queued on the calendar. 07:00 Sydney
 * (`0 21 * * *` UTC in AEST; daylight saving moves it to 08:00, which is fine).
 */
export const config = {
  schedule: '0 21 * * *'
};

export function createPromiseNudgesScheduledHandler(deps = {}) {
  return async function promiseNudgesScheduledHandler() {
    const env = deps.env ?? process.env;
    const result = await runPromiseNudges({ env, now: deps.now ? deps.now() : new Date(), deps });
    return okResponse(202, result);
  };
}

export default createPromiseNudgesScheduledHandler();
