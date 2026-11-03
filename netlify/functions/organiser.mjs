import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { organiserTeacherAction, OrganiserError } from './_shared/organiser.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/units/:unit/organiser' };
const MAX_BODY = 400000;
/** A unit's knowledge organiser: the sheet, and one change at a time. */
export function createOrganiserHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    if (request.method === 'POST') {
      const originError = guardRequestOrigin(request, env);
      if (originError) return withCors(originError, request, env);
      if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That request is too large.', false), request, env);
    }
    const url = new URL(request.url);
    const unit = url.pathname.match(/\/units\/([^/]+)\/organiser$/)?.[1];
    try {
      const body = request.method === 'POST' ? await request.json() : { class: url.searchParams.get('class') || undefined };
      const result = await organiserTeacherAction(store, unit, request.method, body, { now: deps.now?.() });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof OrganiserError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createOrganiserHandler();
