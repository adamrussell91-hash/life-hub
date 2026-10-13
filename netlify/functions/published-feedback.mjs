/**
 * Public student feedback by private token (4f).
 * GET /api/published/feedback/:token
 * GET /api/published/feedback/:token/audio
 *
 * Wrong, expired, and revoked tokens all return the same 404 body.
 */
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import {
  readFeedbackAudioBytes,
  resolveFeedbackByToken,
  toPublishedFeedbackPayload
} from './_shared/teaching-feedback.mjs';

export const config = {
  path: [
    '/api/published/feedback/:token',
    '/api/published/feedback/:token/audio'
  ]
};

const NOT_FOUND = () =>
  errorResponse(404, 'not_found', 'This feedback link is not available.', false);

function readToken(request, context) {
  const fromContext = context.params?.token;
  if (typeof fromContext === 'string' && fromContext) return fromContext;
  const match = new URL(request.url).pathname.match(
    /\/api\/published\/feedback\/([^/]+)(?:\/audio)?$/
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function createPublishedFeedbackHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const token = readToken(request, context);
    if (!token) {
      return withCors(NOT_FOUND(), request, env);
    }

    const doc = await resolveFeedbackByToken(store, token, deps);
    if (!doc) {
      return withCors(NOT_FOUND(), request, env);
    }

    const wantsAudio = new URL(request.url).pathname.endsWith('/audio');
    if (wantsAudio) {
      const audio = await readFeedbackAudioBytes(store, doc);
      if (!audio) {
        return withCors(NOT_FOUND(), request, env);
      }
      return withCors(
        new Response(audio.bytes, {
          status: 200,
          headers: {
            'content-type': audio.contentType,
            'cache-control': 'private, no-store'
          }
        }),
        request,
        env
      );
    }

    const audio_url = doc.audio_media_id
      ? `/api/published/feedback/${encodeURIComponent(token)}/audio`
      : undefined;
    return withCors(
      okResponse(200, toPublishedFeedbackPayload(doc, audio_url)),
      request,
      env
    );
  }, deps);
}

export default createPublishedFeedbackHandler();
