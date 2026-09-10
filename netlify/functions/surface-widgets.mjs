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
import { decodeBlob } from './_shared/decode-blob.mjs';
import {
  isWidgetPath,
  loadApprovedTemplateIds,
  MAX_SURFACE_WIDGETS,
  normalizeSurfaceWidget,
  parseWidgetBlob
} from './_shared/surface-widgets.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';

export const config = { path: '/api/surface/widgets' };

export function createSurfaceWidgetsHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function surfaceWidgetsHandler(request) {
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
      const approved = new Set(loadApprovedTemplateIds());
      const { tree } = await client.resolveTree();
      const widgetEntries = tree
        .filter(entry => entry.type === 'blob' && isWidgetPath(entry.path))
        .slice(0, MAX_SURFACE_WIDGETS);

      const blobs = await Promise.all(widgetEntries.map(entry => client.readBlob(entry.sha)));
      const widgets = widgetEntries
        .map((entry, index) => {
          const parsed = parseWidgetBlob(decodeBlob(blobs[index]));
          if (!parsed || !approved.has(parsed.template_id)) return null;
          const normalized = normalizeSurfaceWidget({ ...parsed, path: entry.path });
          return normalized;
        })
        .filter(Boolean)
        .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

      return jsonResponse(200, { ok: true, data: { widgets } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

function repositoryError(code, retryable) {
  return errorResponse(503, code, REPOSITORY_MESSAGE, retryable, PRIVATE_CACHE);
}

function mapRepositoryError(error) {
  if (error instanceof GitHubClientError) {
    return repositoryError(error.code, error.retryable);
  }
  return repositoryError('github_unavailable', true);
}

export default createSurfaceWidgetsHandler();
