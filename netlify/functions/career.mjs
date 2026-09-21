import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { assembleCareerOverview } from './_shared/career-overview.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';
import { createApplicationRepository } from './_shared/application-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';

export const config = { path: '/api/career' };

export function createCareerHandler(deps = {}) {
  const careerNow = deps.careerNow ?? (() => new Date().toISOString());
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      try {
        const overview = await assembleCareerOverview({
          professionalStore: store,
          universalStore: await getUniversalLinkStore(),
          env,
          resolveEntity,
          createUniversalLinkRepository:
            deps.createUniversalLinkRepository ?? createUniversalLinkRepository,
          createApplicationRepository:
            deps.createApplicationRepository ?? createApplicationRepository,
          createEventRepository: deps.createEventRepository ?? createEventRepository,
          now: careerNow
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
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createCareerHandler();
