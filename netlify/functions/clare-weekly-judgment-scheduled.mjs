import { runClareWeeklyJudgment } from './_shared/clare-weekly-judgment.mjs';
import { okResponse } from './_shared/http.mjs';
import { getSydneyMinutesOfDay } from '../../apps/life/js/core/time.js';

/**
 * Sunday ~19:00 Sydney Clare weekly judgment (Haiku), with ~20:00 retry
 * when the model failed on the first slot.
 * Dual UTC cron slots per hour; Sydney minute gate keeps one fire after DST.
 */
export const config = {
  schedule: '0 8,9,10 * * 0'
};

const PRIMARY_START = 19 * 60;
const PRIMARY_END = 19 * 60 + 25;
const RETRY_START = 20 * 60;
const RETRY_END = 20 * 60 + 25;

export function inSydneyClareJudgmentWindow(instant = new Date()) {
  const mins = getSydneyMinutesOfDay(instant instanceof Date ? instant : new Date(instant));
  return (mins >= PRIMARY_START && mins <= PRIMARY_END)
    || (mins >= RETRY_START && mins <= RETRY_END);
}

export function createClareWeeklyJudgmentScheduledHandler(deps = {}) {
  return async function clareWeeklyJudgmentScheduledHandler() {
    const now = deps.now ? deps.now() : new Date();
    if (!inSydneyClareJudgmentWindow(now)) {
      return okResponse(202, { skipped: 'outside_window' });
    }
    const env = deps.env ?? process.env;
    const result = await runClareWeeklyJudgment({ env, now, deps });
    return okResponse(202, result);
  };
}

export default createClareWeeklyJudgmentScheduledHandler();
