import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { assemblePersonBrief } from './_shared/person-brief.mjs';
import {
  assembleSinceLastSpokeContext,
  buildOpeningLine,
  generateBriefContent
} from './_shared/person-brief-generation.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';

// Person Brief route (Phase 3, Features 3.1 + 3.2).
//
// `GET /api/people/brief?id=<person id>` assembles the synchronous, non-LLM
// sections of the Brief reading-sheet — see `_shared/person-brief.mjs` for
// the full section-by-section breakdown.
//
// `POST /api/people/brief?id=<person id>&action=generate` (Feature 3.2)
// generates the "Since you last spoke" / "Talking points" LLM sections —
// see `_shared/person-brief-generation.mjs` for the structured-input
// assembly, prompt, and Anthropic call. Mirrors `communications.mjs`'s
// `POST ?action=retry-links` method+action sub-routing shape, and
// `knowledge-clementine-coach.mjs`'s `ANTHROPIC_API_KEY` / 503-when-unbound
// degradation pattern.
//
// Route shape: `/api/people/brief?id=<person id>` — a query param, not a
// path param. Verified against this codebase's convention before choosing:
// `entity-overview.mjs` (`/api/entities/overview?ref=`), `people-home-
// signals.mjs`, `people-activity.mjs`, `people-cohorts.mjs` — every
// Professional route that targets one id uses a query param; none uses
// Netlify path-param routing (`/api/x/:id`) anywhere in this app. This
// follows the established convention rather than introducing a new one.
export const config = { path: '/api/people/brief' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createPeopleBriefHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const createMeetings = deps.createMeetingRepository ?? createMeetingRepository;
  const createEvents = deps.createEventRepository ?? createEventRepository;
  const now = deps.now ?? (() => new Date().toISOString());
  const findActiveSelfPerson = deps.findActiveSelfPerson;
  // Test-only injection point (`knowledge-clementine-coach.mjs`'s
  // `deps.complete` pattern) — production leaves this undefined and
  // `generateBriefContent` falls through to a real Anthropic call.
  const complete = deps.complete;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const id = url.searchParams.get('id');

      if (request.method === 'GET') {
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
          return withCors(toErrorResponse(error), request, env);
        }
      }

      if (request.method === 'POST') {
        const action = url.searchParams.get('action');
        if (action !== 'generate') {
          return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
        }
        if (!id) {
          return withCors(errorResponse(400, 'missing_id', 'id query param required.', false), request, env);
        }
        const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
        if (!apiKey) {
          return withCors(
            errorResponse(503, 'people_anthropic_unbound', 'Brief generation is unavailable', true),
            request,
            env
          );
        }
        try {
          const professionalStore = await getProfessionalStore();
          const generationContext = await assembleSinceLastSpokeContext(id, {
            universalStore: store,
            professionalStore,
            env,
            fetchImpl: deps.fetchImpl,
            resolveEntity,
            createRepository,
            now
          });
          const generated = await generateBriefContent({
            structuredInput: generationContext.changes,
            apiKey,
            fetchImpl: deps.fetchImpl,
            complete
          });
          const openingLine = buildOpeningLine(generationContext.lastMeaningfulInteraction, generationContext.nowIso);
          return withCors(
            okResponse(200, {
              since_last_spoke: [openingLine, ...generated.since_last_spoke],
              talking_points: generated.talking_points,
              last_meaningful_interaction: generationContext.sinceIso ?? null
            }),
            request,
            env
          );
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

export default createPeopleBriefHandler();
