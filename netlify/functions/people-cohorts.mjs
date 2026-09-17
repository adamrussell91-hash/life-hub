import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { loadAllPeopleWithRelationships } from './_shared/people-collection.mjs';
import { computeDynamicCohorts } from './_shared/people-cohorts.mjs';

// Dynamic Cohorts data layer (Phase 2, Feature 2.4). GET-only.
export const config = { path: '/api/people/cohorts' };

export function createPeopleCohortsHandler(deps = {}) {
  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const resolveEntity = deps.resolveEntity;
  const createRepository = deps.createRepository;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      try {
        const peopleWithRelationships = await loadPeople({ store, now: now(), resolveEntity, createRepository });
        const cohorts = computeDynamicCohorts(peopleWithRelationships);
        return withCors(okResponse(200, { cohorts }), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
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

export default createPeopleCohortsHandler();
