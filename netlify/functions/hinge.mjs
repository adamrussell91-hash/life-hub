import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { hingeAction, hingeBackupInput, HingeError } from './_shared/hinge.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
import { kickTextToolRun as defaultKick, publicJobView, startTextToolJob } from './_shared/text-tools.mjs';
import { TEXT_TOOLS_RUN_PATH } from './teaching-text-tools.mjs';
export const config = { path: '/api/lessons/:id/hinge/:block' };
export function createHingeHandler(deps = {}) {
  const kick = deps.kickTextToolRun ?? defaultKick;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/hinge\/([^/]+)$/);
    try {
      const body = await request.json();
      // Ann drafts a back-up question as a text tool job; the page polls /api/text-tools/:key.
      if (body?.action === 'draft_backup') {
        const text = await hingeBackupInput(store, match?.[1], match?.[2]);
        const { key, job, kick: shouldKick } = await startTextToolJob({ store, env, tool: 'hinge_backup', text, now: deps.now });
        if (shouldKick) await kick(request, TEXT_TOOLS_RUN_PATH, key, deps.fetchImpl);
        return withCors(okResponse(200, publicJobView(key, job), { 'cache-control': 'no-store' }), request, env);
      }
      const result = await hingeAction(store, match?.[1], match?.[2], body, { teacher: true });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof HingeError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createHingeHandler();
