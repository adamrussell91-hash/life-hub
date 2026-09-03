import { createKnowledgeQuizItemsHandler } from './knowledge-quiz-items.mjs';

export const config = { path: '/api/knowledge/quiz/items/:pageId' };

export function createKnowledgeQuizItemsPathHandler(deps = {}) {
  return createKnowledgeQuizItemsHandler(deps);
}

export default createKnowledgeQuizItemsPathHandler();
