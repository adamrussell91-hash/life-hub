import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { searchPeopleRelationally } from './_shared/relational-search.mjs';
import { planRelationalQuery } from './_shared/relational-search-nl.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

// Relational Search (Phase 3, Feature 3.3), Layer 1 — structured queries
// only, see `_shared/relational-search.mjs` for the full design note.
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
//
// `POST /api/people/relational-search?action=plan` (Phase 5, Layer 2) —
// natural-language relational search. Body `{ question: string }`. Mirrors
// `communications.mjs`'s `POST ?action=retry-links` and
// `people-brief.mjs`'s `POST ?action=generate&id=` method+action
// sub-routing shape, and `people-brief.mjs`'s `ANTHROPIC_API_KEY` / 503-
// when-unbound degradation pattern. PLANS the query (via
// `_shared/relational-search-nl.mjs`'s `planRelationalQuery`) AND EXECUTES
// it against `runRelationalSearch` in the SAME call — simpler for the
// client than two round trips — returning both the resolved filter
// interpretation (for UI transparency: "never opaque") and the same
// `matched_reasons`-carrying results Layer 1 already produces.
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
  // Test-only injection point (`person-brief-generation.mjs`'s
  // `deps.complete` pattern) — production leaves this undefined and
  // `planRelationalQuery` falls through to a real Anthropic call.
  const complete = deps.complete;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;

      if (request.method === 'GET') {
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
            env,
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
      }

      if (request.method === 'POST') {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        if (action !== 'plan') {
          return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
        }

        const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
        if (!apiKey) {
          return withCors(
            errorResponse(
              503,
              'people_relational_search_nl_unbound',
              'Natural-language relational search is unavailable',
              true
            ),
            request,
            env
          );
        }

        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const question = typeof parsed.value.question === 'string' ? parsed.value.question : '';

        try {
          const plan = await planRelationalQuery({
            question,
            apiKey,
            fetchImpl: deps.fetchImpl,
            complete,
            store
          });

          // Never force a bad-fit filter — an honestly-unsupported
          // question, or one that resolved to no filters at all, returns
          // zero results without ever calling `searchPeopleRelationally`
          // (which would otherwise 400 on an all-empty query).
          const hasFilter = Boolean(plan.organisation_ref || plan.role || plan.text);
          let results = [];
          if (!plan.unsupported && hasFilter) {
            const professionalStore = await getProfessionalStore();
            results = await searchPeopleRelationally(
              { organisation_ref: plan.organisation_ref, role: plan.role, text: plan.text },
              {
                store,
                professionalStore,
                env,
                resolveEntity,
                createRepository,
                now: now(),
                createObservationRepository: deps.createObservationRepository,
                loadAllPeopleWithRelationships: deps.loadAllPeopleWithRelationships
              }
            );
          }

          return withCors(okResponse(200, { ...plan, results }), request, env);
        } catch (error) {
          return withCors(toErrorResponse(error), request, env);
        }
      }

      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
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
