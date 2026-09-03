import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  CLASS_PREFIX,
  DEFAULT_SCHEDULE_ANCHOR_DATE,
  DRAFT_LESSON_PREFIX,
  getJSON,
  listJSON,
  MEDIA_PREFIX,
  OUTCOME_PREFIX,
  PUBLISHED_LESSON_PREFIX,
  scheduleAnchorKey,
  SCHEDULED_LESSON_PREFIX,
  SCOPE_SEQUENCE_PREFIX,
  SUBJECT_PREFIX,
  UNIT_PREFIX,
  YEAR_PREFIX
} from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/curriculum' };

function lessonSummary(lesson, publishedIds) {
  const id = typeof lesson.id === 'string' ? lesson.id : '';
  return {
    id,
    title: typeof lesson.title === 'string' ? lesson.title : '',
    unit_id: typeof lesson.unit_id === 'string' ? lesson.unit_id : undefined,
    published: publishedIds.has(id)
  };
}

export async function buildCurriculum(store) {
  const [
    years,
    subjects,
    units,
    lessons,
    publishedList,
    classes,
    scheduled_lessons,
    scope_sequences,
    mediaRaw,
    outcomes,
    anchor
  ] = await Promise.all([
    listJSON(store, YEAR_PREFIX),
    listJSON(store, SUBJECT_PREFIX),
    listJSON(store, UNIT_PREFIX),
    listJSON(store, DRAFT_LESSON_PREFIX),
    store.list({ prefix: PUBLISHED_LESSON_PREFIX }),
    listJSON(store, CLASS_PREFIX),
    listJSON(store, SCHEDULED_LESSON_PREFIX),
    listJSON(store, SCOPE_SEQUENCE_PREFIX),
    listJSON(store, MEDIA_PREFIX),
    listJSON(store, OUTCOME_PREFIX),
    getJSON(store, scheduleAnchorKey())
  ]);

  const publishedIds = new Set(
    (publishedList?.blobs ?? []).map(blob => blob.key.slice(PUBLISHED_LESSON_PREFIX.length)).filter(Boolean)
  );

  return {
    years,
    subjects,
    units,
    lessons: lessons.filter(lesson => lesson.id).map(lesson => lessonSummary(lesson, publishedIds)),
    classes,
    scheduled_lessons,
    scope_sequences,
    media: mediaRaw.filter(item => item.status === 'active'),
    outcomes,
    schedule_anchor_date: typeof anchor?.date === 'string' ? anchor.date : DEFAULT_SCHEDULE_ANCHOR_DATE
  };
}

export function createCurriculumHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    try {
      return withCors(okResponse(200, await buildCurriculum(store)), request, env);
    } catch {
      return withCors(
        errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true),
        request,
        env
      );
    }
  }, deps);
}

export default createCurriculumHandler();
