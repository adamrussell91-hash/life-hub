import { catalog } from './_shared/cognitive-controller.mjs';
import { ID_RE } from './_shared/cognitive-controller.mjs';
import { createCognitiveService } from './_shared/cognitive-service.mjs';
import { defaultGetCognitiveStore } from './_shared/cognitive-store.mjs';
import { createAnthropicClient } from './_shared/anthropic-client.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/protocols' };

function owner(env) { return env.COGNITIVE_OWNER_ID || 'operator'; }

async function defaultModel(prompt, env, fetchImpl = fetch) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Object.assign(new Error('AI provider is not configured.'), { code: 'provider_unavailable' });
  const client = createAnthropicClient({ apiKey, fetchImpl });
  let text = '';
  for await (const event of client.streamMessage({
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxTokens: Math.min(1200, Math.max(160, prompt.wordBudget * 2))
  })) if (event.type === 'text') text += event.text ?? '';
  return { text, evidenceIds: [] };
}

function defaultRetrieve() {
  return { evidence: [], status: 'No matching Knowledge Hub notes were retrieved. Claims remain self-report or uncertainty.' };
}

async function serviceFor(env, deps) {
  const store = deps.getStore ? await deps.getStore(env) : await defaultGetCognitiveStore(env);
  if (!store) throw Object.assign(new Error('Protocol session storage is not configured.'), { status: 503, code: 'cognitive_store_unbound' });
  return createCognitiveService({
    store,
    model: deps.model ?? (prompt => defaultModel(prompt, env, deps.fetchImpl)),
    retrieve: deps.retrieve ?? defaultRetrieve
  });
}

function invokeBackground(request, sessionId, deps) {
  if (deps.invokeBackground) return deps.invokeBackground(request, sessionId);
  const cookie = request.headers.get('cookie');
  const origin = request.headers.get('origin');
  return fetch(new URL('/api/knowledge/protocols/run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cognitive-session-id': sessionId,
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {})
    }
  }).then(response => response.ok).catch(() => false);
}

export function createKnowledgeProtocolsHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (!url.searchParams.has('sessionId') && !url.searchParams.has('list')) return withCors(okResponse(200, { catalog }), request, env);
      try {
        const service = await serviceFor(env, deps);
        const data = url.searchParams.has('list')
          ? { sessions: await service.list(owner(env)) }
          : { session: await service.get(owner(env), url.searchParams.get('sessionId') ?? '') };
        return withCors(okResponse(200, data), request, env);
      } catch (error) { return withCors(errorResponse(error.status ?? 502, error.code ?? 'protocol_failed', error.message, error.status >= 500), request, env); }
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
      const service = await serviceFor(env, deps);
      const body = parsed.value ?? {};
      if (body.sessionId && !ID_RE.test(body.sessionId)) {
        return withCors(errorResponse(400, 'validation_error', 'Valid session ID required.', false), request, env);
      }
      const session = body.sessionId
        ? await service.action(owner(env), body)
        : await service.create(owner(env), body);
      const dispatched = await invokeBackground(request, session.id, deps);
      const data = dispatched ? { session } : { session: { ...session, status: 'failed', error: { code: 'dispatch_failed', message: 'The protocol runner could not start. Retry this session.', retryable: true } } };
      return withCors(okResponse(dispatched ? 202 : 202, data), request, env);
    } catch (error) { return withCors(errorResponse(error.status ?? 502, error.code ?? 'protocol_failed', error.message ?? 'Protocol request failed.', error.status >= 500), request, env); }
  }, deps);
}

export default createKnowledgeProtocolsHandler();
