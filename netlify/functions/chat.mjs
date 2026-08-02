import { randomBytes } from 'node:crypto';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  readCookie
} from './_shared/http.mjs';
import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { selectManifestEntries } from './_shared/repo-policy.mjs';
import { routeAgent, findAgent, ROUTER_SLUG } from './_shared/agent-directory.mjs';
import { buildSystemPrompt } from './_shared/persona.mjs';
import { extractConstraints } from './_shared/constraints.mjs';
import { summarizeRecentHistory } from './_shared/digest.mjs';
import { TARGETS_CONFIG } from './_shared/targets-config.mjs';
import { logEntryToolSchema, validateLogEntry, buildCanonicalPath } from './_shared/chat-schema.mjs';
import { createAnthropicClient, AnthropicClientError } from './_shared/anthropic-client.mjs';
import { getSydneyDateKey, getSydneyTimestamp, addCalendarDays } from '../../js/core/time.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 8 * 1024;
const MAX_MESSAGE_LENGTH = 4000;

export const config = { path: '/api/chat' };

export function createChatHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  createAnthropicClient: createAnthropic = createAnthropicClient,
  now = Date.now
} = {}) {
  return async function chatHandler(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
    const originError = guardRequestOrigin(request);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env) || typeof env.ANTHROPIC_API_KEY !== 'string' || env.ANTHROPIC_API_KEY.length === 0) {
      return withPrivateCache(misconfiguredResponse());
    }

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

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return repositoryError();
    }

    const slug = routeAgent(parsed.message);
    const agent = slug === ROUTER_SLUG ? null : findAgent(slug);
    const today = getSydneyDateKey(new Date(now()));
    const from = addCalendarDays(today, -6);

    let digest = '';
    let constraints = '';
    try {
      const current = await client.resolveTree();
      const manifest = selectManifestEntries(current.tree, { from, to: today });
      const files = [];
      for (const entry of manifest) {
        if (!entry.path.startsWith('data/')) continue;
        const decoded = decodeBlob(await client.readBlob(entry.sha));
        if (decoded !== null) files.push({ path: entry.path, content: decoded });
      }
      digest = summarizeRecentHistory(files, TARGETS_CONFIG, today);

      const centralNodeEntry = current.tree.find(entry => entry.path === 'central-node.md' && entry.type === 'blob');
      if (centralNodeEntry) {
        const decoded = decodeBlob(await client.readBlob(centralNodeEntry.sha));
        if (decoded !== null) constraints = extractConstraints(decoded);
      }
    } catch {
      digest = '';
      constraints = '';
    }

    const system = buildSystemPrompt({ slug, digest, constraints });
    const allowedTypes = agent?.recordTypes.length ? agent.recordTypes : undefined;
    const tools = allowedTypes ? [logEntryToolSchema(allowedTypes)] : [];

    let anthropic;
    try {
      anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, fetchImpl });
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }

    const nowInstant = new Date(now());
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = event => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: 'agent', slug });
        try {
          for await (const event of anthropic.streamMessage({
            system,
            messages: [{ role: 'user', content: parsed.message }],
            tools,
            signal: request.signal
          })) {
            if (event.type === 'tool_call' && event.name === 'log_entry') {
              const validation = validateLogEntry(event.input, {
                id: `${event.input?.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
                now: getSydneyTimestamp(nowInstant)
              });
              if (validation.valid) {
                send({
                  type: 'record_proposal',
                  record: validation.record,
                  path: buildCanonicalPath({
                    type: validation.record.type,
                    date: validation.record.date,
                    slug: slugFor(validation.record)
                  })
                });
              } else {
                send({ type: 'record_rejected', errors: validation.errors });
              }
            } else {
              send(event);
            }
          }
        } catch (error) {
          send({ type: 'error', code: error instanceof AnthropicClientError ? error.code : 'anthropic_unavailable' });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', ...PRIVATE_CACHE, connection: 'keep-alive' }
    });
  };
}

function slugFor(record) {
  if (record.type === 'meal') return record.meal;
  if (record.type === 'skincare') return record.routine;
  return record.type;
}

function decodeBlob(blob) {
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') return null;
  const content = blob.content.replace(/\n/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(content, 'base64'));
  } catch {
    return null;
  }
}

async function parseRequest(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { error: errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false, PRIVATE_CACHE) };
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH) {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  return { message: body.message };
}

function repositoryError() {
  return errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatHandler();
