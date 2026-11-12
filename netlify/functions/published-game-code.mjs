// netlify/functions/published-game-code.mjs: the class site's join page asks which lesson an open
// live-game code is for (game-rooms.mjs findCode), then sends the phone to that lesson for that class.
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { GameError } from './_shared/games.mjs';
import { findCode } from './_shared/game-rooms.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';

// Codes are six digits: a tight limit keeps guessing slow.
export const config = { path: '/api/published/game-code/:code', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 30, windowSize: 60 } };

export function createPublishedGameCodeHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/game-code\/([^/]+)$/);
    try {
      return withCors(okResponse(200, await findCode(store, match?.[1], { now: (deps.now ?? Date.now)() }), { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof GameError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e.message, false), request, env);
      throw e;
    }
  }, deps);
}

export default createPublishedGameCodeHandler();
