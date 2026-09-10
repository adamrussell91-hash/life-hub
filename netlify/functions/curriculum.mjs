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

function lessonStatus(lesson) {
  return lesson.status === 'archived' || lesson.status === 'trashed' ? lesson.status : 'active';
}

function lessonSummary(lesson, publishedIds) {
  const id = typeof lesson.id === 'string' ? lesson.id : '';
  return {
    id,
    title: typeof lesson.title === 'string' ? lesson.title : '',
    slug: typeof lesson.slug === 'string' ? lesson.slug : '',
    unit_id: typeof lesson.unit_id === 'string' ? lesson.unit_id : undefined,
    sequence: Number.isInteger(lesson.sequence) ? lesson.sequence : 0,
    status: lessonStatus(lesson),
    published: publishedIds.has(id),
    updated_at: typeof lesson.updated_at === 'string' ? lesson.updated_at : '',
    ...(typeof lesson.created_at === 'string' ? { created_at: lesson.created_at } : {}),
    ...(typeof lesson.published_at === 'string' ? { published_at: lesson.published_at } : {}),
    ...(Array.isArray(lesson.tags) && lesson.tags.length ? { tags: lesson.tags } : {}),
    ...(typeof lesson.author_id === 'string' ? { author_id: lesson.author_id } : {}),
    ...(lesson.review_status === 'needs_review' ? { review_status: 'needs_review' } : {}),
    ...(Array.isArray(lesson.syllabus_outcomes) && lesson.syllabus_outcomes.length
      ? { syllabus_outcomes: lesson.syllabus_outcomes }
      : {}),
    ...(Array.isArray(lesson.outcome_ids) && lesson.outcome_ids.length
      ? { outcome_ids: lesson.outcome_ids }
      : {}),
    ...(typeof lesson.pedagogical_mode === 'string' ? { pedagogical_mode: lesson.pedagogical_mode } : {})
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
