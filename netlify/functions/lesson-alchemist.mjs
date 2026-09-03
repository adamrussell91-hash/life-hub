import { runAlchemist, alchemistSecret } from './_shared/knowledge-alchemist.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
  withCors
} from './_shared/http.mjs';
import { loadKnowledgePrompt } from './_shared/knowledge-prompts.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/lesson-alchemist', timeout: 26 };

function withAlchemistCors(response, request, env) {
  const wrapped = withCors(response, request, env);
  const headers = new Headers(wrapped.headers);
  if (headers.has('access-control-allow-origin')) {
    headers.set('access-control-allow-headers', 'content-type, x-alchemist-secret');
  }
  return new Response(wrapped.body, { status: wrapped.status, headers });
}

export function createLessonAlchemistHandler(deps = {}) {
  const env = deps.env ?? process.env;
  return async function lessonAlchemistHandler(request) {
    if (request.method === 'OPTIONS') {
      const preflight = preflightResponse(request, env);
      return withAlchemistCors(preflight, request, env);
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return withAlchemistCors(originError, request, env);
    if (request.method !== 'POST') {
      return withAlchemistCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const expected = alchemistSecret(env);
    const provided = request.headers.get('x-alchemist-secret') ?? '';
    if (!expected || provided !== expected) {
      return withAlchemistCors(errorResponse(401, 'unauthenticated', 'Unauthorized', false), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withAlchemistCors(parsed.error, request, env);
    const lessonText = typeof parsed.value?.lessonText === 'string' ? parsed.value.lessonText : '';
    if (!lessonText.trim()) {
      return withAlchemistCors(errorResponse(400, 'validation_error', 'lessonText is required', false), request, env);
    }
    try {
      const result = await runAlchemist({
        lessonText,
        env,
        voice: loadKnowledgePrompt('clementine-voice.md', deps.cwd),
        job: loadKnowledgePrompt('clementine-university.md', deps.cwd),
        fetchImpl: deps.fetchImpl,
        complete: deps.complete
      });
      return withAlchemistCors(jsonResponse(200, result), request, env);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Prompt file missing:')) {
        return withAlchemistCors(errorResponse(500, 'prompt_missing', error.message, false), request, env);
      }
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return withAlchemistCors(errorResponse(
        status,
        error?.code ?? 'alchemist_failed',
        status === 400 ? error.message : 'Alchemist run failed',
        status >= 500
      ), request, env);
    }
  };
}

export default createLessonAlchemistHandler();
