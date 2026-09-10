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
  PUBLISHED_LESSON_PREFIX,
  readPublishedId,
  unitKey
} from './_shared/teaching-blobs.mjs';
import {
  attachedOutcomeIds,
  filterBlocksForStudent,
  orderLessonsByUnitIds,
  sanitizeBlocksDeep,
  toPublicOutcome
} from './_shared/teaching-student.mjs';

export const config = { path: '/api/published/units/:id' };

export function createPublishedUnitHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Unit not found', false), request, env);
    }

    const unit = await getJSON(store, unitKey(id));
    if (!unit?.title) {
      return withCors(errorResponse(404, 'not_found', 'Unit not found', false), request, env);
    }

    const { blobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
    const snapshots = await Promise.all(blobs.map(blob => getJSON(store, blob.key)));
    const matching = [];
    for (const snapshot of snapshots) {
      if (!snapshot || snapshot.unit_id !== id) continue;
      if (!snapshot.lesson_id || !snapshot.title) continue;
      matching.push({ lesson_id: snapshot.lesson_id, title: snapshot.title });
    }

    const lessons = orderLessonsByUnitIds(unit.lesson_ids ?? [], matching);
    const studentBlocks = sanitizeBlocksDeep(filterBlocksForStudent(unit.blocks ?? []));
    const ids = attachedOutcomeIds({ outcome_ids: unit.outcome_ids });
    const outcomes = [];
    for (const outcomeId of ids) {
      const publicOutcome = toPublicOutcome(await getJSON(store, outcomeKey(outcomeId)));
      if (publicOutcome) outcomes.push(publicOutcome);
    }

    return withCors(okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons,
      ...(unit.cover ? { cover: unit.cover } : {}),
      blocks: studentBlocks,
      outcome_ids: ids,
      outcomes
    }), request, env);
  }, deps);
}

export default createPublishedUnitHandler();
