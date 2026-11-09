// netlify/functions/published-rotation.mjs: the student side of a station rotation (pretest, stations, gates, board, finale).
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { rotationAction, RotationError } from './_shared/rotation.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
import { createWritingChecker } from './_shared/rotation-writing.mjs';
import { appendUsageLog, createAnthropicComplete, teachingModels } from './_shared/teaching-ai-job-run.mjs';

/** The real written-gate checker: the standard lane, with cost logged like other Teaching AI jobs. Without a key, written gates go to the teacher. */
function liveChecker(env) {
  if (!env?.ANTHROPIC_API_KEY) return undefined;
  return createWritingChecker({ complete: createAnthropicComplete({ apiKey: env.ANTHROPIC_API_KEY }), models: teachingModels(env), logUsage: appendUsageLog });
}
export const config = { path: '/api/published/rotation/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 900, windowSize: 60 } };
const MAX_BODY = 40000;
/** `deps.checkWriting` replaces the written-gate checker (tests and the local mock). */
export function createPublishedRotationHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That’s too long to send. Shorten it and try again.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/rotation\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new RotationError(413, 'too_large', 'That’s too long to send. Shorten it and try again.');
      const result = await rotationAction(store, match?.[1], JSON.parse(text), { checkWriting: deps.checkWriting ?? liveChecker(env) });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof RotationError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedRotationHandler();
