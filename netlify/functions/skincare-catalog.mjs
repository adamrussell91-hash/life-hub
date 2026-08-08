import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readCookie,
  withCors
} from './_shared/http.mjs';
import {
  createGitHubClient,
  GitHubClientError,
  GitHubConfigurationError
} from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';
import {
  SKINCARE_CATALOG_PATH,
  appendProduct,
  emptyCatalog,
  parseCatalog,
  retireProduct
} from '../../js/app/skincare-catalog.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';

export const config = { path: '/api/skincare/catalog' };

export function createSkincareCatalogHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function skincareCatalogHandler(request) {
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
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now());
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
        return errorResponse(400, 'invalid_request', 'Provide a valid skincare catalog update.', false, PRIVATE_CACHE);
      }
      return updateCatalog(body);
    }
    return getCatalog();
  }

  function client() {
    try {
      return createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return null;
      throw error;
    }
  }

  async function getCatalog() {
    let github;
    try {
      github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const { tree } = await github.resolveTree();
      const entry = tree.find(item => item.path === SKINCARE_CATALOG_PATH && item.type === 'blob');
      if (!entry) return jsonResponse(200, { ok: true, data: { catalog: null } }, PRIVATE_CACHE);
      const catalog = parseCatalog(decodeBlob(await github.readBlob(entry.sha)));
      return jsonResponse(200, { ok: true, data: { catalog } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  async function updateCatalog({ action, routine, name }) {
    let github;
    try {
      github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const { tree } = await github.resolveTree();
      const entry = tree.find(item => item.path === SKINCARE_CATALOG_PATH && item.type === 'blob');
      const existing = entry ? parseCatalog(decodeBlob(await github.readBlob(entry.sha))) : null;
      if (entry && !existing) return repositoryError('catalog_corrupt', false);
      const seed = existing ?? emptyCatalog(SKINCARE_ROUTINES);
      const catalog = action === 'append'
        ? appendProduct(seed, routine, name)
        : retireProduct(seed, routine, name);
      if (!catalog) {
        if (action === 'append' && seed[routine].retired.includes(String(name).trim())) {
          return errorResponse(
            400,
            'retired_product',
            'That product was retired — restore not available yet',
            false,
            PRIVATE_CACHE
          );
        }
        return errorResponse(400, 'invalid_request', 'Provide a valid skincare catalog update.', false, PRIVATE_CACHE);
      }
      const result = await github.writeFile({
        path: SKINCARE_CATALOG_PATH,
        content: JSON.stringify(catalog, null, 2),
        ...(entry ? { sha: entry.sha } : {}),
        message: `chore(skincare): ${action} ${routine} product`
      });
      return jsonResponse(200, { ok: true, data: { catalog, sha: result.sha } }, PRIVATE_CACHE);
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
      (body.action !== 'append' && body.action !== 'retire') ||
      (body.routine !== 'am' && body.routine !== 'pm') ||
      typeof body.name !== 'string' || !body.name.trim()) {
    return null;
  }
  return body;
}

function mapRepositoryError(error) {
  if (error instanceof GitHubClientError && error.code === 'write_conflict') {
    return errorResponse(409, 'write_conflict', 'The skincare catalog was updated elsewhere. Please try again.', true, PRIVATE_CACHE);
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

export default createSkincareCatalogHandler();
