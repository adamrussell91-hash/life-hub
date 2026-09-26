import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { runPeopleCoordinationPass, runClarePeopleSweep } from './_shared/people-coordination.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';

export const config = { path: '/api/people/coordination' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, Boolean(error?.retryable) || status === 503);
}

export function createPeopleCoordinationHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { store, env } = context;
      try {
        if (request.method !== 'POST') {
          return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
        }
        const body = await readJsonObject(request);
        const action = body?.action ?? 'clare_sweep';

        if (action === 'clare_sweep') {
          const result = await runClarePeopleSweep({
            ...deps,
            env,
            universalStore: store
          });
          return withCors(okResponse(200, result), request, env);
        }

        if (action === 'full') {
          const result = await runPeopleCoordinationPass({
            ...deps,
            env,
            universalStore: store,
            forceRemember: Boolean(body?.force_remember),
            skipRemember: Boolean(body?.skip_remember)
          });
          return withCors(okResponse(200, result), request, env);
        }

        return withCors(
          errorResponse(400, 'invalid_action', 'action must be clare_sweep or full.', false),
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

export default createPeopleCoordinationHandler();
