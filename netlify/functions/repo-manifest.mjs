import { createHash } from 'node:crypto';
import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';
import {
  createGitHubClient,
  GitHubClientError,
  GitHubConfigurationError
} from './_shared/github-client.mjs';
import { parseDateRange, selectManifestEntries } from './_shared/repo-policy.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';

export const config = { path: '/api/repo/manifest' };

export function createRepoManifestHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function repoManifestHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET') return withPrivateCache(methodNotAllowed('GET'));
    const originError = guardRequestOrigin(request, env);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env)) return withPrivateCache(misconfiguredResponse());

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    let range;
    try {
      range = parseDateRange(new URL(request.url));
    } catch {
      return errorResponse(400, 'invalid_date_range', 'Provide a valid date range.', false, PRIVATE_CACHE);
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') {
        return withPrivateCache(misconfiguredResponse());
      }
      return repositoryError('github_unavailable', true);
    }

    try {
      const { commitSha, treeSha, tree } = await client.resolveTree();
      const manifestId = createManifestId(commitSha, range);
      const etag = `"${manifestId}"`;
      if (etagMatches(request.headers.get('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers: { ...PRIVATE_CACHE, etag } });
      }
      return jsonResponse(200, {
        ok: true,
        data: {
          commitSha,
          treeSha,
          manifestId,
          ...range,
          files: selectManifestEntries(tree, range)
        }
      }, { ...PRIVATE_CACHE, etag });
    } catch (error) {
      if (error instanceof GitHubClientError) return repositoryError(error.code, error.retryable);
      return repositoryError('github_unavailable', true);
    }
  };
}

function createManifestId(commitSha, { from, to }) {
  return createHash('sha256')
    .update(commitSha)
    .update('\0')
    .update(from)
    .update('\0')
    .update(to)
    .digest('hex');
}

function etagMatches(value, etag) {
  if (!value) return false;
  return value.split(',').some(candidate => {
    const trimmed = candidate.trim();
    return trimmed === '*' || trimmed === etag || trimmed === `W/${etag}`;
  });
}

function repositoryError(code, retryable) {
  return errorResponse(503, code, REPOSITORY_MESSAGE, retryable, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createRepoManifestHandler();
