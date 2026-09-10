import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { listKnowledgePages, rankKnowledgePages } from './_shared/knowledge-data.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/knowledge/search' };

export function createKnowledgeSearchHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    try {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      const pages = await listKnowledgePages({ env, fetchImpl: deps.fetchImpl });
      return withCors(okResponse(200, { hits: rankKnowledgePages(pages, q) }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'github_unavailable';
      return withCors(errorResponse(
        status,
        code,
        status === 503 ? 'Knowledge data repository is not bound.' : 'Knowledge data repository is unavailable.',
        status >= 500
      ), request, env);
    }
  }, deps);
}

export default createKnowledgeSearchHandler();
