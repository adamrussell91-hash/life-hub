// netlify/functions/published-game-invite.mjs: every open class page asks every few seconds whether the
// teacher pushed a live-game invite for its class (game-rooms.mjs readInvite). Answers are cached at the
// edge for a few seconds, so a room of phones asking at once costs about one function call per class.
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { readInvite } from './_shared/game-rooms.mjs';
import { okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';

export const INVITE_EDGE_SECONDS = 4;

// A whole class shares one school address, so the limit is roomy; the edge cache takes most of it.
export const config = { path: '/api/published/game-invite/:class', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 1500, windowSize: 60 } };

export function createPublishedGameInviteHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/game-invite\/([^/]+)$/);
    const classId = match?.[1] ? decodeURIComponent(match[1]) : '';
    const result = await readInvite(store, classId, { now: (deps.now ?? Date.now)() });
    return withCors(
      okResponse(200, result, {
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': `public, durable, s-maxage=${INVITE_EDGE_SECONDS}`
      }),
      request,
      env
    );
  }, deps);
}

export default createPublishedGameInviteHandler();
