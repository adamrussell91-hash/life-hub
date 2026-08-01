import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  errorResponse,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  readCookie
} from './_shared/http.mjs';
import {
  createGitHubClient,
  GitHubClientError,
  GitHubConfigurationError
} from './_shared/github-client.mjs';
import { isAllowedRepositoryPath, parseDateRange, selectManifestEntries } from './_shared/repo-policy.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 16 * 1024;
const MAX_FILES = 50;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_BATCH_BYTES = 1024 * 1024;
const BLOB_SHA = /^[0-9a-f]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';
const BODY_TOO_LARGE = Symbol('body_too_large');

export const config = { path: '/api/repo/files' };

export function createRepoFilesHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function repoFilesHandler(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
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

    if (!isJsonRequest(request)) {
      return errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false, PRIVATE_CACHE);
    }
    const parsed = await parseRequest(request);
    if (parsed.error) return parsed.error;

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') {
        return withPrivateCache(misconfiguredResponse());
      }
      return repositoryError('github_unavailable', true);
    }

    let current;
    try {
      current = await client.resolveTree();
    } catch (error) {
      return mapRepositoryError(error);
    }

    const manifest = selectManifestEntries(current.tree, parsed.range);
    const allowedPairs = new Map(manifest.map(file => [`${file.path}\0${file.sha}`, file]));
    const requestedEntries = parsed.files.map(file => allowedPairs.get(`${file.path}\0${file.sha}`));
    if (requestedEntries.some(file => !file)) {
      return errorResponse(409, 'stale_manifest', 'Refresh the repository manifest and try again.', true, PRIVATE_CACHE);
    }

    const declaredBytes = requestedEntries.reduce((total, file) => total + file.size, 0);
    if (declaredBytes > MAX_BATCH_BYTES) return batchTooLarge();

    const files = [];
    let actualBytes = 0;
    for (const requestFile of parsed.files) {
      let blob;
      try {
        blob = await client.readBlob(requestFile.sha);
      } catch (error) {
        return mapRepositoryError(error);
      }

      const decoded = decodeBlob(blob, requestFile.sha);
      if (!decoded) return repositoryError('github_invalid_response', true);
      if (decoded.byteLength > MAX_FILE_BYTES) {
        return errorResponse(413, 'file_too_large', 'A requested file is too large.', false, PRIVATE_CACHE);
      }
      actualBytes += decoded.byteLength;
      if (actualBytes > MAX_BATCH_BYTES) return batchTooLarge();

      let content;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
      } catch {
        return repositoryError('github_invalid_response', true);
      }
      files.push({ path: requestFile.path, sha: requestFile.sha, content });
    }

    return jsonResponse(200, {
      ok: true,
      data: { commitSha: current.commitSha, files }
    }, PRIVATE_CACHE);
  };
}

function isJsonRequest(request) {
  return request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

async function parseRequest(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: requestTooLarge() };
  }

  let bytes;
  try {
    bytes = await readAtMost(request.body, MAX_BODY_BYTES);
  } catch (error) {
    return { error: error === BODY_TOO_LARGE ? requestTooLarge() : invalidRequest() };
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: invalidRequest() };
  }

  if (!isRequestBody(body)) return { error: invalidRequest() };
  if (body.files.length > MAX_FILES) return { error: batchTooLarge() };

  const seen = new Set();
  for (const file of body.files) {
    if (!isRequestFile(file) || seen.has(`${file.path}\0${file.sha}`)) {
      return { error: invalidRequest() };
    }
    seen.add(`${file.path}\0${file.sha}`);
  }

  return { range: { from: body.from, to: body.to }, files: body.files };
}

async function readAtMost(stream, limit) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw BODY_TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error === BODY_TOO_LARGE) throw error;
    throw new Error('request_read_failed');
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !sameKeys(body, ['files', 'from', 'to']) || !Array.isArray(body.files) ||
      typeof body.from !== 'string' || typeof body.to !== 'string') {
    return false;
  }
  try {
    const url = new URL('https://life.example/');
    url.searchParams.set('from', body.from);
    url.searchParams.set('to', body.to);
    parseDateRange(url);
    return true;
  } catch {
    return false;
  }
}

function isRequestFile(file) {
  return file && typeof file === 'object' && !Array.isArray(file) &&
    sameKeys(file, ['path', 'sha']) && isAllowedRepositoryPath(file.path) && BLOB_SHA.test(file.sha);
}

function sameKeys(object, expected) {
  const keys = Object.keys(object).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function decodeBlob(blob, expectedSha) {
  if (!blob || blob.sha !== expectedSha || blob.encoding !== 'base64' || typeof blob.content !== 'string') return null;
  const content = blob.content.replace(/\n/g, '');
  if (!BASE64.test(content)) return null;
  return Buffer.from(content, 'base64');
}

function invalidRequest() {
  return errorResponse(400, 'invalid_request', 'Provide a valid file request.', false, PRIVATE_CACHE);
}

function requestTooLarge() {
  return errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE);
}

function batchTooLarge() {
  return errorResponse(413, 'batch_too_large', 'The requested file batch is too large.', false, PRIVATE_CACHE);
}

function mapRepositoryError(error) {
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

export default createRepoFilesHandler();
