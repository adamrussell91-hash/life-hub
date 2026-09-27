import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import {
  buildAndStoreWorldSnapshot,
  claimWorldBuild,
  defaultInvokeWorldBuild,
  isSnapshotFresh,
  readWorldSnapshot
} from './_shared/network-ecology-snapshot.mjs';

// Network Ecology world graph (Phase 4, Features 4.1-data/4.2/4.5-text).
// GET-only. See `_shared/network-ecology-world.mjs` for the full design
// note, especially the Privacy/Visibility section.
//
// Served from a Blob snapshot (`_shared/network-ecology-snapshot.mjs`):
// synchronous functions here are cut at 10s, which a cold full-graph build
// does not reliably fit. A stale snapshot is returned immediately and a
// background rebuild is kicked; with no snapshot yet, a live build gets
// LIVE_BUILD_BUDGET_MS before the response becomes 202 `world_building`
// (the SPA polls).
export const config = { path: '/api/network-ecology/world' };

const LIVE_BUILD_BUDGET_MS = 6_000;
const BUDGET_EXCEEDED = Symbol('budget_exceeded');

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createNetworkEcologyWorldHandler(deps = {}) {
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const resolveEntity = deps.resolveEntity;
  const createRepository = deps.createRepository;
  const now = deps.now ?? (() => new Date());
  const invokeBuild = deps.invokeWorldBuild ?? ((request) => defaultInvokeWorldBuild(request, deps.fetchImpl));
  const liveBuildBudgetMs = deps.liveBuildBudgetMs ?? LIVE_BUILD_BUDGET_MS;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      let professionalStore;
      try {
        professionalStore = await getProfessionalStore();
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
      const nowDate = now();
      const nowMs = nowDate.getTime();

      async function kickBuild() {
        try {
          if (await claimWorldBuild(professionalStore, nowMs)) {
            await invokeBuild(request);
          }
        } catch (error) {
          console.error('network-ecology world build kick failed', error);
        }
      }

      let snapshot = null;
      try {
        snapshot = await readWorldSnapshot(professionalStore);
      } catch {
        snapshot = null;
      }

      if (snapshot) {
        if (!isSnapshotFresh(snapshot, nowMs)) await kickBuild();
        return withCors(okResponse(200, { ...snapshot.world, built_at: snapshot.built_at }), request, env);
      }

      const live = buildAndStoreWorldSnapshot({
        store,
        professionalStore,
        env,
        fetchImpl: deps.fetchImpl,
        resolveEntity,
        createRepository,
        now: nowDate,
        loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
      });
      let timer;
      const budget = new Promise((resolve) => {
        timer = setTimeout(() => resolve(BUDGET_EXCEEDED), liveBuildBudgetMs);
      });
      try {
        const built = await Promise.race([live, budget]);
        if (built !== BUDGET_EXCEEDED) {
          return withCors(okResponse(200, { ...built.world, built_at: built.built_at }), request, env);
        }
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      } finally {
        clearTimeout(timer);
      }

      live.catch(() => {});
      await kickBuild();
      return withCors(
        errorResponse(202, 'world_building', 'Your network map is still being built.', true),
        request,
        env
      );
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createNetworkEcologyWorldHandler();
