import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  classKey,
  compositionKey,
  draftLessonKey,
  getJSON,
  lessonTemplateKey,
  mediaKey,
  readPublishedId,
  setJSON,
  unitKey,
  unitTemplateKey
} from './_shared/teaching-blobs.mjs';

export const config = {
  path: [
    '/api/lessons/:id/restore-from-trash',
    '/api/units/:id/restore-from-trash',
    '/api/classes/:id/restore-from-trash',
    '/api/media/:id/restore-from-trash',
    '/api/lesson-templates/:id/restore-from-trash',
    '/api/unit-templates/:id/restore-from-trash',
    '/api/compositions/:id/restore-from-trash',
    '/api/lessons/:id/dependencies',
    '/api/units/:id/dependencies',
    '/api/classes/:id/dependencies',
    '/api/media/:id/dependencies',
    '/api/lesson-templates/:id/dependencies',
    '/api/unit-templates/:id/dependencies',
    '/api/compositions/:id/dependencies'
  ]
};

const KEY_FOR = {
  lessons: draftLessonKey,
  units: unitKey,
  classes: classKey,
  media: mediaKey,
  'lesson-templates': lessonTemplateKey,
  'unit-templates': unitTemplateKey,
  compositions: compositionKey
};

export function collectionFromPath(pathname) {
  const match = String(pathname).match(
    /^\/api\/(lessons|units|classes|media|lesson-templates|unit-templates|compositions)\//
  );
  return match?.[1] ?? null;
}

export function createRestoreFromTrashHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const pathname = new URL(request.url).pathname;
    const collection = collectionFromPath(pathname);
    const id = readPublishedId(request, context);
    const keyFor = collection ? KEY_FOR[collection] : null;
    if (!id || !keyFor) {
      return withCors(errorResponse(404, 'not_found', 'Not found', false), request, env);
    }

    if (pathname.endsWith('/dependencies')) {
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }
      return withCors(okResponse(200, { dependencies: [] }), request, env);
    }

    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const record = await getJSON(store, keyFor(id));
    if (!record) {
      return withCors(errorResponse(404, 'not_found', 'Not found', false), request, env);
    }
    if (record.status !== 'trashed') {
      return withCors(errorResponse(400, 'not_trashed', 'Item is not in trash', false), request, env);
    }
    const next = {
      ...record,
      status: record.previous_status === 'archived' ? 'archived' : 'active',
      updated_at: new Date().toISOString()
    };
    delete next.trashed_at;
    delete next.previous_status;
    await setJSON(store, keyFor(id), next);
    return withCors(okResponse(200, next), request, env);
  }, deps);
}

export default createRestoreFromTrashHandler();
