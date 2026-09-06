import { methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { defaultLoadInverseLinks, normalizeInverseLinks } from './_shared/inverse-links.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/knowledge/backlinks' };

export function createKnowledgeBacklinksHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    try {
      const loadInverse = deps.loadInverseLinks ?? defaultLoadInverseLinks;
      const loaded = normalizeInverseLinks(await loadInverse({
        env,
        fetchImpl: deps.fetchImpl
      }));
      return withCors(okResponse(200, {
        groups: loaded.groups,
        status: loaded.status
      }), request, env);
    } catch {
      return withCors(okResponse(200, {
        groups: [],
        status: 'unavailable'
      }), request, env);
    }
  }, deps);
}

export default createKnowledgeBacklinksHandler();
