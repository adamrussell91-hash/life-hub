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

/** Primary 19:00–19:25 and retry 20:00–20:25 Sydney. */
const CLARE_JUDGMENT_WINDOWS = [
  { start: 19 * 60, end: 19 * 60 + 25 },
  { start: 20 * 60, end: 20 * 60 + 25 }
];

export function inSydneyClareJudgmentWindow(instant = new Date()) {
  const mins = getSydneyMinutesOfDay(instant instanceof Date ? instant : new Date(instant));
  return CLARE_JUDGMENT_WINDOWS.some(({ start, end }) => mins >= start && mins <= end);
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
