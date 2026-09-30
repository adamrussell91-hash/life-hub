/**
 * GET /api/challenges/active — open + ended-awaiting-review sprints with computeSprintState.
 */
import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
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
import { listChallengePaths, parseJsonBlob } from './_shared/capabilities/stores.mjs';
import { computeSprintState, listActiveSprints } from './_shared/sprint-evidence.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };

export const config = { path: '/api/challenges/active' };

export function createChallengesActiveHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = () => new Date()
} = {}) {
  return async function challengesActiveHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET'), request, env);
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), Date.now());
    } catch {
      return withCors(misconfiguredResponse(), request, env);
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    try {
      const client = createClient({ env, fetchImpl });
      const tree = (await client.resolveTree())?.tree ?? [];
      const today = getSydneyDateKey(typeof now === 'function' ? now() : now);
      const paths = listChallengePaths(tree);
      const docs = [];
      for (const path of paths) {
        const entry = tree.find(item => item.path === path && item.type === 'blob');
        if (!entry?.sha) continue;
        const raw = decodeBlob(await client.readBlob(entry.sha));
        const doc = parseJsonBlob(raw, null);
        if (doc) docs.push(doc);
      }
      const active = listActiveSprints(docs, today);
      const sprints = active.map(sprint => {
        const state = computeSprintState(sprint, [], today);
        return { sprint, state };
      });
      const dailyCheckOpen = sprints.some(s => s.state.open && s.state.cadence?.daily_check);
      const endedAwaitingReview = sprints.some(s => s.state.ended_awaiting_review);
      return okResponse(200, {
        today,
        sprints,
        flags: {
          anyOpen: sprints.some(s => s.state.open),
          dailyCheckOpen,
          endedAwaitingReview
        }
      }, PRIVATE_CACHE);
    } catch (err) {
      if (err instanceof GitHubConfigurationError) {
        return withCors(misconfiguredResponse(), request, env);
      }
      if (err instanceof GitHubClientError) {
        return errorResponse(502, 'repository_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
      }
      console.error('challenges/active failed', err instanceof Error ? err.message : err);
      return errorResponse(500, 'challenges_failed', 'Could not load challenges.', true, PRIVATE_CACHE);
    }
  }
}

export default createChallengesActiveHandler();
