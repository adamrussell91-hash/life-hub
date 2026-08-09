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
import { AGENTS } from './_shared/agent-directory.mjs';
import { load } from 'js-yaml';
import { parseEventDocument, TYPE_DOMAINS } from '../../js/core/records.js';
import {
  applyLogToCentralNode,
  formatLogDate
} from '../../js/core/central-node-write.js';
import { getSydneyTimestamp } from '../../js/core/time.js';
import { loadCentralNodeSeed } from './_shared/load-central-node-seed.mjs';
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
      const result = await client.writeFile({
        path,
        content: renderMarkdown(validation.record, validation.notes),
        ...(existingSha ? { sha: existingSha } : {}),
        message: `feat(chat): log ${validation.record.type} for ${validation.record.date}`
      });
      if (validation.record.type === 'workout' && validation.record.status === 'completed') {
        try {
          await upsertWorkoutTemplate(client, validation.record);
        } catch {
          // Best-effort template upsert -- the session itself already saved successfully, so a
          // failure here (conflict, transient GitHub error) must never surface as a failed confirmation.
        }
      }
      let centralNodeUpdated = false;
      try {
        const cn = await syncCentralNodeAfterLog(client, validation.record, validation.notes);
        centralNodeUpdated = cn?.updated === true;
      } catch {
        // Best-effort running log -- the record itself already saved successfully, so a
        // failure here (conflict, missing file, transient GitHub error) must never surface
        // as a failed confirmation. The client is told via centralNodeUpdated instead.
        centralNodeUpdated = false;
      }

      let dayoneSent = null;
      let dayoneReason = null;
      let sha = result.sha;
      let commitSha = result.commitSha;
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

function renderMarkdown(record, notes) {
  const frontmatter = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  const body = typeof notes === 'string' && notes.trim() !== '' ? `${notes.trim()}\n` : '';
  return `---\n${frontmatter}\n---\n${body}`;
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

async function syncCentralNodeAfterLog(client, record, notes) {
  const current = await client.resolveTree();
  const entry = current.tree.find(item => item.path === CENTRAL_NODE_PATH && item.type === 'blob');

  let content;
  let existingSha;
  if (entry) {
    content = decodeBlob(await client.readBlob(entry.sha));
    if (content === null) return { updated: false, reason: 'decode_failed' };
    existingSha = entry.sha;
  } else {
    content = loadCentralNodeSeed();
    if (!content) return { updated: false, reason: 'missing_seed' };
    existingSha = undefined;
  }

  const actionLine = `\n**${formatLogDate(record.date)}:** ${agentNameForType(record.type)}: ${describeRecordForLog(record, notes)}`;
  let nutritionTotals = null;
  if (record.type === 'meal') {
    nutritionTotals = await sumDayMealTotals(client, current.tree, record);
  }

  const updated = applyLogToCentralNode(content, {
    record,
    actionLine,
    nutritionTotals,
    flagNotes: ['meal', 'skincare', 'weight', 'composition', 'measurements'].includes(record.type)
      ? notes
      : null
  });
  if (updated === content) return { updated: false, reason: 'unchanged' };

  await client.writeFile({
    path: CENTRAL_NODE_PATH,
    content: updated,
    ...(existingSha ? { sha: existingSha } : {}),
    message: `chore(central-node): sync ${record.type} log into Status`
  });
  return { updated: true };
}

async function sumDayMealTotals(client, tree, record) {
  const domain = TYPE_DOMAINS.meal;
  const [year, month] = record.date.split('-');
  const prefix = `data/${domain}/${year}/${month}/${record.date}-`;
  const mealPaths = tree
    .filter(item => item.type === 'blob' && item.path.startsWith(prefix) && item.path.endsWith('.md'))
    .map(item => item.path);

  const totals = {
    calories: Number(record.calories) || 0,
    protein_g: Number(record.protein_g) || 0,
    fat_g: Number(record.fat_g) || 0
  };
  if (record.sodium_mg != null) totals.sodium_mg = Number(record.sodium_mg) || 0;
  if (record.calcium_mg != null) totals.calcium_mg = Number(record.calcium_mg) || 0;

  for (const path of mealPaths) {
    const blobEntry = tree.find(item => item.path === path);
    if (!blobEntry) continue;
    let text;
    try {
      text = decodeBlob(await client.readBlob(blobEntry.sha));
    } catch {
      continue;
    }
    if (text === null) continue;
    try {
      const parsed = parseEventDocument(text, path, load);
      if (parsed.record?.type !== 'meal') continue;
      if (parsed.record.meal === record.meal) continue;
      totals.calories += Number(parsed.record.calories) || 0;
      totals.protein_g += Number(parsed.record.protein_g) || 0;
      totals.fat_g += Number(parsed.record.fat_g) || 0;
      if (parsed.record.sodium_mg != null) {
        totals.sodium_mg = (totals.sodium_mg ?? 0) + (Number(parsed.record.sodium_mg) || 0);
      }
      if (parsed.record.calcium_mg != null) {
        totals.calcium_mg = (totals.calcium_mg ?? 0) + (Number(parsed.record.calcium_mg) || 0);
      }
    } catch {
      // Ignore unreadable siblings; still publish totals from the confirmed record.
    }
  }

  return totals;
}

function agentNameForType(type) {
  return AGENTS.find(agent => agent.recordTypes.includes(type))?.name ?? 'Life Hub';
}

function describeRecordForLog(record, notes) {
  const label = typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null;
  switch (record.type) {
    case 'meal': {
      const macros = [
        record.calories != null ? `${record.calories} kcal` : null,
        record.protein_g != null ? `${record.protein_g}g protein` : null,
        record.fat_g != null ? `${record.fat_g}g fat` : null
      ].filter(Boolean).join(', ');
      const what = label ? `${label} for ${record.meal}` : record.meal;
      return `Logged ${what}${macros ? ` (${macros})` : ''}.`;
    }
    case 'workout': {
      const duration = record.duration_min != null ? `${record.duration_min}-min ` : '';
      const title = record.title ? ` (${record.title})` : '';
      return `Logged a ${duration}${record.day_type ?? 'workout'} session${title}.`;
    }
    case 'skincare':
      return `Logged ${record.routine ?? ''} skincare${record.completed === false ? ' (incomplete)' : ''}.`.replace(/\s+/g, ' ');
    case 'diary':
      return `Logged a diary entry${record.mood ? ` (mood: ${record.mood})` : ''}.`;
    case 'weight':
      return `Logged weight${record.weight_kg != null ? `: ${record.weight_kg}kg` : ''}.`;
    case 'composition':
      return `Logged body composition${record.weight_kg != null ? ` (${record.weight_kg}kg${record.body_fat_pct != null ? `, ${record.body_fat_pct}% body fat` : ''})` : ''}.`;
    case 'measurements':
      return 'Logged body measurements.';
    default:
      return `Logged a ${record.type} record.`;
  }
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
