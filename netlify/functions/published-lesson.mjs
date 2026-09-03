import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import {
  getJSON,
  outcomeKey,
  publishedLessonKey,
  readPublishedId
} from './_shared/teaching-blobs.mjs';
import { attachedOutcomeIds, toPublicOutcome } from './_shared/teaching-student.mjs';

export const config = {
  path: ['/api/published/lessons/:id', '/.netlify/functions/published-lesson/:id']
};

export function createPublishedLessonHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }

    const snapshot = await getJSON(store, publishedLessonKey(id));
    if (!snapshot || typeof snapshot !== 'object') {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }

    const ids = attachedOutcomeIds({
      outcome_ids: Array.isArray(snapshot.outcome_ids)
        ? snapshot.outcome_ids.filter(row => typeof row === 'string')
        : undefined
    });
    const outcomes = [];
    for (const outcomeId of ids) {
      const publicOutcome = toPublicOutcome(await getJSON(store, outcomeKey(outcomeId)));
      if (publicOutcome) outcomes.push(publicOutcome);
    }

    return withCors(okResponse(200, { ...snapshot, outcome_ids: ids, outcomes }), request, env);
  }, deps);
}

export default createPublishedLessonHandler();
