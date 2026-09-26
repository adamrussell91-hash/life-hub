import { runRememberScheduledPass } from './_shared/remember-service.mjs';
import { okResponse } from './_shared/http.mjs';

/**
 * Hourly cron; Remember only fires at Sydney 07:00 and 16:00 (see shouldRunRememberNow).
 * Separate from path-bearing handlers — Netlify forbids schedule + path on one function.
 */
export const config = {
  schedule: '5 * * * *'
};

export function createPeopleRememberTickScheduledHandler(deps = {}) {
  return async function peopleRememberTickScheduledHandler() {
    const env = deps.env ?? process.env;
    const result = await runRememberScheduledPass({ ...deps, env });
    return okResponse(202, result);
  };
}

export default createPeopleRememberTickScheduledHandler();
