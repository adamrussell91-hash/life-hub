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
  enrichKnowledgePage,
  loadLifeRepo,
  normalizeDecisionTraces
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
      const needsCompare = body.includes(LIVE_WORKOUT_TOKEN);
      const needsTraces = connected.some(item => String(item).startsWith('life:decision:'));
      let compare = { ok: false };
      let traces = [];
      let tracesStatus = 'ready';
      let lifeRepo;
      const usingDefaultLoaders = !deps.loadWorkoutCompare && !deps.loadDecisionTraces;
      if (usingDefaultLoaders && (needsCompare || needsTraces)) {
        try {
          lifeRepo = await loadLifeRepo({ env, fetchImpl: deps.fetchImpl });
        } catch {
          if (needsTraces) tracesStatus = 'unavailable';
        }
      }
      const runLoaders = !usingDefaultLoaders || Boolean(lifeRepo);
      const jobs = [];
      if (runLoaders && needsCompare) {
        const loadCompare = deps.loadWorkoutCompare ?? defaultLoadWorkoutCompare;
        jobs.push((async () => {
          try {
            compare = await loadCompare({
              env,
              fetchImpl: deps.fetchImpl,
              page,
              ...(lifeRepo ? { lifeRepo } : {})
            }) ?? { ok: false };
          } catch {
            compare = { ok: false };
          }
        })());
      }
      if (runLoaders && needsTraces) {
        const loadTraces = deps.loadDecisionTraces ?? defaultLoadDecisionTraces;
        jobs.push((async () => {
          try {
            const loaded = normalizeDecisionTraces(await loadTraces({
              env,
              fetchImpl: deps.fetchImpl,
              page,
              ...(lifeRepo ? { lifeRepo } : {})
            }));
            traces = loaded.traces;
            tracesStatus = loaded.status;
          } catch {
            traces = [];
            tracesStatus = 'unavailable';
          }
        })());
      }
      await Promise.all(jobs);
      return withCors(okResponse(200, enrichKnowledgePage(page, {
        compare,
        traces,
        tracesStatus
      })), request, env);
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
