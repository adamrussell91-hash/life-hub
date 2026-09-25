import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import { okResponse } from './_shared/http.mjs';
import {
  loadProfessionalEventsFromBlobs,
  loadTeachingLessonsFromBlobs,
  readSchoolTerms
} from './almanac.mjs';
import { createCalendarGhostsProposeHandler } from './_shared/calendar-ghosts-propose.mjs';

/**
 * 05:30 Australia/Sydney. AEST = 19:30 UTC, AEDT = 18:30 UTC.
 * Fire both UTC slots; the runner skips if it already ran for today's Sydney date.
 */
export const config = {
  schedule: '30 18,19 * * *'
};

export function createCalendarGhostsProposeScheduledHandler(deps = {}) {
  const run = createCalendarGhostsProposeHandler({
    createGitHubClient,
    decodeBlob,
    getTasksStore: defaultGetTasksStore,
    loadLessons: loadTeachingLessonsFromBlobs,
    loadProfessionalEvents: loadProfessionalEventsFromBlobs,
    readSchoolTerms,
    ...deps
  });
  return async function calendarGhostsProposeScheduledHandler() {
    try {
      const result = await run();
      return okResponse(202, result);
    } catch (error) {
      if (error instanceof GitHubConfigurationError) {
        return okResponse(503, { ok: false, error: 'github_unavailable' });
      }
      console.error('calendar-ghosts-propose-scheduled failed', error);
      return okResponse(500, {
        ok: false,
        error: error instanceof Error ? error.message : 'propose_failed'
      });
    }
  };
}

export default createCalendarGhostsProposeScheduledHandler();
