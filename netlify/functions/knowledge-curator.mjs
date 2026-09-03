import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import {
  applyCuratorAction,
  curatorBound,
  dispatchCurator,
  loadCuratorQueue
} from './_shared/knowledge-curator.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/curator' };

function knowledgeError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const code = typeof error?.code === 'string' ? error.code : 'curator_failed';
  const message = status === 400
    ? error.message
    : status === 409
      ? 'save collided, try again'
      : status === 503
        ? error.message
        : error?.message || 'Curator failed';
  return errorResponse(status, code, message, status >= 500);
}

export function createKnowledgeCuratorHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (!curatorBound(env)) {
      return withCors(errorResponse(503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.', true), request, env);
    }
    if (request.method === 'GET') {
      try {
        const { pending } = await loadCuratorQueue({ env, fetchImpl: deps.fetchImpl });
        return withCors(okResponse(200, { pending }), request, env);
      } catch (error) {
        return withCors(knowledgeError(error), request, env);
      }
    }
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const action = typeof parsed.value?.action === 'string' ? parsed.value.action : '';
    const id = typeof parsed.value?.id === 'string' ? parsed.value.id : undefined;
    try {
      if (action === 'run') {
        await dispatchCurator({ env, fetchImpl: deps.fetchImpl });
        return withCors(okResponse(200, { status: 'queued' }), request, env);
      }
      const result = await applyCuratorAction({
        action,
        id,
        env,
        fetchImpl: deps.fetchImpl,
        nowIso: deps.nowIso
      });
      return withCors(okResponse(200, result), request, env);
    } catch (error) {
      return withCors(knowledgeError(error), request, env);
    }
  }, deps);
}

export default createKnowledgeCuratorHandler();
