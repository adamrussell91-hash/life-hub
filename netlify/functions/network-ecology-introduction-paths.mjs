import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { assembleIntroductionPaths } from './_shared/network-ecology-world.mjs';

// Introduction Paths (Phase 4, Feature 4.5 — plain-text chain version
// only, see `_shared/introduction-paths.mjs`'s doc comment for the
// Sankey-deferral note). `GET /api/network-ecology/introduction-paths?from=<ref>&to=<ref>`.
// GET-only.
export const config = { path: '/api/network-ecology/introduction-paths' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

function missingRefError(which) {
  return Object.assign(new Error(`A ${which} query parameter is required.`), {
    status: 400,
    code: `missing_${which}`
  });
}

export function createNetworkEcologyIntroductionPathsHandler(deps = {}) {
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
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';

      try {
        if (!from) throw missingRefError('from');
        if (!to) throw missingRefError('to');
        const paths = await assembleIntroductionPaths(from, to, {
          store,
          resolveEntity,
          createRepository,
          now: now(),
          loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
        });
        return withCors(okResponse(200, { paths }), request, env);
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

export default createNetworkEcologyIntroductionPathsHandler();
