import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetProfessionalStore, getJSON, CAREER_SCAN_STATE_KEY } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/career-scan' };

/** Skills scan endpoint — list/keep/bin/run-now. Full Ann pass is Phase 5. */
export function createCareerScanHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      try {
        if (request.method === 'GET') {
          const state = (await getJSON(store, CAREER_SCAN_STATE_KEY)) ?? {
            last_run_at: null,
            last_success_week: null
          };
          return withCors(
            okResponse(200, { proposals: [], scan_state: state, pending_count: 0 }),
            request,
            env
          );
        }
        if (request.method === 'POST') {
          const action = url.searchParams.get('action') || 'run-now';
          if (action === 'run-now' || action === 'keep' || action === 'bin' || action === 'edit') {
            return withCors(
              okResponse(200, {
                ok: true,
                action,
                note: 'Skills scan keep/bin/run-now fully wired in Phase 5.'
              }),
              request,
              env
            );
          }
          return withCors(errorResponse(400, 'unknown_action', 'Unknown scan action.'), request, env);
        }
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        return withCors(
          errorResponse(status, error?.code || 'internal_error', error?.message || 'Request failed.'),
          request,
          env
        );
      }
    },
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createCareerScanHandler();
