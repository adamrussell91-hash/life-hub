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
import { decodeBlob } from './_shared/decode-blob.mjs';
import { buildCanonicalPath, validateLogEntry } from './_shared/chat-schema.mjs';
import { buildTemplateRecord, renderTemplateMarkdown, templatePathForTitle } from './_shared/workout-templates.mjs';
import {
  applyCompletedWorkoutToLibrary,
  EXERCISE_LIBRARY_PATH,
  parseExerciseLibrary
} from './_shared/exercise-library.mjs';
import { persistLogEntry, renderMarkdown } from './_shared/persist-log.mjs';
import { getSydneyDateKey, getSydneyTimestamp } from '../../js/core/time.js';
import { sendDiaryToDayOne } from './_shared/dayone-send.mjs';
import {
  validateCentralNodePatchInput,
  classifyCentralNodePatchRisk,
  applyCentralNodePatch
} from './_shared/hammond-tools.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 16 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BODY_TOO_LARGE = Symbol('body_too_large');
const CENTRAL_NODE_PATH = 'central-node.md';
const HAMMOND_SLUG = 'hammond';

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

    if (parsed.kind === 'cn_patch') {
      return handleCnPatchConfirm(parsed);
    }

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
      const persisted = await persistLogEntry(client, {
        record: validation.record,
        notes: validation.notes,
        path,
        existingSha,
        nowDateKey: getSydneyDateKey(new Date(now()))
      });
      let exercisePersonalBests;
      if (validation.record.type === 'workout' && validation.record.status === 'completed') {
        try {
          await upsertWorkoutTemplate(client, validation.record);
        } catch {
          // Best-effort template upsert -- the session itself already saved successfully, so a
          // failure here (conflict, transient GitHub error) must never surface as a failed confirmation.
        }
        try {
          exercisePersonalBests = await upsertExerciseLibraryProgress(
            client,
            validation.record,
            getSydneyTimestamp(new Date(now()))
          );
        } catch {
          // Best-effort library progress write -- same rationale as the template upsert above:
          // the session record itself already saved, so a library read/write failure (conflict,
          // missing file, transient GitHub error) must never surface as a failed confirmation.
          exercisePersonalBests = [];
        }
      }
      const centralNodeUpdated = persisted.centralNodeUpdated === true;

      let dayoneSent = null;
      let dayoneReason = null;
      let sha = persisted.sha;
      let commitSha = persisted.commitSha;
      if (validation.record.type === 'diary') {
        const dispatch = await sendDiaryToDayOne({
          notes: validation.notes,
          date: validation.record.date,
          env,
          fetchImpl
        });
        if (dispatch.reason !== 'not_configured') {
          dayoneSent = dispatch.sent === true;
          dayoneReason = dispatch.reason ?? null;
          if (dayoneSent && validation.record.dayone_sent !== true) {
            try {
              const patched = { ...validation.record, dayone_sent: true };
              const updated = await client.writeFile({
                path,
                content: renderMarkdown(patched, validation.notes),
                sha,
                message: `chore(chat): mark diary dayone_sent for ${validation.record.date}`
              });
              sha = updated.sha;
              commitSha = updated.commitSha;
            } catch {
              // Entry already saved and emailed; leaving dayone_sent false is recoverable.
            }
          }
        }
      }

      return jsonResponse(200, {
        ok: true,
        data: {
          path,
          sha,
          commitSha,
          centralNodeUpdated,
          ...(exercisePersonalBests !== undefined ? { personalBests: exercisePersonalBests } : {}),
          ...(dayoneSent != null ? { dayoneSent, ...(dayoneReason ? { dayoneReason } : {}) } : {})
        }
      }, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict') {
        return errorResponse(409, 'write_conflict', 'A record already exists at this path.', true, PRIVATE_CACHE);
      }
      return mapRepositoryError(error);
    }
  };

  async function handleCnPatchConfirm(parsed) {
    if (parsed.slug !== HAMMOND_SLUG) {
      return errorResponse(400, 'invalid_request', 'Central Node patches require the hammond slug.', false, PRIVATE_CACHE);
    }

    const patch = validateCentralNodePatchInput(parsed.candidate);
    if (!patch) {
      return errorResponse(400, 'invalid_patch', 'This Central Node patch could not be validated.', false, PRIVATE_CACHE);
    }

    const risk = classifyCentralNodePatchRisk(patch);
    if (risk !== 'confirm') {
      return errorResponse(
        400,
        'auto_class_rejected',
        'Auto-class Central Node patches cannot be confirmed via this endpoint.',
        false,
        PRIVATE_CACHE
      );
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return repositoryError('github_unavailable', true);
    }

    let content;
    let existingSha;
    try {
      const current = await client.resolveTree();
      const entry = current.tree.find(item => item.path === CENTRAL_NODE_PATH && item.type === 'blob');
      if (!entry) {
        return errorResponse(404, 'central_node_missing', 'Central Node is not available.', true, PRIVATE_CACHE);
      }
      content = decodeBlob(await client.readBlob(entry.sha));
      if (content === null) {
        return errorResponse(503, 'central_node_unreadable', 'Central Node could not be read.', true, PRIVATE_CACHE);
      }
      existingSha = entry.sha;
    } catch (error) {
      return mapRepositoryError(error);
    }

    const next = applyCentralNodePatch(content, patch);
    if (!next) {
      return errorResponse(400, 'apply_failed', 'This Central Node patch could not be applied.', false, PRIVATE_CACHE);
    }

    try {
      await client.writeFile({
        path: CENTRAL_NODE_PATH,
        content: next,
        sha: existingSha,
        message: `chore(cn): ${patch.payload.summary}`
      });
      return jsonResponse(200, {
        ok: true,
        data: {
          path: CENTRAL_NODE_PATH,
          summary: patch.payload.summary
        }
      }, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict') {
        return errorResponse(409, 'write_conflict', 'Central Node changed while confirming. Try again.', true, PRIVATE_CACHE);
      }
      return mapRepositoryError(error);
    }
  }
}

async function upsertWorkoutTemplate(client, record) {
  const path = templatePathForTitle(record.title);
  const template = buildTemplateRecord(record, record.date);
  const content = renderTemplateMarkdown(template);
  const current = await client.resolveTree();
  const existingSha = current.tree.find(entry => entry.path === path && entry.type === 'blob')?.sha;
  await client.writeFile({
    path,
    content,
    ...(existingSha ? { sha: existingSha } : {}),
    message: `chore(fitness-templates): upsert ${record.title}`
  });
}

async function upsertExerciseLibraryProgress(client, record, updatedAt) {
  const current = await client.resolveTree();
  const entry = current.tree.find(item => item.path === EXERCISE_LIBRARY_PATH && item.type === 'blob');
  if (!entry) return [];

  const content = decodeBlob(await client.readBlob(entry.sha));
  if (content === null) return [];

  const libraryEntries = parseExerciseLibrary(content);
  const { entries: nextEntries, pbs } = applyCompletedWorkoutToLibrary(libraryEntries, record, updatedAt);
  if (pbs.length === 0 && JSON.stringify(nextEntries) === JSON.stringify(libraryEntries)) return [];

  await client.writeFile({
    path: EXERCISE_LIBRARY_PATH,
    content: JSON.stringify(nextEntries, null, 2),
    sha: entry.sha,
    message: `chore(exercise-library): progress from ${record.title ?? 'workout'} on ${record.date}`
  });
  return pbs;
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
      !SLUG.test(body.slug) || !body.candidate || typeof body.candidate !== 'object' || Array.isArray(body.candidate)) {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid confirmation request.', false, PRIVATE_CACHE) };
  }
  const kind = body.kind === 'cn_patch' ? 'cn_patch' : 'log';
  return { candidate: body.candidate, slug: body.slug, overwrite: body.overwrite === true, kind };
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
