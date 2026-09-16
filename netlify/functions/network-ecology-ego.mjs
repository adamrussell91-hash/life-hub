import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { assembleEgoGraph } from './_shared/network-ecology-world.mjs';

// Network Ecology ego (recentred) subgraph (Phase 4, Feature 4.1 data
// layer). `GET /api/network-ecology/ego?ref=<person ref>&hops=<n>`
// (`hops` optional, default 2). GET-only.
export const config = { path: '/api/network-ecology/ego' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

function missingRefError() {
  return Object.assign(new Error('A ref query parameter is required.'), { status: 400, code: 'missing_ref' });
}

export function createNetworkEcologyEgoHandler(deps = {}) {
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
      const ref = url.searchParams.get('ref') ?? '';
      const hopsParam = url.searchParams.get('hops');
      const parsedHops = hopsParam !== null ? Number(hopsParam) : NaN;
      const hops = Number.isInteger(parsedHops) && parsedHops > 0 ? parsedHops : 2;

      try {
        if (!ref) throw missingRefError();
        const graph = await assembleEgoGraph(ref, {
          store,
          hops,
          resolveEntity,
          createRepository,
          now: now(),
          loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
        });
        return withCors(okResponse(200, graph), request, env);
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

export default createNetworkEcologyEgoHandler();
