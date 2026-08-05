import { randomBytes } from 'node:crypto';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readCookie,
  withCors
} from './_shared/http.mjs';
import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { selectManifestEntries } from './_shared/repo-policy.mjs';
import { routeAgent, findAgent, ROUTER_SLUG } from './_shared/agent-directory.mjs';
import { buildSystemPrompt } from './_shared/persona.mjs';
import { loadChadwickProtocol } from './_shared/load-chadwick-protocol.mjs';
import { loadHyaluronicaProtocol } from './_shared/load-hyaluronica-protocol.mjs';
import { loadPenelopeProtocol } from './_shared/load-penelope-protocol.mjs';
import { loadVeraProtocol } from './_shared/load-vera-protocol.mjs';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractTodaysStatus
} from '../../js/core/constraints.js';
import { summarizeRecentHistory } from './_shared/digest.mjs';
import { TARGETS_CONFIG } from './_shared/targets-config.mjs';
import { logEntryToolSchema, validateLogEntry, buildCanonicalPath } from './_shared/chat-schema.mjs';
import {
  FOOD_LIBRARY_PATH,
  foodLibraryEntrySchema,
  formatFoodLibraryForPrompt,
  parseFoodLibrary,
  upsertFoodLibraryEntry,
  validateFoodLibraryEntry
} from './_shared/food-library.mjs';
import {
  EXERCISE_LIBRARY_PATH,
  formatExerciseLibraryForPrompt,
  parseExerciseLibrary,
  saveExerciseLibraryEntrySchema,
  searchExerciseLibrary,
  searchExerciseLibrarySchema,
  upsertExerciseLibraryEntry,
  validateExerciseLibraryEntry
} from './_shared/exercise-library.mjs';
import {
  formatTemplatesForPrompt,
  isTemplatePath,
  MAX_PROMPT_TEMPLATES,
  summarizeTemplatesFromContents
} from './_shared/workout-templates.mjs';
import { createAnthropicClient, AnthropicClientError } from './_shared/anthropic-client.mjs';
import { getSydneyDateKey, getSydneyTimestamp, addCalendarDays } from '../../js/core/time.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 24 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_ENTRY_CHARS = 1500;
const MAX_HISTORY_TOTAL_CHARS = 6000;
const BODY_TOO_LARGE = Symbol('body_too_large');

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
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
    const originError = guardRequestOrigin(request, env);
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

    const slug = routeAgent(parsed.message, parsed.priorAgentSlug);
    const agent = slug === ROUTER_SLUG ? null : findAgent(slug);
    const today = getSydneyDateKey(new Date(now()));
    const from = addCalendarDays(today, -6);
    const allowedTypes = agent?.recordTypes.length ? agent.recordTypes : undefined;
    const needsFoodLibrary = Boolean(allowedTypes?.includes('meal'));
    const needsWorkoutTemplates = slug === 'chadwick' || Boolean(allowedTypes?.includes('workout'));
    const needsExerciseLibrary = slug === 'chadwick';

    let digest = '';
    let constraints = '';
    let centralNodeLog = '';
    let foodLibraryEntries = [];
    let foodLibrary = '';
    let foodLibrarySha;
    let exerciseLibraryEntries = [];
    let exerciseLibrary = '';
    let exerciseLibrarySha;
    let workoutTemplates = '';
    try {
      const current = await client.resolveTree();
      const manifest = selectManifestEntries(current.tree, { from, to: today });
      const dataEntries = manifest.filter(entry => entry.path.startsWith('data/'));
      const centralNodeEntry = current.tree.find(entry => entry.path === 'central-node.md' && entry.type === 'blob');
      const foodLibraryEntry = needsFoodLibrary
        ? current.tree.find(entry => entry.path === FOOD_LIBRARY_PATH && entry.type === 'blob')
        : null;
      foodLibrarySha = foodLibraryEntry?.sha;
      const exerciseLibraryEntry = needsExerciseLibrary
        ? current.tree.find(entry => entry.path === EXERCISE_LIBRARY_PATH && entry.type === 'blob')
        : null;
      exerciseLibrarySha = exerciseLibraryEntry?.sha;
      const templateEntries = needsWorkoutTemplates
        ? current.tree.filter(entry => entry.type === 'blob' && isTemplatePath(entry.path)).slice(0, MAX_PROMPT_TEMPLATES)
        : [];

      const [dataBlobs, centralNodeBlob, foodLibraryBlob, exerciseLibraryBlob, templateBlobs] = await Promise.all([
        Promise.all(dataEntries.map(entry => client.readBlob(entry.sha))),
        centralNodeEntry ? client.readBlob(centralNodeEntry.sha) : null,
        foodLibraryEntry ? client.readBlob(foodLibraryEntry.sha) : null,
        exerciseLibraryEntry ? client.readBlob(exerciseLibraryEntry.sha) : null,
        Promise.all(templateEntries.map(entry => client.readBlob(entry.sha)))
      ]);

      const files = dataEntries
        .map((entry, index) => ({ path: entry.path, content: decodeBlob(dataBlobs[index]) }))
        .filter(file => file.content !== null);
      digest = summarizeRecentHistory(files, TARGETS_CONFIG, today);

      const decodedCentralNode = centralNodeBlob ? decodeBlob(centralNodeBlob) : null;
      if (decodedCentralNode !== null) {
        constraints = extractConstraints(decodedCentralNode);
        centralNodeLog = [
          extractTodaysStatus(decodedCentralNode),
          extractCrossAgentCoordination(decodedCentralNode),
          extractRecentAgentActions(decodedCentralNode)
        ].filter(Boolean).join('\n\n');
      }

      const decodedFoodLibrary = foodLibraryBlob ? decodeBlob(foodLibraryBlob) : null;
      if (decodedFoodLibrary !== null) {
        foodLibraryEntries = parseFoodLibrary(decodedFoodLibrary);
        foodLibrary = formatFoodLibraryForPrompt(foodLibraryEntries);
      }

      const decodedExerciseLibrary = exerciseLibraryBlob ? decodeBlob(exerciseLibraryBlob) : null;
      if (decodedExerciseLibrary !== null) {
        exerciseLibraryEntries = parseExerciseLibrary(decodedExerciseLibrary);
        exerciseLibrary = formatExerciseLibraryForPrompt(exerciseLibraryEntries);
      }

      const templateContents = templateEntries
        .map((entry, index) => ({ path: entry.path, content: decodeBlob(templateBlobs[index]) }))
        .filter(file => file.content !== null);
      workoutTemplates = formatTemplatesForPrompt(summarizeTemplatesFromContents(templateContents));
    } catch {
      digest = '';
      constraints = '';
      centralNodeLog = '';
      foodLibraryEntries = [];
      foodLibrary = '';
      foodLibrarySha = undefined;
      exerciseLibraryEntries = [];
      exerciseLibrary = '';
      exerciseLibrarySha = undefined;
      workoutTemplates = '';
    }

    const chadwickProtocol = slug === 'chadwick' ? loadChadwickProtocol() : '';
    const hyaluronicaProtocol = slug === 'hyaluronica' ? loadHyaluronicaProtocol() : '';
    const penelopeProtocol = slug === 'penelope' ? loadPenelopeProtocol() : '';
    const veraProtocol = slug === 'vera' ? loadVeraProtocol() : '';
    const system = buildSystemPrompt({
      slug,
      digest,
      constraints,
      centralNodeLog,
      foodLibrary,
      chadwickProtocol,
      hyaluronicaProtocol,
      penelopeProtocol,
      veraProtocol,
      workoutTemplates,
      exerciseLibrary
    });
    const tools = [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 2 },
      ...(allowedTypes ? [logEntryToolSchema(allowedTypes)] : []),
      ...(needsFoodLibrary ? [foodLibraryEntrySchema()] : []),
      ...(needsExerciseLibrary ? [searchExerciseLibrarySchema(), saveExerciseLibraryEntrySchema()] : [])
    ];

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
            messages: [...parsed.history, { role: 'user', content: parsed.message }],
            tools,
            signal: request.signal,
            executeTools: async event => {
              if (event.name === 'search_exercise_library') {
                return searchExerciseLibrary(exerciseLibraryEntries, event.input ?? {});
              }
              if (event.name === 'save_exercise_library_entry') {
                const entry = validateExerciseLibraryEntry(event.input);
                if (!entry) {
                  return JSON.stringify({ ok: false, error: 'invalid_entry' });
                }
                try {
                  exerciseLibraryEntries = upsertExerciseLibraryEntry(
                    exerciseLibraryEntries,
                    entry,
                    getSydneyTimestamp(nowInstant)
                  );
                  const result = await client.writeFile({
                    path: EXERCISE_LIBRARY_PATH,
                    content: JSON.stringify(exerciseLibraryEntries, null, 2),
                    ...(exerciseLibrarySha ? { sha: exerciseLibrarySha } : {}),
                    message: `chore(exercise-library): upsert ${entry.name}`
                  });
                  exerciseLibrarySha = result.sha;
                  send({ type: 'exercise_library_saved', name: entry.name });
                  return JSON.stringify({
                    ok: true,
                    name: entry.name,
                    target_area: entry.target_area
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              if (event.name === 'save_food_library_entry') {
                const entry = validateFoodLibraryEntry(event.input);
                if (!entry) {
                  return JSON.stringify({ ok: false, error: 'invalid_entry' });
                }
                try {
                  foodLibraryEntries = upsertFoodLibraryEntry(foodLibraryEntries, entry, today);
                  const result = await client.writeFile({
                    path: FOOD_LIBRARY_PATH,
                    content: JSON.stringify(foodLibraryEntries, null, 2),
                    ...(foodLibrarySha ? { sha: foodLibrarySha } : {}),
                    message: `chore(food-library): cache ${entry.name}`
                  });
                  foodLibrarySha = result.sha;
                  send({ type: 'food_library_saved', name: entry.name });
                  return JSON.stringify({
                    ok: true,
                    name: entry.name,
                    calories: entry.calories,
                    protein_g: entry.protein_g,
                    fat_g: entry.fat_g
                  });
                } catch {
                  return JSON.stringify({ ok: false, error: 'write_failed' });
                }
              }
              return null;
            }
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
                  notes: validation.notes,
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
  const label = record.type === 'meal' ? record.meal
    : record.type === 'skincare' ? record.routine
    : record.type;
  return `${label}-${slugTime(record.time)}`;
}

function slugTime(time) {
  return typeof time === 'string' ? time.replace(':', '') : '0000';
}

async function parseRequest(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { error: errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false, PRIVATE_CACHE) };
  }
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
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH) {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  return {
    message: body.message,
    history: sanitizeHistory(body.history),
    priorAgentSlug: typeof body.priorAgentSlug === 'string' ? body.priorAgentSlug : undefined
  };
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  let totalChars = 0;
  const sanitized = [];
  for (const entry of value.slice(-MAX_HISTORY_MESSAGES)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;
    if (typeof entry.content !== 'string' || entry.content.trim() === '') continue;
    const content = entry.content.length > MAX_HISTORY_ENTRY_CHARS
      ? entry.content.slice(0, MAX_HISTORY_ENTRY_CHARS)
      : entry.content;
    totalChars += content.length;
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) break;
    sanitized.push({ role: entry.role, content });
  }
  return sanitized;
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

function repositoryError() {
  return errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatHandler();
