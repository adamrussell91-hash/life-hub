import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { getKnowledgePage, readKnowledgePageId } from './_shared/knowledge-data.mjs';
import {
  LIVE_WORKOUT_TOKEN,
  defaultLoadDecisionTraces,
  defaultLoadWorkoutCompare,
  enrichKnowledgePage
} from './_shared/knowledge-live.mjs';
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
      const body = typeof page.body === 'string' ? page.body : '';
      const connected = Array.isArray(page.connected) ? page.connected : [];
      let compare = { ok: false };
      let traces = [];
      if (body.includes(LIVE_WORKOUT_TOKEN)) {
        const loadCompare = deps.loadWorkoutCompare ?? defaultLoadWorkoutCompare;
        try {
          compare = await loadCompare({ env, fetchImpl: deps.fetchImpl, page }) ?? { ok: false };
        } catch {
          compare = { ok: false };
        }
      }
      if (connected.some(item => String(item).startsWith('life:decision:'))) {
        const loadTraces = deps.loadDecisionTraces ?? defaultLoadDecisionTraces;
        try {
          traces = await loadTraces({ env, fetchImpl: deps.fetchImpl, page }) ?? [];
        } catch {
          traces = [];
        }
      }
      return withCors(okResponse(200, enrichKnowledgePage(page, { compare, traces })), request, env);
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
