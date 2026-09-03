import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { getKnowledgePage, readKnowledgePageId } from './_shared/knowledge-data.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/knowledge/pages/:id' };

export function createKnowledgePageHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    const id = readKnowledgePageId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Page not found', false), request, env);
    }
    try {
      const page = await getKnowledgePage(id, { env, fetchImpl: deps.fetchImpl });
      if (!page) {
        return withCors(errorResponse(404, 'not_found', 'Page not found', false), request, env);
      }
      return withCors(okResponse(200, page), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'github_unavailable';
      const message = status === 503
        ? 'Knowledge data repository is not bound.'
        : 'Knowledge data repository is unavailable.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgePageHandler();
