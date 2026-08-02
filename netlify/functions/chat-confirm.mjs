import { randomBytes } from 'node:crypto';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
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
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { buildCanonicalPath, validateLogEntry } from './_shared/chat-schema.mjs';
import { getSydneyTimestamp } from '../../js/core/time.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 16 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BODY_TOO_LARGE = Symbol('body_too_large');

export const config = { path: '/api/chat/confirm' };

export function createChatConfirmHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function chatConfirmHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
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

    const parsed = await parseRequest(request);
    if (parsed.error) return parsed.error;

    const validation = validateLogEntry(parsed.candidate, {
      id: `${parsed.candidate.type}-${parsed.candidate.date}-${randomBytes(3).toString('hex')}`,
      now: getSydneyTimestamp(new Date(now()))
    });
    if (!validation.valid) {
      return errorResponse(400, 'invalid_record', 'This record could not be validated.', false, PRIVATE_CACHE);
    }

    let path;
    try {
      path = buildCanonicalPath({ type: validation.record.type, date: validation.record.date, slug: parsed.slug });
    } catch {
      return errorResponse(400, 'invalid_record', 'This record could not be validated.', false, PRIVATE_CACHE);
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return repositoryError('github_unavailable', true);
    }

    let existingSha;
    if (parsed.overwrite) {
      try {
        const current = await client.resolveTree();
        existingSha = current.tree.find(entry => entry.path === path && entry.type === 'blob')?.sha;
      } catch (error) {
        return mapRepositoryError(error);
      }
    }

    try {
      const result = await client.writeFile({
        path,
        content: renderMarkdown(validation.record),
        ...(existingSha ? { sha: existingSha } : {}),
        message: `feat(chat): log ${validation.record.type} for ${validation.record.date}`
      });
      return jsonResponse(200, { ok: true, data: { path, sha: result.sha, commitSha: result.commitSha } }, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict') {
        return errorResponse(409, 'write_conflict', 'A record already exists at this path.', true, PRIVATE_CACHE);
      }
      return mapRepositoryError(error);
    }
  };
}

function renderMarkdown(record) {
  const frontmatter = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  return `---\n${frontmatter}\n---\n`;
}

async function parseRequest(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    void request.body?.cancel().catch(() => undefined);
    return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
  }

  let bytes;
  try {
    bytes = await readAtMost(request.body, MAX_BODY_BYTES);
  } catch (error) {
    if (error === BODY_TOO_LARGE) {
      return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
    }
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid confirmation request.', false, PRIVATE_CACHE) };
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid confirmation request.', false, PRIVATE_CACHE) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.slug !== 'string' ||
      !SLUG.test(body.slug) || !body.candidate || typeof body.candidate !== 'object') {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid confirmation request.', false, PRIVATE_CACHE) };
  }
  return { candidate: body.candidate, slug: body.slug, overwrite: body.overwrite === true };
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
        await reader.cancel().catch(() => undefined);
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

function mapRepositoryError(error) {
  if (error instanceof GitHubClientError) return repositoryError(error.code, error.retryable);
  return repositoryError('github_unavailable', true);
}

function repositoryError(code, retryable) {
  return errorResponse(503, code, 'The repository is temporarily unavailable.', retryable, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatConfirmHandler();
