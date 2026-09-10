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
  SKINCARE_PRODUCT_LIBRARY_PATH,
  saveProductLibraryEntry
} from '../../apps/life/js/app/skincare-product-library.js';
import { loadOrSeedLibrary, writeJson } from './_shared/skincare-store.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';

export const config = { path: '/api/skincare/library' };

export function createSkincareLibraryHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function skincareLibraryHandler(request) {
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
        return errorResponse(400, 'invalid_request', 'Provide a valid skincare library update.', false, PRIVATE_CACHE);
      }
      return saveLibrary(body);
    }
    return getLibrary();
  }

  function client() {
    try {
      return createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return null;
      throw error;
    }
  }

  async function getLibrary() {
    let github;
    try {
      github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const { library } = await loadOrSeedLibrary(github);
      return jsonResponse(200, { ok: true, data: { library } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  async function saveLibrary(body) {
    let github;
    try {
      github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const { library: seed, entry } = await loadOrSeedLibrary(github);
      const library = saveProductLibraryEntry(seed, body);
      if (!library) {
        return errorResponse(400, 'invalid_request', 'Provide a valid skincare library update.', false, PRIVATE_CACHE);
      }
      const result = await writeJson(
        github,
        SKINCARE_PRODUCT_LIBRARY_PATH,
        library,
        'chore(skincare): save product library entry',
        entry?.sha
      );
      return jsonResponse(200, { ok: true, data: { library, sha: result.sha } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }
}

const OPTIONAL_STRING_FIELDS = [
  'brand', 'category', 'status', 'purpose', 'cost',
  'purchase_date', 'opened_date', 'finished_date', 'notes', 'hint'
];

async function parseRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      body.action !== 'save' ||
      typeof body.name !== 'string' || !body.name.trim()) {
    return null;
  }
  if (body.id != null && (typeof body.id !== 'string' || !body.id.trim())) return null;
  for (const key of OPTIONAL_STRING_FIELDS) {
    if (body[key] != null && typeof body[key] !== 'string') return null;
  }
  if (body.active_ingredients != null) {
    if (!Array.isArray(body.active_ingredients)) return null;
    if (!body.active_ingredients.every(x => typeof x === 'string')) return null;
  }
  return body;
}

function mapRepositoryError(error) {
  if (error?.code === 'library_corrupt') {
    return repositoryError('library_corrupt', false);
  }
  if (error instanceof GitHubClientError && error.code === 'write_conflict') {
    return errorResponse(409, 'write_conflict', 'The skincare library was updated elsewhere. Please try again.', true, PRIVATE_CACHE);
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

export default createSkincareLibraryHandler();
