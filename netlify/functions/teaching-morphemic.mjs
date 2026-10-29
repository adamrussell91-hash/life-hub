/**
 * Morphemic matrices for the teacher (see _shared/morphemic-matrix.mjs).
 *
 *   POST   /api/morphemic                { word }  the word's matrix, building it first if no one has
 *   GET    /api/morphemic/job/:key                 poll a build
 *   GET    /api/morphemic/matrices                 the shared library, newest first, for review
 *   PATCH  /api/morphemic/matrices/:id   { words?, meaning?, status? }  edit or tick as checked
 *   DELETE /api/morphemic/matrices/:id             remove it, so the next request builds it fresh
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { deleteMatrix, listMatrices, normaliseMatrixWord, updateMatrix } from './_shared/morphemic-matrix.mjs';
import { findOrBuildMatrix, readMatrixJob } from './_shared/morphemic-routes.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { kickTextToolRun as defaultKick } from './_shared/text-tools.mjs';
import { TEXT_TOOLS_RUN_PATH } from './teaching-text-tools.mjs';

export const config = {
  path: ['/api/morphemic', '/api/morphemic/job/:key', '/api/morphemic/matrices', '/api/morphemic/matrices/:id']
};

function route(request) {
  const path = new URL(request.url).pathname;
  const job = path.match(/\/api\/morphemic\/job\/([^/]+)$/);
  if (job) return { kind: 'job', key: decodeURIComponent(job[1]) };
  const one = path.match(/\/api\/morphemic\/matrices\/([^/]+)$/);
  if (one) return { kind: 'matrix', id: decodeURIComponent(one[1]) };
  if (/\/api\/morphemic\/matrices\/?$/.test(path)) return { kind: 'matrices' };
  return { kind: 'word' };
}

export function createMorphemicHandler(deps = {}) {
  const kick = deps.kickTextToolRun ?? defaultKick;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const target = route(request);

    if (target.kind === 'job') {
      if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      const view = await readMatrixJob(store, target.key);
      if (!view) return withCors(errorResponse(404, 'not_found', 'That build has expired. Try again.', false), request, env);
      return withCors(okResponse(200, view), request, env);
    }
    if (target.kind === 'matrices') {
      if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      return withCors(okResponse(200, { matrices: await listMatrices(store) }), request, env);
    }
    if (target.kind === 'matrix') {
      if (request.method === 'PATCH') {
        const body = await request.json().catch(() => null);
        const matrix = await updateMatrix(store, target.id, body ?? {});
        if (!matrix) return withCors(errorResponse(404, 'not_found', 'Matrix not found', false), request, env);
        return withCors(okResponse(200, { matrix }), request, env);
      }
      if (request.method === 'DELETE') {
        const removed = await deleteMatrix(store, target.id);
        if (!removed) return withCors(errorResponse(404, 'not_found', 'Matrix not found', false), request, env);
        return withCors(okResponse(200, { removed: true }), request, env);
      }
      return withCors(methodNotAllowed('PATCH, DELETE, OPTIONS'), request, env);
    }

    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const body = await request.json().catch(() => null);
    const word = normaliseMatrixWord(body?.word);
    if (!word) return withCors(errorResponse(400, 'validation_error', 'word must be a word or short phrase', false), request, env);
    const view = await findOrBuildMatrix({ request, store, env, word, runPath: TEXT_TOOLS_RUN_PATH, kick, fetchImpl: deps.fetchImpl, now: deps.now });
    return withCors(okResponse(200, view), request, env);
  }, deps);
}

export default createMorphemicHandler();
