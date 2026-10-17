/**
 * Background run for one operator text tool job. Kicked by
 * `POST /api/text-tools`; the page polls `GET /api/text-tools/:key`.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { isTextToolKey, runTextToolJob } from './_shared/text-tools.mjs';

export const config = { path: '/api/text-tools-run', background: true };

export function createTextToolsRunHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const body = await request.json().catch(() => ({}));
    if (!isTextToolKey(body?.key)) {
      return withCors(errorResponse(400, 'validation_error', 'key is required', false), request, env);
    }
    const job = await runTextToolJob({
      store,
      env,
      key: body.key,
      completeMessage: deps.completeMessage,
      requestTechniqueScan: deps.requestTechniqueScan
    });
    if (!job) return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    return withCors(okResponse(200, { key: body.key, status: job.status }), request, env);
  }, deps);
}

export default createTextToolsRunHandler();
