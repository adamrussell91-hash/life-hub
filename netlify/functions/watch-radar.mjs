/**
 * /api/watch-radar: the Watches page reads the weekly shop prices and Adam's buy prices,
 * and saves a buy price. The checks themselves run in watch-radar-scheduled.mjs.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { readRadar, readTargets, saveTarget } from './_shared/watch-radar.mjs';

export const config = { path: '/api/watch-radar' };

export function createWatchRadarHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const radar = await readRadar(store);
        const targets = await readTargets(store);
        return withCors(okResponse(200, { readings: radar.readings, lastRun: radar.lastRun, targets }), request, env);
      }
      if (request.method !== 'PUT') return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const targets = await saveTarget(store, parsed.value.key, parsed.value.target ?? null);
      return withCors(okResponse(200, { targets }), request, env);
    } catch (error) {
      const code = error?.code === 'unknown_watch' || error?.code === 'validation_error' ? error.code : 'bad_request';
      return withCors(errorResponse(400, code, error.message, false), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createWatchRadarHandler();
