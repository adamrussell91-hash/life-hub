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
import { getSydneyDateKey } from '../../apps/life/js/core/time.js';
import { formatOpenSprintsForPrompt } from './_shared/sprint-prompt.mjs';
import { listActiveSprints } from './_shared/sprint-evidence.mjs';
import { listChallengePaths, parseJsonBlob } from './_shared/capabilities/stores.mjs';
import { executeShortcut } from './_shared/capabilities/shortcuts.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';

export const config = {
  path: '/api/knowledge/clementine-chat',
  timeout: 26
};

async function loadOpenSprintsTextForClementine({ env, fetchImpl, deps }) {
  if (typeof deps.loadOpenSprintsText === 'function') {
    return deps.loadOpenSprintsText();
  }
  try {
    const client = createGitHubClient({ env, fetchImpl });
    const tree = (await client.resolveTree())?.tree ?? [];
    const today = getSydneyDateKey(new Date());
    const docs = [];
    for (const path of listChallengePaths(tree)) {
      const entry = tree.find(item => item.path === path && item.type === 'blob');
      if (!entry?.sha) continue;
      const raw = decodeBlob(await client.readBlob(entry.sha));
      const doc = parseJsonBlob(raw, null);
      if (doc) docs.push(doc);
    }
    const active = listActiveSprints(docs, today);
    return formatOpenSprintsForPrompt(active, { slug: 'clementine', today, records: [] });
  } catch {
    return '';
  }
}

async function defaultRunSprintTool(toolName, input, { agentSlug, env, fetchImpl }) {
  const client = createGitHubClient({ env, fetchImpl });
  const tree = (await client.resolveTree())?.tree ?? [];
  const today = getSydneyDateKey(new Date());
  return executeShortcut(toolName, input, {
    agentSlug,
    today,
    client,
    repoTree: tree,
    readBlob: (sha) => client.readBlob(sha).then(decodeBlob)
  });
}

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
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = parsed.value ?? {};

    // Sprint lane tools do not need the research kernel (W2).
    if (body.sprint_tool && typeof body.sprint_tool === 'object') {
      const who = personalityById(typeof body.personality === 'string' ? body.personality : 'clementine')
        ?? personalityById('clementine');
      const fetchImpl = deps.fetchImpl ?? fetch;
      const toolName = String(body.sprint_tool.name || '').trim();
      if (toolName !== 'track_checkin_lane' && toolName !== 'track_log_progress') {
        return withCors(errorResponse(400, 'validation_error', 'sprint_tool.name must be track_checkin_lane or track_log_progress', false), request, env);
      }
      const runSprintTool = deps.runSprintTool ?? defaultRunSprintTool;
      const toolResult = await runSprintTool(toolName, body.sprint_tool.input || {}, {
        agentSlug: who.id === 'clementine' ? 'clementine' : who.id,
        env,
        fetchImpl
      });
      return withCors(okResponse(200, { status: 'done', sprint_tool: toolResult }), request, env);
    }

    if (!knowledgeKernelSecret(env)) {
      return withCors(errorResponse(
        503,
        'knowledge_kernel_unbound',
        'Chat write clock is not configured',
        true
      ), request, env);
    }
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
      const openSprintsText = typeof deps.openSprintsText === 'string'
        ? deps.openSprintsText
        : (typeof body.openSprintsText === 'string' ? body.openSprintsText : await loadOpenSprintsTextForClementine({ env, fetchImpl, deps }));

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
        openSprintsText,
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
