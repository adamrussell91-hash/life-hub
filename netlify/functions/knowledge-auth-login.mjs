import { createAuthHandler } from './auth.mjs';

export const config = {
  path: '/api/knowledge/auth-login',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 5, windowSize: 60 }
};

export function createKnowledgeAuthLoginHandler(deps = {}) {
  return createAuthHandler(deps);
}

export default createKnowledgeAuthLoginHandler();
