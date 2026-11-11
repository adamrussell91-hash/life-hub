// netlify/functions/published-games.mjs: the student side of a Game lesson (arcade, solo play).
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { gameStudentAction, GameError } from './_shared/games.mjs';
import { joinRoom } from './_shared/game-rooms.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/game/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 900, windowSize: 60 } };
const MAX_BODY = 40000;
export function createPublishedGamesHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That’s too much to send at once.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/game\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new GameError(413, 'too_large', 'That’s too much to send at once.');
      const body = JSON.parse(text);
      // Join a live room by its code (game-rooms.mjs); everything else is the arcade and solo play.
      const result = body?.action === 'join' ? await joinRoom(store, match?.[1], body, { env }) : await gameStudentAction(store, match?.[1], body);
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof GameError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedGamesHandler();
