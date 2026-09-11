import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetStarsStore,
  getConstellation,
  listConstellations,
  saveConstellation
} from './_shared/knowledge-stars.mjs';

export const config = { path: '/api/knowledge/stars' };

export function createKnowledgeStarsHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    try {
      const store = await (deps.getStore ?? defaultGetStarsStore)(env);
      if (request.method === 'GET') {
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return withCors(okResponse(200, { constellations: await listConstellations(store) }), request, env);
        const constellation = await getConstellation(store, id);
        if (!constellation) return withCors(errorResponse(404, 'not_found', 'Constellation not found.', false), request, env);
        return withCors(okResponse(200, { constellation }), request, env);
      }
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const constellation = await saveConstellation(store, parsed.value, {
        id: deps.id?.(),
        now: deps.now?.()
      });
      return withCors(okResponse(201, { constellation }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'stars_unavailable';
      const message = status < 500 ? error.message : 'Stars storage is unavailable.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgeStarsHandler();
