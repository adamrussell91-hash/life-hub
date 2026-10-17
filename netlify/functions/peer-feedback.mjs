import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { peerAction, PeerError } from './_shared/peer-feedback.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/peer-feedback/:block' };
export function createPeerFeedbackHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/peer-feedback\/([^/]+)$/);
    try {
      const result = await peerAction(store, match?.[1], match?.[2], await request.json(), true);
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof PeerError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPeerFeedbackHandler();
