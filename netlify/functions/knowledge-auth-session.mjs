import { createSessionHandler } from './session.mjs';

export const config = { path: '/api/knowledge/auth-session' };

export function createKnowledgeAuthSessionHandler(deps = {}) {
  return createSessionHandler(deps);
}

export default createKnowledgeAuthSessionHandler();
