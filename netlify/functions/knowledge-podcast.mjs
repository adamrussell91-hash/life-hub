import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { runPodcastRequest } from './_shared/knowledge-podcast.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/knowledge/podcast' };

function podcastError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const code = typeof error?.code === 'string' ? error.code : 'podcast_failed';
  const message = status === 404
    ? error.message
    : status === 503
      ? error.message
      : error?.message || 'Podcast failed';
  return errorResponse(status, code, message, status >= 500);
}

export function createKnowledgePodcastHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET' && request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }
    let body = {};
    if (request.method === 'POST') {
      const text = await request.text();
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON', false), request, env);
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return withCors(errorResponse(400, 'validation_error', 'Request body must be a JSON object', false), request, env);
        }
      }
    }
    try {
      const data = await runPodcastRequest({
        pathname: new URL(request.url).pathname,
        method: request.method,
        body,
        env,
        fetchImpl: deps.fetchImpl,
        signGet: deps.signGet
      });
      return withCors(okResponse(200, data), request, env);
    } catch (error) {
      return withCors(podcastError(error), request, env);
    }
  }, deps);
}

export default createKnowledgePodcastHandler();
