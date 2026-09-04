import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  CLASS_PREFIX,
  COMPOSITION_PREFIX,
  DRAFT_LESSON_PREFIX,
  LESSON_TEMPLATE_PREFIX,
  MEDIA_PREFIX,
  UNIT_PREFIX,
  UNIT_TEMPLATE_PREFIX,
  listJSON
} from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/trash' };

const TRASH_SOURCES = [
  { type: 'lesson', prefix: DRAFT_LESSON_PREFIX },
  { type: 'unit', prefix: UNIT_PREFIX },
  { type: 'class', prefix: CLASS_PREFIX },
  { type: 'media', prefix: MEDIA_PREFIX },
  { type: 'composition', prefix: COMPOSITION_PREFIX },
  { type: 'lesson_template', prefix: LESSON_TEMPLATE_PREFIX },
  { type: 'unit_template', prefix: UNIT_TEMPLATE_PREFIX }
];

export async function listTrashSummaries(store) {
  const groups = await Promise.all(
    TRASH_SOURCES.map(async source => {
      const entries = await listJSON(store, source.prefix);
      return entries
        .filter(entry => entry.status === 'trashed')
        .map(entry => ({
          type: source.type,
          id: entry.id,
          title: entry.title ?? entry.id,
          trashed_at: entry.trashed_at,
          previous_status: entry.previous_status
        }));
    })
  );
  return groups.flat().sort((a, b) => String(b.trashed_at ?? '').localeCompare(String(a.trashed_at ?? '')));
}

export function createTrashHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    try {
      return withCors(okResponse(200, await listTrashSummaries(store)), request, env);
    } catch {
      return withCors(
        errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true),
        request,
        env
      );
    }
  }, deps);
}

export default createTrashHandler();
