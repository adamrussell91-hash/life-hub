import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { searchPeopleRelationally } from './_shared/relational-search.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

// Relational Search (Phase 3, Feature 3.3), Layer 1 — structured queries
// only, see `_shared/relational-search.mjs` for the full design note and
// Layer 2 (LLM natural-language parsing) deferral to Phase 5.
//
// `GET /api/people/relational-search?organisation_ref=<ref>&role=<role>&text=<text>`
// — all three query params optional, at least one required. Deliberately
// NOT the plan's shorthand `GET ...?q=<encoded>`: a single opaque blob
// would need its own parsing grammar for no real benefit when three named
// params work fine and match this app's existing query-param conventions
// (`entity-overview.mjs`'s `?ref=`, `entity-search.mjs`'s `?q=&kinds=`,
// `people-brief.mjs`'s `?id=&action=`) — documented deviation, same as
// prior Phase 3 tasks in this build have documented similar shorthand
// deviations.
export const config = { path: '/api/people/relational-search' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createPeopleRelationalSearchHandler(deps = {}) {
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
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
      const filters = {
        organisation_ref: url.searchParams.get('organisation_ref') ?? '',
        role: url.searchParams.get('role') ?? '',
        text: url.searchParams.get('text') ?? ''
      };

      try {
        const professionalStore = await getProfessionalStore();
        const results = await searchPeopleRelationally(filters, {
          store,
          professionalStore,
          resolveEntity,
          createRepository,
          now: now(),
          createObservationRepository: deps.createObservationRepository,
          loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
        });
        return withCors(okResponse(200, { results }), request, env);
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

export default createPeopleRelationalSearchHandler();
