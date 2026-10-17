import { randomUUID } from 'node:crypto';
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
import { PropertyReaderError, readPropertyDocument } from './_shared/property-reader.mjs';
import {
  PROPERTY_DATA_PATH,
  addEntries,
  addEntry,
  emptyPropertyRecord,
  markLodged,
  parsePropertyRecord,
  removeEntry,
  sydneyDateKey,
  updateSettings
} from '../../apps/life/js/app/property-model.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';
const ACTIONS = new Set(['add', 'add-many', 'remove', 'settings', 'lodged', 'read']);

export const config = { path: '/api/property' };

export function createPropertyHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now,
  newId = () => randomUUID().slice(0, 8)
} = {}) {
  return async function propertyHandler(request) {
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

    let github;
    try {
      github = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return withPrivateCache(misconfiguredResponse());
      return mapRepositoryError(error);
    }

    try {
      if (request.method === 'GET') {
        const { record } = await load(github);
        return jsonResponse(200, { ok: true, data: { record } }, PRIVATE_CACHE);
      }
      const body = await parseBody(request);
      if (!body) return errorResponse(400, 'invalid_request', 'Provide a valid property update.', false, PRIVATE_CACHE);
      const { record, sha } = await load(github);
      const today = sydneyDateKey(new Date(now()));
      if (body.action === 'read') return await read(body.file, record, today);
      const result = apply(record, body, today);
      if (result.error) return errorResponse(400, 'invalid_entry', result.error, false, PRIVATE_CACHE);
      await github.writeFile({
        path: PROPERTY_DATA_PATH,
        content: JSON.stringify(result.record, null, 2),
        ...(sha ? { sha } : {}),
        message: `chore(property): ${commitLabel(body, result)}`
      });
      const extra = result.entry ? { entry: result.entry } : result.entries ? { entries: result.entries } : {};
      return jsonResponse(200, { ok: true, data: { record: result.record, ...extra } }, PRIVATE_CACHE);
    } catch (error) {
      return mapRepositoryError(error);
    }
  }

  async function read(file, record, today) {
    try {
      const data = await readPropertyDocument({ file, record, today, apiKey: env.ANTHROPIC_API_KEY, fetchImpl, model: env.PROPERTY_READER_MODEL || undefined });
      return jsonResponse(200, { ok: true, data }, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof PropertyReaderError) return errorResponse(error.status, error.code, error.message, error.retryable, PRIVATE_CACHE);
      throw error;
    }
  }

  function apply(record, body, today) {
    if (body.action === 'add') return addEntry(record, body.entry, { id: `${body.entry?.kind ?? 'entry'}-${newId()}`, today });
    if (body.action === 'add-many') return addEntries(record, body.entries, { newId, today });
    if (body.action === 'remove') return removeEntry(record, body.id);
    if (body.action === 'settings') return updateSettings(record, body.patch);
    return markLodged(record, body.fy);
  }
}

/** Read the record. A missing file is an empty property, not an error; it's created on the first write. */
async function load(github) {
  const { tree } = await github.resolveTree();
  const entry = tree.find(item => item.path === PROPERTY_DATA_PATH && item.type === 'blob');
  if (!entry) return { record: emptyPropertyRecord(), sha: null };
  let raw;
  try {
    raw = JSON.parse(decodeBlob(await github.readBlob(entry.sha)));
  } catch {
    throw Object.assign(new Error('property_corrupt'), { code: 'property_corrupt' });
  }
  const record = parsePropertyRecord(raw);
  if (!record) throw Object.assign(new Error('property_corrupt'), { code: 'property_corrupt' });
  return { record, sha: entry.sha };
}

async function parseBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !ACTIONS.has(body.action)) return null;
  if (body.action === 'add' && (!body.entry || typeof body.entry !== 'object')) return null;
  if (body.action === 'add-many' && !Array.isArray(body.entries)) return null;
  if (body.action === 'read' && (!body.file || typeof body.file !== 'object')) return null;
  if (body.action === 'remove' && (typeof body.id !== 'string' || !body.id)) return null;
  if (body.action === 'settings' && (!body.patch || typeof body.patch !== 'object')) return null;
  if (body.action === 'lodged' && typeof body.fy !== 'string') return null;
  return body;
}

function commitLabel(body, result) {
  if (body.action === 'add') return `add ${body.entry.kind}`;
  if (body.action === 'add-many') return `add ${result.entries.length} from a statement`;
  return body.action;
}

function mapRepositoryError(error) {
  if (error?.code === 'property_corrupt') return repositoryError('property_corrupt', false);
  if (error instanceof GitHubClientError && error.code === 'write_conflict') {
    return errorResponse(409, 'write_conflict', 'The property was updated elsewhere. Please try again.', true, PRIVATE_CACHE);
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

export default createPropertyHandler();
