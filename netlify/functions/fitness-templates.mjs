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
import { EXERCISE_LIBRARY_PATH, parseExerciseLibrary } from './_shared/exercise-library.mjs';
import {
  isTemplatePath,
  MAX_PROMPT_TEMPLATES,
  parseTemplateMarkdown
} from './_shared/workout-templates.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';

export const config = { path: '/api/fitness/templates' };

export function createFitnessTemplatesHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function fitnessTemplatesHandler(request) {
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
      const { tree } = await client.resolveTree();
      const templateEntries = tree
        .filter(entry => entry.type === 'blob' && isTemplatePath(entry.path))
        .slice(0, MAX_PROMPT_TEMPLATES);
      const libraryEntry = tree.find(entry => entry.path === EXERCISE_LIBRARY_PATH && entry.type === 'blob');

      const [templateBlobs, libraryBlob] = await Promise.all([
        Promise.all(templateEntries.map(entry => client.readBlob(entry.sha))),
        libraryEntry ? client.readBlob(libraryEntry.sha) : null
      ]);

      const templates = templateEntries
        .map((entry, index) => {
          const content = decodeBlob(templateBlobs[index]);
          const parsed = parseTemplateMarkdown(content);
          if (!parsed || typeof parsed.title !== 'string' || !parsed.title.trim()) return null;
          return {
            title: parsed.title,
            path: entry.path,
            session_kind: parsed.session_kind ?? null,
            day_type: parsed.day_type ?? null,
            focus: Array.isArray(parsed.focus) ? parsed.focus : [],
            source_session_date: parsed.source_session_date ?? null,
            exercises: Array.isArray(parsed.exercises) ? parsed.exercises : []
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(b.source_session_date ?? '').localeCompare(String(a.source_session_date ?? '')));

      const libraryIndex = {};
      if (libraryBlob) {
        const entries = parseExerciseLibrary(decodeBlob(libraryBlob) ?? '[]');
        for (const entry of entries) {
          libraryIndex[entry.name] = {
            target_area: entry.target_area,
            ...(Array.isArray(entry.focus_areas) ? { focus_areas: entry.focus_areas } : {})
          };
        }
      }

      return jsonResponse(200, { ok: true, data: { templates, libraryIndex } }, PRIVATE_CACHE);
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

export default createFitnessTemplatesHandler();
