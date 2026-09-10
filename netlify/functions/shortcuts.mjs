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
import { getSydneyDateKey } from '../../apps/life/js/core/time.js';
import { listNamedShortcuts } from './_shared/capabilities/registry.mjs';
import { executeShortcut } from './_shared/capabilities/shortcuts.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';
const OPERATOR_SLUG = 'hammond';

export const config = { path: '/api/shortcuts' };

export function createShortcutsHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function shortcutsHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return withPrivateCache(methodNotAllowed('GET, POST'));
    }
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
      const { tree } = await client.resolveTree();
      const today = getSydneyDateKey(new Date(now()));
      const ctxFor = agentSlug => ({
        client,
        agentSlug,
        today,
        repoTree: tree,
        readBlob: async sha => decodeBlob(await client.readBlob(sha))
      });

      if (request.method === 'GET') {
        const listed = await executeShortcut('os_list_promoted_shortcuts', { limit: 50 }, ctxFor(OPERATOR_SLUG));
        if (listed.kind !== 'ok') {
          return errorResponse(
            502,
            'shortcuts_unavailable',
            listed.error || 'Promoted shortcuts could not be listed.',
            true,
            PRIVATE_CACHE
          );
        }
        return jsonResponse(200, {
          ok: true,
          data: {
            catalog: listNamedShortcuts(),
            promoted: listed.drafts ?? []
          }
        }, PRIVATE_CACHE);
      }

      const body = await request.json().catch(() => null);
      const proposedId = typeof body?.proposed_id === 'string' ? body.proposed_id.trim() : '';
      if (!proposedId) {
        return errorResponse(400, 'invalid_input', 'proposed_id is required.', false, PRIVATE_CACHE);
      }
      const agentSlug = typeof body?.agent_slug === 'string' && body.agent_slug.trim()
        ? body.agent_slug.trim()
        : OPERATOR_SLUG;
      const result = await executeShortcut('os_run_promoted_shortcut', { proposed_id: proposedId }, ctxFor(agentSlug));
      if (result.kind === 'error') {
        return errorResponse(400, 'shortcut_failed', result.error || 'Shortcut could not run.', false, PRIVATE_CACHE);
      }
      if (result.kind !== 'propose') {
        return errorResponse(400, 'shortcut_failed', 'Shortcut did not produce a Confirm proposal.', false, PRIVATE_CACHE);
      }
      return jsonResponse(200, { ok: true, data: { proposal: result.proposal, agent_slug: agentSlug } }, PRIVATE_CACHE);
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

export default createShortcutsHandler();
