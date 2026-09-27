import { errorResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { buildAndStoreWorldSnapshot, releaseWorldBuild } from './_shared/network-ecology-snapshot.mjs';

// Background rebuild of the Network Ecology world snapshot (15 minute
// cap). Kicked by `/api/network-ecology/world` when its snapshot is stale
// or missing — see `_shared/network-ecology-snapshot.mjs`.
export const config = { path: '/api/network-ecology/world-build', background: true };

export function createNetworkEcologyWorldBuildHandler(deps = {}) {
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      }
      const professionalStore = await getProfessionalStore();
      try {
        await buildAndStoreWorldSnapshot({
          store,
          professionalStore,
          env,
          fetchImpl: deps.fetchImpl,
          resolveEntity: deps.resolveEntity,
          createRepository: deps.createRepository,
          now: now(),
          loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
        });
      } catch (error) {
        console.error('network-ecology-world-build failed', error);
        return withCors(errorResponse(500, 'internal_error', 'World build failed.', true), request, env);
      } finally {
        await releaseWorldBuild(professionalStore).catch(() => {});
      }
      return withCors(new Response(null, { status: 202 }), request, env);
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createNetworkEcologyWorldBuildHandler();
