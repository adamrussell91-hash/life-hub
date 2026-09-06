import { runScheduledJobsTick } from './_shared/ai-jobs-tick.mjs';
import { okResponse } from './_shared/http.mjs';

/** Cron only — Netlify forbids `schedule` on the same function as `path`. */
export const config = {
  schedule: '17 14 * * *'
};

export function createAiJobsTickScheduledHandler(deps = {}) {
  return async function aiJobsTickScheduledHandler() {
    const env = deps.env ?? process.env;
    const result = await runScheduledJobsTick({ ...deps, env });
    return okResponse(202, result);
  };
}

export default createAiJobsTickScheduledHandler();
