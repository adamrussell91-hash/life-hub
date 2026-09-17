import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { assembleHistoryGraph } from './_shared/network-ecology-history.mjs';

// Network Ecology History mode (Phase 4, Feature 4.6). `GET
// /api/network-ecology/history?date=<ISO date>`. GET-only. See
// `_shared/network-ecology-history.mjs` for the full design note,
// especially the Privacy/Visibility and event-cluster scoping sections.
export const config = { path: '/api/network-ecology/history' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

function missingDateError() {
  return Object.assign(new Error('A date query parameter is required.'), { status: 400, code: 'missing_date' });
}

export function createNetworkEcologyHistoryHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity;
  const createRepository = deps.createRepository;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      const url = new URL(request.url);
      const dateParam = url.searchParams.get('date') ?? '';

      try {
        if (!dateParam) throw missingDateError();
        const history = await assembleHistoryGraph(dateParam, {
          store,
          resolveEntity,
          createRepository,
          now: now(),
          loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
        });
        return withCors(okResponse(200, history), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createNetworkEcologyHistoryHandler();
