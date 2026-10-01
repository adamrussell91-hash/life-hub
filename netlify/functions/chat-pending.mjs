/**
 * GET /api/chat/pending — live Confirm cards waiting on Adam.
 * Hydrates the sticky chat tray so agents cannot claim cards that are only
 * in pending-actions.json while the DOM has none.
 */
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
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import {
  PENDING_ACTIONS_PATH,
  parsePendingActions,
  isPendingActionLive
} from './_shared/capabilities/propose-action.mjs';
import {
  pendingConfirmPublicFields,
  selectLivePendingActions
} from '../../apps/life/js/app/chat-pending-confirms.js';

export const config = { path: '/api/chat/pending' };

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };

export function createChatPendingHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function chatPendingHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET') return withPrivate(methodNotAllowed('GET'));
    const originError = guardRequestOrigin(request, env);
    if (originError) return withPrivate(originError);
    if (!isConfigured(env)) return withPrivate(misconfiguredResponse());

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivate(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    const url = new URL(request.url);
    const slugFilter = (url.searchParams.get('slug') || '').trim().toLowerCase();

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') {
        return withPrivate(misconfiguredResponse());
      }
      throw error;
    }

    let queue = [];
    try {
      const tree = await client.resolveTree();
      const blob = (tree.tree ?? []).find((item) => item.path === PENDING_ACTIONS_PATH && item.type === 'blob');
      if (blob) {
        queue = parsePendingActions(decodeBlob(await client.readBlob(blob.sha)));
      }
    } catch (error) {
      if (error instanceof GitHubClientError) {
        return errorResponse(502, 'repository_unavailable', 'Could not load pending Confirm actions.', true, PRIVATE_CACHE);
      }
      throw error;
    }

    // Newest first so the tray shows the latest asks on top.
    const pending = [...selectLivePendingActions(queue).filter(isPendingActionLive)]
      .filter((entry) => !slugFilter || String(entry.slug || '').toLowerCase() === slugFilter)
      .reverse()
      .map(pendingConfirmPublicFields)
      .filter(Boolean);

    return withPrivate(okResponse(200, { pending, count: pending.length }));
  }
}

function withPrivate(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(PRIVATE_CACHE)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatPendingHandler();
