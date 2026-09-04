import { runAlchemist } from './_shared/knowledge-alchemist.mjs';
import { loadKnowledgePrompt } from './_shared/knowledge-prompts.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/alchemy-lab', timeout: 26 };

const MODES = new Set(['synthesis', 'retrieval', 'empty', 'local']);

export function parseAlchemyResult(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const connections = Array.isArray(payload.connections)
    ? payload.connections.filter(item => item && typeof item.sourcePageId === 'string' && typeof item.summary === 'string')
    : [];
  const mode = MODES.has(payload.mode) ? payload.mode : 'empty';
  return { connections, mode };
}

export function createAlchemyLabHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const lessonText = typeof parsed.value.lessonText === 'string' ? parsed.value.lessonText : '';
    if (!lessonText.trim()) {
      return withCors(errorResponse(400, 'validation_error', 'Lesson text is required.', false), request, env);
    }
    const url = typeof env.KNOWLEDGE_ALCHEMIST_URL === 'string' ? env.KNOWLEDGE_ALCHEMIST_URL.trim() : '';
    const secret = typeof env.ALCHEMIST_SHARED_SECRET === 'string' ? env.ALCHEMIST_SHARED_SECRET.trim() : '';
    try {
      if (url && secret) {
        const fetchImpl = deps.fetchImpl ?? fetch;
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-alchemist-secret': secret
          },
          body: JSON.stringify({ lessonText })
        });
        if (!response.ok) {
          return withCors(
            errorResponse(502, 'upstream_error', "Alchemy Lab couldn't reach the archive.", true),
            request,
            env
          );
        }
        return withCors(okResponse(200, parseAlchemyResult(await response.json())), request, env);
      }
      const result = await runAlchemist({
        lessonText,
        env,
        voice: loadKnowledgePrompt('clementine-voice.md', deps.cwd),
        job: loadKnowledgePrompt('clementine-university.md', deps.cwd),
        fetchImpl: deps.fetchImpl,
        complete: deps.complete
      });
      return withCors(okResponse(200, parseAlchemyResult(result)), request, env);
    } catch {
      return withCors(
        errorResponse(502, 'upstream_error', "Alchemy Lab couldn't reach the archive.", true),
        request,
        env
      );
    }
  }, deps);
}

export default createAlchemyLabHandler();
