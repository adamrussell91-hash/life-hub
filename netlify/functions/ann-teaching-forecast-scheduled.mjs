import { runAnnTeachingForecast } from './_shared/ann-teaching-forecast.mjs';
import { okResponse } from './_shared/http.mjs';
import { getSydneyMinutesOfDay } from '../../apps/life/js/core/time.js';

/**
 * Sunday ~18:00 Sydney Ann teaching-load → Ann→Hammond.
 * Dual UTC cron slots; Sydney minute gate keeps one fire after DST.
 */
export const config = {
  schedule: '0 7,8 * * 0'
};

const WINDOW_START = 18 * 60;
const WINDOW_END = 18 * 60 + 25;

export function inSydneyAnnForecastWindow(instant = new Date()) {
  const mins = getSydneyMinutesOfDay(instant instanceof Date ? instant : new Date(instant));
  return mins >= WINDOW_START && mins <= WINDOW_END;
}

export function createAnnTeachingForecastScheduledHandler(deps = {}) {
  return async function annTeachingForecastScheduledHandler() {
    const now = deps.now ? deps.now() : new Date();
    if (!inSydneyAnnForecastWindow(now)) {
      return okResponse(202, { skipped: 'outside_window' });
    }
    const env = deps.env ?? process.env;
    const result = await runAnnTeachingForecast({ env, now, deps });
    return okResponse(202, result);
  };
}

export default createAnnTeachingForecastScheduledHandler();
