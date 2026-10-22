import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { getJSON, outcomeKey } from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { deleteOutcome, mergeOutcome, outcomeUsage, patchOutcome } from './_shared/outcome-manage.mjs';

export const config = { path: ['/api/outcomes/:id', '/api/outcomes/:id/:action'] };

function readRoute(request, context) {
  const match = new URL(request.url).pathname.match(/\/api\/outcomes\/([^/]+)(?:\/([^/]+))?$/);
  return {
    id: context.params?.id ?? match?.[1] ?? '',
    action: context.params?.action ?? match?.[2] ?? ''
  };
}

export function createOutcomeHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const { id, action } = readRoute(request, context);
    try {
      if (action === 'usage' && request.method === 'GET') {
        return withCors(okResponse(200, { usage: await outcomeUsage(store, id) }), request, env);
      }
      if (action === 'merge' && request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        return withCors(okResponse(200, await mergeOutcome(store, id, parsed.value.into)), request, env);
      }
      if (action) return withCors(errorResponse(404, 'not_found', 'Not found', false), request, env);
      if (request.method === 'GET') {
        const record = await getJSON(store, outcomeKey(id), { consistency: 'strong' });
        if (!record) return withCors(errorResponse(404, 'not_found', 'Outcome not found', false), request, env);
        return withCors(okResponse(200, record), request, env);
      }
      if (request.method === 'PATCH') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        return withCors(okResponse(200, await patchOutcome(store, id, parsed.value)), request, env);
      }
      if (request.method === 'DELETE') {
        return withCors(okResponse(200, await deleteOutcome(store, id)), request, env);
      }
      return withCors(methodNotAllowed('GET, PATCH, DELETE, OPTIONS'), request, env);
    } catch (error) {
      if (!Number.isInteger(error?.status)) throw error;
      return withCors(errorResponse(error.status, error.code, error.message, false, {}, error.data), request, env);
    }
  }, deps);
}

export default createOutcomeHandler();
