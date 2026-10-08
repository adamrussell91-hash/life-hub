import { createGitHubClient } from './_shared/github-client.mjs';
import { scanMailroom } from './_shared/garage-home-store.mjs';
import { okResponse } from './_shared/http.mjs';

/**
 * Cron only — Netlify forbids `schedule` on the same function as `path`.
 * Every three hours, at minute 23 (UTC), read new car / home / investment mail.
 * Without Gmail env it does nothing.
 */
export const config = {
  schedule: '23 */3 * * *'
};

export function createGarageHomeMailScanHandler(deps = {}) {
  return async function garageHomeMailScanHandler() {
    const env = deps.env ?? process.env;
    const fetchImpl = deps.fetchImpl ?? fetch;
    try {
      const github = (deps.createGitHubClient ?? createGitHubClient)({ env, fetchImpl });
      const result = await scanMailroom({ github, env, fetchImpl, now: deps.now ?? Date.now });
      return okResponse(202, { status: result.status, added: result.added });
    } catch (error) {
      return okResponse(202, { status: 'error', code: error?.code ?? 'scan_failed' });
    }
  };
}

export default createGarageHomeMailScanHandler();
