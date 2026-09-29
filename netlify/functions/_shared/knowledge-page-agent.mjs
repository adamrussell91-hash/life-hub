// Clementine: propose creating or patching a Knowledge Hub page.
// Confirm-only. Uses virtual knowledge:page:<id> paths; Confirm calls
// saveKnowledgePage (knowledge-hub-data), not life-data GitHub globs.

import {
  isSafeKnowledgePageId,
  newKnowledgePageId,
  saveKnowledgePage
} from './knowledge-data.mjs';
import { clean, makeProposal } from './agent-propose-helpers.mjs';

export function proposeKnowledgePageSchema() {
  return {
    name: 'propose_knowledge_page',
    description:
      'Propose creating or patching a Knowledge Hub archive page (title, body, area, tags). Nothing is saved until Adam taps Confirm. Use mode=create for a new page, mode=patch with id for an existing page. Do not invent silent saves.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        mode: { type: 'string', enum: ['create', 'patch'] },
        title: { type: 'string' },
        body: { type: 'string' },
        area: { type: 'string', enum: ['notes', 'university'] },
        tags: { type: 'array', items: { type: 'string' } },
        id: { type: 'string', description: 'Required for patch; optional for create.' }
      },
      required: ['summary', 'mode', 'title'],
      additionalProperties: false
    }
  };
}

export function buildKnowledgePageProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 200);
  const mode = input.mode === 'patch' ? 'patch' : input.mode === 'create' ? 'create' : '';
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!mode) return { ok: false, error: 'invalid_mode' };
  if (!title) return { ok: false, error: 'title_required' };

  let id = isSafeKnowledgePageId(input.id) ? input.id : '';
  if (mode === 'patch' && !id) return { ok: false, error: 'id_required_for_patch' };
  if (mode === 'create' && !id) id = newKnowledgePageId();
  if (!isSafeKnowledgePageId(id)) return { ok: false, error: 'invalid_page_id' };

  const payload = {
    mode,
    id,
    title,
    ...(typeof input.body === 'string' ? { body: input.body } : {}),
    ...(input.area === 'notes' || input.area === 'university' ? { area: input.area } : {}),
    ...(Array.isArray(input.tags)
      ? { tags: input.tags.filter(tag => typeof tag === 'string').map(tag => clean(tag, 64)).filter(Boolean).slice(0, 24) }
      : {})
  };

  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: `knowledge:page:${id}`,
      mode: mode === 'create' ? 'create' : 'overwrite',
      content: JSON.stringify(payload),
      diff: mode === 'create'
        ? `Create Knowledge page: ${title}`
        : `Patch Knowledge page: ${title}`
    }], {
      reads: [`knowledge:page:${id}`],
      surfaces: ['confirm_card', 'knowledge', 'governance_log']
    }),
    pageId: id
  };
}

export function createKnowledgeWriteExecutor({
  env,
  fetchImpl = fetch,
  nowIso = () => new Date().toISOString(),
  savePage = saveKnowledgePage
} = {}) {
  return {
    async apply(write, target) {
      let body;
      try {
        body = JSON.parse(write.content);
      } catch {
        return { ok: false, error: 'invalid_knowledge_write', detail: write.path };
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'invalid_knowledge_write', detail: write.path };
      }
      const id = isSafeKnowledgePageId(body.id) ? body.id : target?.id;
      if (!isSafeKnowledgePageId(id)) {
        return { ok: false, error: 'invalid_knowledge_write', detail: 'page id required' };
      }
      const title = clean(body.title, 200);
      if (!title) return { ok: false, error: 'invalid_knowledge_write', detail: 'title required' };

      try {
        const saved = await savePage({
          id,
          title,
          ...(typeof body.body === 'string' ? { body: body.body } : {}),
          ...(body.area === 'notes' || body.area === 'university' ? { area: body.area } : {}),
          ...(Array.isArray(body.tags) ? { tags: body.tags } : {})
        }, { env, fetchImpl, nowIso });
        return {
          ok: true,
          result: {
            path: write.path,
            mode: write.mode,
            id: saved?.id || id,
            updated_at: saved?.updated_at || nowIso()
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: error?.code || 'knowledge_write_failed',
          detail: error?.message || write.path
        };
      }
    }
  };
}
