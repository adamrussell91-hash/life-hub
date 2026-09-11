import { catalog } from './_shared/cognitive-controller.mjs';
import { ID_RE } from './_shared/cognitive-controller.mjs';
import { createCognitiveService } from './_shared/cognitive-service.mjs';
import { defaultGetCognitiveStore } from './_shared/cognitive-store.mjs';
import { createAnthropicClient } from './_shared/anthropic-client.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { readKnowledgeFile } from './_shared/knowledge-data.mjs';

export const config = { path: '/api/knowledge/protocols' };

function owner(env) { return env.COGNITIVE_OWNER_ID || 'operator'; }

export async function defaultModel(prompt, env, fetchImpl = fetch) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Object.assign(new Error('AI provider is not configured.'), { code: 'provider_unavailable' });
  const client = createAnthropicClient({ apiKey, fetchImpl });
  let text = '';
  try {
    for await (const event of client.streamMessage({
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxTokens: Math.min(4096, Math.max(1024, (prompt.wordBudget || 200) * 3))
    })) if (event.type === 'text') text += event.delta ?? '';
  } catch (error) {
    // Sonnet 5 rejects the client's max_tokens assistant-prefill continuation.
    // Keep a complete first-round voice if we already have one.
    if (!text.trim()) throw error;
  }
  return { text, evidenceIds: [] };
}

function searchableTerms(session) {
  return Object.values(session?.intake ?? {})
    .join(' ')
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g)
    ?.filter((term, index, all) => all.indexOf(term) === index)
    .slice(0, 18) ?? [];
}

function manifestRows(raw) {
  return Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : [];
}

/** Read-only, bounded archive lookup. It deliberately avoids listKnowledgePages,
 * whose recovery path may write a repaired manifest. */
export async function defaultRetrieve(session, env, fetchImpl = fetch) {
  const terms = searchableTerms(session);
  if (!terms.length) return { evidence: [], status: 'No specific archive terms were supplied. Claims remain self-report or uncertainty.' };
  try {
    const raw = await readKnowledgeFile('manifest.json', { env, fetchImpl });
    const ranked = manifestRows(raw).map(row => {
      const title = typeof row?.title === 'string' ? row.title : '';
      const excerpt = typeof row?.excerpt === 'string' ? row.excerpt : '';
      const tags = Array.isArray(row?.tags) ? row.tags.filter(tag => typeof tag === 'string').join(' ') : '';
      const haystack = `${title} ${excerpt} ${tags}`.toLowerCase();
      return { row, score: terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) };
    }).filter(({ row, score }) => typeof row?.id === 'string' && score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    const evidence = ranked.map(({ row }) => ({
      id: `knowledge:${row.id}`,
      kind: 'knowledge_hub_note',
      title: typeof row.title === 'string' && row.title ? row.title : row.id,
      text: typeof row.excerpt === 'string' ? row.excerpt.slice(0, 700) : '',
      source: 'Knowledge Hub archive'
    }));
    return evidence.length
      ? { evidence, status: `Retrieved ${evidence.length} matching Knowledge Hub note${evidence.length === 1 ? '' : 's'} for grounding.` }
      : { evidence: [], status: 'No matching Knowledge Hub notes were retrieved. Claims remain self-report or uncertainty.' };
  } catch {
    return { evidence: [], status: 'Knowledge Hub archive is temporarily unavailable. Claims remain self-report or uncertainty.' };
  }
}

async function serviceFor(env, deps) {
  const store = deps.getStore ? await deps.getStore(env) : await defaultGetCognitiveStore(env);
  if (!store) throw Object.assign(new Error('Protocol session storage is not configured.'), { status: 503, code: 'cognitive_store_unbound' });
  return createCognitiveService({
    store,
    model: deps.model ?? (prompt => defaultModel(prompt, env, deps.fetchImpl)),
    retrieve: deps.retrieve ?? (session => defaultRetrieve(session, env, deps.fetchImpl))
  });
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
      const advanced = await service.run(owner(env), session.id);
      return withCors(okResponse(200, { session: advanced }), request, env);
    } catch (error) { return withCors(errorResponse(error.status ?? 502, error.code ?? 'protocol_failed', error.message ?? 'Protocol request failed.', error.status >= 500), request, env); }
  }, deps);
}

export default createKnowledgeProtocolsHandler();
