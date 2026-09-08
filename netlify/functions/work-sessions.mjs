import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  deleteKey,
  getJSON,
  listJSON,
  newRecordId,
  readIndex,
  setJSON,
  writeIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/work-sessions' };

const WORK_SESSION_PREFIX = 'work_sessions/';
const WORK_SESSIONS_INDEX = 'work_sessions/_index';

const RESULTS = new Set(['done', 'partial', 'stopped', 'open']);
const SOURCES = new Set(['focus_block', 'manual', 'inferred', 'clare']);
const DEPTHS = new Set(['deep', 'shallow', 'admin']);
const WORK_MODES = new Set(['predefined', 'reactive', 'defining']);
const CONFIDENCE = new Set(['explicit', 'inferred', 'unknown']);

function workSessionKey(id) {
  return `${WORK_SESSION_PREFIX}${id}`;
}

function readId(request) {
  return new URL(request.url).searchParams.get('id') ?? '';
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return {
    schema_version: 1,
    task_id: null,
    project_id: null,
    work_block_id: null,
    finished_at: null,
    actual_duration_minutes: null,
    depth: 'shallow',
    work_mode: null,
    work_mode_confidence: 'unknown',
    result: 'open',
    source: 'manual',
    notes: '',
    ...raw
  };
}

function validateSessionFields(value) {
  if (typeof value.started_at !== 'string' || !value.started_at) return 'started_at required';
  if (value.depth != null && !DEPTHS.has(value.depth)) return 'invalid depth';
  if (value.work_mode != null && !WORK_MODES.has(value.work_mode)) return 'invalid work_mode';
  if (value.work_mode_confidence != null && !CONFIDENCE.has(value.work_mode_confidence)) {
    return 'invalid work_mode_confidence';
  }
  if (value.result != null && !RESULTS.has(value.result)) return 'invalid result';
  if (value.source != null && !SOURCES.has(value.source)) return 'invalid source';
  if (
    value.actual_duration_minutes != null &&
    (!Number.isFinite(Number(value.actual_duration_minutes)) ||
      Number(value.actual_duration_minutes) < 0)
  ) {
    return 'actual_duration_minutes must be a non-negative number';
  }
  return null;
}

export function createWorkSessionsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const id = readId(request);
        if (id) {
          const session = await getJSON(store, workSessionKey(id));
          if (!session) {
            return withCors(
              errorResponse(404, 'not_found', 'Work session not found', false),
              request,
              env
            );
          }
          return withCors(okResponse(200, normalizeSession(session)), request, env);
        }
        const sessions = (await listJSON(store, WORK_SESSION_PREFIX))
          .filter((item) => typeof item?.id === 'string')
          .map(normalizeSession);
        return withCors(okResponse(200, { work_sessions: sessions }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const validationError = validateSessionFields(parsed.value);
        if (validationError) {
          return withCors(
            errorResponse(400, 'validation_error', validationError, false),
            request,
            env
          );
        }
        const stamp = new Date().toISOString();
        const id = newRecordId('wsession');
        const session = normalizeSession({
          id,
          task_id: optionalString(parsed.value.task_id),
          project_id: optionalString(parsed.value.project_id),
          work_block_id: optionalString(parsed.value.work_block_id),
          started_at: parsed.value.started_at,
          finished_at: optionalString(parsed.value.finished_at),
          actual_duration_minutes:
            parsed.value.actual_duration_minutes == null
              ? null
              : Number(parsed.value.actual_duration_minutes),
          depth: parsed.value.depth ?? 'shallow',
          work_mode: parsed.value.work_mode ?? null,
          work_mode_confidence: parsed.value.work_mode_confidence ?? 'unknown',
          result: parsed.value.result ?? 'open',
          source: parsed.value.source ?? 'manual',
          notes: typeof parsed.value.notes === 'string' ? parsed.value.notes : '',
          created_at: stamp,
          updated_at: stamp
        });
        await setJSON(store, workSessionKey(id), session);
        const ids = await readIndex(store, WORK_SESSIONS_INDEX);
        await writeIndex(store, WORK_SESSIONS_INDEX, [...ids, id]);
        return withCors(okResponse(201, session), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'DELETE') {
        const id = readId(request);
        if (!id) {
          return withCors(
            errorResponse(400, 'missing_id', 'id query param required', false),
            request,
            env
          );
        }
        const existing = await getJSON(store, workSessionKey(id));
        if (!existing) {
          return withCors(
            errorResponse(404, 'not_found', 'Work session not found', false),
            request,
            env
          );
        }
        if (request.method === 'DELETE') {
          await deleteKey(store, workSessionKey(id));
          const ids = (await readIndex(store, WORK_SESSIONS_INDEX)).filter((x) => x !== id);
          await writeIndex(store, WORK_SESSIONS_INDEX, ids);
          return withCors(okResponse(200, { id, deleted: true }), request, env);
        }
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const next = normalizeSession({
          ...existing,
          ...parsed.value,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: new Date().toISOString()
        });
        const validationError = validateSessionFields(next);
        if (validationError) {
          return withCors(
            errorResponse(400, 'validation_error', validationError, false),
            request,
            env
          );
        }
        await setJSON(store, workSessionKey(id), next);
        return withCors(okResponse(200, next), request, env);
      }

      return withCors(methodNotAllowed('GET, POST, PATCH, DELETE, OPTIONS'), request, env);
    } catch {
      return withCors(
        errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true),
        request,
        env
      );
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createWorkSessionsHandler();
