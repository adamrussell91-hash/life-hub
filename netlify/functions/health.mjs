import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  readCookie
} from './_shared/http.mjs';
import { tokenExpiryState } from './_shared/provider-health.mjs';
import { getSydneyDateKey, isCalendarDate } from '../../js/core/time.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const SUCCESS_CACHE_MS = 60 * 1000;
const PUBLIC_GITHUB_CODES = new Set([
  'github_access_denied',
  'github_authentication_failed',
  'github_invalid_response',
  'github_rate_limited',
  'github_request_failed',
  'github_unavailable',
  'repository_not_found',
  'repository_tree_incomplete'
]);

export const config = { path: '/api/health' };

export function createHealthHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  let successfulCheckAt = null;

  return async function healthHandler(request) {
    if (request.method !== 'GET') return withPrivateCache(methodNotAllowed('GET'));
    const originError = guardRequestOrigin(request);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env)) return withPrivateCache(misconfiguredResponse());

    const checkedAt = now();
    let session;
    try {
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, checkedAt);
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    const token = tokenDetails(env.GITHUB_TOKEN_EXPIRES, checkedAt);
    if (token.expiresOn === null) {
      return healthResponse({
        github: 'misconfigured',
        token: 'unknown',
        expiresOn: null,
        code: 'misconfigured',
        retryable: false
      });
    }
    if (successfulCheckAt !== null && checkedAt >= successfulCheckAt &&
        checkedAt - successfulCheckAt < SUCCESS_CACHE_MS) {
      return healthResponse({ github: 'healthy', ...token, code: 'ok', retryable: false });
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') {
        return healthResponse({ github: 'misconfigured', ...token, code: 'misconfigured', retryable: false });
      }
      return healthResponse({ github: 'unavailable', ...token, code: 'github_unavailable', retryable: true });
    }

    try {
      await client.resolveTree();
      successfulCheckAt = now();
      return healthResponse({ github: 'healthy', ...token, code: 'ok', retryable: false });
    } catch (error) {
      const failure = publicProviderFailure(error);
      return healthResponse({ github: 'unavailable', ...token, ...failure });
    }
  };
}

function tokenDetails(expiry, timestamp) {
  const expiresOn = isCalendarDate(expiry) ? expiry : null;
  return {
    token: tokenExpiryState(expiresOn, getSydneyDateKey(new Date(timestamp))),
    expiresOn
  };
}

function publicProviderFailure(error) {
  if (error instanceof GitHubClientError && PUBLIC_GITHUB_CODES.has(error.code)) {
    return { code: error.code, retryable: error.retryable === true };
  }
  return { code: 'github_unavailable', retryable: true };
}

function healthResponse(data) {
  return jsonResponse(200, { ok: true, data }, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createHealthHandler();
