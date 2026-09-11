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

const STOP = new Set(['about','after','again','also','and','any','are','because','been','before','being','between','but','can','could','for','from','has','have','here','how','into','its','just','like','may','might','more','most','need','not','only','other','our','out','over','really','same','should','some','stay','such','than','that','the','their','them','then','there','they','this','through','too','under','very','want','was','were','what','when','where','whether','which','while','who','why','will','with','would','you','your']);

export function searchableTerms(session) {
  return Object.values(session?.intake ?? {})
    .join(' ')
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g)
    ?.filter((term, index, all) => !STOP.has(term) && all.indexOf(term) === index)
    .slice(0, 18) ?? [];
}

function manifestRows(raw) {
  return Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : [];
}

/** Read-only, bounded archive lookup. It deliberately avoids listKnowledgePages,
 * whose recovery path may write a repaired manifest. */
function termHits(haystack, term) {
  if (haystack.includes(term)) return true;
  if (term.endsWith('s') && term.length > 4 && haystack.includes(term.slice(0, -1))) return true;
  if (!term.endsWith('s') && haystack.includes(`${term}s`)) return true;
  return false;
}

export async function defaultRetrieve(session, env, fetchImpl = fetch) {
  const terms = searchableTerms(session);
  if (!terms.length) return { evidence: [], status: 'none' };
  try {
    const raw = await readKnowledgeFile('manifest.json', { env, fetchImpl });
    const ranked = manifestRows(raw).map(row => {
      const title = typeof row?.title === 'string' ? row.title.toLowerCase() : '';
      const excerpt = typeof row?.excerpt === 'string' ? row.excerpt.toLowerCase() : '';
      const tags = Array.isArray(row?.tags) ? row.tags.filter(tag => typeof tag === 'string').join(' ').toLowerCase() : '';
      const score = terms.reduce((total, term) => total + (termHits(`${title} ${tags}`, term) ? 2 : termHits(excerpt, term) ? 1 : 0), 0);
      return { row, score };
    }).filter(({ row, score }) => typeof row?.id === 'string' && score >= 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    const evidence = ranked.map(({ row }) => ({
      id: `knowledge:${row.id}`,
      kind: 'knowledge_hub_note',
      title: typeof row.title === 'string' && row.title ? row.title : row.id,
      text: typeof row.excerpt === 'string' ? row.excerpt.slice(0, 700) : '',
      source: 'Knowledge Hub archive'
    }));
    return evidence.length ? { evidence, status: 'grounded' } : { evidence: [], status: 'none' };
  } catch {
    return { evidence: [], status: 'none' };
  }
}

export function protocolRunUrl(request) {
  return new URL('/api/knowledge/protocols/run', request.url);
}

export async function defaultInvokeProtocolRun(request, sessionId, env = {}, fetchImpl = fetch) {
  const response = await fetchImpl(protocolRunUrl(request), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cognitive-session-id': sessionId,
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ sessionId })
  });
  return response.status === 202 || response.ok;
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
      if (!['queued', 'running'].includes(session.status)) {
        return withCors(okResponse(200, { session }), request, env);
      }
      const invokeRun = deps.invokeRun ?? defaultInvokeProtocolRun;
      let kicked = false;
      try { kicked = await invokeRun(request, session.id, env, deps.fetchImpl ?? fetch); } catch { kicked = false; }
      if (kicked) return withCors(okResponse(202, { session }), request, env);
      const advanced = await service.run(owner(env), session.id);
      return withCors(okResponse(200, { session: advanced }), request, env);
    } catch (error) { return withCors(errorResponse(error.status ?? 502, error.code ?? 'protocol_failed', error.message ?? 'Protocol request failed.', error.status >= 500), request, env); }
  }, deps);
}

export default createKnowledgeProtocolsHandler();
