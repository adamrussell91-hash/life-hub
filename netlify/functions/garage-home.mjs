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
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { GmailError, isGmailConfigured } from './_shared/gmail-client.mjs';
import { loadGarageHome, saveRecord, scanMailroom } from './_shared/garage-home-store.mjs';
import {
  GARAGE_HOME_DATA_PATH,
  MAILROOM_DATA_PATH,
  addVisit,
  applyMailAction,
  forgetSender,
  importPack,
  removePlace,
  removeVisit,
  savePlace,
  sydneyDateKey,
  toggleNeeded,
  togglePrep,
  updateAutoFile
} from '../../apps/life/js/app/garage-home-model.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const REPOSITORY_MESSAGE = 'The repository is temporarily unavailable.';
const HOME_ACTIONS = new Set(['place', 'remove-place', 'visit', 'remove-visit', 'prep', 'needed', 'autofile', 'import']);
const MAIL_ACTIONS = new Set(['mail', 'forget-sender']);

export const config = { path: '/api/garage-home' };

export function createGarageHomeHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now,
  newId = () => randomUUID().slice(0, 8)
} = {}) {
  return async function garageHomeHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET' && request.method !== 'POST') return withPrivateCache(methodNotAllowed('GET, POST'));
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
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, { ...PRIVATE_CACHE, 'set-cookie': clearCookie() });
    }

    let github;
    try {
      github = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return withPrivateCache(misconfiguredResponse());
      return mapError(error);
    }

    const gmailConnected = isGmailConfigured(env);
    try {
      const loaded = await loadGarageHome(github);
      if (request.method === 'GET') return ok(loaded.home.record, loaded.mailroom.record, gmailConnected);

      const body = await parseBody(request);
      if (!body) return errorResponse(400, 'invalid_request', 'Provide a valid Garage & Home update.', false, PRIVATE_CACHE);
      const today = sydneyDateKey(new Date(now()));

      if (body.action === 'scan') {
        const result = await scanMailroom({ github, env, fetchImpl, now, loaded });
        if (result.status === 'not_connected') return errorResponse(409, 'gmail_not_connected', 'Connect Gmail first.', false, PRIVATE_CACHE);
        return ok(loaded.home.record, result.mailroom ?? loaded.mailroom.record, gmailConnected, { scan: { status: result.status, added: result.added } });
      }

      if (MAIL_ACTIONS.has(body.action)) {
        const result = body.action === 'mail'
          ? applyMailAction(loaded.mailroom.record, loaded.home.record, body.mail, { today })
          : forgetSender(loaded.mailroom.record, body.from);
        if (result.error) return errorResponse(400, 'invalid_entry', result.error, false, PRIVATE_CACHE);
        await saveRecord(github, MAILROOM_DATA_PATH, result.mailroom, loaded.mailroom.sha, `chore(mailroom): ${body.action === 'mail' ? body.mail.action : 'forget sender'}`);
        return ok(loaded.home.record, result.mailroom, gmailConnected);
      }

      const result = applyHome(loaded.home.record, body, today);
      if (result.error) return errorResponse(400, 'invalid_entry', result.error, false, PRIVATE_CACHE);
      await saveRecord(github, GARAGE_HOME_DATA_PATH, result.record, loaded.home.sha, `chore(garage-home): ${body.action}`);
      const extra = body.action === 'import' ? { imported: { places: result.placesAdded, visits: result.visitsAdded } } : {};
      return ok(result.record, loaded.mailroom.record, gmailConnected, extra);
    } catch (error) {
      return mapError(error);
    }
  }

  function applyHome(record, body) {
    switch (body.action) {
      case 'place': return savePlace(record, body.place);
      case 'remove-place': return removePlace(record, body.id);
      case 'visit': return addVisit(record, body.visit, { id: `visit-${newId()}` });
      case 'remove-visit': return removeVisit(record, body.id);
      case 'prep': return togglePrep(record, body);
      case 'needed': return toggleNeeded(record, body);
      case 'autofile': return updateAutoFile(record, body.patch);
      case 'import': return importPack(record, body.pack, { newId: () => `visit-${newId()}` });
      default: return { error: 'Unknown action.' };
    }
  }
}

function ok(home, mailroom, gmailConnected, extra = {}) {
  return jsonResponse(200, { ok: true, data: { home, mailroom, gmailConnected, ...extra } }, PRIVATE_CACHE);
}

async function parseBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.action === 'scan') return body;
  if (!HOME_ACTIONS.has(body.action) && !MAIL_ACTIONS.has(body.action)) return null;
  if (body.action === 'mail' && (!body.mail || typeof body.mail !== 'object' || typeof body.mail.id !== 'string')) return null;
  if (body.action === 'forget-sender' && typeof body.from !== 'string') return null;
  if (body.action === 'place' && (!body.place || typeof body.place !== 'object')) return null;
  if (body.action === 'visit' && (!body.visit || typeof body.visit !== 'object')) return null;
  if ((body.action === 'remove-place' || body.action === 'remove-visit') && typeof body.id !== 'string') return null;
  if (body.action === 'import' && (!body.pack || typeof body.pack !== 'object')) return null;
  return body;
}

function mapError(error) {
  if (error?.code === 'garage_home_corrupt') return repositoryError('garage_home_corrupt', false);
  if (error instanceof GmailError) {
    return error.code === 'gmail_reconnect'
      ? errorResponse(409, 'gmail_reconnect', 'Gmail needs reconnecting.', false, PRIVATE_CACHE)
      : errorResponse(503, error.code, 'Gmail is temporarily unavailable.', true, PRIVATE_CACHE);
  }
  if (error instanceof GitHubClientError && error.code === 'write_conflict') {
    return errorResponse(409, 'write_conflict', 'Garage & Home was updated elsewhere. Please try again.', true, PRIVATE_CACHE);
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

export default createGarageHomeHandler();
