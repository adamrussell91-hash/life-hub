import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  assembleEntityOverview,
  defaultGetUniversalLinkStore
} from './_shared/entity-overview.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';

export const config = { path: '/api/entities/overview' };

export function createEntityOverviewHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      const url = new URL(request.url);
      const raw = url.searchParams.get('ref');
      if (!raw) {
        return withCors(errorResponse(400, 'missing_ref', 'ref query param required.', false), request, env);
      }

      try {
        const overview = await assembleEntityOverview(raw, {
          store,
          resolveEntity,
          createRepository
        });
        return withCors(okResponse(200, overview), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message =
          typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(errorResponse(status, code, message, status === 503), request, env);
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

export default createEntityOverviewHandler();
