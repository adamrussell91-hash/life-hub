import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { knowledgeDataToken } from './_shared/knowledge-data.mjs';
import { loadKnowledgePrompt } from './_shared/knowledge-prompts.mjs';
import { tidyPageDirect } from './_shared/knowledge-tidy.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/tidy', timeout: 26 };

function knowledgeError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const code = typeof error?.code === 'string' ? error.code : 'tidy_failed';
  const message = status === 400
    ? error.message
    : status === 404
      ? 'Page was not found'
      : status === 503
        ? error.message
        : error?.message || 'Tidy failed';
  return errorResponse(status, code, message, status >= 500);
}

export function createKnowledgeTidyHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    if (!knowledgeDataToken(env)) {
      return withCors(errorResponse(503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.', true), request, env);
    }
    const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
    if (!apiKey) {
      return withCors(errorResponse(503, 'knowledge_anthropic_unbound', 'Tidy is unavailable', true), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const id = typeof parsed.value?.id === 'string' ? parsed.value.id.trim() : '';
    if (!id) {
      return withCors(errorResponse(400, 'validation_error', 'id is required', false), request, env);
    }
    try {
      const page = await tidyPageDirect({
        id,
        env,
        apiKey,
        prompt: loadKnowledgePrompt('tidy.md', deps.cwd),
        fetchImpl: deps.fetchImpl,
        nowIso: deps.nowIso,
        propose: deps.propose
      });
      return withCors(okResponse(200, page), request, env);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Prompt file missing:')) {
        return withCors(errorResponse(500, 'prompt_missing', error.message, false), request, env);
      }
      return withCors(knowledgeError(error), request, env);
    }
  }, deps);
}

export default createKnowledgeTidyHandler();
