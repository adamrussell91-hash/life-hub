import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { DOCUMENT_PREFIX } from './_shared/notion-import-store.mjs';
import {
  CLASS_PREFIX,
  DEFAULT_SCHEDULE_ANCHOR_DATE,
  DRAFT_LESSON_PREFIX,
  getJSON,
  listJSON,
  MEDIA_PREFIX,
  mediaFoldersKey,
  OUTCOME_PREFIX,
  PUBLISHED_LESSON_PREFIX,
  scheduleAnchorKey,
  SCHEDULED_LESSON_PREFIX,
  SCOPE_SEQUENCE_PREFIX,
  SUBJECT_PREFIX,
  UNIT_PREFIX,
  YEAR_PREFIX
} from './_shared/teaching-blobs.mjs';
import { isDeletedRecord, withoutDeleted } from './_shared/record-liveness.mjs';
import { buildMediaUsage } from './_shared/media-usage.mjs';

const LESSON_KINDS = new Set(['lesson', 'workshop', 'lecture']);

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
    planning_status: Array.isArray(lesson.blocks) && lesson.blocks.length ? 'planned' : 'not_planned',
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
    ...(typeof lesson.pedagogical_mode === 'string' ? { pedagogical_mode: lesson.pedagogical_mode } : {}),
    ...(Array.isArray(lesson.line_stops) && lesson.line_stops.length ? { line_stops: lesson.line_stops } : {}),
    ...(Array.isArray(lesson.line_off) && lesson.line_off.length ? { line_off: lesson.line_off } : {}),
    ...(Array.isArray(lesson.after_lesson_ids) ? { after_lesson_ids: lesson.after_lesson_ids } : {}),
    ...(LESSON_KINDS.has(lesson.lesson_kind) && lesson.lesson_kind !== 'lesson' ? { lesson_kind: lesson.lesson_kind } : {}),
    ...(Array.isArray(lesson.dot_points) && lesson.dot_points.length ? { dot_points: lesson.dot_points } : {})
  };
}

export async function buildCurriculum(store) {
  const source = store;
  store = { get: (key, options) => source.get(key, { ...options, consistency: 'strong' }), list: options => source.list(options) };
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
    documents,
    anchor,
    mediaFolders
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
    listJSON(store, DOCUMENT_PREFIX),
    getJSON(store, scheduleAnchorKey()),
    getJSON(store, mediaFoldersKey())
  ]);

  const publishedIds = new Set(
    (publishedList?.blobs ?? []).map(blob => blob.key.slice(PUBLISHED_LESSON_PREFIX.length)).filter(Boolean)
  );

  // Trashed lessons/units/classes stay in the payload (the Trash view restores them), but
  // their calendar rows must not: a schedule row pointing at deleted work is gone too.
  // Computed per request, so restoring the parent brings its schedule back.
  const liveUnitIds = new Set(withoutDeleted(units).map(row => row.id));
  const liveLessonIds = new Set(withoutDeleted(lessons).map(row => row.id));
  const liveClassIds = new Set(withoutDeleted(classes).map(row => row.id));
  const liveScheduled = withoutDeleted(scheduled_lessons).filter(row =>
    liveLessonIds.has(row.lesson_id) && liveUnitIds.has(row.unit_id) && liveClassIds.has(row.class_id)
  );

  const media = mediaRaw.filter(item => item.status === 'active');

  return {
    years,
    subjects,
    units,
    documents: documents.filter(doc => doc.status === 'active'),
    lessons: lessons.filter(lesson => lesson.id).map(lesson => lessonSummary(lesson, publishedIds)),
    classes,
    scheduled_lessons: liveScheduled,
    scope_sequences,
    media,
    media_folders: Array.isArray(mediaFolders?.folders) ? mediaFolders.folders : [],
    media_usage: buildMediaUsage({ media, lessons, units, classes }),
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
