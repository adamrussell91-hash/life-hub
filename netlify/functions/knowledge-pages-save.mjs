import { createKnowledgePagesHandler } from './knowledge-pages.mjs';

export const config = { path: '/api/knowledge/pages-save' };

export function createKnowledgePagesSaveHandler(deps = {}) {
  return createKnowledgePagesHandler(deps);
}

export default createKnowledgePagesSaveHandler();
