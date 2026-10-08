/**
 * Sundays at 21:00 UTC (7am AEST, 8am AEDT): check every wishlist watch's shop page,
 * convert to Australian dollars and notify when one reaches Adam's buy price.
 * No AI. Logic lives in _shared/watch-radar.mjs.
 */
import { okResponse } from './_shared/http.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import { createRatesClient } from './_shared/travel-rates.mjs';
import { runWatchRadar } from './_shared/watch-radar.mjs';

export const config = { schedule: '0 21 * * 6' };

export function createWatchRadarScheduledHandler(deps = {}) {
  return async function watchRadarScheduled() {
    try {
      const env = deps.env ?? process.env;
      const store = await (deps.getStore ?? defaultGetTasksStore)(env);
      const fetchImpl = deps.fetchImpl ?? fetch;
      const result = await runWatchRadar({ store, fetchImpl, rates: deps.rates ?? createRatesClient({ fetchImpl }), env, ...(deps.run ?? {}) });
      return okResponse(200, result);
    } catch (error) {
      console.error('watch-radar failed', error instanceof Error ? error.message : error);
      return okResponse(200, { checked: 0, error: 'radar_failed' });
    }
  };
}

export default createWatchRadarScheduledHandler();
