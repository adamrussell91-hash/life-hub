import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { peerAction, PeerError } from './_shared/peer-feedback.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/peer-feedback/:id/:block', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
export function createPublishedPeerFeedbackHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > 16000) return withCors(errorResponse(413, 'too_large', 'Keep your response shorter.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/peer-feedback\/([^/]+)\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > 16000) throw new PeerError(413, 'Keep your response shorter.');
      const result = await peerAction(store, match?.[1], match?.[2], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof PeerError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, 'peer_feedback', e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedPeerFeedbackHandler();
