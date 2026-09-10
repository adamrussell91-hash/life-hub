import { createCognitiveService } from './_shared/cognitive-service.mjs';
import { defaultGetCognitiveStore } from './_shared/cognitive-store.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { createAnthropicClient } from './_shared/anthropic-client.mjs';

export const config = { path: '/api/knowledge/protocols/run', background: true };
function owner(env) { return env.COGNITIVE_OWNER_ID || 'operator'; }
async function model(prompt, env, fetchImpl = fetch) {
  if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('AI provider is not configured.'), { code: 'provider_unavailable' });
  const client = createAnthropicClient({ apiKey: env.ANTHROPIC_API_KEY, fetchImpl }); let text = '';
  for await (const event of client.streamMessage({ system: prompt.system, messages: [{ role: 'user', content: prompt.user }], maxTokens: 1000 })) if (event.type === 'text') text += event.delta ?? '';
  return { text, evidenceIds: [] };
}
export function createKnowledgeProtocolsRunHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const sessionId = request.headers.get('x-cognitive-session-id') ?? (await request.json().catch(() => ({}))).sessionId;
    try {
      const store = deps.getStore ? await deps.getStore(env) : await defaultGetCognitiveStore(env);
      if (!store) throw Object.assign(new Error('Protocol session storage is not configured.'), { status: 503, code: 'cognitive_store_unbound' });
      const service = createCognitiveService({ store, model: deps.model ?? (prompt => model(prompt, env, deps.fetchImpl)), retrieve: deps.retrieve ?? (() => ({ evidence: [], status: 'No matching Knowledge Hub notes were retrieved.' })) });
      return withCors(okResponse(200, { session: await service.run(owner(env), sessionId) }), request, env);
    } catch (error) { return withCors(errorResponse(error.status ?? 502, error.code ?? 'protocol_run_failed', error.message, error.status >= 500), request, env); }
  }, deps);
}
export default createKnowledgeProtocolsRunHandler();
