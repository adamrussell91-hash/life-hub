/**
 * Every 10 minutes: the few phone notifications Day Sense sends (dexy, train-home pass).
 * Deterministic rules in _shared/day-sense-notify.mjs. No AI, capped at 4 a day.
 */
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { defaultGetTasksStore, getJSON } from './_shared/tasks-blobs.mjs';
import { okResponse } from './_shared/http.mjs';
import { readSchoolTerms } from './almanac.mjs';
import { runDaySenseNotify } from './_shared/day-sense-notify.mjs';

export const config = { schedule: '*/10 * * * *' };

export default async function daySenseNotifyScheduled() {
  try {
    const store = await defaultGetTasksStore(process.env);
    const result = await runDaySenseNotify({
      store,
      now: new Date(),
      loadProfile: () => getJSON(store, 'meta/planning_profile'),
      loadTerms: () => readSchoolTerms(async () => store),
      openRepo: async () => ({ client: createGitHubClient({ env: process.env, fetchImpl: fetch }), decodeBlob })
    });
    return okResponse(200, result);
  } catch (error) {
    console.error('day-sense-notify failed', error instanceof Error ? error.message : error);
    return okResponse(200, { sent: [], error: 'notify_failed' });
  }
}
