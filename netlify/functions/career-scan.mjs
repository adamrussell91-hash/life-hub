import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  binScanProposal,
  getScanPanelPayload,
  keepScanProposal,
  runCareerScanPass
} from './_shared/career-scan-service.mjs';

export const config = { path: '/api/career-scan' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, status === 503);
}

export function createCareerScanHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      try {
        if (request.method === 'GET') {
          const payload = await getScanPanelPayload(store);
          return withCors(okResponse(200, payload), request, env);
        }
        if (request.method === 'POST') {
          const action = url.searchParams.get('action') || 'run-now';
          const body = await readJsonObject(request).catch(() => ({}));
          if (action === 'run-now') {
            const result = await runCareerScanPass({
              ...deps,
              env,
              professionalStore: store,
              force: Boolean(body?.force)
            });
            const payload = await getScanPanelPayload(store);
            return withCors(okResponse(200, { ...result, ...payload }), request, env);
          }
          if (action === 'bin') {
            const id = body?.id || url.searchParams.get('id');
            const proposal = await binScanProposal(store, id);
            return withCors(okResponse(200, { proposal }), request, env);
          }
          if (action === 'keep') {
            const id = body?.id || url.searchParams.get('id');
            const result = await keepScanProposal({ ...deps, env, store }, id);
            return withCors(okResponse(200, result), request, env);
          }
          if (action === 'edit') {
            // Title / STAR edits before keep — Phase 5 keeps edit on the client until Keep.
            return withCors(
              okResponse(200, { ok: true, note: 'Edit in place on the card, then Keep.' }),
              request,
              env
            );
          }
          return withCors(errorResponse(400, 'unknown_action', 'Unknown scan action.'), request, env);
        }
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
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
