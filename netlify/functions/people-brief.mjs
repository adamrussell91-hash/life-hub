import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { assemblePersonBrief } from './_shared/person-brief.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';

// Person Brief route (Phase 3, Feature 3.1). GET-only. Assembles the
// synchronous, non-LLM sections of the Brief reading-sheet — see
// `_shared/person-brief.mjs` for the full section-by-section breakdown and
// why "Since you last spoke"/"Talking points" (Feature 3.2, LLM) are NOT
// assembled here.
//
// Route shape: `/api/people/brief?id=<person id>` — a query param, not a
// path param. Verified against this codebase's convention before choosing:
// `entity-overview.mjs` (`/api/entities/overview?ref=`), `people-home-
// signals.mjs`, `people-activity.mjs`, `people-cohorts.mjs` — every
// Professional route that targets one id uses a query param; none uses
// Netlify path-param routing (`/api/x/:id`) anywhere in this app. This
// follows the established convention rather than introducing a new one.
export const config = { path: '/api/people/brief' };

export function createPeopleBriefHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const createMeetings = deps.createMeetingRepository ?? createMeetingRepository;
  const createEvents = deps.createEventRepository ?? createEventRepository;
  const now = deps.now ?? (() => new Date().toISOString());
  const findActiveSelfPerson = deps.findActiveSelfPerson;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) {
        return withCors(errorResponse(400, 'missing_id', 'id query param required.', false), request, env);
      }

      try {
        const professionalStore = await getProfessionalStore();
        const brief = await assemblePersonBrief(id, {
          universalStore: store,
          professionalStore,
          env,
          resolveEntity,
          createRepository,
          createMeetingRepository: createMeetings,
          createEventRepository: createEvents,
          now,
          ...(findActiveSelfPerson ? { findActiveSelfPerson } : {})
        });
        return withCors(okResponse(200, brief), request, env);
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

export default createPeopleBriefHandler();
