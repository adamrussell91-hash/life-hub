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
import { buildHubMapSeed } from '../../apps/life/js/app/hub-map-seed.js';
import { HUB_MAP_PATH, parseMap, validateMap } from '../../apps/life/js/app/hub-map-model.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';
const MAX_BODY_BYTES = 256 * 1024;

export const config = { path: '/api/hub-map' };

export function createHubMapHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function hubMapHandler(request) {
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
      const body = await readBody(request);
      if (body === 'too_large') {
        return errorResponse(413, 'payload_too_large', 'The hub map is too large to save.', false, PRIVATE_CACHE);
      }
      const checked = body ? validateMap(body.map) : null;
      const baseSha = body && (body.baseSha === null || typeof body.baseSha === 'string') ? body.baseSha : undefined;
      if (!checked?.ok || baseSha === undefined) {
        return errorResponse(400, 'invalid_request', 'Provide a valid hub map.', false, PRIVATE_CACHE);
      }
      return saveMap(checked.map, baseSha);
    }
    return getMap();
  }

  function client() {
    try {
      return createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return null;
      throw error;
    }
  }

  async function findEntry(github) {
    const { tree } = await github.resolveTree();
    return tree.find(item => item.path === HUB_MAP_PATH && item.type === 'blob') ?? null;
  }

  async function getMap() {
    try {
      const github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const entry = await findEntry(github);
      if (!entry) {
        return jsonResponse(200, { ok: true, data: { map: buildHubMapSeed(), sha: null, seeded: true } }, PRIVATE_CACHE);
      }
      const map = parseMap(decodeBlob(await github.readBlob(entry.sha)));
      if (!map) return repositoryError('map_corrupt', false);
      return jsonResponse(200, { ok: true, data: { map, sha: entry.sha, seeded: false } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  async function saveMap(map, baseSha) {
    try {
      const github = client();
      if (!github) return withPrivateCache(misconfiguredResponse());
      const entry = await findEntry(github);
      if ((entry?.sha ?? null) !== baseSha) return conflict();
      const result = await github.writeFile({
        path: HUB_MAP_PATH,
        content: `${JSON.stringify(map, null, 2)}\n`,
        ...(entry ? { sha: entry.sha } : {}),
        message: 'chore(hub-map): update page map'
      });
      return jsonResponse(200, { ok: true, data: { map, sha: result.sha, seeded: false } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }
}

async function readBody(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return 'too_large';
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function conflict() {
  return errorResponse(409, 'write_conflict', 'The hub map was updated elsewhere. Reload to continue.', true, PRIVATE_CACHE);
}

function mapRepositoryError(error) {
  if (error instanceof GitHubClientError && error.code === 'write_conflict') return conflict();
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

export default createHubMapHandler();
