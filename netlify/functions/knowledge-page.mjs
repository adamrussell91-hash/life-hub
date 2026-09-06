import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { getKnowledgePage, readKnowledgePageId } from './_shared/knowledge-data.mjs';
import { defaultLoadInverseLinks, normalizeInverseLinks } from './_shared/inverse-links.mjs';
import {
  LIVE_WORKOUT_TOKEN,
  defaultLoadDecisionTraces,
  defaultLoadWorkoutCompare,
  enrichKnowledgePage,
  loadLifeRepo,
  normalizeDecisionTraces
} from './_shared/knowledge-live.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { defaultLoadUrlWatches, extractWatchUrls, normalizeUrlWatchStatus } from './_shared/url-watch.mjs';

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
      const needsWatches = extractWatchUrls(body).length > 0;
      let compare = { ok: false };
      let traces = [];
      let tracesStatus = 'ready';
      let inverseLinks = [];
      let inverseStatus = 'ready';
      let urlWatches = [];
      let urlWatchStatus = 'ready';
      let lifeRepo;
      const usingDefaultLife = !deps.loadWorkoutCompare && !deps.loadDecisionTraces && !deps.loadUrlWatches;
      if (usingDefaultLife && (needsCompare || needsTraces || needsWatches)) {
        try {
          lifeRepo = await loadLifeRepo({ env, fetchImpl: deps.fetchImpl });
        } catch {
          if (needsTraces) tracesStatus = 'unavailable';
          if (needsWatches) urlWatchStatus = 'unavailable';
        }
      }
      const runLife = !usingDefaultLife || Boolean(lifeRepo);
      const jobs = [];
      if (runLife && needsCompare) {
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
      if (runLife && needsTraces) {
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
      if (runLife && needsWatches) {
        const loadWatches = deps.loadUrlWatches ?? defaultLoadUrlWatches;
        jobs.push((async () => {
          try {
            const loaded = normalizeUrlWatchStatus(await loadWatches({
              env,
              fetchImpl: deps.fetchImpl,
              page,
              ...(lifeRepo ? { lifeRepo } : {})
            }));
            urlWatches = loaded.watches;
            urlWatchStatus = loaded.status;
          } catch {
            urlWatches = [];
            urlWatchStatus = 'unavailable';
          }
        })());
      }
      jobs.push((async () => {
        const loadInverse = deps.loadInverseLinks ?? defaultLoadInverseLinks;
        try {
          const loaded = normalizeInverseLinks(await loadInverse({
            env,
            fetchImpl: deps.fetchImpl,
            page
          }));
          inverseLinks = loaded.links;
          inverseStatus = loaded.status;
        } catch {
          inverseLinks = [];
          inverseStatus = 'unavailable';
        }
      })());
      await Promise.all(jobs);
      return withCors(okResponse(200, enrichKnowledgePage(page, {
        compare,
        traces,
        tracesStatus,
        inverseLinks,
        inverseStatus,
        urlWatches,
        urlWatchStatus
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
