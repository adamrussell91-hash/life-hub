import { createCognitiveService } from './_shared/cognitive-service.mjs';
import { defaultGetCognitiveStore } from './_shared/cognitive-store.mjs';
import { readCentralNodeMarkdown } from './_shared/cognitive-context.mjs';
import { writeCentralNodeMarkdown } from './_shared/cognitive-writeback.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { defaultModel, defaultGatherContext } from './knowledge-protocols.mjs';

export const config = { path: '/api/knowledge/protocols/run', background: true };
function owner(env) { return env.COGNITIVE_OWNER_ID || 'operator'; }
export function createKnowledgeProtocolsRunHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const sessionId = request.headers.get('x-cognitive-session-id') ?? (await request.json().catch(() => ({}))).sessionId;
    try {
      const store = deps.getStore ? await deps.getStore(env) : await defaultGetCognitiveStore(env);
      if (!store) throw Object.assign(new Error('Protocol session storage is not configured.'), { status: 503, code: 'cognitive_store_unbound' });
      const fetchImpl = deps.fetchImpl ?? fetch;
      const retrieve = deps.retrieve ?? ((session) => defaultGatherContext(session, env, fetchImpl, deps));
      const service = createCognitiveService({
        store,
        model: deps.model ?? (prompt => defaultModel(prompt, env, fetchImpl)),
        retrieve,
        env,
        fetchImpl,
        readCentralNode: deps.readCentralNode ?? readCentralNodeMarkdown,
        writeCentralNode: deps.writeCentralNode ?? writeCentralNodeMarkdown
      });
      return withCors(okResponse(200, { session: await service.run(owner(env), sessionId) }), request, env);
    } catch (error) { return withCors(errorResponse(error.status ?? 502, error.code ?? 'protocol_run_failed', error.message, error.status >= 500), request, env); }
  }, deps);
}
export default createKnowledgeProtocolsRunHandler();
