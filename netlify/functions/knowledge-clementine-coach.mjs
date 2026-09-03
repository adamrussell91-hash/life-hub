import { runCoachTurn } from './_shared/knowledge-coach-turn.mjs';
import { knowledgeKernelSecret } from './_shared/knowledge-kernel.mjs';
import { loadKnowledgePrompt } from './_shared/knowledge-prompts.mjs';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/clementine-coach' };

function parseMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item =>
    item &&
    typeof item === 'object' &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string'
  );
}

async function completeWithAnthropic(system, messages, apiKey, fetchImpl) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system,
      messages
    })
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = await response.json();
  return payload.content?.find(block => block.type === 'text')?.text ?? '';
}

export function createKnowledgeClementineCoachHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const messages = parseMessages(parsed.value?.messages);
    if (!messages.length) {
      return withCors(errorResponse(400, 'validation_error', 'messages are required', false), request, env);
    }
    const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
    if (!apiKey) {
      return withCors(errorResponse(503, 'knowledge_anthropic_unbound', 'Coach is unavailable', true), request, env);
    }
    try {
      const result = await runCoachTurn({
        voice: loadKnowledgePrompt('clementine-voice.md', deps.cwd),
        universityJob: loadKnowledgePrompt('clementine-university.md', deps.cwd),
        messages,
        workingThesis: typeof parsed.value?.workingThesis === 'string' ? parsed.value.workingThesis : undefined,
        draft: typeof parsed.value?.draft === 'string' ? parsed.value.draft : undefined,
        env: knowledgeKernelSecret(env) ? env : undefined,
        fetchImpl: deps.fetchImpl,
        complete: deps.complete ?? ((system, turn) => completeWithAnthropic(system, turn, apiKey, deps.fetchImpl ?? fetch))
      });
      return withCors(okResponse(200, result), request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('Prompt file missing:')) {
        return withCors(errorResponse(500, 'prompt_missing', message, false), request, env);
      }
      return withCors(errorResponse(502, 'coach_failed', 'Coach turn failed', true), request, env);
    }
  }, deps);
}

export default createKnowledgeClementineCoachHandler();
