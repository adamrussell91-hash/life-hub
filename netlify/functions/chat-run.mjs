import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';
import { defaultGetChatJobStore, isChatJobId } from './_shared/chat-job-store.mjs';
import { runStoredChatJob } from './_shared/chat-job-run.mjs';
import { createChatHandler } from './chat.mjs';

export const config = { path: '/api/chat-run', background: true };

export function createChatRunHandler({
  env = process.env,
  getStore = defaultGetChatJobStore,
  createHandler = createChatHandler,
  handlerDeps = {},
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  now = Date.now
} = {}) {
  return async function chatRunHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await run(request), request, env);
  };

  async function run(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const originError = guardRequestOrigin(request, env);
    if (originError) return originError;
    if (!isConfigured(env)) return misconfiguredResponse();

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return misconfiguredResponse();
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        'set-cookie': clearCookie()
      });
    }

    const jobId = request.headers.get('x-chat-job-id') ?? '';
    if (!isChatJobId(jobId)) {
      return errorResponse(400, 'invalid_request', 'Provide a valid chat job id.', false);
    }

    const store = await getStore();
    await runStoredChatJob({ jobId, store, createHandler, handlerDeps });
    return new Response(null, { status: 202 });
  }
}

export default createChatRunHandler();
