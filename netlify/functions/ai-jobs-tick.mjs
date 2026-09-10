import { verifySessionToken } from './_shared/auth-security.mjs';
import { isScheduledTickRequest, runScheduledJobsTick } from './_shared/ai-jobs-tick.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';

export const config = {
  path: '/api/ai/jobs/tick',
  background: true
};

export function createAiJobsTickHandler(deps = {}) {
  return async function aiJobsTickHandler(request) {
    const env = deps.env ?? process.env;
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await run(request, env), request, env);
  };

  async function run(request, env) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return methodNotAllowed('GET, POST, OPTIONS');
    }
    if (isScheduledTickRequest(request)) {
      const result = await runScheduledJobsTick({ ...deps, env });
      return okResponse(202, result);
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return originError;
    if (!isConfigured(env)) return misconfiguredResponse();
    let session;
    try {
      session = (deps.verifySessionToken ?? verifySessionToken)(
        readUmbrellaSessionCookie(request),
        umbrellaSessionSecret(env),
        (deps.now ?? Date.now)()
      );
    } catch {
      return misconfiguredResponse();
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false);
    }
    const result = await runScheduledJobsTick({ ...deps, env });
    return okResponse(200, result);
  }
}

export default createAiJobsTickHandler();
