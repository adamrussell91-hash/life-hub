import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
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
import {
  chatJobOwnerKey,
  defaultGetChatJobStore,
  isChatJobId
} from './_shared/chat-job-store.mjs';

export const config = { path: '/api/chat/events' };

export function createChatEventsHandler({
  env = process.env,
  getStore = defaultGetChatJobStore,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  now = Date.now
} = {}) {
  return async function chatEventsHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await readEvents(request), request, env);
  };

  async function readEvents(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
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

    const url = new URL(request.url);
    const jobId = url.searchParams.get('job') ?? '';
    if (!isChatJobId(jobId)) {
      return errorResponse(400, 'invalid_request', 'Provide a valid chat job id.', false);
    }
    const afterRaw = Number(url.searchParams.get('after') ?? '0');
    const after = Number.isFinite(afterRaw) && afterRaw > 0 ? Math.floor(afterRaw) : 0;

    const store = await getStore();
    const job = await store.get(jobId);
    if (!job || job.owner !== chatJobOwnerKey(request.headers.get('cookie') ?? '')) {
      return errorResponse(404, 'not_found', 'That chat turn was not found.', false);
    }

    const events = Array.isArray(job.events) ? job.events.slice(after) : [];
    return okResponse(200, {
      events,
      status: job.status === 'done' || job.status === 'error' ? job.status : (events.length ? 'running' : job.status),
      next: after + events.length
    });
  }
}

export default createChatEventsHandler();
