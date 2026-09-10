import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  CLASS_PREFIX,
  COMPOSITION_PREFIX,
  DEFAULT_SCHEDULE_ANCHOR_DATE,
  DRAFT_LESSON_PREFIX,
  LESSON_TEMPLATE_PREFIX,
  MEDIA_PREFIX,
  OUTCOME_PREFIX,
  SCHEDULED_LESSON_PREFIX,
  SCOPE_SEQUENCE_PREFIX,
  SUBJECT_PREFIX,
  UNIT_PREFIX,
  UNIT_TEMPLATE_PREFIX,
  YEAR_PREFIX,
  draftLessonKey,
  getJSON,
  listJSON,
  scheduleAnchorKey,
  unitKey
} from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/export' };

function envelope(kind, created_at, objects, rest) {
  return {
    product: 'Teaching Hub',
    export_version: 1,
    kind,
    created_at,
    schema_version: 1,
    objects,
    ...rest
  };
}

export function createExportHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    const id = url.searchParams.get('id');
    const created_at = new Date().toISOString();

    if (kind === 'lesson') {
      if (!id) {
        return withCors(errorResponse(400, 'validation_error', 'id is required', false), request, env);
      }
      const lesson = await getJSON(store, draftLessonKey(id));
      if (!lesson) {
        return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
      }
      return withCors(okResponse(200, envelope('lesson', created_at, { lessons: 1 }, { lesson })), request, env);
    }

    if (kind === 'unit') {
      if (!id) {
        return withCors(errorResponse(400, 'validation_error', 'id is required', false), request, env);
      }
      const unit = await getJSON(store, unitKey(id));
      if (!unit) {
        return withCors(errorResponse(404, 'not_found', 'Unit not found', false), request, env);
      }
      const lessons = (
        await Promise.all((unit.lesson_ids ?? []).map(lessonId => getJSON(store, draftLessonKey(lessonId))))
      ).filter(Boolean);
      return withCors(
        okResponse(200, envelope('unit', created_at, { units: 1, lessons: lessons.length }, { unit, lessons })),
        request,
        env
      );
    }

    if (kind === 'archive') {
      const [
        years,
        subjects,
        units,
        lessons,
        classes,
        scheduled_lessons,
        scope_sequences,
        media,
        outcomes,
        compositions,
        lesson_templates,
        unit_templates,
        anchor
      ] = await Promise.all([
        listJSON(store, YEAR_PREFIX),
        listJSON(store, SUBJECT_PREFIX),
        listJSON(store, UNIT_PREFIX),
        listJSON(store, DRAFT_LESSON_PREFIX),
        listJSON(store, CLASS_PREFIX),
        listJSON(store, SCHEDULED_LESSON_PREFIX),
        listJSON(store, SCOPE_SEQUENCE_PREFIX),
        listJSON(store, MEDIA_PREFIX),
        listJSON(store, OUTCOME_PREFIX),
        listJSON(store, COMPOSITION_PREFIX),
        listJSON(store, LESSON_TEMPLATE_PREFIX),
        listJSON(store, UNIT_TEMPLATE_PREFIX),
        getJSON(store, scheduleAnchorKey())
      ]);
      return withCors(
        okResponse(200, envelope('archive', created_at, {
          years: years.length,
          subjects: subjects.length,
          units: units.length,
          lessons: lessons.length,
          classes: classes.length,
          scheduled_lessons: scheduled_lessons.length,
          scope_sequences: scope_sequences.length,
          media: media.length,
          outcomes: outcomes.length,
          compositions: compositions.length,
          lesson_templates: lesson_templates.length,
          unit_templates: unit_templates.length
        }, {
          years,
          subjects,
          units,
          lessons,
          classes,
          scheduled_lessons,
          scope_sequences,
          media,
          outcomes,
          compositions,
          lesson_templates,
          unit_templates,
          schedule_anchor_date: anchor?.date ?? DEFAULT_SCHEDULE_ANCHOR_DATE
        })),
        request,
        env
      );
    }

    return withCors(
      errorResponse(400, 'validation_error', 'kind must be lesson, unit, or archive', false),
      request,
      env
    );
  }, deps);
}

export default createExportHandler();
