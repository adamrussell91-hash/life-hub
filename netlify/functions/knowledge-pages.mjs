import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import {
  listKnowledgePages,
  replaceKnowledgePageRelationships,
  saveKnowledgePage
} from './_shared/knowledge-data.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/pages' };

function knowledgeError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const code = typeof error?.code === 'string' ? error.code : 'github_unavailable';
  const message = status === 400
    ? error.message
    : status === 409 && error?.data?.retryable
      ? error.message
      : status === 409
        ? 'save collided, try again'
        : status === 503
          ? (code === 'knowledge_ul_unavailable' || code === 'universal_link_blobs_unbound'
            ? 'Universal Link store is unavailable for Knowledge relationship cutover.'
            : 'Knowledge data repository is not bound.')
          : 'Knowledge data repository is unavailable.';
  return errorResponse(status, code, message, status >= 500, {}, error?.data);
}

export function createKnowledgePagesHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method === 'GET') {
      try {
        const pages = await listKnowledgePages({ env, fetchImpl: deps.fetchImpl });
        return withCors(okResponse(200, pages), request, env);
      } catch (error) {
        return withCors(knowledgeError(error), request, env);
      }
    }
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
      if (action === 'replace-relationships') {
        const page = await replaceKnowledgePageRelationships(parsed.value, {
          env,
          fetchImpl: deps.fetchImpl,
          applyRelationshipCutover: deps.applyRelationshipCutover
        });
        return withCors(okResponse(200, { page, relationships_replaced: true }), request, env);
      }
      if (action) {
        return withCors(
          errorResponse(400, 'invalid_action', 'Unsupported action.', false),
          request,
          env
        );
      }
      const saved = await saveKnowledgePage(parsed.value, {
        env,
        fetchImpl: deps.fetchImpl
      });
      return withCors(okResponse(200, saved), request, env);
    } catch (error) {
      return withCors(knowledgeError(error), request, env);
    }
  }, deps);
}

export default createKnowledgePagesHandler();
