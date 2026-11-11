// netlify/functions/games-fold.mjs: a live game room's results, posted by the game-rooms Worker (spec §3.3 step 4).
// Not a browser route: no session and no CORS. The body must be signed with GAME_ROOM_SECRET (x-game-room-signature).
import { GameError } from './_shared/games.mjs';
import { foldRoom } from './_shared/game-rooms.mjs';
import { SIGNATURE_HEADER, verifyBody } from './_shared/game-room-core.mjs';
import { errorResponse, methodNotAllowed, okResponse } from './_shared/http.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/games/fold' };
/** 40 seats × 600 moves fits well inside this. */
const MAX_BODY = 5_500_000;

export function createGameFoldHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const loadStore = deps.getContentStore ?? defaultGetContentStore;
  const now = deps.now ?? Date.now;
  return async function gameFoldHandler(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const secret = env.GAME_ROOM_SECRET;
    if (typeof secret !== 'string' || secret.length < 16) return errorResponse(503, 'not_configured', 'Live games aren’t set up yet.', true);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return errorResponse(413, 'too_large', 'Fold too large.', false);
    const text = await request.text();
    if (text.length > MAX_BODY) return errorResponse(413, 'too_large', 'Fold too large.', false);
    if (!(await verifyBody(secret, text, request.headers.get(SIGNATURE_HEADER), now()))) return errorResponse(401, 'bad_signature', 'Not signed.', false);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return errorResponse(400, 'bad_request', 'Invalid fold.', false);
    }
    let store;
    try {
      store = await loadStore(env);
    } catch {
      store = null;
    }
    if (!store) return errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true);
    try {
      return okResponse(200, await foldRoom(store, payload, { now: now() }), { 'cache-control': 'no-store' });
    } catch (e) {
      if (e instanceof GameError) return errorResponse(e.status ?? 400, e.code ?? 'bad_request', e.message, (e.status ?? 400) >= 500);
      throw e;
    }
  };
}
export default createGameFoldHandler();
