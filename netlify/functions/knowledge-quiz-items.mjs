import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { getQuizItems, isSafeKnowledgePageId } from './_shared/knowledge-data.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/knowledge/quiz/:pageId' };

export function readKnowledgeQuizPageId(request, context = {}) {
  if (isSafeKnowledgePageId(context.params?.pageId)) return context.params.pageId;
  const match = new URL(request.url).pathname.match(/\/api\/knowledge\/quiz\/(?:items\/)?([^/]+)$/);
  return match && isSafeKnowledgePageId(match[1]) ? match[1] : '';
}

export function createKnowledgeQuizItemsHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    const pageId = readKnowledgeQuizPageId(request, context);
    if (!pageId) {
      return withCors(errorResponse(400, 'validation_error', 'Invalid page id', false), request, env);
    }
    try {
      const items = await getQuizItems(pageId, { env, fetchImpl: deps.fetchImpl });
      return withCors(okResponse(200, { items }), request, env);
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

export default createKnowledgeQuizItemsHandler();
