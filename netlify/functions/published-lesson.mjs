import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { classesForLesson, loadRoster } from './_shared/class-claims.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import {
  draftLessonKey,
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
    // The snapshot outlives the draft: a trashed or permanently deleted lesson
    // must stop resolving for students even though its snapshot blob remains.
    const draft = await getJSON(store, draftLessonKey(id));
    if (!snapshot || typeof snapshot !== 'object' || !draft || isDeletedRecord(draft)) {
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

    // A plain lesson link names no class. Lectures, tutorials and sprints need one, so the page gets the choices.
    const needsClass = ['lecture', 'tutorial', 'design_sprint', 'case_study'].includes(snapshot.pedagogical_mode);
    let classes;
    if (needsClass) {
      classes = await classesForLesson(store, id);
      // A tutorial belongs to the one class it was planned for, scheduled or not.
      const own = draft.pedagogical_mode === 'tutorial' ? draft.tutorial?.class_id : draft.pedagogical_mode === 'case_study' ? draft.case?.class_id : null;
      if (own) {
        const roster = await loadRoster(store, own);
        classes = roster ? [{ id: roster.cls.id, title: roster.cls.display_name || roster.cls.title || roster.cls.code || 'Class' }] : classes;
      }
    }

    return withCors(okResponse(200, { ...snapshot, outcome_ids: ids, outcomes, ...(classes ? { classes } : {}) }), request, env);
  }, deps);
}

export default createPublishedLessonHandler();
