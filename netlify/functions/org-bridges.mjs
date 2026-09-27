import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { buildOrgBridges } from './_shared/org-bridges.mjs';

export const config = { path: '/api/org-bridges' };

/**
 * GET /api/org-bridges?ids=a,b[,c]
 * Body-less read: clients may also POST a payload with people/links for pure evaluation.
 * For now accepts POST JSON { orgA, orgB, ... } matching findUsefulBridges / findBridgeCandidates.
 */
export function createOrgBridgesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env } = context;
    try {
      if (request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
          return withCors(errorResponse(400, 'invalid_input', 'JSON body required.', false), request, env);
        }
        const result = buildOrgBridges(body);
        return withCors(okResponse(200, result), request, env);
      }
      if (request.method === 'GET') {
        return withCors(
          okResponse(200, {
            bridges: [],
            hidden_count: 0,
            hidden_label: null,
            note: 'POST people/link payload to evaluate bridges, or use the Compare page.'
          }),
          request,
          env
        );
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const code = typeof error?.code === 'string' ? error.code : 'internal_error';
      const message = typeof error?.message === 'string' ? error.message : 'Request failed.';
      return withCors(errorResponse(status, code, message, status === 503), request, env);
    }
  }, {
    ...deps,
    requireStore: false
  });
}

export default createOrgBridgesHandler();
