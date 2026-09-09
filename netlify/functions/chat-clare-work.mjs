import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
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
import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import { invokeWeeklyReviewProposal } from './_shared/invoke-weekly-review-proposal.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_TOOLS = new Set(['weekly_review']);

export const config = { path: '/api/chat/clare-work' };

export function createChatClareWorkHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now,
  getTasksStore = defaultGetTasksStore,
  invokeWeeklyReviewProposal: invokeProposal = invokeWeeklyReviewProposal
} = {}) {
  return async function chatClareWorkHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'POST') {
      return withPrivateCache(methodNotAllowed('POST'));
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
    if (!session?.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    let body;
    try {
      const text = await request.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
        return errorResponse(413, 'body_too_large', 'Request body is too large.', false, PRIVATE_CACHE);
      }
      body = text ? JSON.parse(text) : {};
    } catch {
      return errorResponse(400, 'invalid_json', 'Request body must be JSON.', false, PRIVATE_CACHE);
    }

    const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
    if (!ALLOWED_TOOLS.has(tool)) {
      return errorResponse(
        400,
        'tool_not_allowed',
        'Only weekly_review is supported on this endpoint.',
        false,
        PRIVATE_CACHE
      );
    }

    const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input)
      ? body.input
      : null;
    if (!input) {
      return errorResponse(400, 'invalid_input', 'input object is required.', false, PRIVATE_CACHE);
    }
    if (!Array.isArray(input.selected_changes)) {
      return errorResponse(
        400,
        'selected_changes_required',
        'selected_changes must be an array of stable change ids.',
        false,
        PRIVATE_CACHE
      );
    }

    const slug =
      typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : 'clare';

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) {
        return withPrivateCache(misconfiguredResponse());
      }
      return errorResponse(503, 'github_unavailable', 'GitHub is temporarily unavailable.', true, PRIVATE_CACHE);
    }

    const tasksStore = await getTasksStore(env);
    const selectedChanges = input.selected_changes.map((id) => String(id)).filter(Boolean);
    const result = await invokeProposal({
      tool,
      input: {
        ...input,
        advance: false,
        confirm: true,
        selected_changes: selectedChanges
      },
      slug,
      githubClient: client,
      tasksStore,
      now: now()
    });

    if (!result.ok) {
      const status = result.error === 'proposal_not_generated' ? 409 : 400;
      return errorResponse(
        status,
        result.error || 'clare_work_failed',
        'Weekly Review proposal could not be generated.',
        false,
        PRIVATE_CACHE,
        { detail: result.detail || null, result: result.result || null }
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        data: {
          pendingId: result.pendingId,
          proposal: result.proposal,
          selected_changes: result.selected_changes,
          review_id: result.review_id,
          state: result.state,
          workflow_kind: result.workflow_kind,
          workflow_id: result.workflow_id
        }
      },
      PRIVATE_CACHE
    );
  }

  function withPrivateCache(response) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
  }
}

export default createChatClareWorkHandler();
