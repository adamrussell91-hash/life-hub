import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { applyScheduleUnit } from './_shared/teaching-schedule.mjs';
import {
  classKey,
  getJSON,
  listJSON,
  SCHEDULED_LESSON_PREFIX,
  scheduledLessonKey,
  setJSON,
  unitKey
} from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/classes/:classId/schedule-unit' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readClassId(request, context = {}) {
  if (typeof context.params?.classId === 'string' && context.params.classId) {
    return context.params.classId;
  }
  const match = new URL(request.url).pathname.match(/\/api\/classes\/([^/]+)\/schedule-unit$/);
  return match?.[1] ?? '';
}

function parseMeetingDays(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) return { error: 'meeting_days must be a non-empty array when provided' };
  const days = [];
  for (const day of value) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return { error: 'meeting_days must contain integers from 1 to 7' };
    }
    days.push(day);
  }
  return { days };
}

export function createScheduleUnitHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const classId = readClassId(request, context);
    if (!classId) {
      return withCors(errorResponse(404, 'not_found', 'Class not found', false), request, env);
    }

    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);

    const unit_id = typeof parsed.value.unit_id === 'string' ? parsed.value.unit_id.trim() : '';
    const start_date = typeof parsed.value.start_date === 'string' ? parsed.value.start_date.trim() : '';
    if (!unit_id || !DATE_RE.test(start_date)) {
      return withCors(
        errorResponse(400, 'validation_error', 'unit_id and start_date (YYYY-MM-DD) are required', false),
        request,
        env
      );
    }

    const meetingParsed = parseMeetingDays(parsed.value.meeting_days);
    if (meetingParsed?.error) {
      return withCors(errorResponse(400, 'validation_error', meetingParsed.error, false), request, env);
    }

    const cls = await getJSON(store, classKey(classId));
    if (!cls || typeof cls !== 'object' || Array.isArray(cls)) {
      return withCors(errorResponse(404, 'not_found', 'Class not found', false), request, env);
    }
    const unit = await getJSON(store, unitKey(unit_id));
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
      return withCors(errorResponse(404, 'not_found', 'Unit not found', false), request, env);
    }
    if (unit.subject_id && cls.subject_id && unit.subject_id !== cls.subject_id) {
      return withCors(
        errorResponse(400, 'subject_mismatch', 'Unit subject does not match class subject', false),
        request,
        env
      );
    }
    if (!Array.isArray(unit.lesson_ids) || unit.lesson_ids.length === 0) {
      return withCors(errorResponse(400, 'no_lessons', 'Unit has no lessons', false), request, env);
    }

    const meetingDays = meetingParsed?.days ?? cls.meeting_days ?? [1, 2, 3, 4, 5];
    const existing = (await listJSON(store, SCHEDULED_LESSON_PREFIX))
      .filter(row => row.class_id === classId);
    const nowIso = new Date().toISOString();
    const result = applyScheduleUnit({
      cls,
      unit,
      existing,
      startDate: start_date,
      meetingDays,
      nowIso,
      idFactory: lessonId => `scheduled_${classId}_${lessonId}`
    });
    if (!result.ok) {
      return withCors(errorResponse(400, result.code, result.message, false), request, env);
    }

    for (const created of result.created) {
      if (await getJSON(store, scheduledLessonKey(created.id))) {
        return withCors(
          errorResponse(409, 'conflict', `Scheduled lesson id already exists: ${created.id}`, false),
          request,
          env
        );
      }
    }

    await setJSON(store, classKey(classId), result.class);
    for (const created of result.created) {
      await setJSON(store, scheduledLessonKey(created.id), created);
    }
    return withCors(okResponse(200, { class: result.class, scheduled_lessons: result.created }), request, env);
  }, deps);
}

export default createScheduleUnitHandler();
