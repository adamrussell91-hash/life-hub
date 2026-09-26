import { okResponse } from './_shared/http.mjs';
import { runCareerScanPass } from './_shared/career-scan-service.mjs';

/**
 * Hourly cron; Skills scan only fires Sunday 17:00 Sydney (shouldRunCareerScanNow).
 */
export const config = {
  schedule: '10 * * * *'
};

export function createCareerScanTickScheduledHandler(deps = {}) {
  return async function careerScanTickScheduledHandler() {
    const env = deps.env ?? process.env;
    const result = await runCareerScanPass({ ...deps, env, scheduled: true });
    return okResponse(202, result);
  };
}

export default createCareerScanTickScheduledHandler();
