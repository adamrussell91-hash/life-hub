import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import {
  classKey,
  draftLessonKey,
  getJSON,
  listJSON,
  PUBLISHED_LESSON_PREFIX,
  readPublishedId,
  scopeSequenceKey,
  subjectKey,
  UNIT_PREFIX
} from './_shared/teaching-blobs.mjs';
import { filterBlocksForStudent } from './_shared/teaching-student.mjs';
import { publicLineStops, publicNetworkLines } from './_shared/teaching-network.mjs';

/**
 * The year network for a class site: the subject's lines and its units in
 * scope order, limited to units with at least one published lesson. Each unit
 * carries only line ids and depth from its published lessons, never lesson
 * content or unpublished titles.
 */
export const config = { path: '/api/published/networks/:id' };

function scopeOrder(scope) {
  const order = new Map();
  const items = Array.isArray(scope?.timeline_items) ? scope.timeline_items : [];
  [...items]
    .filter(item => item?.kind === 'unit' && typeof item.unit_id === 'string')
    .sort((a, b) => (a.start_week ?? 0) - (b.start_week ?? 0) || (a.order ?? 0) - (b.order ?? 0))
    .forEach((item, i) => { if (!order.has(item.unit_id)) order.set(item.unit_id, i); });
  return order;
}

function railLineIds(blocks) {
  const ids = new Set();
  for (const block of filterBlocksForStudent(Array.isArray(blocks) ? blocks : [])) {
    if (block?.block_type !== 'curriculum_lines' || block.content?.version !== 2) continue;
    for (const stop of block.content.rail_stops ?? []) {
      if (typeof stop?.line_id === 'string') ids.add(stop.line_id);
    }
  }
  return [...ids];
}

export function createPublishedNetworkHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    const id = readPublishedId(request, context);
    const cls = id ? await getJSON(store, classKey(id)) : null;
    if (!cls || cls.status !== 'active') {
      return withCors(errorResponse(404, 'not_found', 'Class not found', false), request, env);
    }
    const subject = typeof cls.subject_id === 'string' ? await getJSON(store, subjectKey(cls.subject_id)) : null;
    const lines = publicNetworkLines(subject?.network_lines);
    if (!subject || isDeletedRecord(subject) || !lines.length) {
      return withCors(okResponse(200, { lines: [], units: [], nudges: {} }), request, env);
    }

    const scope = typeof subject.scope_id === 'string' ? await getJSON(store, scopeSequenceKey(subject.scope_id)) : null;
    const order = scopeOrder(scope);
    const units = (await listJSON(store, UNIT_PREFIX))
      .filter(unit => unit?.id && unit.subject_id === subject.id && !isDeletedRecord(unit) && unit.status !== 'archived')
      .filter(unit => order.size === 0 || order.has(unit.id))
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || String(a.title).localeCompare(String(b.title)));

    const { blobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
    const published = new Set(blobs.map(blob => blob.key.slice(PUBLISHED_LESSON_PREFIX.length)));

    const out = [];
    for (const unit of units) {
      const lessonIds = (Array.isArray(unit.lesson_ids) ? unit.lesson_ids : []).filter(lessonId => published.has(lessonId));
      const lessons = [];
      for (const lessonId of lessonIds) {
        const draft = await getJSON(store, draftLessonKey(lessonId));
        if (!draft || isDeletedRecord(draft)) continue;
        const stops = publicLineStops(draft.line_stops);
        lessons.push({ id: lessonId, ...(stops.length ? { line_stops: stops } : {}) });
      }
      if (!lessons.length) continue;
      out.push({
        id: unit.id,
        title: typeof unit.title === 'string' ? unit.title : 'Unit',
        lesson_ids: lessons.map(lesson => lesson.id),
        lessons,
        rail_line_ids: railLineIds(unit.blocks)
      });
    }

    const nudges = {};
    for (const [key, value] of Object.entries(subject.network_nudges ?? {})) {
      if (out.some(unit => unit.id === key) && Number.isFinite(value?.dx) && Number.isFinite(value?.dy)) {
        nudges[key] = { dx: value.dx, dy: value.dy };
      }
    }
    return withCors(okResponse(200, { lines, units: out, nudges }), request, env);
  }, deps);
}

export default createPublishedNetworkHandler();
