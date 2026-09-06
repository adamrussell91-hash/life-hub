import { methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { defaultLoadAllUrlWatches, normalizeUrlWatchStatus } from './_shared/url-watch.mjs';

export const config = { path: '/api/knowledge/url-watches' };

export function createKnowledgeUrlWatchesHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    try {
      const loadWatches = deps.loadUrlWatches ?? defaultLoadAllUrlWatches;
      const loaded = normalizeUrlWatchStatus(await loadWatches({
        env,
        fetchImpl: deps.fetchImpl
      }));
      return withCors(okResponse(200, {
        watches: loaded.watches,
        status: loaded.status
      }), request, env);
    } catch {
      return withCors(okResponse(200, {
        watches: [],
        status: 'unavailable'
      }), request, env);
    }
  }, deps);
}

export default createKnowledgeUrlWatchesHandler();
