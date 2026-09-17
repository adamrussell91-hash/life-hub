import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { findActiveSelfPerson } from './_shared/career-overview.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';

// Self Person lookup (Phase 4, Feature 4.4 "Your Network" support).
// GET-only. `GET /api/people/self` -> `{ self: { ref, display_name } | null }`.
//
// Why a new tiny route rather than reusing `/api/career`: `career.mjs`'s
// `assembleCareerOverview` already computes the active self Person
// internally (`findActiveSelfPerson`) but never returns the ref on its own
// — and it additionally runs several unrelated Applications/Employment/
// People/Organisations queries the Network Ecology "Your Network" mode
// (`apps/professional/src/views/network-ecology.ts`) does not need just to
// discover "who is me" before it can call the already-built
// `GET /api/network-ecology/ego?ref=<self ref>&hops=<n>`. This mirrors
// `findActiveSelfPerson`'s own doc comment ("Exported so other callers
// needing 'the active self Person'... reuse this exact lookup rather than
// re-deriving their own") — same reuse, a thin new route instead of a
// heavier existing one. See PHASE-1-PROGRESS.md for the documented
// decision between this, extending `/api/career`'s response, and adding a
// `self_ref` field elsewhere.
export const config = { path: '/api/people/self' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createPeopleSelfHandler(deps = {}) {
  const findSelf = deps.findActiveSelfPerson ?? findActiveSelfPerson;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      try {
        const self = await findSelf(store);
        if (!self) {
          return withCors(okResponse(200, { self: null }), request, env);
        }
        return withCors(
          okResponse(200, {
            self: {
              ref: formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id }),
              display_name: self.display_name ?? null
            }
          }),
          request,
          env
        );
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

export default createPeopleSelfHandler();
