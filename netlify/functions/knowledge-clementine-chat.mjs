import { runChatTurn } from './_shared/knowledge-chat-turn.mjs';
import {
  isChatHatId,
  normalizeBookContext,
  normalizeProtocolId,
  personalityById
} from './_shared/knowledge-chat-plan.mjs';
import { listKnowledgePages } from './_shared/knowledge-data.mjs';
import {
  knowledgeKernelFetch,
  knowledgeKernelSecret
} from './_shared/knowledge-kernel.mjs';
import { loadKnowledgePrompt } from './_shared/knowledge-prompts.mjs';
import { docsFromManifest, parseResearchResult, researchFromDocs } from './_shared/knowledge-research.mjs';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = {
  path: '/api/knowledge/clementine-chat',
  timeout: 26
};

function parseMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item =>
    item &&
    typeof item === 'object' &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string'
  );
}

function asNote(value) {
  return value &&
    typeof value === 'object' &&
    typeof value.pageId === 'string' &&
    typeof value.title === 'string'
    ? { pageId: value.pageId, title: value.title }
    : undefined;
}

export function createKnowledgeClementineChatHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    if (!knowledgeKernelSecret(env)) {
      return withCors(errorResponse(
        503,
        'knowledge_kernel_unbound',
        'Chat write clock is not configured',
        true
      ), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = parsed.value ?? {};
    const messages = parseMessages(body.messages);
    if (!messages.length) {
      return withCors(errorResponse(400, 'validation_error', 'messages are required', false), request, env);
    }
    if (typeof body.hat !== 'string' || !body.hat.trim()) {
      return withCors(errorResponse(400, 'validation_error', 'hat is required', false), request, env);
    }
    if (!isChatHatId(body.hat)) {
      return withCors(errorResponse(400, 'validation_error', `Unknown chat hat "${body.hat}"`, false), request, env);
    }
    const who = personalityById(typeof body.personality === 'string' ? body.personality : 'clementine')
      ?? personalityById('clementine');
    const fetchImpl = deps.fetchImpl ?? fetch;
    try {
      const result = await runChatTurn({
        voice: loadKnowledgePrompt(who.voiceFile, deps.cwd),
        universityJob: loadKnowledgePrompt('clementine-university.md', deps.cwd),
        hat: body.hat,
        scope: typeof body.scope === 'string' ? body.scope : undefined,
        depth: typeof body.depth === 'string' ? body.depth : undefined,
        messages,
        workingThesis: typeof body.workingThesis === 'string' ? body.workingThesis : undefined,
        draft: typeof body.draft === 'string' ? body.draft : undefined,
        noteContext: asNote(body.noteContext),
        notesInPlay: Array.isArray(body.notesInPlay)
          ? body.notesInPlay.map(asNote).filter(Boolean)
          : undefined,
        bookContext: normalizeBookContext(body.bookContext),
        personality: who.id,
        protocolId: normalizeProtocolId(body.protocolId),
        searchOutside: body.searchOutside === true,
        researchSessionId: typeof body.researchSessionId === 'string' ? body.researchSessionId : undefined,
        writeSessionId: typeof body.writeSessionId === 'string' ? body.writeSessionId : undefined,
        compose: body.compose === true,
        priorResearch: parseResearchResult(body.priorResearch) ?? undefined,
        sittingLibrary: parseResearchResult(body.sittingLibrary) ?? undefined,
        archiveFailed: body.archiveFailed === true,
        env,
        fetchImpl,
        cwd: deps.cwd,
        archivePull: deps.archivePull ?? (async ({ query, k, tags }) => {
          const pages = await listKnowledgePages({ env, fetchImpl });
          return researchFromDocs({ query, docs: docsFromManifest(pages, tags), k });
        }),
        write: deps.write ?? {
          start: async input => {
            const response = await knowledgeKernelFetch('/chat/write/start', {
              env,
              fetchImpl,
              method: 'POST',
              body: input,
              timeoutMs: 8_000
            });
            if (response.status === 404) throw new Error('Chat write clock is not deployed on the Worker');
            if (!response.ok) throw new Error(`Write start failed ${response.status}`);
            return response.json();
          },
          poll: async writeSessionId => {
            const response = await knowledgeKernelFetch(`/chat/write/${encodeURIComponent(writeSessionId)}`, {
              env,
              fetchImpl,
              timeoutMs: 8_000
            });
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`Write poll failed ${response.status}`);
            return response.json();
          }
        }
      });
      return withCors(okResponse(200, result), request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('Prompt file missing:')) {
        return withCors(errorResponse(500, 'prompt_missing', message, false), request, env);
      }
      if (/write clock is not deployed|Chat write clock is not configured/i.test(message)) {
        return withCors(errorResponse(503, 'knowledge_kernel_unbound', message, true), request, env);
      }
      return withCors(errorResponse(502, 'chat_failed', message || 'Chat turn failed', true), request, env);
    }
  }, deps);
}

export default createKnowledgeClementineChatHandler();
