import { createLogoutHandler } from './logout.mjs';

export const config = { path: '/api/knowledge/auth-logout' };

export function createKnowledgeAuthLogoutHandler(deps = {}) {
  return createLogoutHandler(deps);
}

export default createKnowledgeAuthLogoutHandler();
