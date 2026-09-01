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
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  addToRoutine,
  removeFromRoutine
} from '../../apps/life/js/app/skincare-routine-membership.js';
import { loadOrSeedLibrary, loadOrSeedMembership, writeJson } from './_shared/skincare-store.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';

export const config = { path: '/api/skincare/routines' };

export function createSkincareRoutinesHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function skincareRoutinesHandler(request) {
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

    if (request.method === 'POST') {
      const body = await parseRequest(request);
      if (!body) {
        return errorResponse(400, 'invalid_request', 'Provide a valid skincare routine update.', false, PRIVATE_CACHE);
      }
      return updateMembership(body);
    }
    return getMembership();
  }

  function client() {
    try {
      return createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return null;
      throw error;
    }
  }

  async function getMembership() {
    let github;
    try {
      github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const { library } = await loadOrSeedLibrary(github);
      const { membership } = await loadOrSeedMembership(github, library);
      return jsonResponse(200, { ok: true, data: { membership } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  async function updateMembership({ action, routine, product_id: productId }) {
    let github;
    try {
      github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const { library } = await loadOrSeedLibrary(github);
      if (!library.products.some(product => product.id === productId.trim())) {
        return errorResponse(400, 'unknown_product', 'That product is not in the library.', false, PRIVATE_CACHE);
      }
      const { membership: seed, entry } = await loadOrSeedMembership(github, library);
      const membership = action === 'add'
        ? addToRoutine(seed, routine, productId)
        : removeFromRoutine(seed, routine, productId);
      if (!membership) {
        return errorResponse(400, 'invalid_request', 'Provide a valid skincare routine update.', false, PRIVATE_CACHE);
      }
      await writeJson(
        github,
        SKINCARE_ROUTINE_MEMBERSHIP_PATH,
        membership,
        `chore(skincare): ${action} routine product`,
        entry?.sha
      );
      return jsonResponse(200, { ok: true, data: { membership } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }
}

async function parseRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      (body.action !== 'add' && body.action !== 'remove') ||
      (body.routine !== 'am' && body.routine !== 'pm') ||
      typeof body.product_id !== 'string' || !body.product_id.trim()) {
    return null;
  }
  return body;
}

function mapRepositoryError(error) {
  if (error?.code === 'library_corrupt' || error?.code === 'membership_corrupt') {
    return repositoryError(error.code, false);
  }
  if (error instanceof GitHubClientError && error.code === 'write_conflict') {
    return errorResponse(409, 'write_conflict', 'The skincare routines were updated elsewhere. Please try again.', true, PRIVATE_CACHE);
  }
  if (error instanceof GitHubClientError) return repositoryError(error.code, error.retryable);
  return repositoryError('github_unavailable', true);
}

function repositoryError(code, retryable) {
  return errorResponse(503, code, REPOSITORY_MESSAGE, retryable, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createSkincareRoutinesHandler();
