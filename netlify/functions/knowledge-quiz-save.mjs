import { createKnowledgeQuizHandler } from './knowledge-quiz.mjs';

export const config = { path: '/api/knowledge/quiz-save' };

export function createKnowledgeQuizSaveHandler(deps = {}) {
  return createKnowledgeQuizHandler(deps);
}

export default createKnowledgeQuizSaveHandler();
