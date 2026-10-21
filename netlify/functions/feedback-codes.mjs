import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { FeedbackCodesError, readFeedbackCodes, writeFeedbackCodes } from './_shared/feedback-codes.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
export const config = { path: '/api/feedback-codes' };
export function createFeedbackCodesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') return withCors(okResponse(200, { codes: await readFeedbackCodes(store) }, { 'cache-control': 'no-store' }), request, env);
    if (request.method !== 'PUT') return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
      return withCors(okResponse(200, { codes: await writeFeedbackCodes(store, parsed.value) }), request, env);
    } catch (e) {
      if (e instanceof FeedbackCodesError) return withCors(errorResponse(400, 'validation_error', e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createFeedbackCodesHandler();
