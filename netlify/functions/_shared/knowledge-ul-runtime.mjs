/**
 * Bind the canonical Universal Link repository for Knowledge dual-read,
 * backlinks, and relationship write cutover. Server-derived access context
 * only — never trust client-supplied actor/workflow fields.
 */
import { createAccessContext } from './entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';

export function createKnowledgeAccessContext() {
  return createAccessContext({ workflow: 'knowledge' });
}

export function createKnowledgeAdministrationAccessContext() {
  return createAccessContext({ workflow: 'administration' });
}

/**
 * @param {object} [deps]
 */
export async function bindKnowledgeUniversalLinks(deps = {}) {
  const getStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;
  const createRepo = deps.createUniversalLinkRepository ?? createUniversalLinkRepository;
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  let store;
  try {
    store = await getStore(deps.env);
  } catch (error) {
    return {
      ok: false,
      error,
      store: null,
      accessContext: createKnowledgeAccessContext(),
      administrationAccessContext: createKnowledgeAdministrationAccessContext(),
      listIncoming: null,
      listForEntity: null,
      createLink: null,
      suppressLink: null
    };
  }
  if (!store) {
    return {
      ok: false,
      error: Object.assign(new Error('Universal Link store unbound'), {
        status: 503,
        code: 'universal_link_blobs_unbound'
      }),
      store: null,
      accessContext: createKnowledgeAccessContext(),
      administrationAccessContext: createKnowledgeAdministrationAccessContext(),
      listIncoming: null,
      listForEntity: null,
      createLink: null,
      suppressLink: null
    };
  }
  const repo = createRepo({
    store,
    resolveEntity,
    now: deps.now
  });
  const accessContext = createKnowledgeAccessContext();
  const administrationAccessContext = createKnowledgeAdministrationAccessContext();
  return {
    ok: true,
    store,
    accessContext,
    administrationAccessContext,
    repo,
    listIncoming: (ref, ctx, options) => repo.listIncoming(ref, ctx ?? accessContext, options),
    listForEntity: (ref, ctx, options) => repo.listForEntity(ref, ctx ?? accessContext, options),
    createLink: (input, ctx) => repo.createLink(input, ctx ?? accessContext),
    // Timeless related_to removal uses the approved suppress lifecycle, which
    // requires the administration workflow.
    suppressLink: (id, reason, ctx) =>
      repo.suppressLink(id, reason ?? 'knowledge_cutover_remove', ctx ?? administrationAccessContext)
  };
}
