// netlify/functions/games.mjs: the teacher side of a Game lesson (results per game, markbook push, Build from this unit).
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { gameTeacherAction, GameError } from './_shared/games.mjs';
import { listRooms, openRoom } from './_shared/game-rooms.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/game' };
export function createGamesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/game$/);
    try {
      const body = await request.json();
      // Live rooms (game-rooms.mjs): open one for a class, or list the open ones to resume.
      const result = body?.action === 'open' ? await openRoom(store, match?.[1], body, { env, fetchImpl: deps.fetch ?? fetch })
        : body?.action === 'rooms' ? await listRooms(store, match?.[1], { env })
          : await gameTeacherAction(store, match?.[1], body);
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof GameError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createGamesHandler();
